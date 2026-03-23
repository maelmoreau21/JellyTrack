import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
// No rules
import { readSystemHealthState } from "@/lib/systemHealth";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        // Fetch all the data we need to construct a huge JSON backup file.
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await prisma.telemetryEvent.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });
        const libraryRules = null;
        const systemHealth = await readSystemHealthState({ eventLimit: 200 });

        const backupContent = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            data: {
                users,
                media,
                playbackHistory,
                telemetryEvents,
                settings,
                libraryRules,
                systemHealth,
            }
        };

        // BigInt-safe JSON serializer (Prisma returns BigInt for durationMs, positionTicks, etc.)
        const bigIntReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;

        // Construct standard file headers to serve the file instantly downstream.
        return new NextResponse(JSON.stringify(backupContent, bigIntReplacer, 2), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="JellyTrack-backup-${new Date().toISOString().split('T')[0]}.json"`,
            }
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[BackupExport] Failed", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
