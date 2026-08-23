import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { mergeUsers } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const { sourceUserId, targetUserId } = body;

    if (!sourceUserId || !targetUserId) {
      return NextResponse.json(
        { error: "Both sourceUserId and targetUserId are required." },
        { status: 400 }
      );
    }

    const result = await mergeUsers({
      sourceUserId,
      targetUserId,
      actorUsername: auth.username || "Admin",
      actorUserId: auth.jellyfinUserId || undefined,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to merge users.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
