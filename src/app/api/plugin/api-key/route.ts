import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getRequestIp } from "@/lib/adminAudit";
import {
    computeDaysUntilExpiry,
    getPluginKeySnapshot,
    isPreviousPluginKeyValid,
    revokePluginApiKey,
    rotatePluginApiKey,
    updatePluginKeyRotationPolicy,
} from "@/lib/pluginKeyManager";

/**
 * GET /api/plugin/api-key — Retrieve key presence + connection status (never returns stored key)
 * POST /api/plugin/api-key — Generate a new plugin API key (replaces existing)
 * DELETE /api/plugin/api-key — Revoke the current plugin API key
 * PATCH /api/plugin/api-key — Update key rotation policy
 */

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const ipAddress = getRequestIp(req);

    const { snapshot, autoRotated } = await getPluginKeySnapshot({
        rotateIfExpired: true,
        context: {
            actorUserId: auth.linkedUserDbIds[0] ?? null,
            actorUsername: auth.username || null,
            ipAddress,
        },
    });

    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: {
            pluginLastSeen: true,
            pluginVersion: true,
            pluginServerName: true,
        },
    });

    const isConnected = settings?.pluginLastSeen
        ? (Date.now() - new Date(settings.pluginLastSeen).getTime()) < 120_000 // 2min
        : false;

    return NextResponse.json({
        hasApiKey: !!snapshot.currentKeyHash,
        pluginLastSeen: settings?.pluginLastSeen || null,
        pluginVersion: settings?.pluginVersion || null,
        pluginServerName: settings?.pluginServerName || null,
        isConnected,
        keyCreatedAt: snapshot.keyCreatedAt,
        keyExpiresAt: snapshot.keyExpiresAt,
        previousKeyGraceUntil: snapshot.previousKeyExpiresAt,
        previousKeyActive: isPreviousPluginKeyValid(snapshot),
        rotationDays: snapshot.rotationDays,
        autoRotateEnabled: snapshot.autoRotateEnabled,
        rotationGraceHours: snapshot.rotationGraceHours,
        expiresInDays: computeDaysUntilExpiry(snapshot.keyExpiresAt),
        autoRotated,
    });
}

export async function POST(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { apiKey, snapshot } = await rotatePluginApiKey({
        reason: "manual",
        context: {
            actorUserId: auth.linkedUserDbIds[0] ?? null,
            actorUsername: auth.username || null,
            ipAddress: getRequestIp(req),
        },
    });

    return NextResponse.json({
        apiKey,
        keyCreatedAt: snapshot.keyCreatedAt,
        keyExpiresAt: snapshot.keyExpiresAt,
        previousKeyGraceUntil: snapshot.previousKeyExpiresAt,
        rotationDays: snapshot.rotationDays,
        rotationGraceHours: snapshot.rotationGraceHours,
    });
}

export async function DELETE(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    await revokePluginApiKey({
        actorUserId: auth.linkedUserDbIds[0] ?? null,
        actorUsername: auth.username || null,
        ipAddress: getRequestIp(req),
    });

    return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    let payload: Record<string, unknown>;
    try {
        const parsed = await req.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
        }
        payload = parsed as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const rotationDays = typeof payload.rotationDays === "number" ? payload.rotationDays : undefined;
    const rotationGraceHours = typeof payload.rotationGraceHours === "number" ? payload.rotationGraceHours : undefined;
    const autoRotateEnabled = typeof payload.autoRotateEnabled === "boolean" ? payload.autoRotateEnabled : undefined;

    const snapshot = await updatePluginKeyRotationPolicy({
        autoRotateEnabled,
        rotationDays,
        rotationGraceHours,
        context: {
            actorUserId: auth.linkedUserDbIds[0] ?? null,
            actorUsername: auth.username || null,
            ipAddress: getRequestIp(req),
        },
    });

    return NextResponse.json({
        rotationDays: snapshot.rotationDays,
        autoRotateEnabled: snapshot.autoRotateEnabled,
        rotationGraceHours: snapshot.rotationGraceHours,
        keyCreatedAt: snapshot.keyCreatedAt,
        keyExpiresAt: snapshot.keyExpiresAt,
        previousKeyGraceUntil: snapshot.previousKeyExpiresAt,
        expiresInDays: computeDaysUntilExpiry(snapshot.keyExpiresAt),
    });
}
