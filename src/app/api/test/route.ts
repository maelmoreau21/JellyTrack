import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  return NextResponse.json({ ok: true, time: new Date().toISOString() }, { status: 200 });
}
