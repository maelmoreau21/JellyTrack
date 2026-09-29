import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { deleteUser } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const result = await deleteUser({
      userId: id,
      actorUsername: auth.username || "Admin",
      actorUserId: auth.jellyfinUserId || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `User ${result.username} deleted successfully.`,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
