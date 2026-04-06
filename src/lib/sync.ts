import prisma from "./prisma";
import { appendHealthEvent, markSyncFinished, markSyncStarted } from "@/lib/systemHealth";
import { normalizeJellyfinId, compactJellyfinId } from "@/lib/jellyfinId";
import { cleanupOrphanedSessions } from "@/lib/cleanup";
import { GHOST_LIBRARY_NAMES } from "./libraryUtils";
import { ensureMasterServer } from "@/lib/serverRegistry";
import {
    buildJellyfinApiKeyHeaders,
    getConfiguredJellyfinServers,
    resolveServerApiKey,
} from "@/lib/jellyfinServers";

/**
 * Fonction maîtresse de synchronisation de la librairie Jellyfin.
 * Interroge l'API Jellyfin pour récupérer les Utilisateurs et les Médias (Films, Séries, Épisodes),
 * et effectue un Upsert massif dans la base PostgreSQL via Prisma.
 */
export async function syncJellyfinLibrary(options?: { recentOnly?: boolean }) {
    const mode = options?.recentOnly ? 'récente (7 derniers jours)' : 'complète';
    console.log(`[Sync] Démarrage de la synchronisation ${mode} de la librairie Jellyfin...`);
    await markSyncStarted(options?.recentOnly ? 'recent' : 'full');

    const configuredServers = await getConfiguredJellyfinServers();
    const primaryEnvApiKey = String(process.env.JELLYFIN_API_KEY || '').trim();

    const syncTargets = configuredServers
        .map((server) => {
            const apiKey = resolveServerApiKey(server, primaryEnvApiKey) || "";

            return {
                server,
                baseUrl: String(server.url || '').replace(/\/+$/, ''),
                apiKey,
            };
        })
        .filter((entry) => entry.baseUrl && entry.apiKey);

    if (syncTargets.length === 0) {
        console.error("[Sync Error] Aucun serveur Jellyfin configuré avec URL + clé API.");
        return { success: false, error: "No Jellyfin server configured with URL and API key." };
    }
    
    // Fetch global settings to get custom resolution thresholds if any
    const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
    const resolutionThresholds = (settings?.resolutionThresholds as Record<string, unknown>) || null;
    await ensureMasterServer();

    const fetchWithRetry = async (url: string, options: RequestInit = {}, timeout = 30000, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(id);
                if (!response.ok) {
                    const bodyPreview = await response.text().catch(() => "");
                    const compactPreview = bodyPreview.trim().replace(/\s+/g, ' ').slice(0, 200);
                    const previewSuffix = compactPreview ? ` - ${compactPreview}` : "";
                    throw new Error(`HTTP ${response.status} ${response.statusText || ''}${previewSuffix}`.trim());
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

    const parseJsonResponse = <T>(rawBody: string, url: string): T => {
        try {
            return JSON.parse(rawBody) as T;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid JSON response from ${url.split('?')[0]}: ${msg}`);
        }
    };

    const fetchJsonWithRetry = async <T>(url: string, options: RequestInit = {}, timeout = 30000, maxRetries = 3): Promise<T> => {
        let lastError: unknown = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetchWithRetry(url, options, timeout, 1);
                const rawBody = await response.text();

                if (!rawBody || !rawBody.trim()) {
                    throw new Error(`Empty JSON response body from ${url.split('?')[0]}`);
                }

                return parseJsonResponse<T>(rawBody, url);
            } catch (e: unknown) {
                lastError = e;
                const message = e instanceof Error ? e.message : String(e);
                console.warn(`[Sync Warning] JSON attempt ${i + 1}/${maxRetries} failed for ${url.split('?')[0]}: ${message}`);

                if (i === maxRetries - 1) break;
                await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
            }
        }

        if (lastError instanceof Error) throw lastError;
        throw new Error(`Unable to fetch JSON from ${url.split('?')[0]}`);
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

        let totalUsersCount = 0;
        let totalMediaCount = 0;
        const failedServers: Array<{ name: string; error: string }> = [];

        for (const target of syncTargets) {
            const baseUrl = target.baseUrl;
            const jellyfinHeaders = buildJellyfinApiKeyHeaders(target.apiKey);
            const currentServerId = target.server.id;
            const currentServerName = target.server.name;

            console.log(`[Sync] Début synchronisation serveur: ${currentServerName} (${target.server.jellyfinServerId})`);

            try {
                // 1. Sync Users
                const users = await fetchJsonWithRetry<Array<{ Id?: string; Name?: string }>>(`${baseUrl}/Users`, { headers: jellyfinHeaders });
                let usersCount = 0;
                for (const user of users) {
                    const jellyfinUserId = normalizeJellyfinId(user.Id);
                    if (!jellyfinUserId) continue;
                    await prisma.user.upsert({
                        where: { jellyfinUserId_serverId: { jellyfinUserId, serverId: currentServerId } },
                        update: { username: user.Name },
                        create: { serverId: currentServerId, jellyfinUserId, username: user.Name },
                    });
                    usersCount++;
                }

                // 2. Build Library Mapping (VirtualFolders + UserViews)
                const libraryNameMap = new Map<string, string>();
                const libraryCollectionMap = new Map<string, string>();

                const folders = await fetchJsonWithRetry<Array<{ CollectionType?: string; Id?: string; ItemId?: string; Name?: string }>>(
                    `${baseUrl}/Library/VirtualFolders`,
                    { headers: jellyfinHeaders },
                );
                folders.forEach((f) => {
                    if (f.CollectionType === 'boxsets') return;
                    const keys = [f.Id, f.ItemId].filter(Boolean) as string[];
                    keys.forEach(k => {
                        if (f.Name) libraryNameMap.set(k, f.Name);
                        if (f.CollectionType) libraryCollectionMap.set(k, f.CollectionType);
                    });
                });

                const views = await fetchJsonWithRetry<{ Items?: Array<{ CollectionType?: string; Id?: string; ItemId?: string; Name?: string }> }>(
                    `${baseUrl}/UserViews`,
                    { headers: jellyfinHeaders },
                );
                (views.Items || []).forEach((v) => {
                    if (v.CollectionType === 'boxsets') return;
                    const keys = [v.Id, v.ItemId].filter(Boolean) as string[];
                    keys.forEach(k => {
                        if (v.Name) libraryNameMap.set(k, v.Name);
                        if (v.CollectionType) libraryCollectionMap.set(k, v.CollectionType);
                    });
                });

                // 3. Sync Media Items
                const baseItemsQuery = `IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum,Book,BoxSet&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId,People,Studios,RunTimeTicks,ProductionYear,Path`;
                let recentFilters: string[] = [''];
                if (options?.recentOnly) {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const sinceIso = sevenDaysAgo.toISOString();
                    // Query both newly created and recently saved items to avoid missing imports
                    // where filesystem metadata keeps an old creation date.
                    recentFilters = [
                        `&MinDateCreated=${sinceIso}&SortBy=DateCreated&SortOrder=Descending`,
                        `&MinDateLastSaved=${sinceIso}&SortBy=DateLastSaved&SortOrder=Descending`,
                    ];
                }

                const DEFAULT_PAGE_SIZE = 200;
                const SLOW_PAGE_SIZE = 50;
                const SLOW_START_THRESHOLD = 2000;
                type JellyfinItem = Record<string, any>;
                const itemsById = new Map<string, JellyfinItem>();

                for (const recentFilter of recentFilters) {
                    let startIndex = 0;
                    while (true) {
                        const currentPageSize = startIndex >= SLOW_START_THRESHOLD ? SLOW_PAGE_SIZE : DEFAULT_PAGE_SIZE;
                        const pageUrl = `${baseUrl}/Items?${baseItemsQuery}${recentFilter}&StartIndex=${startIndex}&Limit=${currentPageSize}`;
                        const timeoutMs = startIndex >= SLOW_START_THRESHOLD ? 120000 : 60000;
                        const retries = startIndex >= SLOW_START_THRESHOLD ? 6 : 4;
                        console.log(`[Sync] [${currentServerName}] Fetching Items StartIndex=${startIndex} Limit=${currentPageSize} timeout=${timeoutMs} retries=${retries}`);
                        const pageData = await fetchJsonWithRetry<{ Items?: JellyfinItem[] }>(pageUrl, { headers: jellyfinHeaders }, timeoutMs, retries);
                        const pageItems: JellyfinItem[] = pageData.Items || [];

                        for (const pageItem of pageItems) {
                            const itemId = typeof pageItem?.Id === 'string' ? pageItem.Id : null;
                            if (itemId) itemsById.set(itemId, pageItem);
                        }

                        if (pageItems.length < currentPageSize) break;
                        startIndex += currentPageSize;
                        if (startIndex >= 50000) break;
                    }
                }

                const items = Array.from(itemsById.values());

                const itemLibraryCache = new Map<string, string>();
                const itemCollectionCache = new Map<string, string>();
                const seriesResolutionMap = new Map<string, string>();
                const seriesLatestDateMap = new Map<string, Date>();
                const albumLatestDateMap = new Map<string, Date>();

                let mediaCount = 0;
                for (const item of items) {
                    try {
                        const jellyfinMediaId = normalizeJellyfinId(item.Id);
                        if (!jellyfinMediaId) continue;

                        let libraryName: string | null = null;
                        let collectionType: string | null = item.CollectionType || null;

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

                        if (!collectionType) {
                            if (item.Type === 'Movie' || item.Type === 'BoxSet') collectionType = 'movies';
                            else if (['Series', 'Season', 'Episode'].includes(item.Type)) collectionType = 'tvshows';
                            else if (['Audio', 'MusicAlbum'].includes(item.Type)) collectionType = 'music';
                            else if (item.Type === 'Book') collectionType = 'books';
                        }

                        if (!libraryName && collectionType) {
                            const knownName = Array.from(libraryCollectionMap.entries()).find(([_, type]) => type === collectionType)?.[0];
                            if (knownName && libraryNameMap.has(knownName)) {
                                libraryName = libraryNameMap.get(knownName)!;
                            } else {
                                libraryName = collectionType;
                            }
                        }

                        if (libraryName) {
                            itemLibraryCache.set(item.Id, libraryName);
                            if (collectionType) itemCollectionCache.set(item.Id, collectionType);
                        }

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
                            const widthCandidate = vs?.Width;
                            const heightCandidate = vs?.Height;
                            const widthNum = (typeof widthCandidate === 'number') ? widthCandidate : (typeof widthCandidate === 'string' && !Number.isNaN(Number(widthCandidate)) ? Number(widthCandidate) : null);
                            const heightNum = (typeof heightCandidate === 'number') ? heightCandidate : (typeof heightCandidate === 'string' && !Number.isNaN(Number(heightCandidate)) ? Number(heightCandidate) : null);
                            try {
                                const { resolutionFromDimensions } = await import('@/lib/resolution');
                                resolution = resolutionFromDimensions(widthNum, heightNum, resolutionThresholds);
                            } catch {
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

                        if (resolution && item.SeriesId) {
                            const sid = normalizeJellyfinId(item.SeriesId);
                            if (sid) {
                                const existing = seriesResolutionMap.get(sid);
                                const getWeight = (r: string) => {
                                    if (r === '4K') return 5;
                                    if (r === '1440p') return 4;
                                    if (r === '1080p') return 3;
                                    if (r === '720p') return 2;
                                    if (r === 'SD') return 1;
                                    return 0;
                                };
                                if (!existing || getWeight(resolution) > getWeight(existing)) {
                                    seriesResolutionMap.set(sid, resolution);
                                }
                            }
                        }

                        const durationMs = item.RunTimeTicks ? BigInt(Math.floor(Number(item.RunTimeTicks) / 10000)) : null;
                        const parentId = normalizeJellyfinId(item.AlbumId || item.SeasonId || item.SeriesId || item.ParentId || null);
                        const artist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || item.Artists?.[0] || null;
                        const dateAdded = item.DateCreated ? new Date(item.DateCreated) : new Date();

                        if (item.Type === 'Episode' && item.SeriesId) {
                            const sid = normalizeJellyfinId(item.SeriesId);
                            if (sid) {
                                const previous = seriesLatestDateMap.get(sid);
                                if (!previous || dateAdded.getTime() > previous.getTime()) {
                                    seriesLatestDateMap.set(sid, dateAdded);
                                }
                            }
                        }

                        if ((item.Type === 'Audio' || item.Type === 'Track') && item.AlbumId) {
                            const aid = normalizeJellyfinId(item.AlbumId);
                            if (aid) {
                                const previous = albumLatestDateMap.get(aid);
                                if (!previous || dateAdded.getTime() > previous.getTime()) {
                                    albumLatestDateMap.set(aid, dateAdded);
                                }
                            }
                        }

                        const compactId = compactJellyfinId(jellyfinMediaId);
                        const candidates = Array.from(new Set([jellyfinMediaId, compactId]));

                        await prisma.$transaction(async (tx) => {
                            const matches = await tx.media.findMany({
                                where: { serverId: currentServerId, jellyfinMediaId: { in: candidates } },
                                orderBy: { createdAt: "asc" },
                            });

                            let primary = matches.find((m) => m.jellyfinMediaId === jellyfinMediaId) || matches[0] || null;

                            if (!primary) {
                                primary = await tx.media.create({
                                    data: {
                                        serverId: currentServerId,
                                        jellyfinMediaId,
                                        title: item.Name || "Unknown",
                                        type: item.Type,
                                        genres,
                                        directors,
                                        actors,
                                        studios,
                                        resolution: item.Type === 'Series' ? (seriesResolutionMap.get(item.Id) || resolution) : resolution,
                                        collectionType,
                                        durationMs,
                                        size: sizeVal,
                                        parentId,
                                        artist,
                                        dateAdded,
                                        libraryName,
                                        updatedAt: new Date(),
                                    },
                                });
                            } else {
                                // Decide whether to update the stored resolution: only overwrite when
                                // the incoming resolution represents an equal or better quality.
                                const incomingRes = (item.Type === 'Series' ? (seriesResolutionMap.get(item.Id) || resolution) : resolution) ?? null;
                                const getWeight = (r: string | null | undefined) => {
                                    if (!r) return 0;
                                    if (r === '4K') return 5;
                                    if (r === '1440p') return 4;
                                    if (r === '1080p') return 3;
                                    if (r === '720p') return 2;
                                    if (r === 'SD' || r === '480p') return 1;
                                    return 0;
                                };
                                const existingRes = primary?.resolution ?? null;
                                const finalResolution = getWeight(incomingRes) > getWeight(existingRes) ? incomingRes : existingRes;

                                primary = await tx.media.update({
                                    where: { id: primary.id },
                                    data: {
                                        jellyfinMediaId,
                                        title: item.Name || "Unknown",
                                        type: item.Type,
                                        genres: genres ?? undefined,
                                        directors: directors ?? undefined,
                                        actors: actors ?? undefined,
                                        studios: studios ?? undefined,
                                        resolution: finalResolution ?? undefined,
                                        collectionType: collectionType ?? undefined,
                                        durationMs: durationMs ?? undefined,
                                        size: sizeVal ?? undefined,
                                        parentId: parentId ?? undefined,
                                        artist: artist ?? undefined,
                                        dateAdded,
                                        libraryName: libraryName ?? undefined,
                                        updatedAt: new Date(),
                                    },
                                });
                            }

                            const duplicates = matches.filter((m) => m.id !== primary!.id);
                            for (const duplicate of duplicates) {
                                await tx.playbackHistory.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primary!.id } });
                                await tx.activeStream.updateMany({ where: { mediaId: duplicate.id }, data: { mediaId: primary!.id } });
                                await tx.media.delete({ where: { id: duplicate.id } });
                                console.warn("[Sync] Media merged after ID normalization", {
                                    kept: primary!.jellyfinMediaId,
                                    removed: duplicate.jellyfinMediaId,
                                });
                            }
                        });
                        mediaCount++;
                    } catch (err) {
                        console.error(`[Sync] Error item ${item.Id} on ${currentServerName}:`, err);
                    }
                }

                if (seriesResolutionMap.size > 0) {
                    console.log(`[Sync] Propagating resolutions for ${seriesResolutionMap.size} series on ${currentServerName}...`);
                    for (const [sid, res] of seriesResolutionMap.entries()) {
                        await prisma.media.updateMany({
                            where: { serverId: currentServerId, jellyfinMediaId: sid, type: 'Series' },
                            data: { resolution: res }
                        }).catch(e => console.error(`[Sync] Failed to update series resolution for ${sid}:`, e));
                    }
                }

                if (seriesLatestDateMap.size > 0) {
                    console.log(`[Sync] Propagating latest episode dates to ${seriesLatestDateMap.size} series on ${currentServerName}...`);
                    for (const [sid, latestDate] of seriesLatestDateMap.entries()) {
                        await prisma.media.updateMany({
                            where: { serverId: currentServerId, jellyfinMediaId: sid, type: 'Series' },
                            data: { dateAdded: latestDate }
                        }).catch(e => console.error(`[Sync] Failed to update series dateAdded for ${sid}:`, e));
                    }
                }

                if (albumLatestDateMap.size > 0) {
                    console.log(`[Sync] Propagating latest track dates to ${albumLatestDateMap.size} albums on ${currentServerName}...`);
                    for (const [aid, latestDate] of albumLatestDateMap.entries()) {
                        await prisma.media.updateMany({
                            where: { serverId: currentServerId, jellyfinMediaId: aid, type: 'MusicAlbum' },
                            data: { dateAdded: latestDate }
                        }).catch(e => console.error(`[Sync] Failed to update album dateAdded for ${aid}:`, e));
                    }
                }

                totalUsersCount += usersCount;
                totalMediaCount += mediaCount;

                console.log(`[Sync] Serveur ${currentServerName} terminé: users=${usersCount}, media=${mediaCount}`);
            } catch (serverError: unknown) {
                let normalizedError = 'Unknown error';
                if (serverError instanceof Error) normalizedError = serverError.message;
                else if (typeof serverError === 'string') normalizedError = serverError;
                else if (typeof serverError === 'object' && serverError !== null) {
                    const maybe = serverError as Record<string, unknown>;
                    if (typeof maybe.message === 'string') normalizedError = maybe.message;
                }

                failedServers.push({
                    name: currentServerName,
                    error: normalizedError,
                });
                console.error(`[Sync] Échec serveur ${currentServerName}:`, normalizedError);
            }
        }

        if (failedServers.length === syncTargets.length) {
            throw new Error(`All configured servers failed during sync: ${failedServers.map((entry) => `${entry.name}: ${entry.error}`).join(' | ')}`);
        }

        await markSyncFinished({ success: true, mode: options?.recentOnly ? 'recent' : 'full', users: totalUsersCount, media: totalMediaCount });

        if (failedServers.length > 0) {
            await appendHealthEvent({
                source: 'sync',
                kind: 'sync_partial',
                message: `Synchronisation partielle: ${failedServers.length} serveur(s) en échec.`,
                details: { count: failedServers.length, failedServers }
            });
        }

        if (totalMediaCount > 0) {
            await appendHealthEvent({
                source: 'sync',
                kind: 'sync_success',
                message: `Synchronisation réussie : ${totalMediaCount} médias traités.`,
                details: { count: 1, mediaProcessed: totalMediaCount, usersProcessed: totalUsersCount }
            });
        }

        cleanupOrphanedSessions().catch(() => {});
        return { success: true, users: totalUsersCount, media: totalMediaCount };
    } catch (e: unknown) {
        let fullError = 'Unknown error';
        if (e instanceof Error) fullError = e.message;
        else if (typeof e === 'string') fullError = e;
        else if (typeof e === 'object' && e !== null) {
            const maybe = e as Record<string, unknown>;
            if (typeof maybe.message === 'string') fullError = maybe.message;
        }
        console.error("[Sync Error]", fullError);
        await appendHealthEvent({ source: 'sync', kind: 'sync_error', message: fullError, details: { count: 1 } });
        await markSyncFinished({ success: false, mode: options?.recentOnly ? 'recent' : 'full', error: fullError });
        return { success: false, error: fullError };
    }
}
