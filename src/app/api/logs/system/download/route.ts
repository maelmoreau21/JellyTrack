import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getLogFileContentByName } from "@/lib/systemLogger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) {
        return auth;
    }

    const { searchParams } = new URL(req.url);
    const requestedFile = searchParams.get("file");

    const fileResult = getLogFileContentByName(requestedFile);

    return new NextResponse(fileResult.content, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileResult.filename}"`,
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
