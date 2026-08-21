import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { resolveJellyfinConnection } from "@/lib/jellyfinImageServer";

const UUID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return new NextResponse("userId is required", { status: 400 });
    }

    if (!UUID_PATTERN.test(userId)) {
        return new NextResponse("Invalid userId format", { status: 400 });
    }

    try {
        const conn = await resolveJellyfinConnection();
        if (!conn) {
            return new NextResponse("Jellyfin not configured", { status: 503 });
        }

        const imageUrl = `${conn.baseUrl}/Users/${encodeURIComponent(userId)}/Images/Primary`;
        const response = await fetch(imageUrl, {
            headers: {
                "X-Emby-Authorization": `MediaBrowser Token="${conn.apiKey}"`,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return generateFallback();
        }

        const contentType = response.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/") || contentType.includes("svg")) {
            return generateFallback();
        }

        const data = await response.arrayBuffer();
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "public, max-age=3600");
        return new NextResponse(new Uint8Array(data), { headers });
    } catch {
        return generateFallback();
    }
}

function generateFallback(): NextResponse {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#1e293b"/><text x="50%" y="50%" fill="#64748b" font-size="60" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">?</text></svg>`;
    const headers = new Headers();
    headers.set("Content-Type", "image/svg+xml");
    headers.set("Cache-Control", "public, max-age=60");
    return new NextResponse(svg, { headers });
}