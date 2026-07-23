import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import UserInfo from "./UserInfo";
import UserActivity from "./UserActivity";
import UserRecentMedia from "./UserRecentMedia";
import UserStatsCharts from "./UserStatsCharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getTranslations } from 'next-intl/server';
import { ensureMasterServer } from "@/lib/serverRegistry";
import { resolveLinkedAccounts } from "@/lib/auth";
import valkey from "@/lib/valkey";
import { buildStreamValkeyKey } from "@/lib/serverRegistry";

export const dynamic = "force-dynamic";

interface UserPageProps {
    params: Promise<{
        id: string; // jellyfinUserId
    }>;
    searchParams: Promise<{
        historyPage?: string;
        page?: string;
        query?: string;
        sort?: string;
        type?: string;
        client?: string;
        audio?: string;
        subtitle?: string;
        dateFrom?: string;
        dateTo?: string;
        resolution?: string;
        playMethod?: string;
        hideZapped?: string;
        cols?: string;
    }>;
}

export default async function UserDetailPage({ params, searchParams }: UserPageProps) {
    const { id: jellyfinUserId } = await params;
    const resolvedSearchParams = await searchParams;
    const currentHistoryPage = Math.max(1, parseInt(resolvedSearchParams.page || resolvedSearchParams.historyPage || "1", 10) || 1);

    // RBAC: Non-admin users can only view their own profile
    const session = await getServerSession(authOptions);
    const isAdmin = session?.user?.isAdmin === true;
    const myJellyfinId = (session?.user as any)?.jellyfinUserId;
    if (!isAdmin && myJellyfinId !== jellyfinUserId) {
        redirect(myJellyfinId ? `/users/${myJellyfinId}` : "/login");
    }

    let user = await prisma.user.findFirst({
        where: { jellyfinUserId },
        orderBy: { createdAt: "asc" },
        select: { username: true, jellyfinUserId: true },
    });

    if (!user) {
        if (myJellyfinId === jellyfinUserId) {
            const masterServer = await ensureMasterServer();
            user = await prisma.user.upsert({
                where: { jellyfinUserId_serverId: { jellyfinUserId, serverId: masterServer.id } },
                update: { username: session?.user?.name || "User" },
                create: { serverId: masterServer.id, jellyfinUserId, username: session?.user?.name || "User" },
                select: { username: true, jellyfinUserId: true },
            });
        } else {
            notFound();
        }
    }

    const linkedAccounts = await resolveLinkedAccounts({
        jellyfinUserId,
        username: user.username || session?.user?.name || undefined,
        authServerJellyfinServerId: isAdmin
            ? undefined
            : (session?.user as { authServerJellyfinServerId?: string } | undefined)?.authServerJellyfinServerId,
    });
    const linkedUserIds = linkedAccounts.linkedJellyfinUserIds.length > 0
        ? linkedAccounts.linkedJellyfinUserIds
        : [jellyfinUserId];

    const linkedUsers = await prisma.user.findMany({
        where: { jellyfinUserId: { in: linkedUserIds } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });
    const linkedUserDbIds = linkedUsers.map((u) => u.id);

    const serverRows = await prisma.server.findMany({ select: { id: true, isActive: true } });
    const activeServerRows = serverRows.filter((server) => server.isActive);
    const selectableServerRows = activeServerRows.length > 0 ? activeServerRows : serverRows;
    const jellytrackMode = (process.env.JELLYTRACK_MODE || "single").toLowerCase();
    const multiServerEnabled = jellytrackMode === "multi" && selectableServerRows.length > 1;
    const cookieStore = await cookies();
    const persistedScopeCookie = cookieStore.get(GLOBAL_SERVER_SCOPE_COOKIE)?.value ?? null;
    const { selectedServerIds } = await resolveSelectedServerIdsAsync({
        multiServerEnabled,
        selectableServerIds: selectableServerRows.map((s) => s.id),
        requestedServersParam: resolvedSearchParams.cols, // or generic servers param
        cookieServersParam: persistedScopeCookie,
    });

    // Fetch active stream for this user (or linked users)
    const currentActiveStream = await prisma.activeStream.findFirst({
        where: { userId: { in: linkedUserDbIds } },
        select: {
            serverId: true,
            sessionId: true,
            clientName: true,
            deviceName: true,
            playMethod: true,
            positionTicks: true,
            media: {
                select: {
                    title: true,
                    durationMs: true,
                }
            }
        }
    });

    let liveProgressPercent = 0;
    let isPaused = false;
    if (currentActiveStream) {
        try {
            const valkeyKey = buildStreamValkeyKey(currentActiveStream.serverId, currentActiveStream.sessionId);
            const valkeyPayload = await valkey.get(valkeyKey);
            if (valkeyPayload) {
                const parsed = JSON.parse(valkeyPayload);
                isPaused = parsed.isPaused || parsed.IsPaused || false;
                const totalMs = currentActiveStream.media?.durationMs ? Number(currentActiveStream.media.durationMs) : 0;
                const positionTicks = parsed.positionTicks || parsed.PositionTicks || Number(currentActiveStream.positionTicks) || 0;
                const positionMs = positionTicks / 10000;
                if (totalMs > 0) {
                    liveProgressPercent = Math.min(100, Math.round((positionMs / totalMs) * 100));
                }
            }
        } catch {}
    }

    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } }) as any;
    let showWrappedButton = true;
    if (!isAdmin) {
        if (settings?.wrappedVisible === false) {
            showWrappedButton = false;
        } else if (settings?.wrappedPeriodEnabled !== false && settings) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const start = new Date(currentYear, (settings.wrappedStartMonth || 12) - 1, settings.wrappedStartDay || 1);
            const endMonthRaw = settings.wrappedEndMonth || 1;
            const startMonthRaw = settings.wrappedStartMonth || 12;
            const end = new Date(currentYear + (endMonthRaw < startMonthRaw ? 1 : 0), endMonthRaw - 1, settings.wrappedEndDay || 31);
            if (now < start || now > end) {
                showWrappedButton = false;
            }
        }
    }

    const t = await getTranslations('userProfile');
    const tc = await getTranslations('common');

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 mb-6">
                    <div className="flex flex-col space-y-2">
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                            {t('profile', { name: user.username || tc('deletedUser') })}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {t('jellyfinId')} {user.jellyfinUserId}
                        </p>
                    </div>
                    {showWrappedButton && (
                        <a
                            href={`/wrapped/${jellyfinUserId}`}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white transition-all bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-full border border-border/40 shadow-sm hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                        >
                            🎁 {t('viewWrapped')}
                        </a>
                    )}
                </div>

                {currentActiveStream && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="relative flex h-3.5 w-3.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                            </span>
                            <div>
                                <h3 className="text-xs font-semibold text-emerald-500 tracking-wider uppercase">Lecture en cours</h3>
                                <p className="text-base font-bold text-foreground mt-0.5">
                                    {currentActiveStream.media?.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Sur {currentActiveStream.clientName} ({currentActiveStream.deviceName || "Inconnu"}) • {currentActiveStream.playMethod}
                                </p>
                            </div>
                        </div>
                        <div className="w-full md:w-64 space-y-1.5 shrink-0">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{isPaused ? "En pause" : "En cours de lecture"}</span>
                                <span>{liveProgressPercent}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${liveProgressPercent}%` }}></div>
                            </div>
                        </div>
                    </div>
                )}

                <Suspense fallback={<Skeleton className="w-full h-[250px] rounded-xl bg-zinc-900/50" />}>
                    <UserInfo userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[300px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserActivity userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[320px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserStatsCharts userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} selectedServerIds={selectedServerIds} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[500px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserRecentMedia userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} page={currentHistoryPage} filterParams={resolvedSearchParams} />
                </Suspense>
            </div>
        </div>
    );
}
