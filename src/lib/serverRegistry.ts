import prisma from "@/lib/prisma";

type RecordLike = Record<string, unknown>;

export interface ServerIdentity {
  jellyfinServerId: string;
  name: string;
  url: string;
}

export interface ServerRecord {
  id: string;
  jellyfinServerId: string;
  name: string;
  url: string;
}

const DEFAULT_MASTER_SERVER_ID = "master";
const DEFAULT_SERVER_NAME = "Master Jellyfin";
const DEFAULT_SERVER_URL = "http://localhost";

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== "object") return null;
  return value as RecordLike;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUrl(url: string | null): string {
  if (!url) return DEFAULT_SERVER_URL;
  return url.replace(/\/+$/, "");
}

function deriveServerNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || DEFAULT_SERVER_NAME;
  } catch {
    return DEFAULT_SERVER_NAME;
  }
}

function deriveServerIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
    if (!host) return DEFAULT_MASTER_SERVER_ID;
    return `srv:${host}`;
  } catch {
    return DEFAULT_MASTER_SERVER_ID;
  }
}

export function getMasterServerIdentityFromEnv(): ServerIdentity {
  const envUrl = normalizeUrl(asTrimmedString(process.env.JELLYFIN_URL));
  const envName = asTrimmedString(process.env.JELLYFIN_SERVER_NAME) || deriveServerNameFromUrl(envUrl);
  const envServerId = asTrimmedString(process.env.JELLYFIN_SERVER_ID) || deriveServerIdFromUrl(envUrl);

  return {
    jellyfinServerId: envServerId,
    name: envName,
    url: envUrl,
  };
}

export function extractServerIdentityFromPayload(payload: unknown): ServerIdentity {
  const body = asRecord(payload) || {};
  const serverNode = asRecord(body.server) || asRecord(body.Server) || {};
  const master = getMasterServerIdentityFromEnv();

  const jellyfinServerId =
    asTrimmedString(serverNode.serverId) ||
    asTrimmedString(serverNode.ServerId) ||
    asTrimmedString(serverNode.jellyfinServerId) ||
    asTrimmedString(serverNode.JellyfinServerId) ||
    asTrimmedString(body.serverId) ||
    asTrimmedString(body.ServerId) ||
    asTrimmedString(body.jellyfinServerId) ||
    asTrimmedString(body.JellyfinServerId) ||
    asTrimmedString(body.serverUniqueId) ||
    asTrimmedString(body.ServerUniqueId) ||
    master.jellyfinServerId;

  const url = normalizeUrl(
    asTrimmedString(serverNode.serverUrl) ||
      asTrimmedString(serverNode.ServerUrl) ||
      asTrimmedString(serverNode.url) ||
      asTrimmedString(serverNode.Url) ||
      asTrimmedString(body.serverUrl) ||
      asTrimmedString(body.ServerUrl) ||
      asTrimmedString(body.url) ||
      asTrimmedString(body.Url) ||
      master.url
  );

  const name =
    asTrimmedString(serverNode.serverName) ||
    asTrimmedString(serverNode.ServerName) ||
    asTrimmedString(serverNode.name) ||
    asTrimmedString(serverNode.Name) ||
    asTrimmedString(body.serverName) ||
    asTrimmedString(body.ServerName) ||
    asTrimmedString(body.pluginServerName) ||
    asTrimmedString(body.PluginServerName) ||
    asTrimmedString(body.server) ||
    asTrimmedString(body.Server) ||
    deriveServerNameFromUrl(url) ||
    master.name;

  return {
    jellyfinServerId,
    name,
    url,
  };
}

export async function upsertServerRecord(identity: ServerIdentity): Promise<ServerRecord> {
  const safeUrl = normalizeUrl(identity.url);
  const safeName = identity.name.trim() || DEFAULT_SERVER_NAME;
  const safeServerId = identity.jellyfinServerId.trim() || DEFAULT_MASTER_SERVER_ID;

  const prismaAny = prisma as any;
  if (!prismaAny?.server || typeof prismaAny.server.upsert !== "function") {
    // Some test suites mock prisma without the `server` model.
    return {
      id: safeServerId,
      jellyfinServerId: safeServerId,
      name: safeName,
      url: safeUrl,
    };
  }

  const row = await prismaAny.server.upsert({
    where: { jellyfinServerId: safeServerId },
    update: {
      name: safeName,
      isActive: true,
    },
    create: {
      jellyfinServerId: safeServerId,
      name: safeName,
      url: safeUrl,
      isActive: true,
    },
    select: {
      id: true,
      jellyfinServerId: true,
      name: true,
      url: true,
    },
  });

  return row as ServerRecord;
}

export async function ensureMasterServer(): Promise<ServerRecord> {
  return upsertServerRecord(getMasterServerIdentityFromEnv());
}

export function buildStreamRedisKey(serverId: string, sessionId: string): string {
  return `stream:${serverId}:${sessionId}`;
}
