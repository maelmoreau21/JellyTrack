import prisma from "./prisma";
import { markSyncFinished, markSyncStarted } from "@/lib/systemHealth";
import { normalizeJellyfinId } from "@/lib/jellyfinId";
import { cleanupOrphanedSessions } from "@/lib/cleanup";
import { GHOST_LIBRARY_NAMES } from "./libraryUtils";

/**
 * Fonction maîtresse de synchronisation de la librairie Jellyfin.
 * Interroge l'API Jellyfin pour récupérer les Utilisateurs et les Médias (Films, Séries, Épisodes),
 * et effectue un Upsert massif dans la base PostgreSQL via Prisma.
 */
export async function syncJellyfinLibrary(options?: { recentOnly?: boolean }) {
    const mode = options?.recentOnly ? 'récente (7 derniers jours)' : 'complète';
    console.log(`[Sync] Démarrage de la synchronisation ${mode} de la librairie Jellyfin...`);
    await markSyncStarted(options?.recentOnly ? 'recent' : 'full');

    // Nettoyage de l'URL (suppression du slash final superflu)
    const baseUrl = (process.env.JELLYFIN_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.JELLYFIN_API_KEY;

    if (!baseUrl || !apiKey) {
        console.error("[Sync Error] JELLYFIN_URL ou JELLYFIN_API_KEY manquants.");
        return { success: false, error: "Server not configured. Please check JELLYFIN_URL and JELLYFIN_API_KEY in your settings/env." };
    }
    const jellyfinHeaders = { "X-Emby-Token": apiKey };

    const fetchWithRetry = async (url: string, options: RequestInit = {}, timeout = 30000, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(id);
                if (!response.ok && [500, 502, 503, 504].includes(response.status)) {
                    throw new Error(`HTTP ${response.status} from server`);
                }
                return response;
            } catch (e: unknown) {
                clearTimeout(id);
                const err = e as { name?: string; message?: string };
                const isAbort = err.name === 'AbortError';
                const errorMsg = isAbort ? `Timeout (${timeout}ms)` : (err.message || "Unknown Network Error");
                
                console.warn(`[Sync Warning] Tentative ${i + 1}/${maxRetries} échouée pour ${url.split('?')[0]}: ${errorMsg}`);
                
                if (i === maxRetries - 1) {
                    console.error(`[Sync Error] Échec final après ${maxRetries} tentatives. URL: ${url}. Erreur:`, e);
                    throw e;
                }
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            }
        }
        throw new Error("Max retries exceeded");
    };

    try {
        // --- AUTOMATIC GHOST CLEANUP ---
        // If we have items assigned to "ghost" libraries (Movies, TV Shows, etc.),
        // we nullify them to force re-evaluation or simple exclusion from stats.
        try {
            const cleanup = await prisma.media.updateMany({
                where: {
                    OR: [
                        { libraryName: { in: GHOST_LIBRARY_NAMES } },
                        { collectionType: 'boxsets' }
                    ]
                },
                data: {
                    libraryName: null,
                    collectionType: null
                }
            });
            if (cleanup.count > 0) {
                console.log(`[Sync] Cleaned up ${cleanup.count} ghost/collection entries.`);
            }
        } catch (e) {
            console.error("[Sync] Ghost cleanup failed:", e);
        }
        // -------------------------------

        // 1. Sync Users
        const usersRes = await fetchWithRetry(`${baseUrl}/Users`, { headers: jellyfinHeaders });
        const users = await usersRes.json();
        let usersCount = 0;
        for (const user of users) {
            const jellyfinUserId = normalizeJellyfinId(user.Id);
            if (!jellyfinUserId) continue;
            await prisma.user.upsert({
                where: { jellyfinUserId },
                update: { username: user.Name },
                create: { jellyfinUserId, username: user.Name },
            });
            usersCount++;
        }

        // 2. Build Library Mapping (VirtualFolders + UserViews)
        const libraryNameMap = new Map<string, string>();
        const libraryCollectionMap = new Map<string, string>();

        const vfRes = await fetchWithRetry(`${baseUrl}/Library/VirtualFolders`, { headers: jellyfinHeaders });
        if (vfRes.ok) {
            const folders = await vfRes.json() as Array<{ CollectionType?: string; Id?: string; ItemId?: string; Name?: string }>;
            folders.forEach((f) => {
                if (f.CollectionType === 'boxsets') return;
                const keys = [f.Id, f.ItemId].filter(Boolean) as string[];
                keys.forEach(k => {
                    if (f.Name) libraryNameMap.set(k, f.Name);
                    if (f.CollectionType) libraryCollectionMap.set(k, f.CollectionType);
                });
            });
        }

        const uvRes = await fetchWithRetry(`${baseUrl}/UserViews`, { headers: jellyfinHeaders });
        if (uvRes.ok) {
            const views = await uvRes.json() as { Items?: Array<{ CollectionType?: string; Id?: string; ItemId?: string; Name?: string }> };
            (views.Items || []).forEach((v) => {
                if (v.CollectionType === 'boxsets') return;
                const keys = [v.Id, v.ItemId].filter(Boolean) as string[];
                keys.forEach(k => {
                    if (v.Name) libraryNameMap.set(k, v.Name);
                    if (v.CollectionType) libraryCollectionMap.set(k, v.CollectionType);
                });
            });
        }

        // 3. Sync Media Items
        const baseItemsQuery = `IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum,Book,BoxSet&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId,People,Studios`;
        let minDateParam = '';
        if (options?.recentOnly) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            minDateParam = `&MinDateCreated=${sevenDaysAgo.toISOString()}&SortBy=DateCreated&SortOrder=Descending`;
        }

        const pageSize = 200;
        type JellyfinItem = Record<string, any>;
        const items: JellyfinItem[] = [];
        let startIndex = 0;
        while (true) {
            const pageUrl = `${baseUrl}/Items?${baseItemsQuery}${minDateParam}&StartIndex=${startIndex}&Limit=${pageSize}`;
            const pageRes = await fetchWithRetry(pageUrl, { headers: jellyfinHeaders }, 60000, 4);
            const pageData = await pageRes.json();
            const pageItems = pageData.Items || [];
            items.push(...pageItems);
            if (pageItems.length < pageSize) break;
            startIndex += pageSize;
            if (startIndex >= 50000) break; // Safety
        }

        // Cache for faster lookup of parent library names
        const itemLibraryCache = new Map<string, string>();
        const itemCollectionCache = new Map<string, string>();

        let mediaCount = 0;
        for (const item of items) {
            try {
                const jellyfinMediaId = normalizeJellyfinId(item.Id);
                if (!jellyfinMediaId) continue;

                // Resolve Library Name & Collection Type
                let libraryName: string | null = null;
                let collectionType: string | null = item.CollectionType || null;

                // 1. Direct check in library maps
                const potentialParents = [item.ParentId, item.SeasonId, item.SeriesId, item.AlbumId].filter(Boolean);
                for (const pid of potentialParents) {
                    if (libraryNameMap.has(pid)) {
                        libraryName = libraryNameMap.get(pid)!;
                        if (!collectionType) collectionType = libraryCollectionMap.get(pid) || null;
                        break;
                    }
                    if (itemLibraryCache.has(pid)) {
                        libraryName = itemLibraryCache.get(pid)!;
                        if (!collectionType) collectionType = itemCollectionCache.get(pid) || null;
                        break;
                    }
                }

                // 2. Fallbacks based on item type if still not resolved
                if (!collectionType) {
                    if (item.Type === 'Movie' || item.Type === 'BoxSet') collectionType = 'movies';
                    else if (['Series', 'Season', 'Episode'].includes(item.Type)) collectionType = 'tvshows';
                    else if (['Audio', 'MusicAlbum'].includes(item.Type)) collectionType = 'music';
                    else if (item.Type === 'Book') collectionType = 'books';
                }

                if (!libraryName && collectionType) {
                    libraryName = collectionType;
                }

                // Cache the resolution for children of this item
                if (libraryName) {
                    itemLibraryCache.set(item.Id, libraryName);
                    if (collectionType) itemCollectionCache.set(item.Id, collectionType);
                }

                // Extract metadata
                const genres = item.Genres || [];
                const studios = ((item.Studios as Array<{ Name?: string }> | undefined) || []).map(s => s.Name).filter(Boolean) as string[];
                const people = (item.People as Array<{ Type?: string; Name?: string }> | undefined) || [];
                const directors = people.filter((p) => p.Type === "Director").map((p) => p.Name).filter(Boolean) as string[];
                const actors = people.filter((p) => p.Type === "Actor").map((p) => p.Name).filter(Boolean) as string[];

                let resolution: string | null = null;
                let sizeVal: bigint | null = null;
                if (item.MediaSources?.[0]) {
                    const ms = item.MediaSources[0];
                    sizeVal = ms.Size ? BigInt(ms.Size) : null;
                    const vs = ms.MediaStreams?.find((s: unknown) => ((s as Record<string, unknown>)['Type'] === 'Video')) as Record<string, unknown> | undefined;
                    // Coerce stream width/height candidates to numbers safely
                    const widthCandidate = vs?.Width;
                    const heightCandidate = vs?.Height;
                    const widthNum = (typeof widthCandidate === 'number') ? widthCandidate : (typeof widthCandidate === 'string' && !Number.isNaN(Number(widthCandidate)) ? Number(widthCandidate) : null);
                    const heightNum = (typeof heightCandidate === 'number') ? heightCandidate : (typeof heightCandidate === 'string' && !Number.isNaN(Number(heightCandidate)) ? Number(heightCandidate) : null);
                    // Prefer using the video HEIGHT to determine canonical resolution (e.g. 1080p == height 1080).
                    // Delegate to resolution helper (prefer height, fallback to width)
                    try {
                        const { resolutionFromDimensions } = await import('@/lib/resolution');
                        resolution = resolutionFromDimensions(widthNum, heightNum);
                    } catch (e) {
                        // fallback conservative behavior using numeric parsed values
                        if (heightNum !== null) {
                            const h = heightNum;
                            if (h >= 2160) resolution = "4K";
                            else if (h >= 1080) resolution = "1080p";
                            else if (h >= 720) resolution = "720p";
                            else if (h >= 480) resolution = "480p";
                            else resolution = "SD";
                        } else if (widthNum !== null) {
                            const w = widthNum;
                            if (w >= 3800) resolution = "4K";
                            else if (w >= 1800) resolution = "1080p";
                            else if (w >= 1200) resolution = "720p";
                            else if (w >= 700) resolution = "480p";
                            else resolution = "SD";
                        }
                    }
                }

                const durationMs = item.RunTimeTicks ? BigInt(Math.floor(Number(item.RunTimeTicks) / 10000)) : null;
                const parentId = normalizeJellyfinId(item.AlbumId || item.SeasonId || item.SeriesId || item.ParentId || null);
                const artist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || item.Artists?.[0] || null;
                const dateAdded = item.DateCreated ? new Date(item.DateCreated) : new Date();

                await prisma.media.upsert({
                    where: { jellyfinMediaId },
                    update: { title: item.Name || "Unknown", type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size: sizeVal, parentId, artist, dateAdded, libraryName, updatedAt: new Date() },
                    create: { jellyfinMediaId, title: item.Name || "Unknown", type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size: sizeVal, parentId, artist, dateAdded, libraryName, updatedAt: new Date() },
                });
                mediaCount++;
            } catch (err) {
                console.error(`[Sync] Error item ${item.Id}:`, err);
            }
        }

        await markSyncFinished({ success: true, mode: options?.recentOnly ? 'recent' : 'full', users: usersCount, media: mediaCount });
        cleanupOrphanedSessions().catch(() => {});
        return { success: true, users: usersCount, media: mediaCount };
    } catch (e: unknown) {
        let fullError = 'Unknown error';
        if (e instanceof Error) fullError = e.message;
        else if (typeof e === 'string') fullError = e;
        else if (typeof e === 'object' && e !== null) {
            const maybe = e as Record<string, unknown>;
            if (typeof maybe.message === 'string') fullError = maybe.message;
        }
        console.error("[Sync Error]", fullError);
        await markSyncFinished({ success: false, mode: options?.recentOnly ? 'recent' : 'full', error: fullError });
        return { success: false, error: fullError };
    }
}
