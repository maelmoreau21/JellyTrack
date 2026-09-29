import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { pruneDeletedJellyfinUsers } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const targetServerId = typeof body.serverId === "string" ? body.serverId : undefined;

    const result = await pruneDeletedJellyfinUsers(
      targetServerId,
      auth.username || "Admin"
    );

    return NextResponse.json({
      success: true,
      message: `Pruning complete. Removed ${result.totalPruned} user(s) not found in Jellyfin.`,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to prune deleted users.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
