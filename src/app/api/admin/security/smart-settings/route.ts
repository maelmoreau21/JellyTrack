import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";
import {
  mergeSmartSecurityThresholdsIntoResolutionSettings,
  normalizeSmartSecurityThresholds,
  readSmartSecurityThresholdsFromResolutionSettings,
} from "@/lib/securitySmartThresholds";
import { z } from "zod";

export const dynamic = "force-dynamic";

const smartSettingsPatchSchema = z.object({
  thresholds: z.unknown(),
});

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
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const parsed = await req.json().catch(() => ({}));
  const parseResult = smartSettingsPatchSchema.safeParse(parsed);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const incoming = parseResult.data.thresholds;
  const thresholds = normalizeSmartSecurityThresholds(incoming);

  const existing = await prisma.globalSettings.findUnique({
    where: { id: "global" },
    select: { resolutionThresholds: true },
  });

  const mergedResolutionSettings = mergeSmartSecurityThresholdsIntoResolutionSettings(
    existing?.resolutionThresholds,
    thresholds,
  ) as Prisma.InputJsonObject;

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
    details: { ...thresholds },
  });

  return NextResponse.json({ thresholds });
}
