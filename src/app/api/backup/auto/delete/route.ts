import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { apiT } from "@/lib/i18n-api";
import { getBackupDirectory } from "@/lib/backupDir";

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const { fileName } = await req.json();

        if (!fileName || typeof fileName !== "string") {
            return NextResponse.json({ error: await apiT('fileNameMissing') }, { status: 400 });
        }

        // Load fs/path at request time to avoid Turbopack tracing filesystem at import time
        const fs = await import('fs');
        const path = await import('path');

        // Path traversal protection: only use the base filename
        const safeName = path.basename(fileName);

        // Validate it's an auto-backup file
        if (!safeName.startsWith("JellyTrack-auto-") || !safeName.endsWith(".json")) {
            return NextResponse.json({ error: await apiT('fileInvalid') }, { status: 400 });
        }

        const backupDir = getBackupDirectory();
        const filePath = path.join(backupDir, safeName);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        fs.unlinkSync(filePath);

        return NextResponse.json({ success: true, message: await apiT('backupDeleted', { fileName: safeName }) });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup Delete] Error:", e);
        return NextResponse.json({ error: msg || await apiT('deleteError') }, { status: 500 });
    }
}
