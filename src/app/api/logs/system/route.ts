import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getLogFilesList, deleteLogFileByName, clearSystemLogs, systemLog } from "@/lib/systemLogger";
import prisma from "@/lib/prisma";
import { normalizeSchedulerIntervals } from "@/lib/schedulerIntervals";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const files = getLogFilesList();

    let retentionDays = 30;
    try {
        const settings = await prisma.globalSettings.findUnique({ where: { id: "global" } });
        const resolutionObj = settings?.resolutionThresholds && typeof settings.resolutionThresholds === "object"
            ? (settings.resolutionThresholds as Record<string, unknown>)
            : null;
        const normalized = normalizeSchedulerIntervals(resolutionObj?.schedulerIntervals);
        retentionDays = normalized.logRetentionDays;
    } catch {
        // Fallback default
    }

    const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

    return NextResponse.json({
        success: true,
        files,
        totalSizeBytes,
        retentionDays,
    });
}

export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    const username = session?.user?.name || "Admin";

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    if (filename) {
        const deleted = deleteLogFileByName(filename);
        if (deleted) {
            systemLog.audit("Delete Log File", username, undefined, { file: filename });
            return NextResponse.json({ success: true, message: `Fichier ${filename} supprimé.` });
        }
        return NextResponse.json({ success: false, message: "Impossible de supprimer le fichier." }, { status: 400 });
    }

    const cleared = clearSystemLogs();
    if (cleared) {
        systemLog.audit("Clear All Logs", username, undefined, { target: "all_system_logs" });
        return NextResponse.json({ success: true, message: "Tous les journaux ont été réinitialisés." });
    }

    return NextResponse.json({ success: false, message: "Échec de la réinitialisation des journaux." }, { status: 500 });
}
