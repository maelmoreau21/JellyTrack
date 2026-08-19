import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { isAuthError } from "@/lib/auth";
import { getOidcConfig } from "@/lib/oidcConfig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  try {
    let targetUrl = "";
    try {
      const body = await req.json();
      targetUrl = String(body?.url || "").trim();
    } catch {}

    if (!targetUrl) {
      const oidc = getOidcConfig();
      targetUrl = oidc.url;
    }

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: "OIDC URL is not configured or provided." },
        { status: 400 }
      );
    }

    const cleanUrl = targetUrl
      .replace(/\/+$/, "")
      .replace(/\/\.well-known\/openid-configuration$/, "");

    const wellKnownUrl = `${cleanUrl}/.well-known/openid-configuration`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(wellKnownUrl, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: `OIDC discovery endpoint returned HTTP ${res.status} (${res.statusText})`,
        wellKnownUrl,
      });
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object" || !data.issuer) {
      return NextResponse.json({
        success: false,
        error: "OIDC discovery response is not valid JSON OpenID configuration metadata.",
        wellKnownUrl,
      });
    }

    return NextResponse.json({
      success: true,
      issuer: data.issuer,
      authorizationEndpoint: data.authorization_endpoint,
      tokenEndpoint: data.token_endpoint,
      userinfoEndpoint: data.userinfo_endpoint,
      jwksUri: data.jwks_uri,
      scopesSupported: data.scopes_supported || ["openid", "email", "profile", "groups"],
      wellKnownUrl,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to reach OIDC provider.",
    });
  }
}
