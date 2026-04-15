import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";
import {
  mergeSmartSecurityThresholdsIntoResolutionSettings,
  normalizeSmartSecurityThresholds,
  readSmartSecurityThresholdsFromResolutionSettings,
} from "@/lib/securitySmartThresholds";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const settings = await prisma.globalSettings.findUnique({
    where: { id: "global" },
    select: { resolutionThresholds: true },
  });

  const thresholds = readSmartSecurityThresholdsFromResolutionSettings(settings?.resolutionThresholds);

  return NextResponse.json({ thresholds });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  let payload: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const incoming = payload.thresholds;
  const thresholds = normalizeSmartSecurityThresholds(incoming);

  const existing = await prisma.globalSettings.findUnique({
    where: { id: "global" },
    select: { resolutionThresholds: true },
  });

  const mergedResolutionSettings = mergeSmartSecurityThresholdsIntoResolutionSettings(
    existing?.resolutionThresholds,
    thresholds,
  );

  await prisma.globalSettings.upsert({
    where: { id: "global" },
    update: { resolutionThresholds: mergedResolutionSettings },
    create: {
      id: "global",
      resolutionThresholds: mergedResolutionSettings,
    },
  });

  await writeAdminAuditLog({
    action: "plugin.security.smart_thresholds_updated",
    actorUserId: auth.linkedUserDbIds[0] ?? null,
    actorUsername: auth.username || null,
    ipAddress: getRequestIp(req),
    target: "/api/admin/security/smart-settings",
    details: thresholds,
  });

  return NextResponse.json({ thresholds });
}
