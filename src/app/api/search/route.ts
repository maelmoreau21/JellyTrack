import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { formatMediaSubtitle } from "@/lib/mediaSubtitle";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ media: [], users: [] });
  }

  const isAdmin = session.user.isAdmin === true;

  // Search media across movies, series, albums, episodes, and tracks
  const rawMedia = await prisma.media.findMany({
    where: {
      type: { in: ["Movie", "Series", "MusicAlbum", "Episode", "Audio"] },
      libraryName: { not: null },
      AND: [
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { directors: { has: q } },
            { actors: { has: q } },
            { studios: { has: q } },
          ],
        },
      ],
    },
    select: {
      id: true,
      serverId: true,
      jellyfinMediaId: true,
      title: true,
      type: true,
      parentId: true,
      artist: true,
    },
    take: 10,
    orderBy: { title: "asc" },
  });

  // Fetch parents for episodes and audio tracks
  const parentPairs = new Set<string>();
  rawMedia.forEach((m) => {
    if (m.parentId && m.serverId) {
      parentPairs.add(JSON.stringify([m.serverId, m.parentId]));
    }
  });
  const parentTargets = Array.from(parentPairs).map((pair) => {
    const parsed = JSON.parse(pair) as [string, string];
    return { serverId: parsed[0], jellyfinMediaId: parsed[1] };
  });
  const parentMedia = parentTargets.length > 0
    ? await prisma.media.findMany({
        where: {
          OR: parentTargets.map((target) => ({
            serverId: target.serverId,
            jellyfinMediaId: target.jellyfinMediaId,
          })),
        },
        select: { serverId: true, jellyfinMediaId: true, title: true, type: true, artist: true },
      })
    : [];
  const parentMap = new Map(parentMedia.map(pm => [`${pm.serverId}:${pm.jellyfinMediaId}`, pm]));

  const media = rawMedia.map((m) => {
    const parent = m.parentId ? parentMap.get(`${m.serverId}:${m.parentId}`) : null;
    const subtitle = formatMediaSubtitle({
      type: m.type,
      parentTitle: parent?.title || null,
      artist: m.artist || parent?.artist || null,
    });
    return {
      jellyfinMediaId: m.jellyfinMediaId,
      title: m.title,
      type: m.type,
      parentId: m.parentId,
      subtitle,
    };
  });

  // Only admins can search users
  let users: { jellyfinUserId: string; username: string }[] = [];
  if (isAdmin) {
    users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: "insensitive" },
      },
      select: {
        jellyfinUserId: true,
        username: true,
      },
      take: 5,
      orderBy: { username: "asc" },
    });
  }

  return NextResponse.json({ media, users });
}
