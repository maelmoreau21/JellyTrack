import prisma from "./prisma";
import { makeScopedLibraryExclusion, normalizeLibraryKey } from "./mediaPolicy";
import {
  buildJellyfinApiKeyHeaders,
  getConfiguredJellyfinServers,
  resolveServerApiKey,
} from "@/lib/jellyfinServers";

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
  let jellyfinNames: string[] = [];

  // 1. Fetch from all configured Jellyfin servers
  const configuredServers = await getConfiguredJellyfinServers().catch(() => []);
  const primaryEnvApiKey = String(process.env.JELLYFIN_API_KEY || '').trim();

  for (const server of configuredServers) {
    const baseUrl = String(server.url || '').trim().replace(/\/+$/, '');
    const apiKey = resolveServerApiKey(server, primaryEnvApiKey) || '';

    if (!baseUrl || !apiKey) continue;

    try {
      const response = await fetch(`${baseUrl}/Library/VirtualFolders`, {
        headers: buildJellyfinApiKeyHeaders(apiKey),
        cache: "no-store",
      });
      if (!response.ok) continue;

      const foldersRaw = await response.json() as unknown;
      if (!Array.isArray(foldersRaw)) continue;

      const currentNames = foldersRaw
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .filter(f => (f['CollectionType'] as string | undefined) !== 'boxsets')
        .map(f => String(f['Name'] ?? '').trim())
        .filter((n): n is string => n.length > 0);

      jellyfinNames.push(...currentNames);
    } catch (e) {
      console.error(`[LibraryUtils] Failed to fetch VirtualFolders from ${server.name}:`, e);
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

async function fetchServerVirtualFolderNames(baseUrl: string, apiKey: string): Promise<string[]> {
  const normalizedUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedApiKey = String(apiKey || '').trim();
  if (!normalizedUrl || !normalizedApiKey) return [];

  try {
    const response = await fetch(`${normalizedUrl}/Library/VirtualFolders`, {
      headers: buildJellyfinApiKeyHeaders(normalizedApiKey),
      cache: "no-store",
    });
    if (!response.ok) return [];

    const foldersRaw = await response.json() as unknown;
    if (!Array.isArray(foldersRaw)) return [];

    return foldersRaw
      .filter((folder): folder is Record<string, unknown> => typeof folder === 'object' && folder !== null)
      .filter((folder) => String(folder['CollectionType'] || '').trim().toLowerCase() !== 'boxsets')
      .map((folder) => String(folder['Name'] || '').trim())
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

export async function getServerLibraryScopes(): Promise<ServerLibraryScope[]> {
  const prismaAny = prisma as any;
  if (!prismaAny?.media || typeof prismaAny.media.findMany !== 'function') {
    return [];
  }

  const configuredServers = await getConfiguredJellyfinServers().catch(() => []);
  const primaryEnvApiKey = String(process.env.JELLYFIN_API_KEY || '').trim();

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

  for (const server of configuredServers) {
    serverMap.set(server.id, {
      name: String(server.name || server.id || 'Unknown server'),
      url: String(server.url || '').trim() || null,
    });
  }

  const seen = new Set<string>();
  const scoped: ServerLibraryScope[] = [];

  const registerScope = (input: {
    serverId: string;
    libraryName: string;
    serverName?: string | null;
    serverUrl?: string | null;
  }) => {
    const serverId = String(input.serverId || '').trim();
    const libraryName = String(input.libraryName || '').trim();
    if (!serverId || !libraryName) return;

    const key = makeScopedLibraryExclusion(serverId, libraryName);
    if (!key || seen.has(key)) return;

    const serverMeta = serverMap.get(serverId);
    scoped.push({
      key,
      serverId,
      serverName: String(input.serverName || serverMeta?.name || serverId),
      serverUrl: input.serverUrl !== undefined ? (input.serverUrl || null) : (serverMeta?.url || null),
      libraryName,
    });
    seen.add(key);
  };

  const liveLibraryResults = await Promise.all(
    configuredServers.map(async (server) => {
      const baseUrl = String(server.url || '').trim().replace(/\/+$/, '');
      const apiKey = resolveServerApiKey(server, primaryEnvApiKey) || '';

      const names = await fetchServerVirtualFolderNames(baseUrl, apiKey);
      return {
        serverId: server.id,
        serverName: server.name,
        serverUrl: baseUrl || null,
        names,
      };
    })
  );

  for (const entry of liveLibraryResults) {
    for (const libraryName of entry.names) {
      registerScope({
        serverId: entry.serverId,
        serverName: entry.serverName,
        serverUrl: entry.serverUrl,
        libraryName,
      });
    }
  }

  for (const row of mediaRows as Array<{ serverId: string; libraryName: string | null }>) {
    registerScope({
      serverId: row.serverId,
      libraryName: String(row.libraryName || ''),
    });
  }

  scoped.sort((left, right) => {
    const byServer = left.serverName.localeCompare(right.serverName, undefined, { sensitivity: 'base' });
    if (byServer !== 0) return byServer;
    return left.libraryName.localeCompare(right.libraryName, undefined, { sensitivity: 'base' });
  });

  return scoped;
}
