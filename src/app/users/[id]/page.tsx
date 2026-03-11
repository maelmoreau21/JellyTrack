import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import UserInfo from "./UserInfo";
import UserActivity from "./UserActivity";
import UserRecentMedia from "./UserRecentMedia";
import UserStatsCharts from "./UserStatsCharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from 'next-intl/server';

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

    const user = await prisma.user.findUnique({
        where: { jellyfinUserId },
        select: { username: true, jellyfinUserId: true },
    });

    if (!user) notFound();

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
                    <a
                        href={`/wrapped/${jellyfinUserId}`}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white transition-all bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-full hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                    >
                        ðŸŽ {t('viewWrapped')}
                    </a>
                </div>

                <Suspense fallback={<Skeleton className="w-full h-[250px] rounded-xl bg-zinc-900/50" />}>
                    <UserInfo userId={jellyfinUserId} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[300px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserActivity userId={jellyfinUserId} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[320px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserStatsCharts userId={jellyfinUserId} />
                </Suspense>

                <Suspense fallback={<Skeleton className="w-full h-[500px] rounded-xl bg-zinc-900/50 mt-6" />}>
                    <UserRecentMedia userId={jellyfinUserId} page={currentHistoryPage} />
                </Suspense>
            </div>
        </div>
    );
}
