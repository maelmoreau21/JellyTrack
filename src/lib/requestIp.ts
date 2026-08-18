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

export function isPrivateOrLocalIp(value: string | null | undefined): boolean {
  const ip = normalizeIp(value);
  if (!ip) return true;

  const lower = ip.toLowerCase();
  if (lower === "localhost" || lower === "unknown" || lower === "::1" || lower === "0.0.0.0") {
    return true;
  }

  // Check IPv4 private ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4Match) {
    const octet1 = Number(ipv4Match[1]);
    const octet2 = Number(ipv4Match[2]);
    const octet3 = Number(ipv4Match[3]);
    const octet4 = Number(ipv4Match[4]);

    if (octet1 > 255 || octet2 > 255 || octet3 > 255 || octet4 > 255) return false;

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) return true;

    // 10.0.0.0/8 (Private Class A)
    if (octet1 === 10) return true;

    // 172.16.0.0/12 (Private Class B: 172.16.0.0 - 172.31.255.255)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;

    // 192.168.0.0/16 (Private Class C)
    if (octet1 === 192 && octet2 === 168) return true;

    // 169.254.0.0/16 (Link-local)
    if (octet1 === 169 && octet2 === 254) return true;

    // 0.0.0.0/8
    if (octet1 === 0) return true;

    return false;
  }

  // Check IPv6 private/local ranges
  // Link-local: fe80::/10 (fe8x, fe9x, feax, febx)
  if (/^fe[89ab]/i.test(lower)) return true;

  // Unique local addresses: fc00::/7 (fcxx, fdxx)
  if (/^f[cd]/i.test(lower)) return true;

  return false;
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
