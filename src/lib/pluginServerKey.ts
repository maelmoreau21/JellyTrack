const SCOPED_PLUGIN_KEY_PREFIX = "jts3";

function normalizeValue(value: string | null | undefined): string {
  return String(value || "").trim();
}

function encodeServerId(serverId: string): string {
  return Buffer.from(serverId, "utf8").toString("base64url");
}

function decodeServerId(encoded: string): string | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8").trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export function deriveScopedPluginApiKey(rawPluginKey: string | null | undefined, jellyfinServerId: string | null | undefined): string | null {
  const normalizedKey = normalizeValue(rawPluginKey);
  const normalizedServerId = normalizeValue(jellyfinServerId);
  if (!normalizedKey || !normalizedServerId) return null;

  const encodedServerId = encodeServerId(normalizedServerId);
  return `${SCOPED_PLUGIN_KEY_PREFIX}.${encodedServerId}.${normalizedKey}`;
}

export function parsePluginApiKeyCandidate(candidateToken: string | null | undefined): { rawKey: string | null; jellyfinServerId: string | null; scoped: boolean } {
  const token = normalizeValue(candidateToken);
  if (!token) {
    return { rawKey: null, jellyfinServerId: null, scoped: false };
  }

  if (!token.startsWith(`${SCOPED_PLUGIN_KEY_PREFIX}.`)) {
    return { rawKey: token, jellyfinServerId: null, scoped: false };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SCOPED_PLUGIN_KEY_PREFIX) {
    return { rawKey: null, jellyfinServerId: null, scoped: false };
  }

  const serverId = decodeServerId(parts[1]);
  const rawKey = normalizeValue(parts[2]);

  if (!serverId) {
    return { rawKey: null, jellyfinServerId: null, scoped: true };
  }

  if (!rawKey) {
    return { rawKey: null, jellyfinServerId: serverId, scoped: true };
  }

  return {
    rawKey,
    jellyfinServerId: serverId,
    scoped: true,
  };
}
