import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchJellyfinImage, fetchJellyfinJson } from "@/lib/jellyfinImageServer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

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
};

function normalizeCandidateId(value: unknown): string | null {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id) return null;
    return UUID_PATTERN.test(id) ? id : null;
}

async function fetchJellyfinItemMeta(itemId: string, serverId?: string | null): Promise<JellyfinItemMeta | null> {
    const data = await fetchJellyfinJson<Record<string, unknown>>(
        `/Items/${encodeURIComponent(itemId)}?Fields=ParentId,SeasonId,SeriesId,AlbumId,Type`,
        serverId
    );
    if (!data) return null;

    const id = normalizeCandidateId(data?.Id) || itemId;

    return {
        id,
        type: typeof data?.Type === "string" ? data.Type : null,
        parentId: normalizeCandidateId(data?.ParentId),
        seasonId: normalizeCandidateId(data?.SeasonId),
        seriesId: normalizeCandidateId(data?.SeriesId),
        albumId: normalizeCandidateId(data?.AlbumId),
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
        select: { serverId: true, parentId: true },
    });

    const candidates: string[] = [];
    const addCandidate = (value: string | null | undefined) => {
        const id = normalizeCandidateId(value);
        if (!id || candidates.includes(id)) return;
        candidates.push(id);
    };

    addCandidate(item?.parentId);

    if (item?.parentId) {
        const parent = await prisma.media.findFirst({
            where: { serverId: item.serverId, jellyfinMediaId: item.parentId },
            select: { parentId: true },
        });
        addCandidate(parent?.parentId);
    }

    return candidates;
}

export async function GET(req: NextRequest) {
    // SECURITY: Require authentication (defense-in-depth, middleware also checks)
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const type = searchParams.get("type") || "Primary";
    const fallbackId = searchParams.get("fallbackId");
    const serverId = searchParams.get("serverId");
    const noStore = searchParams.has("v") || searchParams.has("cacheBust");

    if (!itemId) {
        return new NextResponse("Item ID is required", { status: 400 });
    }

    // SECURITY: Validate type against allowlist (prevents path traversal like ../../)
    if (!ALLOWED_IMAGE_TYPES.includes(type)) {
        return new NextResponse("Invalid image type", { status: 400 });
    }

    // SECURITY: Validate itemId and fallbackId format (UUID, dashed or non-dashed)
    if (!UUID_PATTERN.test(itemId)) {
        return new NextResponse("Invalid item ID format", { status: 400 });
    }
    if (fallbackId && !UUID_PATTERN.test(fallbackId)) {
        return new NextResponse("Invalid fallback ID format", { status: 400 });
    }
    if (serverId && !UUID_PATTERN.test(serverId)) {
        return new NextResponse("Invalid server ID format", { status: 400 });
    }

    try {
        let response = await fetchJellyfinImage(itemId, type, serverId, noStore);
        const attemptedIds = new Set<string>([itemId]);

        const tryCandidate = async (candidate: string | null | undefined): Promise<boolean> => {
            const candidateId = normalizeCandidateId(candidate);
            if (!candidateId || attemptedIds.has(candidateId)) return false;

            attemptedIds.add(candidateId);
            const candidateResponse = await fetchJellyfinImage(candidateId, type, serverId, noStore);
            if (!candidateResponse.ok) return false;

            response = candidateResponse;
            return true;
        };

        // If the item has no image, try the fallback (e.g. parent album)
        if (!response.ok && fallbackId) {
            await tryCandidate(fallbackId);
        }

        // If still missing, walk known Jellyfin hierarchy IDs to match Jellyfin-like fallback behavior:
        // Episode -> Season -> Series, Track -> Album, Season -> Series.
        if (!response.ok) {
            const itemMeta = await fetchJellyfinItemMeta(itemId, serverId);
            const candidateIds: string[] = [];
            const addCandidate = (value: string | null | undefined) => {
                const id = normalizeCandidateId(value);
                if (!id || attemptedIds.has(id) || candidateIds.includes(id)) return;
                candidateIds.push(id);
            };

            for (const candidateId of await fetchDatabaseCandidateIds(itemId, serverId)) {
                addCandidate(candidateId);
            }
            addCandidate(itemMeta?.seasonId);
            addCandidate(itemMeta?.seriesId);
            addCandidate(itemMeta?.albumId);
            addCandidate(itemMeta?.parentId);

            // Series can legitimately miss a primary image. In that case,
            // use the first available season poster as visual fallback.
            if ((itemMeta?.type || "").toLowerCase() === "series") {
                const seasonCandidates = await fetchSeriesSeasonCandidateIds(itemId, serverId);
                for (const seasonId of seasonCandidates) {
                    addCandidate(seasonId);
                }
            }

            for (const candidateId of candidateIds) {
                const found = await tryCandidate(candidateId);
                if (found) break;
            }
        }

        if (!response.ok) {
            // If Jellyfin doesn't have the image or returns an error, return a small SVG placeholder
            const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`;
            const encoder = new TextEncoder();
            const buffer = encoder.encode(placeholder);
            const headers = new Headers();
            headers.set('Content-Type', 'image/svg+xml');
            headers.set('Cache-Control', 'public, max-age=60, immutable');
            return new NextResponse(buffer, { headers });
        }

        const buffer = await response.arrayBuffer();
        const headers = new Headers();

        // Retrieve content type from original server for our proxy (often image/jpeg or image/webp)
        headers.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
        // Long-term browser caching to offload the API
        headers.set('Cache-Control', noStore ? 'no-store' : 'public, max-age=604800, immutable');

        return new NextResponse(buffer, { headers });
    } catch (e) {
        console.error("Jellyfin Image proxy error:", e);
        // Return a replacement SVG instead of a 500 error to avoid client-side side-effects
        const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(placeholder);
        const headers = new Headers();
        headers.set('Content-Type', 'image/svg+xml');
        headers.set('Cache-Control', 'public, max-age=60, immutable');
        return new NextResponse(buffer, { headers });
    }
}
