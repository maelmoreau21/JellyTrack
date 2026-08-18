import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getLogFilesList, deleteLogFileByName, clearSystemLogs, systemLog } from "@/lib/systemLogger";
import prisma from "@/lib/prisma";
import { normalizeSchedulerIntervals } from "@/lib/schedulerIntervals";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) {
        return auth;
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
    const auth = await requireAdmin();
    if (isAuthError(auth)) {
        return auth;
    }

    const username = auth.username || "Admin";
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
