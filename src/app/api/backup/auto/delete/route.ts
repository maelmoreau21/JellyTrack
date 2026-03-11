import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { unlinkSync, existsSync } from "fs";
import path from "path";
import { apiT } from "@/lib/i18n-api";

export const dynamic = "force-dynamic";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const { fileName } = await req.json();

        if (!fileName || typeof fileName !== "string") {
            return NextResponse.json({ error: await apiT('fileNameMissing') }, { status: 400 });
        }

        // Path traversal protection: only use the base filename
        const safeName = path.basename(fileName);

        // Validate it's an auto-backup file
        if (!safeName.startsWith("JellyTrack-auto-") || !safeName.endsWith(".json")) {
            return NextResponse.json({ error: await apiT('fileInvalid') }, { status: 400 });
        }

        const filePath = path.join(BACKUP_DIR, safeName);

        if (!existsSync(filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        unlinkSync(filePath);

        return NextResponse.json({ success: true, message: await apiT('backupDeleted', { fileName: safeName }) });
    } catch (e: any) {
        console.error("[Auto-Backup Delete] Error:", e);
        return NextResponse.json({ error: e.message || await apiT('deleteError') }, { status: 500 });
    }
}
