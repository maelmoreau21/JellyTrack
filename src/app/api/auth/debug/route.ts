import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const mod = await import("@/lib/authOptions");
    const found = !!(mod && (mod.authOptions || mod.default));
    return NextResponse.json({ ok: true, authOptionsFound: found }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "debug_check_failed" }, { status: 500 });
  }
}
