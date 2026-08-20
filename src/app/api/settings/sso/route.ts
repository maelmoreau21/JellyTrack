import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import prisma from "@/lib/prisma";
import {
  getOidcConfigAsync,
  setInMemoryDbSsoConfig,
  parseDbSsoSettings,
  isLocalAdminConfigured,
  getLocalAdminCredentials,
  type OidcConfig,
} from "@/lib/oidcConfig";
import { writeAdminAuditLog } from "@/lib/adminAudit";
import { getClientIpFromHeaders } from "@/lib/requestIp";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const oidc = await getOidcConfigAsync();
  const local = getLocalAdminCredentials();

  return NextResponse.json({
    enabled: oidc.enabled,
    url: oidc.url,
    clientId: oidc.clientId,
    hasClientSecret: Boolean(oidc.clientSecret && oidc.clientSecret.length > 0),
    clientSecretMasked: oidc.clientSecret
      ? `${oidc.clientSecret.slice(0, 3)}••••••••${oidc.clientSecret.slice(-3)}`
      : "",
    userGroup: oidc.userGroup,
    adminGroup: oidc.adminGroup,
    tokenAlg: oidc.tokenAlg || "HS256",
    origins: oidc.origins,
    isEnvControlled: oidc.isEnvControlled,
    dbConfig: {
      enabled: oidc.dbConfig.enabled,
      url: oidc.dbConfig.url,
      clientId: oidc.dbConfig.clientId,
      hasClientSecret: Boolean(oidc.dbConfig.clientSecret && oidc.dbConfig.clientSecret.length > 0),
      clientSecretMasked: oidc.dbConfig.clientSecret
        ? `${oidc.dbConfig.clientSecret.slice(0, 3)}••••••••${oidc.dbConfig.clientSecret.slice(-3)}`
        : "",
      userGroup: oidc.dbConfig.userGroup,
      adminGroup: oidc.dbConfig.adminGroup,
      tokenAlg: oidc.dbConfig.tokenAlg || "HS256",
    },
    localAdminConfigured: local.isConfigured,
    localAdminUser: local.username,
    callbackPath: "/api/auth/callback/oidc",
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();

    const existingSettings = await (prisma as any).globalSettings?.findUnique({
      where: { id: "global" },
      select: { ssoSettings: true },
    });
    const currentDbConfig = parseDbSsoSettings(existingSettings?.ssoSettings);

    const newDbConfig: OidcConfig = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : currentDbConfig.enabled,
      url: typeof body.url === "string" ? body.url.trim().replace(/\/+$/, "") : currentDbConfig.url,
      clientId: typeof body.clientId === "string" ? body.clientId.trim() : currentDbConfig.clientId,
      clientSecret:
        typeof body.clientSecret === "string" && body.clientSecret.trim().length > 0 && !body.clientSecret.includes("••••••••")
          ? body.clientSecret.trim()
          : (body.keepExistingSecret ? currentDbConfig.clientSecret : (typeof body.clientSecret === "string" ? body.clientSecret.trim() : currentDbConfig.clientSecret)),
      userGroup: typeof body.userGroup === "string" ? body.userGroup.trim() : currentDbConfig.userGroup,
      adminGroup: typeof body.adminGroup === "string" ? body.adminGroup.trim() : currentDbConfig.adminGroup,
      tokenAlg: typeof body.tokenAlg === "string" && body.tokenAlg.trim() ? body.tokenAlg.trim() : currentDbConfig.tokenAlg || "HS256",
    };

    await (prisma as any).globalSettings?.upsert({
      where: { id: "global" },
      update: { ssoSettings: newDbConfig },
      create: { id: "global", ssoSettings: newDbConfig },
    });

    setInMemoryDbSsoConfig(newDbConfig);

    const clientIp = getClientIpFromHeaders(req.headers);
    await writeAdminAuditLog({
      action: "SSO_SETTINGS_UPDATED",
      actorUsername: auth.session?.user?.name || "admin",
      ipAddress: clientIp,
      details: {
        enabled: newDbConfig.enabled,
        url: newDbConfig.url,
        clientId: newDbConfig.clientId,
        userGroup: newDbConfig.userGroup,
        adminGroup: newDbConfig.adminGroup,
        tokenAlg: newDbConfig.tokenAlg,
      },
    });

    const oidc = await getOidcConfigAsync();
    const local = getLocalAdminCredentials();

    return NextResponse.json({
      success: true,
      message: "SSO settings updated successfully",
      enabled: oidc.enabled,
      url: oidc.url,
      clientId: oidc.clientId,
      hasClientSecret: Boolean(oidc.clientSecret && oidc.clientSecret.length > 0),
      clientSecretMasked: oidc.clientSecret
        ? `${oidc.clientSecret.slice(0, 3)}••••••••${oidc.clientSecret.slice(-3)}`
        : "",
      userGroup: oidc.userGroup,
      adminGroup: oidc.adminGroup,
      tokenAlg: oidc.tokenAlg || "HS256",
      origins: oidc.origins,
      isEnvControlled: oidc.isEnvControlled,
      dbConfig: {
        enabled: oidc.dbConfig.enabled,
        url: oidc.dbConfig.url,
        clientId: oidc.dbConfig.clientId,
        hasClientSecret: Boolean(oidc.dbConfig.clientSecret && oidc.dbConfig.clientSecret.length > 0),
        clientSecretMasked: oidc.dbConfig.clientSecret
          ? `${oidc.dbConfig.clientSecret.slice(0, 3)}••••••••${oidc.dbConfig.clientSecret.slice(-3)}`
          : "",
        userGroup: oidc.dbConfig.userGroup,
        adminGroup: oidc.dbConfig.adminGroup,
        tokenAlg: oidc.dbConfig.tokenAlg || "HS256",
      },
      localAdminConfigured: local.isConfigured,
      localAdminUser: local.username,
      callbackPath: "/api/auth/callback/oidc",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update SSO settings" },
      { status: 500 }
    );
  }
}
