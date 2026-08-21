import { Suspense } from "react";
import prisma from "@/lib/prisma";
import CleanupClient from "./CleanupClient";
import { Skeleton } from "@/components/ui/skeleton";
import { getTranslations } from 'next-intl/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getCleanupData } from "@/lib/cleanupData";

export const dynamic = "force-dynamic";

export default async function CleanupPage() {
    const sessionAuth = await getServerSession(authOptions);
    if (!sessionAuth?.user?.isAdmin) {
        redirect("/login");
    }
    const t = await getTranslations('cleanup');
    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between space-y-2 mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                </div>

                <Suspense fallback={<Skeleton className="w-full h-[600px] rounded-xl bg-zinc-900/50" />}>
                    <CleanupDataFetcher />
                </Suspense>
            </div>
        </div>
    );
}

async function CleanupDataFetcher() {
    const data = await getCleanupData();
    return <CleanupClient initialData={data} />;
}



