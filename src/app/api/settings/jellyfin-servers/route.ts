import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import {
  fetchJellyfinSystemInfo,
  getConfiguredJellyfinServers,
  maskSecret,
  resolveServerApiKey,
} from "@/lib/jellyfinServers";
import { getPluginKeySnapshot } from "@/lib/pluginKeyManager";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";

export const dynamic = "force-dynamic";

type ConnectionState = "online" | "offline" | "no_api_key";

async function probeConnection(url: string, apiKey: string | null): Promise<{ state: ConnectionState; message: string }> {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return { state: "offline", message: "URL serveur manquante." };
  }

  const normalizedApiKey = normalizeSecret(apiKey);
  if (!normalizedApiKey) {
    return { state: "no_api_key", message: "Clé API manquante." };
  }

  try {
    const info = await fetchJellyfinSystemInfo({
      url: normalizedUrl,
      apiKey: normalizedApiKey,
    });

    if (info) {
      return { state: "online", message: "Connexion OK" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const publicProbe = await fetch(`${normalizedUrl}/System/Info/Public`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    if (publicProbe?.ok) {
      return {
        state: "offline",
        message: "Serveur accessible, mais clé API refusée/incompatible. Régénérez une clé API admin Jellyfin.",
      };
    }

    return { state: "offline", message: "Serveur indisponible ou endpoint System/Info non compatible." };
  } catch {
    return { state: "offline", message: "Serveur injoignable." };
  }
}

function normalizeUrl(value: unknown): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeSecret(value: unknown): string {
  return String(value || "").trim();
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return fallback;
}

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const servers = await getConfiguredJellyfinServers();
  const primaryEnvApiKey = normalizeSecret(process.env.JELLYFIN_API_KEY);
  const jellytrackMode = String(process.env.JELLYTRACK_MODE || "single").trim().toLowerCase();
  const isMultiMode = jellytrackMode === "multi";

  const { snapshot } = await getPluginKeySnapshot({
    rotateIfExpired: true,
    context: {
      actorUserId: auth.linkedUserDbIds[0] ?? null,
      actorUsername: auth.username || null,
      ipAddress: null,
    },
  });
  const pluginKeyReady = Boolean(snapshot.currentKeyHash);
  const pluginRuntime = await prisma.globalSettings.findUnique({
    where: { id: "global" },
    select: {
      pluginLastSeen: true,
      pluginServerName: true,
    },
  });
  const pluginConnected = pluginRuntime?.pluginLastSeen
    ? Date.now() - new Date(pluginRuntime.pluginLastSeen).getTime() < 120_000
    : false;

  const serversWithConnection = await Promise.all(
    servers.map(async (server) => {
      const effectiveApiKey = resolveServerApiKey(server, primaryEnvApiKey);
      const connection = await probeConnection(server.url, effectiveApiKey);

      return {
        id: server.id,
        jellyfinServerId: server.jellyfinServerId,
        name: server.name,
        url: server.url,
        isPrimary: server.isPrimary,
        hasApiKey: !!effectiveApiKey,
        apiKeyMasked: maskSecret(effectiveApiKey),
        allowAuthFallback: server.allowAuthFallback,
        hasPluginKey: pluginKeyReady,
        pluginKeyMasked: pluginKeyReady ? "stored-as-hash" : "",
        connectionState: connection.state,
        connectionMessage: connection.message,
      };
    })
  );

  return NextResponse.json(
    {
      servers: serversWithConnection,
      jellytrackMode,
      isMultiMode,
      pluginKeyReady,
      pluginEndpointPath: "/api/plugin/events",
      pluginConnected,
      pluginServerName: pluginRuntime?.pluginServerName || null,
      pluginLastSeen: pluginRuntime?.pluginLastSeen || null,
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = normalizeUrl(body.url);
  const apiKey = normalizeSecret(body.apiKey);
  const displayName = String(body.name || "").trim();
  const allowAuthFallback = asBoolean(body.allowAuthFallback, true);

  if (!url) {
    return NextResponse.json({ error: "URL serveur Jellyfin requise." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API Jellyfin requise." }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "URL Jellyfin invalide." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "URL Jellyfin invalide." }, { status: 400 });
  }

  const info = await fetchJellyfinSystemInfo({ url, apiKey });
  if (!info) {
    return NextResponse.json(
      { error: "Connexion Jellyfin impossible. Vérifiez l'URL et la clé API." },
      { status: 400 }
    );
  }

  const master = getMasterServerIdentityFromEnv();

  const updated = await prisma.server.upsert({
    where: { jellyfinServerId: info.serverId },
    update: {
      name: displayName || info.serverName,
      url,
      jellyfinApiKey: apiKey,
      allowAuthFallback: allowAuthFallback && info.serverId !== master.jellyfinServerId,
      isActive: true,
    },
    create: {
      jellyfinServerId: info.serverId,
      name: displayName || info.serverName,
      url,
      jellyfinApiKey: apiKey,
      allowAuthFallback: allowAuthFallback && info.serverId !== master.jellyfinServerId,
      isActive: true,
    },
    select: {
      id: true,
      jellyfinServerId: true,
      name: true,
      url: true,
      allowAuthFallback: true,
    },
  });

  return NextResponse.json({ server: updated }, { status: 200 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 400 });
  }

  const master = getMasterServerIdentityFromEnv();
  const prismaAny = prisma as any;
  const existing = await prismaAny.server.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 404 });
  }

  const nextName =
    body.name === undefined
      ? existing.name
      : String(body.name || "").trim();

  if (!nextName) {
    return NextResponse.json({ error: "Nom du serveur requis." }, { status: 400 });
  }

  const nextAllowFallback =
    body.allowAuthFallback === undefined
      ? existing.allowAuthFallback
      : asBoolean(body.allowAuthFallback, existing.allowAuthFallback);

  const nextIsActive =
    body.isActive === undefined ? existing.isActive : asBoolean(body.isActive, existing.isActive);

  const updated = await prismaAny.server.update({
    where: { id },
    data: {
      name: nextName,
      allowAuthFallback:
        existing.jellyfinServerId === master.jellyfinServerId ? false : Boolean(nextAllowFallback),
      isActive: Boolean(nextIsActive),
    },
    select: {
      id: true,
      jellyfinServerId: true,
      name: true,
      url: true,
      allowAuthFallback: true,
      isActive: true,
    },
  });

  return NextResponse.json({ server: updated }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 400 });
  }

  const prismaAny = prisma as any;
  const updated = await prismaAny.server.update({
    where: { id },
    data: {
      jellyfinApiKey: null,
      allowAuthFallback: false,
    },
    select: {
      id: true,
      jellyfinServerId: true,
      name: true,
      url: true,
      allowAuthFallback: true,
    },
  });

  return NextResponse.json({ server: updated }, { status: 200 });
}
