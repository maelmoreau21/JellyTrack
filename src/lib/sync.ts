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

    try {
        // 1. Synchronisation des Utilisateurs
        console.log("[Sync] Fetching Users...");
        const usersRes = await fetch(`${baseUrl}/Users`, { headers: jellyfinHeaders });
        if (!usersRes.ok) throw new Error("Erreur de récupération des utilisateurs");
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
        const viewsRes = await fetch(`${baseUrl}/Library/VirtualFolders`, { headers: jellyfinHeaders });
        const libraryCollectionMap = new Map<string, string>();
        const libraryNameMap = new Map<string, string>();
        if (viewsRes.ok) {
            const views = await viewsRes.json();
            for (const view of views) {
                if (view.ItemId && view.CollectionType) {
                    libraryCollectionMap.set(view.ItemId, view.CollectionType);
                }
                if (view.ItemId && view.Name) {
                    libraryNameMap.set(view.ItemId, view.Name);
                }
            }
        }

        // Also fetch user views for parent mapping
        const userViewsRes = await fetch(`${baseUrl}/UserViews`, { headers: jellyfinHeaders });
        const parentCollectionMap = new Map<string, string>();
        const parentNameMap = new Map<string, string>();
        if (userViewsRes.ok) {
            const userViews = await userViewsRes.json();
            for (const v of (userViews.Items || [])) {
                if (v.Id && v.CollectionType) {
                    parentCollectionMap.set(v.Id, v.CollectionType);
                }
                if (v.Id && v.Name) {
                    parentNameMap.set(v.Id, v.Name);
                }
            }
        }

        // 3. Sync Media (Movies, Series, Seasons, Episodes, Audio, MusicAlbums, Books) with Genres and MediaSources
        let itemsUrl = `${baseUrl}/Items?IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum,Book&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId,People,Studios`;
        if (options?.recentOnly) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            itemsUrl += `&MinDateCreated=${sevenDaysAgo.toISOString()}&SortBy=DateCreated&SortOrder=Descending`;
        }
        console.log(`[Sync] Fetching Media Items${options?.recentOnly ? ' (recent only)' : ''}...`);
        const itemsRes = await fetch(itemsUrl, { headers: jellyfinHeaders });
        if (!itemsRes.ok) throw new Error("Erreur de récupération des médias");
        const itemsData = await itemsRes.json();
        const items = itemsData.Items || [];

        let mediaCount = 0;
        for (const item of items) {
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

            // Resolve actual Jellyfin library name from parent chain
            let libraryName: string | null = null;
            {
                const libParentId = item.ParentId || item.SeasonId || item.SeriesId;
                if (libParentId) {
                    libraryName = parentNameMap.get(libParentId) || libraryNameMap.get(libParentId) || null;
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
                    else if (w >= 1900) resolution = "1080p";
                    else if (w >= 1200) resolution = "720p";
                    else resolution = "SD";
                }
            }

            const durationMs = item.RunTimeTicks ? BigInt(Math.floor(item.RunTimeTicks / 10000)) : null;
            const parentId = normalizeJellyfinId(item.AlbumId || item.SeasonId || item.SeriesId || item.ParentId || null);
            const artist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || item.Artists?.[0] || null;
            const dateAdded = item.DateCreated ? new Date(item.DateCreated) : null;

            await prisma.media.upsert({
                where: { jellyfinMediaId },
                update: { title: item.Name, type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size, parentId, artist, dateAdded, libraryName },
                create: { jellyfinMediaId, title: item.Name, type: item.Type, genres, directors, actors, studios, resolution, collectionType, durationMs, size, parentId, artist, dateAdded, libraryName },
            });
            mediaCount++;
        }
        console.log(`[Sync] ${mediaCount} médias synchronisés.`);

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
        const isConnectionError = e.message === 'fetch failed' || e.cause?.code === 'ECONNREFUSED';
        if (isConnectionError) {
            console.error(`[Sync Error] Jellyfin injoignable (${baseUrl}). Vérifiez JELLYFIN_URL — dans Docker, utilisez l'IP réelle du serveur (pas localhost/127.0.0.1).`);
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
