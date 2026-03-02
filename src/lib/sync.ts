import prisma from "./prisma";

/**
 * Fonction maîtresse de synchronisation de la librairie Jellyfin.
 * Interroge l'API Jellyfin pour récupérer les Utilisateurs et les Médias (Films, Séries, Épisodes),
 * et effectue un Upsert massif dans la base PostgreSQL via Prisma.
 */
export async function syncJellyfinLibrary(options?: { recentOnly?: boolean }) {
    const mode = options?.recentOnly ? 'récente (7 derniers jours)' : 'complète';
    console.log(`[Sync] Démarrage de la synchronisation ${mode} de la librairie Jellyfin...`);
    console.log(`[Sync] JELLYFIN_URL = ${process.env.JELLYFIN_URL || '(not set)'}`);

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
            await prisma.user.upsert({
                where: { jellyfinUserId: user.Id },
                update: { username: user.Name },
                create: { jellyfinUserId: user.Id, username: user.Name },
            });
            usersCount++;
        }
        console.log(`[Sync] ${usersCount} utilisateurs synchronisés.`);

        // 2. Fetch library views to map CollectionType per library
        console.log("[Sync] Fetching Library Views...");
        const viewsRes = await fetch(`${baseUrl}/Library/VirtualFolders`, { headers: jellyfinHeaders });
        const libraryCollectionMap = new Map<string, string>();
        if (viewsRes.ok) {
            const views = await viewsRes.json();
            for (const view of views) {
                if (view.ItemId && view.CollectionType) {
                    libraryCollectionMap.set(view.ItemId, view.CollectionType);
                }
            }
        }

        // Also fetch user views for parent mapping
        const userViewsRes = await fetch(`${baseUrl}/UserViews`, { headers: jellyfinHeaders });
        const parentCollectionMap = new Map<string, string>();
        if (userViewsRes.ok) {
            const userViews = await userViewsRes.json();
            for (const v of (userViews.Items || [])) {
                if (v.Id && v.CollectionType) {
                    parentCollectionMap.set(v.Id, v.CollectionType);
                }
            }
        }

        // 3. Sync Media (Movies, Series, Episodes, Audio, MusicAlbum) with Genres and MediaSources
        let itemsUrl = `${baseUrl}/Items?IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId`;
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
            const genres = item.Genres || [];

            // Determine collectionType from library parent chain
            let collectionType: string | null = null;
            if (item.CollectionType) {
                collectionType = item.CollectionType;
            } else {
                const parentId = item.ParentId || item.SeasonId || item.SeriesId;
                if (parentId) {
                    collectionType = parentCollectionMap.get(parentId) || libraryCollectionMap.get(parentId) || null;
                }
            }
            // Infer from item type if still unknown
            if (!collectionType) {
                if (item.Type === 'Movie') collectionType = 'movies';
                else if (['Series', 'Episode'].includes(item.Type)) collectionType = 'tvshows';
                else if (['Audio', 'MusicAlbum'].includes(item.Type)) collectionType = 'music';
            }

            let resolution = null;
            if (item.MediaSources && item.MediaSources.length > 0) {
                const mediaSource = item.MediaSources[0];
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
            const parentId = item.AlbumId || item.SeasonId || item.SeriesId || item.ParentId || null;
            const artist = item.AlbumArtist || item.AlbumArtists?.[0]?.Name || item.Artists?.[0] || null;
            const dateAdded = item.DateCreated ? new Date(item.DateCreated) : null;

            await prisma.media.upsert({
                where: { jellyfinMediaId: item.Id },
                update: { title: item.Name, type: item.Type, genres, resolution, collectionType, durationMs, parentId, artist, dateAdded },
                create: { jellyfinMediaId: item.Id, title: item.Name, type: item.Type, genres, resolution, collectionType, durationMs, parentId, artist, dateAdded },
            });
            mediaCount++;
        }
        console.log(`[Sync] ${mediaCount} médias synchronisés.`);

        console.log("[Sync] Terminée avec succès.");
        return { success: true, users: usersCount, media: mediaCount };
    } catch (e: any) {
        const isConnectionError = e.message === 'fetch failed' || e.cause?.code === 'ECONNREFUSED';
        if (isConnectionError) {
            console.error(`[Sync Error] Jellyfin injoignable (${baseUrl}). Vérifiez JELLYFIN_URL — dans Docker, utilisez l'IP réelle du serveur (pas localhost/127.0.0.1).`);
        } else {
            console.error("[Sync Error]", e.message);
        }
        return { success: false, error: e.message };
    }
}
