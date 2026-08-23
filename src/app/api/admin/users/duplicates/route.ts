import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { detectUserDuplicates, cleanupOrphanSsoUsers } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const duplicates = await detectUserDuplicates();
    return NextResponse.json({
      duplicates,
      count: duplicates.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to detect duplicates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const cleanupResult = await cleanupOrphanSsoUsers({
      actorUsername: auth.username || "Admin",
      actorUserId: auth.jellyfinUserId || undefined,
    });

    return NextResponse.json({
      success: true,
      ...cleanupResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cleanup orphan users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
