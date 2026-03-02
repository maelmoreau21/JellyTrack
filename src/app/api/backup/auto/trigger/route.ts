import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { performAutoBackup } from "@/lib/autoBackup";
import { apiT } from "@/lib/i18n-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const fileName = await performAutoBackup();
        return NextResponse.json({ success: true, message: await apiT('backupCreated', { fileName }), fileName });
    } catch (e: any) {
        console.error("[Manual Backup Trigger] Error:", e);
        return NextResponse.json({ error: e.message || await apiT('backupError') }, { status: 500 });
    }
}
