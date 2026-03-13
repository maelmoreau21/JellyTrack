const UUID_COMPACT_PATTERN = /^[a-f0-9]{32}$/i;
const UUID_DASHED_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function compactJellyfinId(value: string): string {
    return value.replace(/-/g, "").toLowerCase();
}

export function normalizeJellyfinId(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (UUID_DASHED_PATTERN.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    if (UUID_COMPACT_PATTERN.test(trimmed)) {
        const compact = trimmed.toLowerCase();
        return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
    }

    return trimmed;
}
