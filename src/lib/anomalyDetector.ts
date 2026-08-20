import prisma from "@/lib/prisma";
import { subMinutes, subDays } from "date-fns";

export interface SecurityAlert {
    id: string;
    type: "account_sharing" | "corrupted_media" | "rapid_switches";
    severity: "warning" | "critical";
    title: string;
    description: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Checks for immediate anomalies on a newly received or updated playback session.
 */
export async function detectPlaybackAnomalies(params: {
    userId?: string | null;
    mediaId?: string | null;
    ipAddress?: string | null;
    country?: string | null;
    durationWatched?: number | null;
}): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = [];
    const now = new Date();

    // 1. Account Sharing / Multi-Location Detection
    // If the same userId played from a different IP or Country within the last 30 minutes
    if (params.userId && params.ipAddress) {
        const thirtyMinAgo = subMinutes(now, 30);
        const recentOtherSessions = await prisma.playbackHistory.findMany({
            where: {
                userId: params.userId,
                startedAt: { gte: thirtyMinAgo },
                NOT: { ipAddress: params.ipAddress },
            },
            select: {
                id: true,
                ipAddress: true,
                country: true,
                startedAt: true,
                user: { select: { username: true } },
            },
            take: 2,
        });

        if (recentOtherSessions.length > 0) {
            const firstOther = recentOtherSessions[0];
            const username = firstOther.user?.username || "Utilisateur";
            alerts.push({
                id: `sharing_${params.userId}_${Date.now()}`,
                type: "account_sharing",
                severity: "warning",
                title: "⚠️ Suspicion de partage de compte / Double localisation",
                description: `Le compte "${username}" a été utilisé depuis deux adresses IP distinctes (${params.ipAddress} et ${firstOther.ipAddress}) en moins de 30 minutes.`,
                timestamp: now,
                metadata: {
                    userId: params.userId,
                    username,
                    currentIp: params.ipAddress,
                    otherIp: firstOther.ipAddress,
                    currentCountry: params.country,
                    otherCountry: firstOther.country,
                },
            });
        }
    }

    // 2. Corrupted Media / Early Crash Loop Detection
    // If this media was stopped within <= 15s by >= 3 distinct users in the last 7 days
    if (params.mediaId && (params.durationWatched ?? 0) <= 15) {
        const sevenDaysAgo = subDays(now, 7);
        const earlyStops = await prisma.playbackHistory.findMany({
            where: {
                mediaId: params.mediaId,
                startedAt: { gte: sevenDaysAgo },
                durationWatched: { lte: 15 },
            },
            select: { userId: true },
        });

        const distinctUsers = new Set(earlyStops.map((s) => s.userId).filter(Boolean));
        if (distinctUsers.size >= 3) {
            const media = await prisma.media.findUnique({
                where: { id: params.mediaId },
                select: { title: true, type: true },
            });
            alerts.push({
                id: `corrupt_${params.mediaId}_${Date.now()}`,
                type: "corrupted_media",
                severity: "critical",
                title: "🚨 Alerte fichier corrompu / Crash client répété",
                description: `Le média "${media?.title || "Inconnu"}" a été coupé en moins de 15 secondes par ${distinctUsers.size} utilisateurs différents (problème potentiel d'encodage ou conteneur corrompu).`,
                timestamp: now,
                metadata: {
                    mediaId: params.mediaId,
                    title: media?.title,
                    userCount: distinctUsers.size,
                },
            });
        }
    }

    return alerts;
}

/**
 * Retrieves all active security anomalies across the server for the admin dashboard.
 */
export async function getActiveSecurityAnomalies(): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = [];
    const now = new Date();

    // 1. Check for account sharing in the last 24h
    const oneDayAgo = subDays(now, 1);
    const recentPlaybacks = await prisma.playbackHistory.findMany({
        where: { startedAt: { gte: oneDayAgo } },
        select: {
            userId: true,
            ipAddress: true,
            country: true,
            startedAt: true,
            user: { select: { username: true } },
        },
        orderBy: { startedAt: "desc" },
    });

    const userIpsMap = new Map<string, { username: string; ips: Set<string>; countries: Set<string>; latestDate: Date }>();
    for (const p of recentPlaybacks) {
        if (!p.userId || !p.ipAddress) continue;
        const entry = userIpsMap.get(p.userId) || {
            username: p.user?.username || "Utilisateur",
            ips: new Set<string>(),
            countries: new Set<string>(),
            latestDate: p.startedAt,
        };
        entry.ips.add(p.ipAddress);
        if (p.country && p.country !== "Unknown") entry.countries.add(p.country);
        userIpsMap.set(p.userId, entry);
    }

    for (const [uId, entry] of userIpsMap.entries()) {
        if (entry.ips.size >= 2) {
            alerts.push({
                id: `sharing_${uId}`,
                type: "account_sharing",
                severity: "warning",
                title: `Double localisation : ${entry.username}`,
                description: `Utilisé depuis ${entry.ips.size} adresses IP distinctes (${Array.from(entry.ips).slice(0, 3).join(", ")}) au cours des 24 dernières heures.`,
                timestamp: entry.latestDate,
                metadata: {
                    userId: uId,
                    username: entry.username,
                    ipCount: entry.ips.size,
                },
            });
        }
    }

    // 2. Check for potentially corrupted media (>= 3 distinct users stopped within 15s in the last 7 days)
    const sevenDaysAgo = subDays(now, 7);
    const earlyStops = await prisma.playbackHistory.findMany({
        where: {
            startedAt: { gte: sevenDaysAgo },
            durationWatched: { lte: 15 },
            mediaId: { not: "" },
        },
        include: {
            media: { select: { title: true, type: true } },
        },
    });

    const mediaStopsMap = new Map<string, { title: string; users: Set<string>; latestDate: Date }>();
    for (const s of earlyStops) {
        if (!s.mediaId || !s.userId) continue;
        const entry = mediaStopsMap.get(s.mediaId) || {
            title: s.media?.title || "Média inconnu",
            users: new Set<string>(),
            latestDate: s.startedAt,
        };
        entry.users.add(s.userId);
        mediaStopsMap.set(s.mediaId, entry);
    }

    for (const [mId, entry] of mediaStopsMap.entries()) {
        if (entry.users.size >= 3) {
            alerts.push({
                id: `corrupt_${mId}`,
                type: "corrupted_media",
                severity: "critical",
                title: `Fichier potentiellement corrompu : ${entry.title}`,
                description: `Fermé après moins de 15s par ${entry.users.size} spectateurs différents. Vérifiez l'encodage du fichier.`,
                timestamp: entry.latestDate,
                metadata: {
                    mediaId: mId,
                    title: entry.title,
                    userCount: entry.users.size,
                },
            });
        }
    }

    return alerts.slice(0, 10);
}
