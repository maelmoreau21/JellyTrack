import prisma from "@/lib/prisma";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { subDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { PlayCircle, Clock, Users, Trophy, Sparkles } from "lucide-react";
import { getTranslations, getLocale } from 'next-intl/server';

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
    const t = await getTranslations('newsletter');
    const tc = await getTranslations('common');
    const locale = await getLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    // Total Metrics
    const totalMetrics = await prisma.playbackHistory.aggregate({
        _sum: { durationWatched: true },
        _count: { id: true },
        where: { 
            startedAt: { gte: thirtyDaysAgo },
            ...ZAPPING_CONDITION
        }
    });
    const totalHours = ((totalMetrics._sum.durationWatched || 0) / 3600).toFixed(0);
    const totalPlays = totalMetrics._count.id;

    // Top 3 Media
    const topMediaAgg = await prisma.playbackHistory.groupBy({
        by: ['mediaId'],
        _sum: { durationWatched: true },
        where: { 
            startedAt: { gte: thirtyDaysAgo },
            ...ZAPPING_CONDITION
        },
        orderBy: { _sum: { durationWatched: 'desc' } },
        take: 3
    });

    const topMedia = await Promise.all(
        topMediaAgg.map(async (agg) => {
            if (!agg.mediaId) return null;
            const m = await prisma.media.findUnique({ where: { id: agg.mediaId } });
            return {
                title: m?.title || tc('unknownMedia'),
                type: m?.type || "Unknown",
                jellyfinId: m?.jellyfinMediaId,
                hours: ((agg._sum.durationWatched || 0) / 3600).toFixed(1)
            };
        })
    );
    const validTopMedia = topMedia.filter(Boolean);

    // Top User
    const topUserAgg = await prisma.playbackHistory.groupBy({
        by: ['userId'],
        _sum: { durationWatched: true },
        where: { 
            startedAt: { gte: thirtyDaysAgo },
            ...ZAPPING_CONDITION
        },
        orderBy: { _sum: { durationWatched: 'desc' } },
        take: 1
    });

    let topUser = null;
    if (topUserAgg.length > 0 && topUserAgg[0].userId) {
        const u = await prisma.user.findUnique({ where: { id: topUserAgg[0].userId } });
        topUser = {
            name: u?.username || tc('deletedUser'),
            hours: ((topUserAgg[0]._sum.durationWatched || 0) / 3600).toFixed(0)
        };
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white p-4 md:p-8 flex flex-col items-center justify-center font-sans">
            <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative mb-6 md:mb-8">
                {/* Header Section */}
                <div className="relative h-56 md:h-64 bg-indigo-900/40 overflow-hidden flex flex-col items-center justify-center text-center p-4 md:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-500/30 via-transparent to-transparent opacity-80" />
                    <Sparkles className="w-12 h-12 text-indigo-400 mb-4 animate-pulse relative z-10" />
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-2 relative z-10">
                        JellyTrack Rewind
                    </h1>
                    <p className="text-zinc-400 dark:text-zinc-300 font-medium relative z-10">
                        {t('monthlyRecap')}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2 relative z-10 font-mono">
                        {format(thirtyDaysAgo, 'dd MMM yyyy', { locale: dateFnsLocale })} - {format(today, 'dd MMM yyyy', { locale: dateFnsLocale })}
                    </p>
                </div>

                {/* Main Content */}
                <div className="p-4 md:p-8 lg:p-12 space-y-8 md:space-y-12">
                    {/* Big Numbers */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-zinc-100/60 dark:bg-zinc-800/50 rounded-2xl p-6 text-center border border-zinc-200/60 dark:border-zinc-700/50">
                            <Clock className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                            <div className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white">{totalHours}h</div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium pb-2 border-b border-zinc-200/50 dark:border-zinc-700/50">{t('hoursWatched')}</div>
                        </div>
                        <div className="bg-zinc-100/60 dark:bg-zinc-800/50 rounded-2xl p-6 text-center border border-zinc-200/60 dark:border-zinc-700/50">
                            <PlayCircle className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                            <div className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white">{totalPlays}</div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium pb-2 border-b border-zinc-200/50 dark:border-zinc-700/50">{t('totalPlays')}</div>
                        </div>
                    </div>

                    {/* Top Media */}
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <Trophy className="w-6 h-6 text-yellow-500" />
                            <h2 className="text-2xl font-bold">{t('videoPodium')}</h2>
                        </div>
                        <div className="space-y-4">
                            {validTopMedia.map((media, i) => (
                                <div key={i} className="flex items-center gap-6 p-4 rounded-2xl bg-zinc-100/40 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <h3 className="text-3xl font-black text-zinc-400 dark:text-zinc-600 w-8 text-center">
                                        {i + 1}
                                    </h3>
                                    <div className="relative w-16 h-24 rounded-lg overflow-hidden shrink-0 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-md">
                                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('/api/jellyfin/image?itemId=${media?.jellyfinId}&type=Primary')` }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-lg font-bold text-zinc-900 dark:text-white truncate">{media?.title}</h4>
                                        <p className="text-zinc-500 dark:text-zinc-400 text-sm">{media?.type}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold text-emerald-400">{media?.hours}h</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top User */}
                    {topUser && (
                        <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
                            <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                                <Users className="w-8 h-8 text-indigo-400" />
                            </div>
                            <div className="text-center sm:text-left flex-1 border-b sm:border-b-0 sm:border-r border-indigo-500/20 pb-4 sm:pb-0 sm:pr-6">
                                <p className="text-sm text-indigo-400 dark:text-indigo-300 font-medium mb-1">{t('bestViewer')}</p>
                                <p className="text-2xl font-black text-zinc-900 dark:text-white truncate">{topUser.name}</p>
                            </div>
                            <div className="text-center sm:text-right pt-4 sm:pt-0 sm:pl-2">
                                <div className="text-3xl font-black text-zinc-900 dark:text-white">{topUser.hours}h</div>
                                <p className="text-sm text-indigo-400 dark:text-indigo-300 font-medium">{t('hoursWatched')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <p className="text-zinc-500 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> {t('shareHint')}
            </p>
        </div>
    );
}
