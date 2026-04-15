import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import prisma from "@/lib/prisma";
import { writeAdminAuditLog } from "@/lib/adminAudit";

const scryptAsync = promisify(scrypt);

const MIN_ROTATION_DAYS = 7;
const MAX_ROTATION_DAYS = 365;
const DEFAULT_ROTATION_DAYS = 90;

const MIN_GRACE_HOURS = 1;
const MAX_GRACE_HOURS = 168;
const DEFAULT_GRACE_HOURS = 24;

const PLUGIN_KEY_HASH_VERSION = "s1";
const PLUGIN_KEY_HASH_BYTES = 64;

function normalizePluginKey(value: string | null | undefined): string | null {
    const normalized = String(value || "").trim();
    return normalized.length > 0 ? normalized : null;
}

function isHashFormat(value: string | null | undefined): boolean {
    const normalized = normalizePluginKey(value);
    return Boolean(normalized && normalized.startsWith(`${PLUGIN_KEY_HASH_VERSION}$`));
}

function getPluginKeyPepper(): string {
    return String(process.env.PLUGIN_KEY_PEPPER || "").trim();
}

function getHashInput(rawKey: string): string {
    const pepper = getPluginKeyPepper();
    if (!pepper) return rawKey;
    return `${pepper}:${rawKey}`;
}

async function derivePluginKeyHash(rawKey: string, salt: Buffer): Promise<Buffer> {
    const derived = await scryptAsync(getHashInput(rawKey), salt, PLUGIN_KEY_HASH_BYTES);
    return Buffer.from(derived as Buffer);
}

