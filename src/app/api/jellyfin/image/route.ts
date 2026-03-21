import { NextRequest, NextResponse } from "next/server";
import { fetchJellyfinImage } from "@/lib/jellyfin";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Allowed image types for the Jellyfin image proxy (prevent path traversal)
const ALLOWED_IMAGE_TYPES = ["Primary", "Thumb", "Backdrop", "Banner", "Logo", "Art"];
// Jellyfin IDs can be UUIDs with or without dashes (both are valid in practice).
const UUID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

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

    try {
        let response = await fetchJellyfinImage(itemId, type);

        // If the item has no image, try the fallback (e.g. parent album)
        if (!response.ok && fallbackId) {
            response = await fetchJellyfinImage(fallbackId, type);
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

        // On récupère le type de contenu depuis le serveur originel pour notre proxy (souvent image/jpeg ou image/webp)
        headers.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
        // Mise en cache navigateur longue durée pour soulager l'API
        headers.set('Cache-Control', 'public, max-age=604800, immutable');

        return new NextResponse(buffer, { headers });
    } catch (e) {
        console.error("Erreur proxy Image Jellyfin:", e);
        // On renvoie un SVG de remplacement plutôt qu'une erreur 500 pour éviter des effets secondaires côté client
        const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#9ca3af" font-size="20" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>`;
        const encoder = new TextEncoder();
        const buffer = encoder.encode(placeholder);
        const headers = new Headers();
        headers.set('Content-Type', 'image/svg+xml');
        headers.set('Cache-Control', 'public, max-age=60, immutable');
        return new NextResponse(buffer, { headers });
    }
}
