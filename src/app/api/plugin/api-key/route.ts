import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { getRequestIp } from "@/lib/adminAudit";
import {
    computeDaysUntilExpiry,
    getPluginKeySnapshot,
    isPreviousPluginKeyValid,
    revokePluginApiKey,
    rotatePluginApiKey,
} from "@/lib/pluginKeyManager";

const SENSITIVE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
};

/**
 * GET /api/plugin/api-key — Retrieve key presence + connection status (never returns stored key)
 * POST /api/plugin/api-key — Generate a new plugin API key (replaces existing)
 * DELETE /api/plugin/api-key — Revoke the current plugin API key
 */

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { snapshot, autoRotated } = await getPluginKeySnapshot();

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
        expiresInDays: computeDaysUntilExpiry(snapshot.keyExpiresAt),
        autoRotated,
    }, { headers: SENSITIVE_RESPONSE_HEADERS });
}

export async function POST(req: Request) {
    const auth = await requireAdminMutation(req);
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
    }, { headers: SENSITIVE_RESPONSE_HEADERS });
}

export async function DELETE(req: Request) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    await revokePluginApiKey({
        actorUserId: auth.linkedUserDbIds[0] ?? null,
        actorUsername: auth.username || null,
        ipAddress: getRequestIp(req),
    });

    return NextResponse.json({ success: true }, { headers: SENSITIVE_RESPONSE_HEADERS });
}
