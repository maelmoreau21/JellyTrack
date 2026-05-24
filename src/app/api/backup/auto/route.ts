import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";
import { getBackupDirectory, resolveAutoBackupFile } from "@/lib/backupDir";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const backupDir = getBackupDirectory();
        const files = fs.readdirSync(backupDir)
            .filter((fileName: string) => resolveAutoBackupFile(fileName) !== null)
            .map((f: string) => {
                const stats = fs.statSync(path.join(backupDir, f));
                return {
                    name: f,
                    size: stats.size,
                    sizeMb: (stats.size / 1024 / 1024).toFixed(2),
                    date: stats.mtime.toISOString(),
                };
            })
            .sort((a: { date: string }, b: { date: string }) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ backups: files });

    } catch (e: unknown) {
        // Directory might not exist yet
        let code: unknown = undefined;
        if (e && typeof e === 'object' && 'code' in e) {
            code = (e as { code?: unknown }).code;
        }
        if (typeof code === 'string' && code === 'ENOENT') {
            return NextResponse.json({ backups: [] });
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup List] Error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
