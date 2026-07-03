import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import {
  fetchJellyfinSystemInfo,
  getConfiguredJellyfinServers,
  maskSecret,
  resolveServerApiKey,
} from "@/lib/jellyfinServers";
import { getPluginKeySnapshot } from "@/lib/pluginKeyManager";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";
import { deriveScopedPluginApiKey } from "@/lib/pluginServerKey";
import { z } from "zod";

export const dynamic = "force-dynamic";

type ConnectionState = "online" | "offline" | "no_api_key";

const serverPostSchema = z.object({
  url: z.string(),
  apiKey: z.string(),
  name: z.string().optional(),
  allowAuthFallback: z.any().optional(),
});

const serverPatchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  allowAuthFallback: z.any().optional(),
  isActive: z.any().optional(),
});

const serverDeleteSchema = z.object({
  id: z.string(),
});

async function probeConnection(url: string, apiKey: string | null): Promise<{ state: ConnectionState; message: string }> {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return { state: "offline", message: "Server URL missing." };
  }

  const normalizedApiKey = normalizeSecret(apiKey);
  if (!normalizedApiKey) {
    return { state: "no_api_key", message: "API key missing." };
  }

  try {
    const info = await fetchJellyfinSystemInfo({
      url: normalizedUrl,
      apiKey: normalizedApiKey,
    });

    if (info) {
      return { state: "online", message: "Connection OK" };
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
        message: "Server reachable, but API key rejected/incompatible. Regenerate a Jellyfin admin API key.",
      };
    }

    return { state: "offline", message: "Server unavailable or incompatible System/Info endpoint." };
  } catch {
    return { state: "offline", message: "Server unreachable." };
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

  const { snapshot } = await getPluginKeySnapshot();
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

      let pluginApiKey: string | null = null;
      if (pluginKeyReady && snapshot.currentKeyHash) {
        pluginApiKey = deriveScopedPluginApiKey(snapshot.currentKeyHash, server.jellyfinServerId);
      }

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
        pluginApiKey,
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
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parseResult = serverPostSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload structure." }, { status: 400 });
  }

  const url = normalizeUrl(parseResult.data.url);
  const apiKey = normalizeSecret(parseResult.data.apiKey);
  const displayName = String(parseResult.data.name || "").trim();
  const allowAuthFallback = asBoolean(parseResult.data.allowAuthFallback, true);

  if (!url) {
    return NextResponse.json({ error: "Jellyfin server URL required." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Jellyfin API key required." }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid Jellyfin URL." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid Jellyfin URL." }, { status: 400 });
  }

  const info = await fetchJellyfinSystemInfo({ url, apiKey });
  if (!info) {
    return NextResponse.json(
      { error: "Unable to connect to Jellyfin. Check the URL and API key." },
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
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parseResult = serverPatchSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload structure." }, { status: 400 });
  }

  const id = String(parseResult.data.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Server not found." }, { status: 400 });
  }

  const master = getMasterServerIdentityFromEnv();
  const prismaAny = prisma as any;
  const existing = await prismaAny.server.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  const nextName =
    parseResult.data.name === undefined
      ? existing.name
      : String(parseResult.data.name || "").trim();

  if (!nextName) {
    return NextResponse.json({ error: "Server name required." }, { status: 400 });
  }

  const nextAllowFallback =
    parseResult.data.allowAuthFallback === undefined
      ? existing.allowAuthFallback
      : asBoolean(parseResult.data.allowAuthFallback, existing.allowAuthFallback);

  const nextIsActive =
    parseResult.data.isActive === undefined ? existing.isActive : asBoolean(parseResult.data.isActive, existing.isActive);

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
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parseResult = serverDeleteSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload structure." }, { status: 400 });
  }

  const id = String(parseResult.data.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Server not found." }, { status: 400 });
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
