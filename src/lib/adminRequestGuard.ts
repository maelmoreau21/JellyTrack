import { NextResponse } from "next/server";
import { requireAdmin, type AuthResult } from "@/lib/auth";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function addOriginFromUrl(origins: Set<string>, value: string | null | undefined) {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Ignore malformed environment or request URLs.
  }
}

function expectedOrigins(req: Request): Set<string> {
  const origins = new Set<string>();
  addOriginFromUrl(origins, req.url);
  addOriginFromUrl(origins, process.env.NEXTAUTH_URL);
  addOriginFromUrl(origins, process.env.AUTH_TRUSTED_ORIGIN);

  const extraOrigins = String(process.env.AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of extraOrigins) {
    addOriginFromUrl(origins, origin);
  }

  return origins;
}

function originFromHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function hasValidMutationOrigin(req: Request): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return true;
  }

  const allowedOrigins = expectedOrigins(req);
  const origin = originFromHeader(req.headers.get("origin"));
  if (origin) {
    return allowedOrigins.has(origin);
  }

  const refererOrigin = originFromHeader(req.headers.get("referer"));
  if (refererOrigin) {
    return allowedOrigins.has(refererOrigin);
  }

  return process.env.ALLOW_MISSING_ORIGIN_FOR_MUTATIONS === "true";
}

export function invalidOriginResponse(): NextResponse {
  return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
}

export async function requireAdminMutation(req: Request): Promise<AuthResult | NextResponse> {
  if (!hasValidMutationOrigin(req)) {
    return invalidOriginResponse();
  }

  return requireAdmin();
}
