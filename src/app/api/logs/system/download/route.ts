import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getLogFileContentByName } from "@/lib/systemLogger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (!session || role !== "admin") {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedFile = searchParams.get("file");

    const fileResult = getLogFileContentByName(requestedFile);

    if (!fileResult) {
        return new NextResponse("Fichier de log introuvable", { status: 404 });
    }

    return new NextResponse(fileResult.content, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileResult.filename}"`,
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
