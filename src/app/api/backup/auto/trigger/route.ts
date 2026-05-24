import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { performAutoBackup } from "@/lib/autoBackup";
import { apiT } from "@/lib/i18n-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const fileName = await performAutoBackup();
        return NextResponse.json({ success: true, message: await apiT('backupCreated', { fileName }), fileName });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Manual Backup Trigger] Error:", e);
        return NextResponse.json({ error: msg || await apiT('backupError') }, { status: 500 });
    }
}
