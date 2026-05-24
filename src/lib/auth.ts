import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { NextResponse } from "next/server";
import { apiT } from "@/lib/i18n-api";
import prisma from "@/lib/prisma";

/**
 * Shared security helpers for API routes.
 * Provides defense-in-depth authentication and authorization checks
 * beyond the Next.js middleware layer.
 */

export interface AuthResult {
  session: Session | null;
  jellyfinUserId: string;
  username: string;
  linkedJellyfinUserIds: string[];
  linkedUserDbIds: string[];
  isAdmin: boolean;
  authServerJellyfinServerId: string;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function resolveLinkedAccounts(input: {
  jellyfinUserId?: string;
  username?: string;
  authServerJellyfinServerId?: string;
}): Promise<{ canonicalUsername: string | null; linkedJellyfinUserIds: string[]; linkedUserDbIds: string[] }> {
  const seedJellyfinUserId = input.jellyfinUserId?.trim() || "";
  const seedUsername = input.username?.trim() || "";
  const authServerJellyfinServerId = input.authServerJellyfinServerId?.trim() || "";
  const authServer = authServerJellyfinServerId
    ? await prisma.server.findUnique({
        where: { jellyfinServerId: authServerJellyfinServerId },
        select: { id: true },
      })
    : null;
  const serverScope = authServer?.id ? { serverId: authServer.id } : {};

  const direct = seedJellyfinUserId
    ? await prisma.user.findFirst({
        where: { jellyfinUserId: seedJellyfinUserId, ...serverScope },
        orderBy: { createdAt: "asc" },
        select: { username: true },
      })
    : null;

  const canonicalUsername = direct?.username?.trim() || seedUsername || null;

  const byUsername = canonicalUsername
    ? await prisma.user.findMany({
        where: { username: { equals: canonicalUsername, mode: "insensitive" }, ...serverScope },
        orderBy: { createdAt: "asc" },
        select: { id: true, jellyfinUserId: true },
      })
    : [];

  const fallbackByJellyfinId = byUsername.length === 0 && seedJellyfinUserId
    ? await prisma.user.findMany({
        where: { jellyfinUserId: seedJellyfinUserId, ...serverScope },
        orderBy: { createdAt: "asc" },
        select: { id: true, jellyfinUserId: true },
      })
    : [];

  const linkedRows = byUsername.length > 0 ? byUsername : fallbackByJellyfinId;

  return {
    canonicalUsername,
    linkedJellyfinUserIds: uniq([...linkedRows.map((row) => row.jellyfinUserId), seedJellyfinUserId]),
    linkedUserDbIds: uniq(linkedRows.map((row) => row.id)),
  };
}

/**
 * Require an authenticated session. Returns 401 if unauthenticated.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: await apiT('unauthenticated') }, { status: 401 });
  }
  const user = (session.user as unknown) as { jellyfinUserId?: string; isAdmin?: boolean; name?: string } | undefined;
  const authServerJellyfinServerId = String((session.user as { authServerJellyfinServerId?: string }).authServerJellyfinServerId || "");
  const username = user?.name?.trim() || "";
  const linked = await resolveLinkedAccounts({
    jellyfinUserId: user?.jellyfinUserId,
    username,
    authServerJellyfinServerId,
  });

  return {
    session,
    jellyfinUserId: user?.jellyfinUserId || "",
    username,
    linkedJellyfinUserIds: linked.linkedJellyfinUserIds,
    linkedUserDbIds: linked.linkedUserDbIds,
    isAdmin: user?.isAdmin === true,
    authServerJellyfinServerId,
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