function encodeStoredPluginKeyHash(salt: Buffer, digest: Buffer): string {
    return `${PLUGIN_KEY_HASH_VERSION}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function parseStoredPluginKeyHash(storedHash: string): { salt: Buffer; digest: Buffer } | null {
    const normalized = normalizePluginKey(storedHash);
    if (!normalized) return null;

    const parts = normalized.split("$");
    if (parts.length !== 3) return null;
    if (parts[0] !== PLUGIN_KEY_HASH_VERSION) return null;

    try {
        const salt = Buffer.from(parts[1], "base64url");
        const digest = Buffer.from(parts[2], "base64url");
        if (salt.length === 0 || digest.length === 0) return null;
        return { salt, digest };
    } catch {
        return null;
    }
}

async function hashPluginApiKey(rawKey: string): Promise<string> {
    const salt = randomBytes(16);
    const digest = await derivePluginKeyHash(rawKey, salt);
    return encodeStoredPluginKeyHash(salt, digest);
}

export async function comparePluginApiKey(candidateRaw: string | null | undefined, storedHash: string | null | undefined): Promise<boolean> {
    const candidate = normalizePluginKey(candidateRaw);
    const stored = normalizePluginKey(storedHash);
    if (!candidate || !stored) return false;

    const parsed = parseStoredPluginKeyHash(stored);
    if (!parsed) {
        // Strict hash-only mode: reject malformed/legacy non-hash values.
        return false;
    }

    const computed = await derivePluginKeyHash(candidate, parsed.salt);
    if (computed.length !== parsed.digest.length) return false;

    try {
        return timingSafeEqual(computed, parsed.digest);
    } catch {
        return false;
    }
}

interface PluginKeySettingsSnapshot {
    pluginApiKey: string | null;
    pluginPreviousApiKey: string | null;
    pluginPreviousApiKeyExpiresAt: Date | null;
    pluginKeyCreatedAt: Date | null;
    pluginKeyExpiresAt: Date | null;
    pluginKeyRotationDays: number;
    pluginAutoRotateEnabled: boolean;
    pluginKeyRotationGraceHours: number;
}

export interface PluginKeySnapshot {
    currentKeyHash: string | null;
    previousKeyHash: string | null;
    previousKeyExpiresAt: Date | null;
    keyCreatedAt: Date | null;
    keyExpiresAt: Date | null;
    rotationDays: number;
    autoRotateEnabled: boolean;
    rotationGraceHours: number;
}

export interface RotationAuditContext {
    actorUserId?: string | null;
    actorUsername?: string | null;
    ipAddress?: string | null;
}

export function sanitizeRotationDays(value: number | null | undefined): number {
    if (!Number.isFinite(value)) return DEFAULT_ROTATION_DAYS;
    return Math.max(MIN_ROTATION_DAYS, Math.min(MAX_ROTATION_DAYS, Math.round(Number(value))));
}

export function sanitizeRotationGraceHours(value: number | null | undefined): number {
    if (!Number.isFinite(value)) return DEFAULT_GRACE_HOURS;
    return Math.max(MIN_GRACE_HOURS, Math.min(MAX_GRACE_HOURS, Math.round(Number(value))));
}

function computeExpiry(baseDate: Date, rotationDays: number): Date {
    return new Date(baseDate.getTime() + rotationDays * 24 * 60 * 60 * 1000);
}

function computeGraceExpiry(baseDate: Date, graceHours: number): Date {
    return new Date(baseDate.getTime() + graceHours * 60 * 60 * 1000);
}

function toSnapshot(settings: PluginKeySettingsSnapshot | null): PluginKeySnapshot {
    const rotationDays = sanitizeRotationDays(settings?.pluginKeyRotationDays);
    const rotationGraceHours = sanitizeRotationGraceHours(settings?.pluginKeyRotationGraceHours);

    return {
        currentKeyHash: settings?.pluginApiKey ?? null,
        previousKeyHash: settings?.pluginPreviousApiKey ?? null,
        previousKeyExpiresAt: settings?.pluginPreviousApiKeyExpiresAt ?? null,
        keyCreatedAt: settings?.pluginKeyCreatedAt ?? null,
        keyExpiresAt: settings?.pluginKeyExpiresAt ?? null,
        rotationDays,
        autoRotateEnabled: settings?.pluginAutoRotateEnabled ?? false,
        rotationGraceHours,
    };
}

async function migrateLegacyPlaintextPluginKeys(settings: PluginKeySettingsSnapshot | null): Promise<PluginKeySettingsSnapshot | null> {
    if (!settings) return null;

    const hasCurrentPlaintext = Boolean(settings.pluginApiKey) && !isHashFormat(settings.pluginApiKey);
    const hasPreviousPlaintext = Boolean(settings.pluginPreviousApiKey) && !isHashFormat(settings.pluginPreviousApiKey);

    if (!hasCurrentPlaintext && !hasPreviousPlaintext) {
        return settings;
    }

    const updateData: Record<string, unknown> = {};

    if (hasCurrentPlaintext && settings.pluginApiKey) {
        updateData.pluginApiKey = await hashPluginApiKey(settings.pluginApiKey);
    }

    if (hasPreviousPlaintext && settings.pluginPreviousApiKey) {
        updateData.pluginPreviousApiKey = await hashPluginApiKey(settings.pluginPreviousApiKey);
    }

    const updated = await prisma.globalSettings.update({
        where: { id: "global" },
        data: updateData,
        select: {
            pluginApiKey: true,
            pluginPreviousApiKey: true,
            pluginPreviousApiKeyExpiresAt: true,
            pluginKeyCreatedAt: true,
            pluginKeyExpiresAt: true,
            pluginKeyRotationDays: true,
            pluginAutoRotateEnabled: true,
            pluginKeyRotationGraceHours: true,
        },
    });

    return {
        pluginApiKey: updated.pluginApiKey,
        pluginPreviousApiKey: updated.pluginPreviousApiKey,
        pluginPreviousApiKeyExpiresAt: updated.pluginPreviousApiKeyExpiresAt,
        pluginKeyCreatedAt: updated.pluginKeyCreatedAt,
        pluginKeyExpiresAt: updated.pluginKeyExpiresAt,
        pluginKeyRotationDays: updated.pluginKeyRotationDays,
        pluginAutoRotateEnabled: updated.pluginAutoRotateEnabled,
        pluginKeyRotationGraceHours: updated.pluginKeyRotationGraceHours,
    };
}

async function fetchSettings(): Promise<PluginKeySettingsSnapshot | null> {
    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: {
            pluginApiKey: true,
            pluginPreviousApiKey: true,
            pluginPreviousApiKeyExpiresAt: true,
            pluginKeyCreatedAt: true,
            pluginKeyExpiresAt: true,
            pluginKeyRotationDays: true,
            pluginAutoRotateEnabled: true,
            pluginKeyRotationGraceHours: true,
        },
    });

    if (!settings) return null;

    const mapped: PluginKeySettingsSnapshot = {
        pluginApiKey: settings.pluginApiKey,
        pluginPreviousApiKey: settings.pluginPreviousApiKey,
        pluginPreviousApiKeyExpiresAt: settings.pluginPreviousApiKeyExpiresAt,
        pluginKeyCreatedAt: settings.pluginKeyCreatedAt,
        pluginKeyExpiresAt: settings.pluginKeyExpiresAt,
        pluginKeyRotationDays: settings.pluginKeyRotationDays,
        pluginAutoRotateEnabled: settings.pluginAutoRotateEnabled,
        pluginKeyRotationGraceHours: settings.pluginKeyRotationGraceHours,
    };

    return migrateLegacyPlaintextPluginKeys(mapped);
}

function shouldAutoRotate(snapshot: PluginKeySnapshot, now: Date): boolean {
    if (!snapshot.autoRotateEnabled) return false;
    if (!snapshot.currentKeyHash) return false;
    if (!snapshot.keyExpiresAt) return false;
    return snapshot.keyExpiresAt.getTime() <= now.getTime();
}

export async function updatePluginKeyRotationPolicy(input: {
    autoRotateEnabled?: boolean;
    rotationDays?: number;
    rotationGraceHours?: number;
    context?: RotationAuditContext;
}): Promise<PluginKeySnapshot> {
    const settings = await fetchSettings();

    const rotationDays = input.rotationDays !== undefined
        ? sanitizeRotationDays(input.rotationDays)
        : sanitizeRotationDays(settings?.pluginKeyRotationDays);

    const rotationGraceHours = input.rotationGraceHours !== undefined
        ? sanitizeRotationGraceHours(input.rotationGraceHours)
        : sanitizeRotationGraceHours(settings?.pluginKeyRotationGraceHours);

    const autoRotateEnabled = input.autoRotateEnabled !== undefined
        ? Boolean(input.autoRotateEnabled)
        : settings?.pluginAutoRotateEnabled ?? false;

    const updated = await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: {
            pluginKeyRotationDays: rotationDays,
            pluginAutoRotateEnabled: autoRotateEnabled,
            pluginKeyRotationGraceHours: rotationGraceHours,
        },
        create: {
            id: "global",
            pluginKeyRotationDays: rotationDays,
            pluginAutoRotateEnabled: autoRotateEnabled,
            pluginKeyRotationGraceHours: rotationGraceHours,
        },
        select: {
            pluginApiKey: true,
            pluginPreviousApiKey: true,
            pluginPreviousApiKeyExpiresAt: true,
            pluginKeyCreatedAt: true,
            pluginKeyExpiresAt: true,
            pluginKeyRotationDays: true,
            pluginAutoRotateEnabled: true,
            pluginKeyRotationGraceHours: true,
        },
    });

    await writeAdminAuditLog({
        action: "plugin.key.policy_updated",
        actorUserId: input.context?.actorUserId ?? null,
        actorUsername: input.context?.actorUsername ?? null,
        ipAddress: input.context?.ipAddress ?? null,
        target: "pluginApiKey",
        details: {
            pluginKeyRotationDays: rotationDays,
            pluginAutoRotateEnabled: autoRotateEnabled,
            pluginKeyRotationGraceHours: rotationGraceHours,
        },
    });

    return toSnapshot(updated);
}

export async function rotatePluginApiKey(input: {
    reason: "manual" | "automatic";
    context?: RotationAuditContext;
}): Promise<{ apiKey: string; snapshot: PluginKeySnapshot }> {
    const now = new Date();
    const currentSettings = await fetchSettings();
    const previousKeyHash = currentSettings?.pluginApiKey ?? null;
    const rotationDays = sanitizeRotationDays(currentSettings?.pluginKeyRotationDays);
    const rotationGraceHours = sanitizeRotationGraceHours(currentSettings?.pluginKeyRotationGraceHours);

    const newKey = `jt_${randomBytes(32).toString("hex")}`;
    const newKeyHash = await hashPluginApiKey(newKey);
    const keyExpiresAt = computeExpiry(now, rotationDays);
    const previousKeyExpiresAt = previousKeyHash ? computeGraceExpiry(now, rotationGraceHours) : null;

    const updated = await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: {
            pluginApiKey: newKeyHash,
            pluginPreviousApiKey: previousKeyHash,
            pluginPreviousApiKeyExpiresAt: previousKeyExpiresAt,
            pluginKeyCreatedAt: now,
            pluginKeyExpiresAt: keyExpiresAt,
            pluginKeyRotationDays: rotationDays,
            pluginKeyRotationGraceHours: rotationGraceHours,
        },
        create: {
            id: "global",
            pluginApiKey: newKeyHash,
            pluginPreviousApiKey: previousKeyHash,
            pluginPreviousApiKeyExpiresAt: previousKeyExpiresAt,
            pluginKeyCreatedAt: now,
            pluginKeyExpiresAt: keyExpiresAt,
            pluginKeyRotationDays: rotationDays,
            pluginKeyRotationGraceHours: rotationGraceHours,
        },
        select: {
            pluginApiKey: true,
            pluginPreviousApiKey: true,
            pluginPreviousApiKeyExpiresAt: true,
            pluginKeyCreatedAt: true,
            pluginKeyExpiresAt: true,
            pluginKeyRotationDays: true,
            pluginAutoRotateEnabled: true,
            pluginKeyRotationGraceHours: true,
        },
    });

    const action = previousKeyHash ? "plugin.key.rotated" : "plugin.key.generated";

    await writeAdminAuditLog({
        action,
        actorUserId: input.context?.actorUserId ?? null,
        actorUsername: input.context?.actorUsername ?? (input.reason === "automatic" ? "system:auto-rotation" : null),
        ipAddress: input.context?.ipAddress ?? null,
        target: "pluginApiKey",
        details: {
            reason: input.reason,
            rotationDays,
            graceHours: rotationGraceHours,
            previousKeyRetainedUntil: previousKeyExpiresAt?.toISOString() ?? null,
        },
    });

    return { apiKey: newKey, snapshot: toSnapshot(updated) };
}

export async function revokePluginApiKey(context?: RotationAuditContext): Promise<void> {
    await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: {
            pluginApiKey: null,
            pluginPreviousApiKey: null,
            pluginPreviousApiKeyExpiresAt: null,
            pluginKeyCreatedAt: null,
            pluginKeyExpiresAt: null,
            pluginLastSeen: null,
            pluginVersion: null,
            pluginServerName: null,
        },
        create: {
            id: "global",
            pluginApiKey: null,
            pluginPreviousApiKey: null,
            pluginPreviousApiKeyExpiresAt: null,
            pluginKeyCreatedAt: null,
            pluginKeyExpiresAt: null,
            pluginLastSeen: null,
            pluginVersion: null,
            pluginServerName: null,
        },
    });

    await writeAdminAuditLog({
        action: "plugin.key.revoked",
        actorUserId: context?.actorUserId ?? null,
        actorUsername: context?.actorUsername ?? null,
        ipAddress: context?.ipAddress ?? null,
        target: "pluginApiKey",
    });
}

export async function getPluginKeySnapshot(input?: {
    rotateIfExpired?: boolean;
    context?: RotationAuditContext;
}): Promise<{ snapshot: PluginKeySnapshot; autoRotated: boolean }> {
    const settings = await fetchSettings();
    const snapshot = toSnapshot(settings);

    if (input?.rotateIfExpired) {
        const now = new Date();
        if (shouldAutoRotate(snapshot, now)) {
            const rotated = await rotatePluginApiKey({ reason: "automatic", context: input.context });
            return {
                snapshot: rotated.snapshot,
                autoRotated: true,
            };
        }
    }

    return {
        snapshot,
        autoRotated: false,
    };
}

export function isPreviousPluginKeyValid(snapshot: PluginKeySnapshot, now: Date = new Date()): boolean {
    if (!snapshot.previousKeyHash || !snapshot.previousKeyExpiresAt) return false;
    return snapshot.previousKeyExpiresAt.getTime() > now.getTime();
}

export function computeDaysUntilExpiry(expiresAt: Date | null): number | null {
    if (!expiresAt) return null;
    const diffMs = expiresAt.getTime() - Date.now();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
