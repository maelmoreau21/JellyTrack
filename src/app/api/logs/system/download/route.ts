import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getLogFileContent } from "@/lib/systemLogger";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const content = getLogFileContent();
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `jellytrack-system-logs-${dateStr}.log`;

    return new NextResponse(content, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
