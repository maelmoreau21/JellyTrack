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
    const pepper = String(process.env.PLUGIN_KEY_PEPPER || "").trim();
    if (!pepper && process.env.NODE_ENV === "production") {
        throw new Error("[PluginKey] PLUGIN_KEY_PEPPER is required in production.");
    }
    return pepper;
}

function getPluginKeyLegacyPeppers(): string[] {
    const raw = String(process.env.PLUGIN_KEY_PREVIOUS_PEPPERS || "").trim();
    if (!raw) return [];

    return raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function getPluginKeyPepperCandidates(): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const primaryPepper = getPluginKeyPepper();
    if (primaryPepper && !seen.has(primaryPepper)) {
        candidates.push(primaryPepper);
        seen.add(primaryPepper);
    }

    for (const legacyPepper of getPluginKeyLegacyPeppers()) {
        if (seen.has(legacyPepper)) continue;
        candidates.push(legacyPepper);
        seen.add(legacyPepper);
    }

    // Keep no-pepper compatibility to avoid invalidating existing deployments
    // when a pepper is introduced later.
    if (!seen.has("")) {
        candidates.push("");
    }

    return candidates;
}

function getHashInput(rawKey: string, pepper: string): string {
    if (!pepper) return rawKey;
    return `${pepper}:${rawKey}`;
}

async function derivePluginKeyHash(rawKey: string, salt: Buffer, pepper: string = getPluginKeyPepper()): Promise<Buffer> {
    const derived = await scryptAsync(getHashInput(rawKey, pepper), salt, PLUGIN_KEY_HASH_BYTES);
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

    for (const pepperCandidate of getPluginKeyPepperCandidates()) {
        const computed = await derivePluginKeyHash(candidate, parsed.salt, pepperCandidate);
        if (computed.length !== parsed.digest.length) continue;

        try {
            if (timingSafeEqual(computed, parsed.digest)) {
                return true;
            }
        } catch {
            // Continue to next candidate.
        }
    }

    return false;
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
        autoRotateEnabled: false,
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

export async function rotatePluginApiKey(input: {
    reason: "manual";
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
        actorUsername: input.context?.actorUsername ?? null,
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

export async function getPluginKeySnapshot(): Promise<{ snapshot: PluginKeySnapshot; autoRotated: boolean }> {
    const settings = await fetchSettings();
    const snapshot = toSnapshot(settings);

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
