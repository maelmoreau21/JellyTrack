import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import {
    computeDaysUntilExpiry,
    getPluginKeySnapshot,
    isPreviousPluginKeyValid,
} from "@/lib/pluginKeyManager";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const auditModel = (prisma as any).adminAuditLog;

    const [{ snapshot }, pluginMeta, totalAudit24h, unauthorized24h, rateLimited24h, previousKeyUsed24h, keyActions30d, revocations30d, policyChanges30d, recentSecurityEvents] = await Promise.all([
        getPluginKeySnapshot(),
        prisma.globalSettings.findUnique({
            where: { id: "global" },
            select: {
                pluginLastSeen: true,
                pluginVersion: true,
                pluginServerName: true,
            },
        }),
        auditModel.count({ where: { createdAt: { gte: last24Hours } } }),
        auditModel.count({ where: { action: "plugin.events.unauthorized", createdAt: { gte: last24Hours } } }),
        auditModel.count({ where: { action: "plugin.events.rate_limited", createdAt: { gte: last24Hours } } }),
        auditModel.count({ where: { action: "plugin.key.previous_key_used", createdAt: { gte: last24Hours } } }),
        auditModel.count({
            where: {
                action: { in: ["plugin.key.generated", "plugin.key.rotated"] },
                createdAt: { gte: last30Days },
            },
        }),
        auditModel.count({ where: { action: "plugin.key.revoked", createdAt: { gte: last30Days } } }),
        auditModel.count({ where: { action: "plugin.key.policy_updated", createdAt: { gte: last30Days } } }),
        auditModel.findMany({
            where: {
                action: {
                    in: [
                        "plugin.events.unauthorized",
                        "plugin.events.rate_limited",
                        "plugin.events.payload_too_large",
                        "plugin.events.invalid_payload",
                        "plugin.events.invalid_content_type",
                    ],
                },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
                id: true,
                action: true,
                actorUsername: true,
                ipAddress: true,
                createdAt: true,
                details: true,
            },
        }),
    ]);

    const isConnected = pluginMeta?.pluginLastSeen
        ? (Date.now() - new Date(pluginMeta.pluginLastSeen).getTime()) < 120_000
        : false;

    const expiresInDays = computeDaysUntilExpiry(snapshot.keyExpiresAt);
    const keyExpired = expiresInDays !== null && expiresInDays <= 0;
    const keyExpiringSoon = expiresInDays !== null && expiresInDays > 0 && expiresInDays <= 7;

    return NextResponse.json({
        plugin: {
            serverName: pluginMeta?.pluginServerName || null,
            version: pluginMeta?.pluginVersion || null,
            lastSeen: pluginMeta?.pluginLastSeen || null,
            connected: isConnected,
        },
        key: {
            hasApiKey: !!snapshot.currentKeyHash,
            createdAt: snapshot.keyCreatedAt,
            expiresAt: snapshot.keyExpiresAt,
            expiresInDays,
            expired: keyExpired,
            expiringSoon: keyExpiringSoon,
            autoRotateEnabled: snapshot.autoRotateEnabled,
            rotationDays: snapshot.rotationDays,
            rotationGraceHours: snapshot.rotationGraceHours,
            previousKeyActive: isPreviousPluginKeyValid(snapshot),
            previousKeyGraceUntil: snapshot.previousKeyExpiresAt,
        },
        metrics: {
            totalAudit24h,
            unauthorized24h,
            rateLimited24h,
            previousKeyUsed24h,
            keyActions30d,
            revocations30d,
            policyChanges30d,
        },
        recentSecurityEvents,
    });
}
