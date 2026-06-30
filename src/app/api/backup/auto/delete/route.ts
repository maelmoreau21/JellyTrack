import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { apiT } from "@/lib/i18n-api";
import fs from "node:fs";
import { resolveAutoBackupFile } from "@/lib/backupDir";

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const { fileName } = await req.json();

        if (!fileName || typeof fileName !== "string") {
            return NextResponse.json({ error: await apiT('fileNameMissing') }, { status: 400 });
        }

        const backupFile = resolveAutoBackupFile(fileName);
        if (!backupFile) {
            return NextResponse.json({ error: await apiT('fileInvalid') }, { status: 400 });
        }

        if (!fs.existsSync(backupFile.filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        fs.unlinkSync(backupFile.filePath);

        return NextResponse.json({ success: true, message: await apiT('backupDeleted', { fileName: backupFile.fileName }) });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup Delete] Error:", e);
        return NextResponse.json({ error: msg || await apiT('deleteError') }, { status: 500 });
    }
}
