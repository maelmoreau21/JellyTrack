import prisma from "@/lib/prisma";
import { FallbackImage } from "@/components/FallbackImage";
import Link from "next/link";
import { Clock, Sparkles, Film, Tv, Music, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { getJellyfinImageUrl } from "@/lib/jellyfin";
import { normalizeResolution } from '@/lib/utils';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from 'next-intl/server';
import { buildExcludedMediaClause } from '@/lib/mediaPolicy';

export const dynamic = "force-dynamic";

const ITEMS_PER_PAGE = 40;

function getTypeBadge(type: string, tc: (k: string) => string) {
  switch (type) {
    case "Movie": return { label: tc('movie'), color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Film };
    case "Series": return { label: tc('seriesSingular'), color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Tv };
    case "Season": return { label: tc('season'), color: "bg-teal-500/20 text-teal-400 border-teal-500/30", icon: Tv };
    case "Episode": return { label: tc('episode'), color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Tv };
    case "MusicAlbum": return { label: tc('album'), color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Music };
    case "Audio": return { label: tc('track'), color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: Music };
    default: return { label: type, color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: BookOpen };
  }
}

function isNew(date: Date): boolean {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return date >= sevenDaysAgo;
}

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  const t = await getTranslations('recent');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    const uid = (session?.user as unknown as { jellyfinUserId?: string })?.jellyfinUserId;
    redirect(uid ? `/users/${uid}` : "/login");
  }

  const sParams = await searchParams;
  const type = sParams.type;
  const currentPage = Math.max(1, parseInt(sParams.page || "1", 10) || 1);

  // Retrieve settings for excluded libraries
  const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
  const excludedLibraries = settings?.excludedLibraries || [];

  // Build type filter — show parent-level items (Movie, Series, MusicAlbum) by default
  const displayTypes = type === "movie" ? ["Movie"]
    : type === "series" ? ["Series"]
    : type === "music" ? ["MusicAlbum"]
    : ["Movie", "Series", "MusicAlbum"];

  const mediaWhere = (() => {
    const clauses: Record<string, unknown>[] = [{ type: { in: displayTypes } } as Record<string, unknown>];
    const excluded = buildExcludedMediaClause(excludedLibraries);
    if (excluded) clauses.push(excluded as Record<string, unknown>);
    return { AND: clauses };
  })();

  const totalCount = await prisma.media.count({ where: mediaWhere });
  console.log(`[RecentPage] Filters:`, JSON.stringify(mediaWhere, null, 2));
  console.log(`[RecentPage] Total count for filters: ${totalCount}`);
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);

  const recentMedia = await prisma.media.findMany({
    where: mediaWhere,
    orderBy: [{ dateAdded: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: ITEMS_PER_PAGE,
    skip: (page - 1) * ITEMS_PER_PAGE,
    select: {
      id: true,
      jellyfinMediaId: true,
      title: true,
      type: true,
      genres: true,
      resolution: true,
      parentId: true,
      dateAdded: true,
      createdAt: true,
      _count: { select: { playbackHistory: true } },
    },
  });

  const buildUrl = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    if (params.type) sp.set("type", params.type);
    if (params.page) sp.set("page", params.page);
    return `/recent?${sp.toString()}`;
  };

  return (
    <div className="flex-col md:flex">
      <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-primary" />
              {t('title')}
            </h2>
            <Tabs defaultValue={type || "all"} className="w-full md:w-[380px]">
              <TabsList className="app-field border-zinc-700/60 w-full">
                <TabsTrigger value="all" asChild><Link href={buildUrl({})}>{tc('all')}</Link></TabsTrigger>
                <TabsTrigger value="movie" asChild><Link href={buildUrl({ type: "movie" })}>{tc('movies')}</Link></TabsTrigger>
                <TabsTrigger value="series" asChild><Link href={buildUrl({ type: "series" })}>{tc('series')}</Link></TabsTrigger>
                <TabsTrigger value="music" asChild><Link href={buildUrl({ type: "music" })}>{tc('music')}</Link></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <span className="app-chip text-sm px-2.5 py-1 rounded-md">{totalCount} {t('mediaCount')}</span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
          {recentMedia.map((media) => {
            const badge = getTypeBadge(media.type, tc);
            const Icon = badge.icon;
            const dateAdded = new Date(media.dateAdded || media.createdAt);
            const isRecent = isNew(dateAdded);
            const plays = media._count.playbackHistory;

            return (
              <Link key={media.id} href={`/media/${media.jellyfinMediaId}`} className="group flex flex-col space-y-2 relative">
                <div className={`app-surface-soft relative w-full ${media.type === 'Episode' ? 'aspect-video' : ['MusicAlbum', 'Audio'].includes(media.type) ? 'aspect-square' : 'aspect-[2/3]'} rounded-lg overflow-hidden ring-1 ring-white/10 shadow-lg`}>
                  <FallbackImage
                    src={getJellyfinImageUrl(media.jellyfinMediaId, 'Primary', media.parentId || undefined)}
                    alt={media.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110 group-hover:brightness-50"
                  />
                  {/* NOUVEAU badge — animated glow */}
                  {isRecent && (
                    <div className="absolute top-2 left-2 z-10">
                      <Badge className="bg-primary text-white border-0 text-[10px] px-2 py-0.5 font-bold shadow-lg shadow-primary/30 animate-pulse">
                        {t('newBadge')}
                      </Badge>
                    </div>
                  )}
                  {/* Type badge */}
                  <div className="absolute top-2 right-2 z-10">
                    <Badge className={`${badge.color} border text-[10px] px-1.5 py-0.5 backdrop-blur-sm`}>
                      <Icon className="w-3 h-3 mr-1" />
                      {badge.label}
                    </Badge>
                  </div>
                  {/* Hover overlay with metadata */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                    <h3 className="text-sm font-bold text-white truncate">{media.title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-300 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {dateAdded.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    {plays > 0 && (
                      <span className="text-[11px] text-primary mt-0.5">{plays} {plays > 1 ? tc('plays') : tc('play')}</span>
                    )}
                    {media.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {media.genres.slice(0, 3).map(g => (
                          <span key={g} className="text-[10px] bg-zinc-200/60 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-full">{g}</span>
                        ))}
                      </div>
                    )}
                    {media.resolution && (
                      <Badge className="mt-1.5 w-fit bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 border text-[10px] px-1.5 py-0">
                        {normalizeResolution(media.resolution)}
                      </Badge>
                    )}
                  </div>
                  {/* Static bottom gradient for title visibility */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent group-hover:opacity-0 transition-opacity duration-300 pointer-events-none" />
                </div>
                {/* Title below poster (visible when not hovering) */}
                <div className="px-0.5">
                  <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{media.title}</h3>
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {dateAdded.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    {plays > 0 && <span className="text-zinc-400 ml-1">· {plays} {plays > 1 ? tc('views') : tc('view')}</span>}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {recentMedia.length === 0 && (
          <Card className="app-surface">
            <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Sparkles className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('noMedia')}</p>
              <p className="text-sm mt-1">{t('noMediaDesc')}</p>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={buildUrl({ type, page: String(page - 1) })} className="app-field flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-slate-700/50">
                <ChevronLeft className="w-4 h-4" /> {tc('previous')}
              </Link>
            )}
            <span className="app-chip text-sm px-4 py-1 rounded-md">Page {page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={buildUrl({ type, page: String(page + 1) })} className="app-field flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-slate-700/50">
                {tc('next')} <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
