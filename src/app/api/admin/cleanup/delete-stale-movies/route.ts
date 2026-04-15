import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getConfiguredJellyfinServers, buildJellyfinApiKeyHeaders, resolveServerApiKey } from "@/lib/jellyfinServers";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

const STALE_MOVIE_MIN_AGE_DAYS = 730;
const MAX_MEDIA_PER_REQUEST = 25;
const CONFIRM_TOKEN = "DELETE";

function normalizeUrl(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function truncate(value: string, max = 240): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

async function deleteItemOnJellyfin(input: {
  baseUrl: string;
  apiKey: string;
  jellyfinMediaId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const endpoint = `${input.baseUrl}/Items/${encodeURIComponent(input.jellyfinMediaId)}`;

  try {
    const primaryResponse = await fetch(endpoint, {
      method: "DELETE",
      headers: buildJellyfinApiKeyHeaders(input.apiKey),
      cache: "no-store",
    });

    if (primaryResponse.ok) return { ok: true };

    const fallbackResponse = await fetch(
      `${endpoint}?api_key=${encodeURIComponent(input.apiKey)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (fallbackResponse.ok) return { ok: true };

    const fallbackText = await fallbackResponse.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${fallbackResponse.status}${fallbackText ? ` - ${truncate(fallbackText)}` : ""}`,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : "Unknown deletion error";
    return { ok: false, error: truncate(text) };
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const actorUserId = auth.linkedUserDbIds[0] ?? null;
  const actorUsername = auth.username || null;
  const ipAddress = getRequestIp(req);

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

  const confirmation = String(payload.confirmation || "").trim().toUpperCase();
  if (confirmation !== CONFIRM_TOKEN) {
    return NextResponse.json({ error: "Confirmation token mismatch." }, { status: 400 });
  }

  const rawMediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];
  const requestedMediaIds = Array.from(
    new Set(
      rawMediaIds
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (requestedMediaIds.length === 0) {
    return NextResponse.json({ error: "No media selected." }, { status: 400 });
  }

  if (requestedMediaIds.length > MAX_MEDIA_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many items in one request. Max is ${MAX_MEDIA_PER_REQUEST}.` },
      { status: 400 },
    );
  }

  const candidates = await prisma.media.findMany({
    where: {
      id: { in: requestedMediaIds },
      type: "Movie",
    },
    select: {
      id: true,
      title: true,
      jellyfinMediaId: true,
      serverId: true,
      dateAdded: true,
      createdAt: true,
      playbackHistory: {
        select: { id: true },
        take: 1,
      },
    },
  });

  if (candidates.length !== requestedMediaIds.length) {
    return NextResponse.json(
      { error: "Some selected media are no longer eligible for deletion." },
      { status: 400 },
    );
  }

  const staleCutoff = new Date(Date.now() - STALE_MOVIE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000);

  const eligibilityErrors: string[] = [];
  for (const candidate of candidates) {
    if (candidate.playbackHistory.length > 0) {
      eligibilityErrors.push(candidate.title);
      continue;
    }

    const referenceDate = candidate.dateAdded || candidate.createdAt;
    if (referenceDate >= staleCutoff) {
      eligibilityErrors.push(candidate.title);
    }
  }

  if (eligibilityErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Some selected media no longer match stale deletion criteria.",
        rejectedTitles: eligibilityErrors,
      },
      { status: 400 },
    );
  }

  const serverMap = new Map((await getConfiguredJellyfinServers()).map((server) => [server.id, server] as const));
  const primaryEnvApiKey = process.env.JELLYFIN_API_KEY ?? null;

  const deletedIds: string[] = [];
  const deletedTitles: string[] = [];
  const failed: Array<{ id: string; title: string; reason: string }> = [];

  for (const candidate of candidates) {
    const server = serverMap.get(candidate.serverId);
    if (!server) {
      failed.push({
        id: candidate.id,
        title: candidate.title,
        reason: "Server configuration not found or inactive.",
      });
      continue;
    }

    const apiKey = resolveServerApiKey(server, primaryEnvApiKey);
    if (!apiKey) {
      failed.push({
        id: candidate.id,
        title: candidate.title,
        reason: "Missing Jellyfin API key for target server.",
      });
      continue;
    }

    const baseUrl = normalizeUrl(server.url);
    if (!baseUrl) {
      failed.push({
        id: candidate.id,
        title: candidate.title,
        reason: "Invalid Jellyfin server URL.",
      });
      continue;
    }

    const deletionResult = await deleteItemOnJellyfin({
      baseUrl,
      apiKey,
      jellyfinMediaId: candidate.jellyfinMediaId,
    });

    if (!deletionResult.ok) {
      failed.push({
        id: candidate.id,
        title: candidate.title,
        reason: deletionResult.error || "Deletion rejected by Jellyfin.",
      });
      continue;
    }

    deletedIds.push(candidate.id);
    deletedTitles.push(candidate.title);
  }

  if (deletedIds.length > 0) {
    await prisma.media.deleteMany({
      where: { id: { in: deletedIds } },
    });
  }

  await writeAdminAuditLog({
    action: "cleanup.stale_movies.delete_requested",
    actorUserId,
    actorUsername,
    ipAddress,
    target: "/api/admin/cleanup/delete-stale-movies",
    details: {
      requestedCount: requestedMediaIds.length,
      deletedCount: deletedIds.length,
      failedCount: failed.length,
      deletedTitles,
      failed,
    },
  });

  revalidatePath("/admin/cleanup");

  return NextResponse.json({
    deletedCount: deletedIds.length,
    deletedIds,
    deletedTitles,
    failed,
  });
}
