type HeaderReader = {
  get(name: string): string | null;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function envFlag(name: string): boolean {
  return TRUE_VALUES.has(String(process.env[name] || "").trim().toLowerCase());
}

function trustedProxyHops(): number {
  const parsed = Number(process.env.TRUSTED_PROXY_HOPS || "1");
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.floor(parsed);
}

export function trustProxyHeaders(): boolean {
  return envFlag("TRUST_PROXY_HEADERS") || envFlag("TRUST_PROXY");
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;

  let normalized = value.trim().replace(/^"|"$/g, "");
  if (!normalized) return null;

  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice(7);
  }

  if (normalized.startsWith("[") && normalized.includes("]")) {
    normalized = normalized.slice(1, normalized.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
    normalized = normalized.slice(0, normalized.lastIndexOf(":"));
  }

  return normalized || null;
}

export function getClientIpFromHeaders(headers: HeaderReader, fallback: string | null = "unknown"): string | null {
  if (!trustProxyHeaders()) {
    return fallback;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const chain = forwardedFor
      .split(",")
      .map((part) => normalizeIp(part))
      .filter((part): part is string => Boolean(part));

    if (chain.length > 0) {
      const index = Math.max(0, chain.length - 1 - trustedProxyHops());
      return chain[index] || fallback;
    }
  }

  return normalizeIp(headers.get("x-real-ip")) || fallback;
}

export function getClientIp(req: Pick<Request, "headers">, fallback: string | null = "unknown"): string | null {
  return getClientIpFromHeaders(req.headers, fallback);
}
