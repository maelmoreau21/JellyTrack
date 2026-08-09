import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { readSystemHealthState } from "@/lib/systemHealth";
import { redactBackupData } from "@/lib/backupSecurity";
import { createZipBackup } from "@/lib/backupUtils";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const servers = await prisma.server.findMany();
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await prisma.telemetryEvent.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });
        const systemHealth = await readSystemHealthState({ eventLimit: 200 });

        const rawData = redactBackupData({
            servers,
            users,
            media,
            playbackHistory,
            telemetryEvents,
            settings,
            systemHealth,
        });

        const zipBuffer = await createZipBackup(rawData);
        const filename = `JellyTrack-backup-${new Date().toISOString().split('T')[0]}.zip`;

        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
            }
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[BackupExport] Failed", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
