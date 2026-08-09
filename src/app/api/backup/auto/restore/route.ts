import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { apiT } from "@/lib/i18n-api";
import fs from "node:fs";
import { resolveAutoBackupFile } from "@/lib/backupDir";
import { revalidateDashboardCache } from "@/lib/revalidate";
import { restoreBackupBuffer } from "@/lib/backupUtils";
import { z } from "zod";

const restoreBackupSchema = z.object({
    fileName: z.string().min(1),
});

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json().catch(() => ({}));
        const parseResult = restoreBackupSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json({ error: await apiT('fileNameInvalid') }, { status: 400 });
        }

        const { fileName } = parseResult.data;

        const backupFile = resolveAutoBackupFile(fileName);
        if (!backupFile) {
            return NextResponse.json({ error: await apiT('fileAutoOnly') }, { status: 400 });
        }

        if (!fs.existsSync(backupFile.filePath)) {
            return NextResponse.json({ error: await apiT('fileNotFound') }, { status: 404 });
        }

        const buffer = fs.readFileSync(backupFile.filePath);
        const result = await restoreBackupBuffer(buffer);

        revalidateDashboardCache();

        return NextResponse.json({ success: true, mode: result.mode }, { status: 200 });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Backup Restore] Failed:", e);
        return NextResponse.json({ error: msg || "Restauration échouée" }, { status: 500 });
    }
}
