import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a 24h hour integer into a locale-appropriate label.
 * - French: "00h", "01h", ..., "23h"
 * - English: "12 AM", "1 AM", ..., "12 PM", "1 PM", ..., "11 PM"
 */
export function formatHour(hour24: number, locale: string): string {
    if (locale === "en") {
        const period = hour24 >= 12 ? "PM" : "AM";
        const h12 = hour24 % 12 || 12;
        return `${h12} ${period}`;
    }
    return `${hour24.toString().padStart(2, "0")}h`;
}

/**
 * Categorize a Jellyfin client name into a device category.
 */
export function categorizeClient(clientName: string): string {
    const lower = (clientName || "").toLowerCase();
    // Specific client name mappings
    if (lower.includes("feishin")) return "Desktop"; // Feishin is a desktop client
    if (lower.includes("finamp")) return "Mobile"; // Finamp is a mobile client
    // TV / Smart TV / STB
    if (lower.includes("tv") || lower.includes("androidtv") || lower.includes("firestick") || lower.includes("roku") || lower.includes("chromecast") || lower.includes("apple tv") || lower.includes("kodi") || lower.includes("swiftfin") || lower.includes("infuse")) return "TV";
    // Web
    if (lower.includes("web") || lower.includes("jellyfin web") || lower.includes("browser") || lower.includes("chrome") || lower.includes("firefox") || lower.includes("safari") || lower.includes("edge")) return "Web";
    // Mobile
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("ios") || lower.includes("iphone") || lower.includes("ipad") || lower.includes("findroid")) return "Mobile";
    // Desktop
    if (lower.includes("desktop") || lower.includes("jellyfin media player") || lower.includes("mpv") || lower.includes("vlc") || lower.includes("windows") || lower.includes("macos") || lower.includes("linux")) return "Desktop";
    return "Other";
}

/**
 * Normalize a resolution value to a standardized label.
 * Returns: '4K', '1080p', '1440p', '720p', 'SD', 'Unknown' or the trimmed original value.
 */
export function normalizeResolution(raw?: string | null): string {
    if (!raw) return "Unknown";
    const s = String(raw).trim();
    const lower = s.toLowerCase();
    
    // Safety check: if raw is actually a play method or common non-res string, treat as Unknown here
    if (lower === 'directplay' || lower === 'transcode' || lower === 'remux' || lower === 'unknown') return "Unknown";

    if (/(4k|2160|3840|ultra[-\s]?hd|uhd)/i.test(lower)) return '4K';
    if (/(1080p|1080|full[-\s]?hd|fhd)/i.test(lower)) return '1080p';
    if (/(1440p|2560x1440|qhd|2k)/i.test(lower)) return '1440p';
    if (/(720p|720|\bhd\b)/i.test(lower)) return '720p';
    if (/(480p|480|\bsd\b)/i.test(lower)) return 'SD';
    return s;
}
/**
 * Clamp a playback duration (in seconds) by the total media duration.
 * This prevents sessions from reporting impossible watch times due to
 * loops, missed stop events, or clock drifts.
 *
 * @param durationSeconds The accumulated or reported watch time in seconds.
 * @param mediaDurationMs The total length of the media in milliseconds.
 * @returns The clamped duration in seconds.
 */
export function clampDuration(durationSeconds: number, mediaDurationMs: bigint | number | null): number {
    if (durationSeconds <= 0) return 0;
    if (mediaDurationMs === null || mediaDurationMs === undefined) return Math.min(durationSeconds, 86400); // 24h cap if unknown

    const mediaDurationS = Math.ceil(Number(mediaDurationMs) / 1000);
    // Allow a small 10s buffer for rounding/overhangs
    return Math.min(durationSeconds, mediaDurationS + 10);
}
