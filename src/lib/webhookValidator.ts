/**
 * Webhook validation utilities to prevent SSRF attacks.
 * Only allows safe external webhook endpoints.
 */

const ALLOWED_WEBHOOK_DOMAINS = [
  "discord.com",
  "discordapp.com",
];

const BLOCKED_INTERNAL_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::ffff:127.0.0.1",
  process.env.HOSTNAME || "",
  process.env.NEXTAUTH_URL?.split("://")[1]?.split(":")[0] || "",
];

function isAllowedDomain(hostname: string, allowedDomains: string[]): boolean {
  const lower = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return lower === normalizedDomain || lower.endsWith(`.${normalizedDomain}`);
  });
}

function isInternalAddress(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  
  // Check blocked internal hosts
  if (BLOCKED_INTERNAL_HOSTS.some(h => h && lower === h)) {
    return true;
  }

  // Block private IP ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
    return true;
  }

  // Block IPv6 private ranges
  if (/^(fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/.test(hostname)) {
    return true;
  }

  return false;
}

export function isValidDiscordWebhook(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    
    // Must be HTTPS for webhooks
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Check if domain is Discord
    const hostname = parsed.hostname?.toLowerCase() || "";
    if (!isAllowedDomain(hostname, ALLOWED_WEBHOOK_DOMAINS)) {
      return false;
    }

    // Ensure it's not an internal/private address
    if (isInternalAddress(hostname)) {
      return false;
    }

    // Must have webhook path pattern
    if (!parsed.pathname.includes("/webhooks/")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isValidWebhookUrl(url: string, allowedDomains: string[] = ALLOWED_WEBHOOK_DOMAINS): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    
    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname?.toLowerCase() || "";

    // Check allowed domains
    if (!isAllowedDomain(hostname, allowedDomains)) {
      return false;
    }

    // Ensure it's not internal/private
    if (isInternalAddress(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Safe fetch wrapper that validates webhook URLs before making requests.
 * Throws error if URL is invalid/suspicious.
 */
export async function safeFetchWebhook(
  url: string,
  options: RequestInit,
  validator: (url: string) => boolean = isValidWebhookUrl
): Promise<Response> {
  if (!validator(url)) {
    throw new Error(`Invalid or suspicious webhook URL: ${url}`);
  }

  return fetch(url, {
    ...options,
    // Add timeout to prevent hanging connections
    signal: AbortSignal.timeout(10000),
  });
}
