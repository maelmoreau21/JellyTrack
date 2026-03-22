import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiT } from "@/lib/i18n-api";

export async function POST(req: NextRequest) {
    // Only administrators can kill streams
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const { sessionId } = await req.json();
        if (!sessionId) {
            return NextResponse.json({ error: "Session ID required" }, { status: 400 });
        }

        const baseUrl = process.env.JELLYFIN_URL;
        const apiKey = process.env.JELLYFIN_API_KEY;

        if (!baseUrl || !apiKey) {
            return NextResponse.json({ error: await apiT('jellyfinNotConfigured') }, { status: 500 });
        }

        // SECURITY: Pass API key via header instead of URL query param (avoids proxy/log leaks)
        const jellyfinUrl = `${baseUrl}/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop`;
        const res = await fetch(jellyfinUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Emby-Token": apiKey,
            }
        });

        if (!res.ok) {
            console.error("[KillStream] Failed to stop session:", res.status, await res.text());
            return NextResponse.json({ error: await apiT('killStreamFailed') }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: await apiT('killStreamSuccess') }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[KillStream] Exception:", e);
        return NextResponse.json({ error: msg || await apiT('internalError') }, { status: 500 });
    }
}
