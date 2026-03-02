import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        // Fetch all the data we need to construct a huge JSON backup file.
        const users = await prisma.user.findMany();
        const media = await prisma.media.findMany();
        const playbackHistory = await prisma.playbackHistory.findMany();
        const telemetryEvents = await (prisma as any).telemetryEvent.findMany();
        const settings = await prisma.globalSettings.findFirst({ where: { id: "global" } });

        const backupContent = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            data: {
                users,
                media,
                playbackHistory,
                telemetryEvents,
                settings,
            }
        };

        // BigInt-safe JSON serializer (Prisma returns BigInt for durationMs, positionTicks, etc.)
        const bigIntReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;

        // Construct standard file headers to serve the file instantly downstream.
        return new NextResponse(JSON.stringify(backupContent, bigIntReplacer, 2), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="jellytulli-backup-${new Date().toISOString().split('T')[0]}.json"`,
            }
        });

    } catch (e: any) {
        console.error("[BackupExport] Failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
