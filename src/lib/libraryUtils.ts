import prisma from "./prisma";
import { makeScopedLibraryExclusion, normalizeLibraryKey } from "./mediaPolicy";

/**
 * Common list of 'ghost' library names created by sync fallbacks
 * or Jellyfin internal pseudo-libraries.
 */
export const GHOST_LIBRARY_NAMES = [
  'Movies', 'TV Shows', 'Music', 'Books', 
  'movies', 'tvshows', 'music', 'books', 
  'Collections'
];

export type ServerLibraryScope = {
  key: string;
  serverId: string;
  serverName: string;
  serverUrl: string | null;
  libraryName: string;
};

/**
 * Fetches the list of library names from both Jellyfin (via VirtualFolders)
 * and the local Database, filtering out ghost names and pseudo-libraries.
 */
export async function getSanitizedLibraryNames() {
  const jellyfinUrl = process.env.JELLYFIN_URL;
  const jellyfinApiKey = process.env.JELLYFIN_API_KEY;

  let jellyfinNames: string[] = [];

  // 1. Fetch from Jellyfin
  if (jellyfinUrl && jellyfinApiKey) {
    try {
      const response = await fetch(`${jellyfinUrl}/Library/VirtualFolders`, {
        headers: { "X-Emby-Token": jellyfinApiKey },
        cache: "no-store",
      });
      if (response.ok) {
        const foldersRaw = await response.json() as unknown;
        if (Array.isArray(foldersRaw)) {
          jellyfinNames = foldersRaw
            .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
            .filter(f => (f['CollectionType'] as string | undefined) !== 'boxsets')
            .map(f => String(f['Name'] ?? '').trim())
            .filter((n): n is string => n.length > 0);
        }
      }
    } catch (e) {
      console.error("[LibraryUtils] Failed to fetch Jellyfin VirtualFolders:", e);
    }
  }

  // 2. Fetch from Database
  const dbEntries = await prisma.media.findMany({
    distinct: ["libraryName"],
    where: { libraryName: { not: null } },
    select: { libraryName: true }
  });
  const dbNames = dbEntries.map(e => e.libraryName as string);

  // 3. Consolidate & Filter using normalized keys to avoid duplicates
  const ghostSet = new Set(GHOST_LIBRARY_NAMES);
  const normalizedToOriginal = new Map<string, string>();

  // Helper to add a name with normalization logic
  const addName = (name: string, isFromJellyfin: boolean) => {
    if (ghostSet.has(name) && !isFromJellyfin) return;
    
    // Normalize accent/case for grouping (e.g. "musique" vs "Musique" vs "Musique ")
    const norm = normalizeLibraryKey(name) || name.trim().toLowerCase();
    
    // If it's from Jellyfin, it always wins as the display name
    // If it's from DB and we don't have a name for this normalized key yet, keep it.
    if (isFromJellyfin || !normalizedToOriginal.has(norm)) {
      normalizedToOriginal.set(norm, name);
    }
  };

  jellyfinNames.forEach(n => addName(n, true));
  dbNames.forEach(n => addName(n, false));

  return Array.from(normalizedToOriginal.values()).sort((a, b) => a.localeCompare(b));
}

function normalizeLibraryNameIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function getServerLibraryScopes(): Promise<ServerLibraryScope[]> {
  const prismaAny = prisma as any;
  if (!prismaAny?.media || typeof prismaAny.media.findMany !== 'function') {
    return [];
  }

  const [serverRows, mediaRows] = await Promise.all([
    prismaAny?.server && typeof prismaAny.server.findMany === 'function'
      ? prismaAny.server.findMany({
          select: { id: true, name: true, url: true },
        })
      : Promise.resolve([]),
    prismaAny.media.findMany({
      where: { libraryName: { not: null } },
      select: { serverId: true, libraryName: true },
      distinct: ['serverId', 'libraryName'],
    }),
  ]);

  const serverMap = new Map<string, { name: string; url: string | null }>(
    (serverRows || []).map((row: { id: string; name: string; url?: string | null }) => [
      row.id,
      {
        name: String(row.name || row.id || 'Unknown server'),
        url: row.url ? String(row.url) : null,
      },
    ])
  );

  const ghostSet = new Set(GHOST_LIBRARY_NAMES.map((name) => normalizeLibraryNameIdentity(name)));
  const seen = new Set<string>();
  const scoped: ServerLibraryScope[] = [];

  for (const row of mediaRows as Array<{ serverId: string; libraryName: string | null }>) {
    const serverId = String(row.serverId || '').trim();
    const libraryName = String(row.libraryName || '').trim();
    if (!serverId || !libraryName) continue;

    if (ghostSet.has(normalizeLibraryNameIdentity(libraryName))) continue;

    const key = makeScopedLibraryExclusion(serverId, libraryName);
    if (!key || seen.has(key)) continue;

    const serverMeta = serverMap.get(serverId);
    scoped.push({
      key,
      serverId,
      serverName: serverMeta?.name || serverId,
      serverUrl: serverMeta?.url || null,
      libraryName,
    });
    seen.add(key);
  }

  scoped.sort((left, right) => {
    const byServer = left.serverName.localeCompare(right.serverName, undefined, { sensitivity: 'base' });
    if (byServer !== 0) return byServer;
    return left.libraryName.localeCompare(right.libraryName, undefined, { sensitivity: 'base' });
  });

  return scoped;
}
