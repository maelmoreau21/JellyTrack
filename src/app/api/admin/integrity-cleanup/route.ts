import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { cleanupOrphanedSessions, consolidateAllPlaybackHistory } from "@/lib/cleanup";

export async function POST(req: Request) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        await cleanupOrphanedSessions();
        const consolidation = await consolidateAllPlaybackHistory();
        return NextResponse.json({
            success: true,
            message: "Integrity check, stale sessions cleanup, and playback history consolidation completed successfully.",
            consolidation,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error during cleanup";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
