import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getLogHealthSnapshot } from "@/lib/logHealth";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const snapshot = await getLogHealthSnapshot();
    return NextResponse.json(snapshot, { status: 200 });
}