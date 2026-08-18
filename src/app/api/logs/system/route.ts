import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getRecentSystemLogs, getLogFileInfo, clearSystemLogs, systemLog } from "@/lib/systemLogger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(10, parseInt(searchParams.get("limit") || "100", 10)));

    const logs = getRecentSystemLogs(limit);
    const info = getLogFileInfo();

    return NextResponse.json({
        success: true,
        info,
        logs,
    });
}

export async function DELETE() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    const username = session?.user?.name || "Admin";

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const cleared = clearSystemLogs();
    if (cleared) {
        systemLog.audit("Clear Logs", username, undefined, { target: "system_logs" });
        return NextResponse.json({ success: true, message: "Logs cleared successfully" });
    }

    return NextResponse.json({ success: false, message: "Failed to clear logs" }, { status: 500 });
}
