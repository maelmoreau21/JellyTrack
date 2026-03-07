import { NextRequest, NextResponse } from "next/server";
import { syncJellyfinLibrary } from "@/lib/sync";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiT } from "@/lib/i18n-api";

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;
    try {
        const body = await req.json().catch(() => ({}));
        const recentOnly = body?.mode === 'recent';

        const result = await syncJellyfinLibrary({ recentOnly });

        if (result.success) {
            const modeLabel = recentOnly ? await apiT('syncRecent') : await apiT('syncFull');
            return NextResponse.json({
                status: "success",
                message: await apiT('syncSuccess', { mode: modeLabel, users: result.users ?? 0, media: result.media ?? 0 })
            }, { status: 200 });
        } else {
            return NextResponse.json({
                status: "error",
                message: result.error
            }, { status: 500 });
        }
    } catch {
        return NextResponse.json({ status: "error", message: await apiT('internalError') }, { status: 500 });
    }
}
