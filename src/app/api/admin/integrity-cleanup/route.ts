import { NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { cleanupOrphanedSessions } from "@/lib/cleanup";

export async function POST(req: Request) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        await cleanupOrphanedSessions();
        return NextResponse.json({ success: true, message: "Integrity check and stale sessions cleanup triggered successfully." });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error during cleanup";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
