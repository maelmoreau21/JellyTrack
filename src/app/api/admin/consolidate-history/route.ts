import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { consolidatePlaybackHistory } from "@/lib/sessionConsolidation";
import { writeAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const mergeWindowMinutes = typeof body.mergeWindowMinutes === "number" && body.mergeWindowMinutes > 0
      ? body.mergeWindowMinutes
      : 60;

    const result = await consolidatePlaybackHistory({ mergeWindowMinutes });

    await writeAdminAuditLog({
      action: "HISTORY_CONSOLIDATION_TRIGGER",
      details: {
        mergeWindowMinutes,
        clustersMerged: result.clustersMerged,
        sessionsPruned: result.sessionsPruned,
      },
      actorUsername: auth.username || "Admin",
      target: "playbackHistory",
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      message: `Consolidation terminée : ${result.clustersMerged} groupe(s) fusionné(s), ${result.sessionsPruned} micro-coupure(s) supprimée(s).`,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to consolidate playback history.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
