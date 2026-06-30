export function normalizeBitrateToKbps(raw: unknown): number | null {
    let value: number | null = null;

    if (typeof raw === "number") {
        value = raw;
    } else if (typeof raw === "bigint") {
        value = Number(raw);
    } else if (typeof raw === "string") {
        const parsed = Number(raw.trim());
        value = Number.isFinite(parsed) ? parsed : null;
    }

    if (value === null || !Number.isFinite(value) || value <= 0) return null;

    // Jellyfin commonly reports stream bitrates in bits/s, while the UI column is kbps.
    return Math.round(value >= 10_000 ? value / 1000 : value);
}
