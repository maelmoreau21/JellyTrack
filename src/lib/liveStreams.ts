import prisma from "@/lib/prisma";
import valkey from "@/lib/valkey";
import { buildStreamValkeyKey } from "@/lib/serverRegistry";
import type { LiveStream, ActiveStreamRow } from "@/types/dashboard";

/**
 * Hydrates live streaming information from both the Prisma ActiveStream database
 * and real-time state stored in Valkey.
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
    // Fetch real-time specifics from Valkey if they exist
    const valkeyKeys = activeStreamEntries.map((s) => buildStreamValkeyKey(s.serverId, s.sessionId));
    const valkeyPayloads = await Promise.all(valkeyKeys.map((k) => valkey.get(k)));
    const valkeyMap = new Map<string, Record<string, unknown>>();

    valkeyPayloads.forEach((p, idx) => {
      if (p) {
        try {
          const parsed = JSON.parse(p);
          const stream = activeStreamEntries[idx];
          valkeyMap.set(`${stream.serverId}:${stream.sessionId}`, parsed);
        } catch {}
      }
    });

    const relatedPairs = new Set<string>();
    for (const entry of activeStreamEntries) {
      // We also need parent and grandparent for hierarchical display if not in Valkey
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
      const payload = (valkeyMap.get(`${dbStream.serverId}:${dbStream.sessionId}`) || {}) as Record<string, unknown>;

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

export interface UserActiveStreamInfo {
  serverId: string;
  sessionId: string;
  itemId: string;
  parentItemId?: string | null;
  mediaTitle: string;
  mediaSubtitle: string | null;
  playMethod: string;
  clientName: string;
  deviceName: string;
  progressPercent: number;
  isPaused: boolean;
  mediaType?: string | null;
}

/**
 * Retrieves the currently active stream for a user across all their linked DB IDs.
 * Combines database state with real-time Valkey state and multi-tier progress computation.
 */
export async function getUserActiveStream(userDbIds: string[]): Promise<UserActiveStreamInfo | null> {
  if (!userDbIds || userDbIds.length === 0) return null;

  const dbStream = await prisma.activeStream.findFirst({
    where: { userId: { in: userDbIds } },
    orderBy: { lastPingAt: "desc" },
    include: {
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
  });

  if (!dbStream || !dbStream.media) return null;

  const valkeyKey = buildStreamValkeyKey(dbStream.serverId, dbStream.sessionId);
  let payload: Record<string, unknown> = {};
  try {
    const valkeyPayload = await valkey.get(valkeyKey);
    if (valkeyPayload) {
      payload = JSON.parse(valkeyPayload);
    }
  } catch {}

  const itemMedia = dbStream.media;

  // Calculate progress percentage with multiple fallback layers
  let progressPercent = 0;
  if (typeof payload["progressPercent"] === "number") {
    progressPercent = payload["progressPercent"] as number;
  } else if (typeof payload["ProgressPercent"] === "number") {
    progressPercent = payload["ProgressPercent"] as number;
  } else {
    const runTimeTicks = Number(
      payload["runTimeTicks"] ||
      payload["RunTimeTicks"] ||
      (itemMedia.durationMs ? Number(itemMedia.durationMs) * 10_000 : 0)
    );
    const posTicks = Number(
      payload["positionTicks"] ??
      payload["PositionTicks"] ??
      payload["playbackPositionTicks"] ??
      payload["PlaybackPositionTicks"] ??
      dbStream.positionTicks ??
      0
    );
    if (runTimeTicks > 0 && posTicks > 0) {
      progressPercent = Math.min(100, Math.max(0, Math.round((posTicks / runTimeTicks) * 100)));
    }
  }

  // Build enriched subtitle
  let mediaSubtitle: string | null = null;
  if (typeof payload["mediaSubtitle"] === "string") {
    mediaSubtitle = payload["mediaSubtitle"] as string;
  } else if (itemMedia.parentId) {
    try {
      const parentMedia = await prisma.media.findUnique({
        where: {
          jellyfinMediaId_serverId: {
            jellyfinMediaId: itemMedia.parentId,
            serverId: dbStream.serverId,
          },
        },
        select: { title: true, parentId: true, artist: true },
      });
      if (parentMedia) {
        if (itemMedia.type === "Episode" && parentMedia.parentId) {
          const grandParent = await prisma.media.findUnique({
            where: {
              jellyfinMediaId_serverId: {
                jellyfinMediaId: parentMedia.parentId,
                serverId: dbStream.serverId,
              },
            },
            select: { title: true },
          });
          mediaSubtitle = grandParent?.title ? `${grandParent.title} — ${parentMedia.title}` : parentMedia.title;
        } else if (itemMedia.type === "Audio" || itemMedia.type === "Track") {
          const resolvedArtist = itemMedia.artist || parentMedia.artist || null;
          mediaSubtitle = resolvedArtist ? `${resolvedArtist} — ${parentMedia.title}` : parentMedia.title;
        } else {
          mediaSubtitle = parentMedia.title;
        }
      }
    } catch {}
  }

  const isPaused = payload["isPaused"] === true || payload["IsPaused"] === true;

  return {
    serverId: dbStream.serverId,
    sessionId: dbStream.sessionId,
    itemId: itemMedia.jellyfinMediaId,
    parentItemId: itemMedia.parentId,
    mediaTitle: itemMedia.title || "Unknown",
    mediaSubtitle,
    playMethod: dbStream.playMethod || "DirectPlay",
    clientName: dbStream.clientName || "Inconnu",
    deviceName: dbStream.deviceName || "Inconnu",
    progressPercent,
    isPaused,
    mediaType: itemMedia.type,
  };
}
