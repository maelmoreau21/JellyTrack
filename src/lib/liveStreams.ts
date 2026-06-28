import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { buildStreamRedisKey } from "@/lib/serverRegistry";
import type { LiveStream, ActiveStreamRow } from "@/types/dashboard";

/**
 * Hydrates live streaming information from both the Prisma ActiveStream database
 * and real-time state stored in Redis.
 */
export async function getLiveStreams(selectedServerIds: string[]): Promise<{
  liveStreams: LiveStream[];
  totalBandwidthMbps: number;
  activeStreamsCount: number;
}> {
  const selectedServerScope = selectedServerIds.length > 0 ? { in: selectedServerIds } : undefined;

  // Source of truth: Prisma ActiveStream table
  const activeStreamEntries = (await prisma.activeStream.findMany({
    where: selectedServerScope ? { serverId: selectedServerScope } : undefined,
    include: {
      user: { select: { username: true } },
      media: {
        select: {
          jellyfinMediaId: true,
          title: true,
          type: true,
          parentId: true,
          artist: true,
          durationMs: true,
        },
      },
    },
  })) as unknown as ActiveStreamRow[];

  const activeStreamsCount = activeStreamEntries.length;
  let liveStreams: LiveStream[] = [];
  let totalBandwidthMbps = 0;

  if (activeStreamsCount > 0) {
    // Fetch real-time specifics from Redis if they exist
    const redisKeys = activeStreamEntries.map((s) => buildStreamRedisKey(s.serverId, s.sessionId));
    const redisPayloads = await Promise.all(redisKeys.map((k) => redis.get(k)));
    const redisMap = new Map<string, Record<string, unknown>>();

    redisPayloads.forEach((p, idx) => {
      if (p) {
        try {
          const parsed = JSON.parse(p);
          const stream = activeStreamEntries[idx];
          redisMap.set(`${stream.serverId}:${stream.sessionId}`, parsed);
        } catch {}
      }
    });

    const relatedPairs = new Set<string>();
    for (const entry of activeStreamEntries) {
      // We also need parent and grandparent for hierarchical display if not in Redis
      if (entry.media?.parentId) {
        relatedPairs.add(JSON.stringify([entry.serverId, entry.media.parentId]));
      }
    }

    const relatedTargets = Array.from(relatedPairs).map((pair) => {
      const parsed = JSON.parse(pair) as [string, string];
      return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
    });

    const relatedMedia =
      relatedTargets.length > 0
        ? await prisma.media.findMany({
            where: {
              OR: relatedTargets.map((target) => ({
                serverId: target.serverId,
                jellyfinMediaId: target.jellyfinMediaId,
              })),
            },
            select: {
              serverId: true,
              jellyfinMediaId: true,
              title: true,
              type: true,
              parentId: true,
              artist: true,
            },
          })
        : [];
    const mediaHierarchyMap = new Map(relatedMedia.map((m) => [`${m.serverId}:${m.jellyfinMediaId}`, m]));

    liveStreams = activeStreamEntries.map((dbStream) => {
      const payload = (redisMap.get(`${dbStream.serverId}:${dbStream.sessionId}`) || {}) as Record<string, unknown>;

      const isTranscoding =
        dbStream.playMethod === "Transcode" ||
        payload["isTranscoding"] === true ||
        payload["IsTranscoding"] === true;

      totalBandwidthMbps += isTranscoding ? 12 : 6;

      const itemMedia = dbStream.media;
      const parentMedia = itemMedia.parentId ? mediaHierarchyMap.get(`${dbStream.serverId}:${itemMedia.parentId}`) : null;
      const grandparentMedia = parentMedia?.parentId
        ? mediaHierarchyMap.get(`${dbStream.serverId}:${parentMedia.parentId}`)
        : null;

      // Build enriched subtitle
      let mediaSubtitle: string | null = null;
      if (typeof payload["mediaSubtitle"] === "string") {
        mediaSubtitle = payload["mediaSubtitle"] as string;
      } else if (itemMedia.type === "Episode" && parentMedia) {
        mediaSubtitle = grandparentMedia?.title ? `${grandparentMedia.title} — ${parentMedia.title}` : parentMedia.title;
      } else if ((itemMedia.type === "Audio" || itemMedia.type === "Track") && parentMedia) {
        const resolvedArtist = itemMedia.artist || parentMedia.artist || null;
        mediaSubtitle = resolvedArtist ? `${resolvedArtist} — ${parentMedia.title}` : parentMedia.title;
      } else if (parentMedia?.title) {
        mediaSubtitle = parentMedia.title;
      }

      // Calculate progress percentage
      let progressPercent = 0;
      if (typeof payload["progressPercent"] === "number") {
        progressPercent = payload["progressPercent"] as number;
      } else if (dbStream.positionTicks && itemMedia.durationMs && itemMedia.durationMs > 0) {
        const runTimeTicks = Number(itemMedia.durationMs) * 10_000;
        progressPercent = Math.min(100, Math.round((Number(dbStream.positionTicks) / runTimeTicks) * 100));
      }

      const audioLang = typeof payload["audioLanguage"] === "string" ? (payload["audioLanguage"] as string) : null;
      const audioC = typeof payload["audioCodec"] === "string" ? (payload["audioCodec"] as string) : null;
      const subLang = typeof payload["subtitleLanguage"] === "string" ? (payload["subtitleLanguage"] as string) : null;
      const subC = typeof payload["subtitleCodec"] === "string" ? (payload["subtitleCodec"] as string) : null;

      return {
        serverId: dbStream.serverId,
        sessionId: dbStream.sessionId,
        itemId: itemMedia.jellyfinMediaId,
        user: dbStream.user?.username || "Unknown",
        mediaTitle: itemMedia.title || "Unknown",
        mediaSubtitle,
        playMethod: dbStream.playMethod || "Unknown",
        device: dbStream.deviceName || "Unknown",
        country: dbStream.country || "Unknown",
        city: dbStream.city || "Unknown",
        progressPercent,
        isPaused: payload["isPaused"] === true || payload["IsPaused"] === true,
        parentItemId: itemMedia.parentId ?? null,
        audioLanguage: dbStream.audioLanguage || audioLang || null,
        audioCodec: dbStream.audioCodec || audioC || null,
        subtitleLanguage: dbStream.subtitleLanguage || subLang || null,
        subtitleCodec: dbStream.subtitleCodec || subC || null,
        audioStreamIndex:
          typeof payload["audioStreamIndex"] === "number"
            ? (payload["audioStreamIndex"] as number)
            : typeof payload["AudioStreamIndex"] === "number"
            ? (payload["AudioStreamIndex"] as number)
            : null,
        subtitleStreamIndex:
          typeof payload["subtitleStreamIndex"] === "number"
            ? (payload["subtitleStreamIndex"] as number)
            : typeof payload["SubtitleStreamIndex"] === "number"
            ? (payload["SubtitleStreamIndex"] as number)
            : null,
        mediaType: itemMedia.type,
        albumArtist: itemMedia.artist,
        posterItemId:
          itemMedia.type === "Audio" || itemMedia.type === "Track"
            ? itemMedia.parentId || itemMedia.jellyfinMediaId
            : itemMedia.jellyfinMediaId,
      };
    });
  }

  return {
    liveStreams,
    totalBandwidthMbps,
    activeStreamsCount,
  };
}
