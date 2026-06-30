import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNED_SCOPED_PLUGIN_KEY_PREFIX = "jts4";
const SCOPED_KEY_CONTEXT = "JellyTrack scoped plugin key v1";

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

function signScopedServerId(storedPluginKeyHash: string, jellyfinServerId: string): string {
  return createHmac("sha256", storedPluginKeyHash)
    .update(SCOPED_KEY_CONTEXT)
    .update("\0")
    .update(jellyfinServerId)
    .digest("base64url");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function deriveScopedPluginApiKey(storedPluginKeyHash: string | null | undefined, jellyfinServerId: string | null | undefined): string | null {
  const normalizedKeyHash = normalizeValue(storedPluginKeyHash);
  const normalizedServerId = normalizeValue(jellyfinServerId);
  if (!normalizedKeyHash || !normalizedServerId) return null;

  const encodedServerId = encodeServerId(normalizedServerId);
  const signature = signScopedServerId(normalizedKeyHash, normalizedServerId);
  return `${SIGNED_SCOPED_PLUGIN_KEY_PREFIX}.${encodedServerId}.${signature}`;
}

export function parsePluginApiKeyCandidate(candidateToken: string | null | undefined): { rawKey: string | null; jellyfinServerId: string | null; scoped: boolean; scopedToken: string | null } {
  const token = normalizeValue(candidateToken);
  if (!token) {
    return { rawKey: null, jellyfinServerId: null, scoped: false, scopedToken: null };
  }

  if (!token.startsWith(`${SIGNED_SCOPED_PLUGIN_KEY_PREFIX}.`)) {
    return { rawKey: token, jellyfinServerId: null, scoped: false, scopedToken: null };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SIGNED_SCOPED_PLUGIN_KEY_PREFIX) {
    return { rawKey: null, jellyfinServerId: null, scoped: false, scopedToken: null };
  }

  const serverId = decodeServerId(parts[1]);

  if (!serverId) {
    return { rawKey: null, jellyfinServerId: null, scoped: true, scopedToken: token };
  }

  return {
    rawKey: null,
    jellyfinServerId: serverId,
    scoped: true,
    scopedToken: token,
  };
}

export function verifyScopedPluginApiKey(candidateToken: string | null | undefined, storedPluginKeyHash: string | null | undefined): { valid: boolean; jellyfinServerId: string | null } {
  const parsed = parsePluginApiKeyCandidate(candidateToken);
  const storedHash = normalizeValue(storedPluginKeyHash);
  if (!parsed.scoped || !parsed.jellyfinServerId || !parsed.scopedToken || !storedHash) {
    return { valid: false, jellyfinServerId: parsed.jellyfinServerId };
  }

  if (!parsed.scopedToken.startsWith(`${SIGNED_SCOPED_PLUGIN_KEY_PREFIX}.`)) {
    return { valid: false, jellyfinServerId: parsed.jellyfinServerId };
  }

  const expected = deriveScopedPluginApiKey(storedHash, parsed.jellyfinServerId);
  return {
    valid: Boolean(expected && timingSafeStringEqual(parsed.scopedToken, expected)),
    jellyfinServerId: parsed.jellyfinServerId,
  };
}
