import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getOidcConfig, isLocalAdminConfigured, getLocalAdminCredentials } from "@/lib/oidcConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const oidc = getOidcConfig();
  const local = getLocalAdminCredentials();

  return NextResponse.json({
    enabled: oidc.enabled,
    url: oidc.url,
    clientId: oidc.clientId,
    hasClientSecret: Boolean(oidc.clientSecret && oidc.clientSecret.length > 0),
    clientSecretMasked: oidc.clientSecret ? `${oidc.clientSecret.slice(0, 3)}••••••••${oidc.clientSecret.slice(-3)}` : "",
    userGroup: oidc.userGroup,
    adminGroup: oidc.adminGroup,
    localAdminConfigured: local.isConfigured,
    localAdminUser: local.username,
    callbackPath: "/api/auth/callback/oidc",
  });
}
