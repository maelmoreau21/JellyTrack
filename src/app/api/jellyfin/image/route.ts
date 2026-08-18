import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchJellyfinImage, fetchJellyfinJson } from "@/lib/jellyfinImageServer";
import { systemLog } from "@/lib/systemLogger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getCachedImage, saveCachedImage } from "@/lib/imageCache";
import { compactJellyfinId, normalizeJellyfinId } from "@/lib/jellyfinId";

// Allowed image types for the Jellyfin image proxy (prevent path traversal)
const ALLOWED_IMAGE_TYPES = ["Primary", "Thumb", "Backdrop", "Banner", "Logo", "Art"];
// Jellyfin IDs can be UUIDs with or without dashes (both are valid in practice).
const UUID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

type JellyfinItemMeta = {
    id: string;
    type: string | null;
    parentId: string | null;
    seasonId: string | null;
    seriesId: string | null;
    albumId: string | null;
    artistId: string | null;
    parentPrimaryImageItemId: string | null;
    parentThumbItemId: string | null;
    hasPrimaryTag: boolean;
    hasThumbTag: boolean;
    hasBackdropTag: boolean;
};

function normalizeCandidateId(value: unknown): string | null {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id) return null;
    return UUID_PATTERN.test(id) ? (normalizeJellyfinId(id) || id) : null;
}

async function fetchJellyfinItemMeta(itemId: string, serverId?: string | null): Promise<JellyfinItemMeta | null> {
    const data = await fetchJellyfinJson<Record<string, unknown>>(
        `/Items/${encodeURIComponent(itemId)}?Fields=ParentId,SeasonId,SeriesId,AlbumId,Type,ArtistItems,ImageTags,BackdropImageTags,SeriesPrimaryImageTag,SeriesThumbImageTag,ParentPrimaryImageItemId,ParentThumbItemId,AlbumPrimaryImageTag`,
        serverId
    );
    if (!data) return null;

    const id = normalizeCandidateId(data?.Id) || itemId;

    let artistId: string | null = null;
    if (Array.isArray(data?.ArtistItems) && data.ArtistItems.length > 0) {
        artistId = normalizeCandidateId(data.ArtistItems[0]?.Id);
    }

    const imageTags = (data?.ImageTags && typeof data.ImageTags === "object" ? data.ImageTags : {}) as Record<string, unknown>;
    const backdropTags = Array.isArray(data?.BackdropImageTags) ? data.BackdropImageTags : [];

    return {
        id,
        type: typeof data?.Type === "string" ? data.Type : null,
        parentId: normalizeCandidateId(data?.ParentId),
        seasonId: normalizeCandidateId(data?.SeasonId),
        seriesId: normalizeCandidateId(data?.SeriesId),
        albumId: normalizeCandidateId(data?.AlbumId),
        artistId,
        parentPrimaryImageItemId: normalizeCandidateId(data?.ParentPrimaryImageItemId),
        parentThumbItemId: normalizeCandidateId(data?.ParentThumbItemId),
        hasPrimaryTag: Boolean(imageTags.Primary || data?.SeriesPrimaryImageTag || data?.AlbumPrimaryImageTag),
        hasThumbTag: Boolean(imageTags.Thumb || data?.SeriesThumbImageTag),
        hasBackdropTag: backdropTags.length > 0 || Boolean(imageTags.Backdrop),
    };
}

async function fetchSeriesSeasonCandidateIds(seriesId: string, serverId?: string | null): Promise<string[]> {
    const data = await fetchJellyfinJson<{ Items?: Array<Record<string, unknown>> }>(
        `/Items?ParentId=${encodeURIComponent(seriesId)}&IncludeItemTypes=Season&Recursive=false&SortBy=SortName&SortOrder=Ascending&Limit=10`,
        serverId
    );
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return items
        .map((item) => normalizeCandidateId(item?.Id))
        .filter((id): id is string => Boolean(id));
}

async function fetchDatabaseCandidateIds(itemId: string, serverId?: string | null): Promise<string[]> {
    const where = serverId
        ? { serverId, jellyfinMediaId: itemId }
        : { jellyfinMediaId: itemId };

    const item = await prisma.media.findFirst({
        where,
        select: { serverId: true, parentId: true, type: true },
    });

    if (!item || item.type === "MusicAlbum") {
        return [];
    }

    const candidates: string[] = [];
    const addCandidate = (value: string | null | undefined) => {
        const id = normalizeCandidateId(value);
        if (!id || candidates.includes(id)) return;
        candidates.push(id);
    };

    addCandidate(item.parentId);

    if (item.parentId) {
        const parent = await prisma.media.findFirst({
            where: { serverId: item.serverId, jellyfinMediaId: item.parentId },
            select: { parentId: true },
        });
        addCandidate(parent?.parentId);
    }

    return candidates;
}

