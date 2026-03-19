import prisma from "./prisma";
import { appendHealthEvent, markSyncFinished, markSyncStarted } from "@/lib/systemHealth";
import { normalizeJellyfinId } from "@/lib/jellyfinId";
import { cleanupOrphanedSessions } from "@/lib/cleanup";

/**
 * Fonction maîtresse de synchronisation de la librairie Jellyfin.
 * Interroge l'API Jellyfin pour récupérer les Utilisateurs et les Médias (Films, Séries, Épisodes),
 * et effectue un Upsert massif dans la base PostgreSQL via Prisma.
 */
export async function syncJellyfinLibrary(options?: { recentOnly?: boolean }) {
    const mode = options?.recentOnly ? 'récente (7 derniers jours)' : 'complète';
    console.log(`[Sync] Démarrage de la synchronisation ${mode} de la librairie Jellyfin...`);
    console.log(`[Sync] JELLYFIN_URL = ${process.env.JELLYFIN_URL || '(not set)'}`);
    await markSyncStarted(options?.recentOnly ? 'recent' : 'full');

    const baseUrl = process.env.JELLYFIN_URL;
    const apiKey = process.env.JELLYFIN_API_KEY;

    if (!baseUrl || !apiKey) {
        console.error("[Sync Error] JELLYFIN_URL ou JELLYFIN_API_KEY manquants dans les variables d'environnement.");
        return { success: false, error: "Server not configured (JELLYFIN_URL/JELLYFIN_API_KEY env vars missing)." };
    }
    const jellyfinHeaders = {
        "X-Emby-Token": apiKey,
    };

    const fetchWithRetry = async (url: string, options: any = {}, timeout = 30000, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(id);
                if (!response.ok && [500, 502, 503, 504].includes(response.status)) {
                    throw new Error(`Server overload HTTP ${response.status}`);
                }
                return response;
            } catch (e: any) {
                clearTimeout(id);
                const isRetryable = e.name === 'AbortError' || e.message?.includes('fetch failed') || e.cause?.code === 'ECONNREFUSED' || e.message?.includes('Server overload HTTP');
                if (i === maxRetries - 1 || !isRetryable) throw e;
                console.warn(`[Sync] Fetch retry ${i + 1}/${maxRetries} for ${url.split('?')[0]} in ${2000 * (i + 1)}ms...`);
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            }
        }
        throw new Error("Max retries exceeded");
    };

    try {
        // 1. Synchronisation des Utilisateurs
        console.log("[Sync] Fetching Users...");
        const usersRes = await fetchWithRetry(`${baseUrl}/Users`, { headers: jellyfinHeaders });
        if (!usersRes.ok) throw new Error(`Erreur de récupération des utilisateurs: ${usersRes.status}`);
        const users = await usersRes.json();

        // Upsert massifs utilisateurs
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
        console.log(`[Sync] ${usersCount} utilisateurs synchronisés.`);

        // 2. Fetch library views to map CollectionType per library
        console.log("[Sync] Fetching Library Views...");
        const viewsRes = await fetchWithRetry(`${baseUrl}/Library/VirtualFolders`, { headers: jellyfinHeaders });
        const libraryCollectionMap = new Map<string, string>();
        const libraryNameMap = new Map<string, string>();
        if (viewsRes.ok) {
            const views = await viewsRes.json();
            for (const view of views) {
                // Jellyfin/Emby sometimes returns different id fields depending on endpoint/version.
                // Index by multiple candidate keys (ItemId, Id, ParentId) to be robust.
                const keys = [view.ItemId, view.Id, view.ParentId].filter(Boolean);
                for (const k of keys) {
                    if (view.CollectionType) libraryCollectionMap.set(k, view.CollectionType);
                    if (view.Name) libraryNameMap.set(k, view.Name);
                }
            }
        }

        // Also fetch user views for parent mapping
        const userViewsRes = await fetchWithRetry(`${baseUrl}/UserViews`, { headers: jellyfinHeaders });
        const parentCollectionMap = new Map<string, string>();
        const parentNameMap = new Map<string, string>();
        if (userViewsRes.ok) {
            const userViews = await userViewsRes.json();
            for (const v of (userViews.Items || [])) {
                const keys = [v.Id, v.ItemId, v.ParentId].filter(Boolean);
                for (const k of keys) {
                    if (v.CollectionType) parentCollectionMap.set(k, v.CollectionType);
                    if (v.Name) parentNameMap.set(k, v.Name);
                }
            }
        }

        // 3. Sync Media (Movies, Series, Seasons, Episodes, Audio, MusicAlbums, Books) with Genres and MediaSources
        // Use a paginated fetch to avoid very large single requests causing long timeouts.
        const baseItemsQuery = `IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum,Book&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId,People,Studios`;
        let minDateParam = '';
        if (options?.recentOnly) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            minDateParam = `&MinDateCreated=${sevenDaysAgo.toISOString()}&SortBy=DateCreated&SortOrder=Descending`;
        }

        const pageSize = 200;
        let items: any[] = [];
        let startIndex = 0;
        let page = 0;
        while (true) {
            page++;
            const pageUrl = `${baseUrl}/Items?${baseItemsQuery}${minDateParam}&StartIndex=${startIndex}&Limit=${pageSize}`;
            console.log(`[Sync] Fetching Media Items page ${page} (start=${startIndex})${options?.recentOnly ? ' (recent only)' : ''}...`);
            const pageRes = await fetchWithRetry(pageUrl, { headers: jellyfinHeaders }, 60000, 4);
            if (!pageRes.ok) throw new Error(`Erreur de récupération des médias: ${pageRes.status}`);
            const pageData = await pageRes.json();
            const pageItems = pageData.Items || [];
            items.push(...pageItems);
            if (pageItems.length < pageSize) break;
            startIndex += pageSize;
            // Safety: avoid infinite loops on unexpected Jellyfin behaviour
            if (page >= 1000) {
                console.warn('[Sync] Reached page limit while fetching media items, stopping early.');
                break;
            }
        }
        console.log(`[Sync] Jellyfin returned ${items.length} items to index (paginated).`);

        let mediaCount = 0;
        let errorsCount = 0;
        for (const item of items) {
            try {
                const jellyfinMediaId = normalizeJellyfinId(item.Id);
                if (!jellyfinMediaId) continue;
                const genres = item.Genres || [];
                const studios = (item.Studios || []).map((s: any) => s.Name);
                const people = item.People || [];
                const directors = people.filter((p: any) => p.Type === "Director").map((p: any) => p.Name);
                const actors = people.filter((p: any) => p.Type === "Actor").map((p: any) => p.Name);

                // Determine collectionType from library parent chain
                let collectionType: string | null = null;
                if (item.CollectionType) {
                    collectionType = item.CollectionType;
                } else {
                    const libParentId = item.ParentId || item.SeasonId || item.SeriesId;
                    if (libParentId) {
                        collectionType = parentCollectionMap.get(libParentId) || libraryCollectionMap.get(libParentId) || null;
                    }
                }
                // Infer from item type if still unknown
                if (!collectionType) {
                    if (item.Type === 'Movie') collectionType = 'movies';
                    else if (['Series', 'Episode'].includes(item.Type)) collectionType = 'tvshows';
                    else if (['Audio', 'MusicAlbum'].includes(item.Type)) collectionType = 'music';
                    else if (item.Type === 'Book') collectionType = 'books';
                }

                // Resolve actual Jellyfin library name from parent chain (try multiple id variants)
                let libraryName: string | null = null;
                {
                    // Try to find the library name in the parent chain using several candidate parent ids
                    const possibleParentIds = [item.ParentId, item.SeasonId, item.SeriesId, item.AlbumId, item.LibraryId].filter(Boolean);
                    for (const pid of possibleParentIds) {
                        const idKey = pid as string;
                        const name = parentNameMap.get(idKey) || libraryNameMap.get(idKey) || null;
                        if (name) {
                            libraryName = name;
                            break;
                        }
                    }
                }

                let resolution = null;
                let size = null;
                if (item.MediaSources && item.MediaSources.length > 0) {
                    const mediaSource = item.MediaSources[0];
                    size = mediaSource.Size ? BigInt(mediaSource.Size) : null;
                    const videoStream = mediaSource.MediaStreams?.find((s: any) => s.Type === "Video");
                    if (videoStream && videoStream.Width) {
                        const w = videoStream.Width;
                        if (w >= 3800) resolution = "4K";
                        else if (w >= 2500) resolution = "1440p";
                        else if (w >= 1800) resolution = "1080p"; // More lenient (was 1900)
                        else if (w >= 1200) resolution = "720p";
                        else if (w >= 700) resolution = "480p"; // More lenient (was 800)
                        else resolution = "SD";
                    }
                }


                const durationMs = item.RunTimeTicks ? BigInt(Math.floor(item.RunTimeTicks / 10000)) : null;
                const parentId = normalizeJellyfinId(item.AlbumId || item.SeasonId || item.SeriesId || item.ParentId || null);
                const artist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || item.Artists?.[0] || null;
                const dateAdded = item.DateCreated ? new Date(item.DateCreated) : new Date(); // Fallback to current date for indexing

                await prisma.media.upsert({
                    where: { jellyfinMediaId },
                    update: { title: item.Name, type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size, parentId, artist, dateAdded, libraryName },
                    create: { jellyfinMediaId, title: item.Name, type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size, parentId, artist, dateAdded, libraryName },
                });
                if (!libraryName) {
                    console.warn(`[Sync] Could not resolve libraryName for item ${item.Name} (id=${item.Id}) parents=[${[item.ParentId, item.SeasonId, item.SeriesId, item.AlbumId].filter(Boolean).join(',')}]`);
                }
                mediaCount++;
            } catch (itemErr: any) {
                console.error(`[Sync] Erreur silencieuse sur l'item ${item.Name} (id=${item.Id}):`, itemErr?.message);
                errorsCount++;
            }
        }
        console.log(`[Sync] ${mediaCount} médias synchronisés. (${errorsCount} ignorés suite à des erreurs)`);

        console.log("[Sync] Terminée avec succès.");

        // Run background cleanup after successful sync
        cleanupOrphanedSessions().catch(err => console.error("[Sync] Post-sync cleanup error:", err));

        await markSyncFinished({ success: true, mode: options?.recentOnly ? 'recent' : 'full', users: usersCount, media: mediaCount });
        await appendHealthEvent({
            source: 'sync',
            kind: 'success',
            message: `Synchronisation ${options?.recentOnly ? 'récente' : 'complète'} terminée.`,
            details: { users: usersCount, media: mediaCount }
        });
        return { success: true, users: usersCount, media: mediaCount };
    } catch (e: any) {
        const isConnectionError = e.message === 'fetch failed' || e.cause?.code === 'ECONNREFUSED' || e.name === 'AbortError';
        if (isConnectionError) {
            console.error(`[Sync Error] Jellyfin injoignable ou timeout (${baseUrl}). Vérifiez JELLYFIN_URL — dans Docker, utilisez l'IP réelle du serveur (pas localhost/127.0.0.1).`);
            if (e.name === 'AbortError') console.error(`[Sync Error] La requête a expiré après 30-60s.`);
        } else {
            console.error("[Sync Error]", e.message);
        }
        await markSyncFinished({ success: false, mode: options?.recentOnly ? 'recent' : 'full', error: e.message });
        await appendHealthEvent({
            source: 'sync',
            kind: 'error',
            message: `Échec de synchronisation ${options?.recentOnly ? 'récente' : 'complète'}.`,
            details: { error: e.message }
        });
        return { success: false, error: e.message };
    }
}
