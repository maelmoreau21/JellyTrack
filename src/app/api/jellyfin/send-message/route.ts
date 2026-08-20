import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { apiT } from "@/lib/i18n-api";
import { z } from "zod";

const sendMessageSchema = z.object({
    sessionId: z.string().min(1),
    message: z.string().min(1).max(500),
    header: z.string().max(100).optional(),
    timeoutMs: z.number().int().min(1000).max(60000).optional().default(10000),
});

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json().catch(() => ({}));
        const parseResult = sendMessageSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: "Session ID and message required" }, { status: 400 });
        }

        const { sessionId, message, header, timeoutMs } = parseResult.data;

        const baseUrl = process.env.JELLYFIN_URL;
        const apiKey = process.env.JELLYFIN_API_KEY;

        if (!baseUrl || !apiKey) {
            return NextResponse.json({ error: await apiT('jellyfinNotConfigured') }, { status: 500 });
        }

        const jellyfinUrl = `${baseUrl.replace(/\/$/, '')}/Sessions/${encodeURIComponent(sessionId)}/Message`;
        const res = await fetch(jellyfinUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `MediaBrowser Token="${apiKey}"`,
            },
            body: JSON.stringify({
                Header: header || "Message de l'administrateur",
                Text: message,
                TimeoutMs: timeoutMs,
            }),
        });

        if (!res.ok) {
            console.error("[SendMessage] Failed to send message to session:", res.status, await res.text());
            return NextResponse.json({ error: "Impossible de transmettre le message au client Jellyfin." }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: "Message envoyé avec succès." }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[SendMessage] Exception:", e);
        return NextResponse.json({ error: msg || "Erreur interne" }, { status: 500 });
    }
}
