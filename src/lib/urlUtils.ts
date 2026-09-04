/**
 * URL validation and security utilities:
 * - Open Redirect prevention (safe relative URLs)
 * - SSRF protection against Cloud Metadata endpoints
 */

const CLOUD_METADATA_HOSTNAMES = new Set([
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.internal",
    "100.100.100.200", // Alibaba Cloud metadata
    "[fd00:ec2::254]", // AWS IPv6 metadata
    "fd00:ec2::254",
]);

/**
 * Checks if a hostname or IP targets cloud instance metadata services.
 */
export function isCloudMetadataHost(hostname: string | null | undefined): boolean {
    if (!hostname) return false;
    const lower = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
    if (CLOUD_METADATA_HOSTNAMES.has(lower)) return true;

    // IPv4 Link-local / Cloud Metadata range (169.254.0.0/16)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(lower)) {
        return true;
    }

    // AWS IPv6 metadata range (fd00:ec2::254)
    if (lower.startsWith("fd00:ec2:")) {
        return true;
    }

    return false;
}

/**
 * Validates and sanitizes a post-login callbackUrl to ensure it only redirects
 * to safe relative paths on the same origin (prevents Open Redirect attacks).
 */
export function getSafeCallbackUrl(raw: string | null | undefined): string {
    if (!raw || typeof raw !== "string") return "/";
    const trimmed = raw.trim();

    // Must start with '/' and NOT '//' or '/\' (protocol-relative / backslash trick)
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
        return "/";
    }

    // Reject CRLF or control characters
    if (/[\r\n\t]/.test(trimmed)) {
        return "/";
    }

    // Ensure it resolves to a path on dummy base without changing origin or protocol
    try {
        const dummyBase = "http://localhost";
        const parsed = new URL(trimmed, dummyBase);
        if (parsed.origin !== dummyBase) {
            return "/";
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    } catch {
        return "/";
    }
}
