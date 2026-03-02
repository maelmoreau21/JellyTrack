import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { apiT } from "@/lib/i18n-api";

/**
 * Shared security helpers for API routes.
 * Provides defense-in-depth authentication and authorization checks
 * beyond the Next.js middleware layer.
 */

export interface AuthResult {
  session: any;
  jellyfinUserId: string;
  isAdmin: boolean;
}

/**
 * Require an authenticated session. Returns 401 if unauthenticated.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: await apiT('unauthenticated') }, { status: 401 });
  }
  return {
    session,
    jellyfinUserId: (session.user as any).jellyfinUserId || "",
    isAdmin: (session.user as any).isAdmin === true,
  };
}

/**
 * Require an authenticated admin session. Returns 401/403 as appropriate.
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (!result.isAdmin) {
    return NextResponse.json({ error: await apiT('adminOnly') }, { status: 403 });
  }
  return result;
}

/**
 * Check if the result is an error response (NextResponse).
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