function getFallbackImageTypes(requestedType: string): string[] {
    switch (requestedType) {
        case "Primary":
            return ["Primary", "Thumb", "Backdrop", "Banner", "Art"];
        case "Backdrop":
            return ["Backdrop", "Thumb", "Primary"];
        case "Thumb":
            return ["Thumb", "Primary", "Backdrop"];
        case "Logo":
            return ["Logo", "Primary", "Banner", "Thumb"];
        case "Banner":
            return ["Banner", "Backdrop", "Primary"];
        default:
            return [requestedType, "Primary", "Thumb"];
    }
}

export async function GET(req: NextRequest) {
    // SECURITY: Require authentication (defense-in-depth, middleware also checks)
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const requestedType = searchParams.get("type") || "Primary";
    const fallbackId = searchParams.get("fallbackId");
    const serverIdParam = searchParams.get("serverId");
    const noStore = searchParams.has("v") || searchParams.has("cacheBust");

    if (!itemId) {
        return new NextResponse("Item ID is required", { status: 400 });
    }

    // SECURITY: Validate type against allowlist (prevents path traversal like ../../)
    if (!ALLOWED_IMAGE_TYPES.includes(requestedType)) {
        return new NextResponse("Invalid image type", { status: 400 });
    }

    // SECURITY: Validate itemId and fallbackId format (UUID, dashed or non-dashed)
    if (!UUID_PATTERN.test(itemId)) {
        return new NextResponse("Invalid item ID format", { status: 400 });
    }
    if (fallbackId && !UUID_PATTERN.test(fallbackId)) {
        return new NextResponse("Invalid fallback ID format", { status: 400 });
    }
    if (serverIdParam && !UUID_PATTERN.test(serverIdParam)) {
        return new NextResponse("Invalid server ID format", { status: 400 });
    }

    try {
        // Automatic server ID resolution from database if not explicitly passed in query
        let effectiveServerId = serverIdParam;
        let dbMediaRecord: { serverId: string; parentId: string | null; type: string } | null = null;

        if (!effectiveServerId || !fallbackId) {
            try {
                dbMediaRecord = await prisma.media.findFirst({
                    where: { jellyfinMediaId: itemId },
                    select: { serverId: true, parentId: true, type: true },
                });
                if (!effectiveServerId && dbMediaRecord?.serverId) {
                    effectiveServerId = dbMediaRecord.serverId;
                }
            } catch {
                // DB not ready or stub active
            }
        }

        // STEP 1: Persistent Cache Check (Keep existing images unless user explicitly clicked refresh)
        if (!noStore) {
            const cached = await getCachedImage(effectiveServerId, itemId, requestedType);
            if (cached) {
                const headers = new Headers();
                headers.set("Content-Type", cached.contentType);
                headers.set("Cache-Control", "public, max-age=31536000, immutable");
                return new NextResponse(new Uint8Array(cached.data), { headers });
            }

            if (fallbackId) {
                const fallbackCached = await getCachedImage(effectiveServerId, fallbackId, requestedType);
                if (fallbackCached) {
                    const headers = new Headers();
                    headers.set("Content-Type", fallbackCached.contentType);
                    headers.set("Cache-Control", "public, max-age=31536000, immutable");
                    return new NextResponse(new Uint8Array(fallbackCached.data), { headers });
                }
            }
        }

        // STEP 2: Live Fetch from Jellyfin (Supporting Jellyfin 10.11 and 12)
        let finalResponse: Response | null = null;
        let matchedCandidateId: string | null = null;
        let matchedType: string = requestedType;
        const attempted = new Set<string>();

        const tryCandidate = async (candidate: string | null | undefined, typesToTry: string[]): Promise<Response | null> => {
            const candidateId = normalizeCandidateId(candidate);
            if (!candidateId) return null;

            for (const t of typesToTry) {
                const key = `${candidateId}:${t}`;
                if (attempted.has(key)) continue;
                attempted.add(key);

                try {
                    const candidateResponse = await fetchJellyfinImage(candidateId, t, effectiveServerId, noStore);
                    if (candidateResponse.ok) {
                        const contentType = candidateResponse.headers.get("content-type") || "";
                        if (!contentType.includes("image/svg")) {
                            matchedCandidateId = candidateId;
                            matchedType = t;
                            return candidateResponse;
                        }
                    }
                } catch {
                    // Try next candidate
                }
            }
            return null;
        };

        const imageTypesToTry = getFallbackImageTypes(requestedType);

        // Try itemId with requested type
        finalResponse = await tryCandidate(itemId, [requestedType]);

        // Try fallbackId with requested type
        if (!finalResponse && fallbackId) {
            finalResponse = await tryCandidate(fallbackId, [requestedType]);
        }

        // If still missing, query Jellyfin metadata and database hierarchy
        if (!finalResponse) {
            const itemMeta = await fetchJellyfinItemMeta(itemId, effectiveServerId);

            if (itemMeta?.parentPrimaryImageItemId) {
                finalResponse = await tryCandidate(itemMeta.parentPrimaryImageItemId, imageTypesToTry);
            }

            if (!finalResponse) {
                finalResponse = await tryCandidate(itemId, imageTypesToTry);
            }

            if (!finalResponse) {
                const hierarchyCandidates: string[] = [];
                const addCandidate = (val: string | null | undefined) => {
                    const id = normalizeCandidateId(val);
                    if (id && !hierarchyCandidates.includes(id)) {
                        hierarchyCandidates.push(id);
                    }
                };

                addCandidate(itemMeta?.seasonId);
                addCandidate(itemMeta?.seriesId);
                addCandidate(itemMeta?.albumId);
                addCandidate(itemMeta?.artistId);
                addCandidate(itemMeta?.parentId);
                addCandidate(itemMeta?.parentThumbItemId);
                addCandidate(dbMediaRecord?.parentId);
                addCandidate(fallbackId);

                if (itemMeta?.albumId) {
                    const albumMeta = await fetchJellyfinItemMeta(itemMeta.albumId, effectiveServerId);
                    if (albumMeta?.artistId) {
                        addCandidate(albumMeta.artistId);
                    }
                    if (albumMeta?.parentId) {
                        addCandidate(albumMeta.parentId);
                    }
                }

                const dbCandidates = await fetchDatabaseCandidateIds(itemId, effectiveServerId);
                for (const c of dbCandidates) {
                    addCandidate(c);
                }

                if ((itemMeta?.type || "").toLowerCase() === "series" || dbMediaRecord?.type === "Series") {
                    const seasonCandidates = await fetchSeriesSeasonCandidateIds(itemId, effectiveServerId);
                    for (const s of seasonCandidates) {
                        addCandidate(s);
                    }
                }

                for (const candidateId of hierarchyCandidates) {
                    finalResponse = await tryCandidate(candidateId, imageTypesToTry);
                    if (finalResponse) break;
                }
            }
        }

        // STEP 3: Handle Found Response or Cached Fallback
        if (finalResponse && finalResponse.ok) {
            const arrayBuf = await finalResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const contentType = finalResponse.headers.get("content-type") || "image/jpeg";

            // Save to persistent image cache for itemId so it stays preserved
            await saveCachedImage(effectiveServerId, itemId, requestedType, buffer, contentType);
            if (matchedCandidateId && matchedCandidateId !== itemId) {
                await saveCachedImage(effectiveServerId, matchedCandidateId, matchedType, buffer, contentType);
            }

            const headers = new Headers();
            headers.set("Content-Type", contentType);
            headers.set("Cache-Control", noStore ? "no-store, no-cache, must-revalidate" : "public, max-age=31536000, immutable");

            return new NextResponse(new Uint8Array(buffer), { headers });
        }

        // If Jellyfin has no image right now, check if we had an existing cached image on disk
        const existingCache = await getCachedImage(effectiveServerId, itemId, requestedType)
            || (fallbackId ? await getCachedImage(effectiveServerId, fallbackId, requestedType) : null);

        if (existingCache) {
            const headers = new Headers();
            headers.set("Content-Type", existingCache.contentType);
            headers.set("Cache-Control", "public, max-age=31536000, immutable");
            return new NextResponse(new Uint8Array(existingCache.data), { headers });
        }

        // Return clean placeholder SVG if no image exists anywhere
        systemLog.warn("ImageProxy", `Image not found for itemId=${itemId}, type=${requestedType}, fallbackId=${fallbackId || 'none'}`);
        const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(placeholder);
        const headers = new Headers();
        headers.set("Content-Type", "image/svg+xml");
        headers.set("Cache-Control", "public, max-age=60, immutable");
        return new NextResponse(buffer, { headers });
    } catch (e: any) {
        systemLog.error("ImageProxy", `Image proxy error for itemId=${itemId}: ${e?.message || e}`, e);
        const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(placeholder);
        const headers = new Headers();
        headers.set("Content-Type", "image/svg+xml");
        headers.set("Cache-Control", "public, max-age=60, immutable");
        return new NextResponse(buffer, { headers });
    }
}
