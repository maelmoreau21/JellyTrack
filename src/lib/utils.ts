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
    // TV / Smart TV / STB
    if (lower.includes("tv") || lower.includes("androidtv") || lower.includes("firestick") || lower.includes("roku") || lower.includes("chromecast") || lower.includes("apple tv") || lower.includes("kodi") || lower.includes("swiftfin") || lower.includes("infuse")) return "TV";
    // Web
    if (lower.includes("web") || lower.includes("jellyfin web") || lower.includes("browser") || lower.includes("chrome") || lower.includes("firefox") || lower.includes("safari") || lower.includes("edge")) return "Web";
    // Mobile
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("ios") || lower.includes("iphone") || lower.includes("ipad") || lower.includes("findroid")) return "Mobile";
    // Desktop
    if (lower.includes("desktop") || lower.includes("jellyfin media player") || lower.includes("mpv") || lower.includes("vlc") || lower.includes("windows") || lower.includes("macos") || lower.includes("linux")) return "Desktop";
    return "Autre";
}
