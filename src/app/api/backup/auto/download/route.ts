import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiT } from "@/lib/i18n-api";
import fs from "node:fs";
import { resolveAutoBackupFile } from "@/lib/backupDir";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const { searchParams } = new URL(req.url);
        const fileName = searchParams.get("fileName");

        if (!fileName) {
            return NextResponse.json({ error: await apiT('fileNameMissing') }, { status: 400 });
        }

        const backupFile = resolveAutoBackupFile(fileName);
        if (!backupFile) {
            return NextResponse.json({ error: await apiT('fileInvalid') }, { status: 400 });
        }

        if (!fs.existsSync(backupFile.filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(backupFile.filePath);
        const isZip = backupFile.fileName.endsWith(".zip");

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": isZip ? "application/zip" : "application/json",
                "Content-Disposition": `attachment; filename="${backupFile.fileName}"`,
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Backup Download] Error:", e);
        return NextResponse.json({ error: msg || await apiT('internalError') }, { status: 500 });
    }
}
