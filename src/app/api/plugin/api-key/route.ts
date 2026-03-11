import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { randomBytes } from "crypto";

/**
 * GET /api/plugin/api-key — Retrieve current plugin API key + connection status
 * POST /api/plugin/api-key — Generate a new plugin API key (replaces existing)
 * DELETE /api/plugin/api-key — Revoke the current plugin API key
 */

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: {
            pluginApiKey: true,
            pluginLastSeen: true,
            pluginVersion: true,
            pluginServerName: true,
        },
    });

    const isConnected = settings?.pluginLastSeen
        ? (Date.now() - new Date(settings.pluginLastSeen).getTime()) < 120_000 // 2min
        : false;

    return NextResponse.json({
        hasApiKey: !!settings?.pluginApiKey,
        apiKey: settings?.pluginApiKey || null,
        pluginLastSeen: settings?.pluginLastSeen || null,
        pluginVersion: settings?.pluginVersion || null,
        pluginServerName: settings?.pluginServerName || null,
        isConnected,
    });
}

export async function POST() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    // Generate a cryptographically secure API key
    const apiKey = `jt_${randomBytes(32).toString("hex")}`;

    await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: { pluginApiKey: apiKey },
        create: {
            id: "global",
            pluginApiKey: apiKey,
        },
    });

    return NextResponse.json({ apiKey });
}

export async function DELETE() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    await prisma.globalSettings.update({
        where: { id: "global" },
        data: {
            pluginApiKey: null,
            pluginLastSeen: null,
            pluginVersion: null,
            pluginServerName: null,
        },
    });

    return NextResponse.json({ success: true });
}
