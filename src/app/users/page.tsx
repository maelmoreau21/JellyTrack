import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { UsersManagementClient, type UserStatsItem } from "./UsersManagementClient";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";
const ZAPPING_MIN_SECONDS = 60;

export default async function UsersPage() {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.isAdmin) {
        redirect("/login");
    }

    const locale = await getLocale();

    const [users, usageRows, streamMethodRows, clientRows, globalSettings] = await Promise.all([
        prisma.user.findMany({
            select: {
                id: true,
                jellyfinUserId: true,
                username: true,
                lastActive: true,
            },
        }),
        prisma.playbackHistory.groupBy({
            by: ["userId"],
            where: {
                userId: { not: null },
                durationWatched: { gte: ZAPPING_MIN_SECONDS },
            },
            _sum: { durationWatched: true },
            _count: { _all: true },
        }),
        prisma.playbackHistory.groupBy({
            by: ["userId", "playMethod"],
            where: {
                userId: { not: null },
                durationWatched: { gte: ZAPPING_MIN_SECONDS },
            },
            _count: { _all: true },
        }),
        prisma.playbackHistory.groupBy({
            by: ["userId", "clientName"],
            where: {
                userId: { not: null },
                durationWatched: { gte: ZAPPING_MIN_SECONDS },
                clientName: { not: null },
            },
            _count: { _all: true },
        }),
        prisma.globalSettings.findUnique({
            where: { id: "global" },
            select: { ssoSettings: true },
        }),
    ]);

    // Compute total time & count
    const usageByUserId = new Map<string, { totalSeconds: number; sessionsCount: number }>();
    for (const row of usageRows) {
        if (!row.userId) continue;
        usageByUserId.set(row.userId, {
            totalSeconds: row._sum.durationWatched ?? 0,
            sessionsCount: row._count._all ?? 0,
        });
    }

    // Compute transcode vs direct play
    const transcodeStatsByUserId = new Map<string, { transcode: number; directPlay: number }>();
    for (const row of streamMethodRows) {
        if (!row.userId) continue;
        const current = transcodeStatsByUserId.get(row.userId) || { transcode: 0, directPlay: 0 };
        const method = (row.playMethod || "").toLowerCase();
        if (method.includes("transcode")) {
            current.transcode += row._count._all;
        } else {
            current.directPlay += row._count._all;
        }
        transcodeStatsByUserId.set(row.userId, current);
    }

    // Compute favorite client
    const favoriteClientByUserId = new Map<string, string>();
    const favoriteClientCountByUserId = new Map<string, number>();
    for (const row of clientRows) {
        if (!row.userId || !row.clientName) continue;
        const currentBest = favoriteClientCountByUserId.get(row.userId) ?? 0;
        const nextCount = row._count._all ?? 0;
        const currentName = favoriteClientByUserId.get(row.userId);

        if (
            nextCount > currentBest ||
            (nextCount === currentBest && currentName && row.clientName.localeCompare(currentName, locale, { sensitivity: "base" }) < 0)
        ) {
            favoriteClientCountByUserId.set(row.userId, nextCount);
            favoriteClientByUserId.set(row.userId, row.clientName);
        }
    }

    const ssoUrl = (globalSettings?.ssoSettings as Record<string, string>)?.url || process.env.JELLYTRACK_AUTHENTIK_URL || process.env.AUTHENTIK_URL || null;

    const userStatsItems: UserStatsItem[] = users
        .map((user) => {
            const usage = usageByUserId.get(user.id);
            const methods = transcodeStatsByUserId.get(user.id) || { transcode: 0, directPlay: 0 };
            const totalStreams = methods.transcode + methods.directPlay;
            const transcodeRatio = totalStreams > 0 ? Math.round((methods.transcode / totalStreams) * 100) : 0;

            return {
                id: user.id,
                jellyfinUserId: user.jellyfinUserId,
                username: user.username || "Utilisateur inconnu",
                totalHours: parseFloat(((usage?.totalSeconds ?? 0) / 3600).toFixed(1)),
                sessionsCount: usage?.sessionsCount ?? 0,
                lastActive: user.lastActive ? user.lastActive.toISOString() : null,
                favoriteClient: favoriteClientByUserId.get(user.id) || "Inconnu",
                transcodeCount: methods.transcode,
                directPlayCount: methods.directPlay,
                transcodeRatio,
            };
        })
        .sort((a, b) => b.totalHours - a.totalHours);

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
                <UsersManagementClient users={userStatsItems} ssoUrl={ssoUrl} />
            </div>
        </div>
    );
}
