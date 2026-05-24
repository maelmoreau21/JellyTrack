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

export const dynamic = "force-dynamic";

interface UserPageProps {
    params: Promise<{
        id: string; // jellyfinUserId
    }>;
    searchParams: Promise<{
        historyPage?: string;
    }>;
}

export default async function UserDetailPage({ params, searchParams }: UserPageProps) {
    const { id: jellyfinUserId } = await params;
    const { historyPage } = await searchParams;
    const currentHistoryPage = Math.max(1, parseInt(historyPage || "1", 10) || 1);

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

                <Suspense fallback={<Skeleton className="w-full h-[250px] rounded-xl bg-zinc-900/50" />}>
                    <UserInfo userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[300px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserActivity userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[320px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserStatsCharts userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} />
                </Suspense>


                <Suspense fallback={<Skeleton className="w-full h-[500px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserRecentMedia userId={jellyfinUserId} userIds={linkedUserIds} userDbIds={linkedUserDbIds} page={currentHistoryPage} />
                </Suspense>
            </div>
        </div>
    );
}
