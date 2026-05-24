export function getJellyfinImageUrl(
    itemId: string,
    type: 'Primary' | 'Thumb' | 'Backdrop' | 'Banner' | 'Logo' | 'Art' = 'Primary',
    fallbackId?: string,
    serverId?: string | null
): string {
    const params = new URLSearchParams({ itemId, type });
    if (fallbackId) params.set("fallbackId", fallbackId);
    if (serverId) params.set("serverId", serverId);
    return `/api/jellyfin/image?${params.toString()}`;
}

export async function fetchJellyfinImage(itemId: string, type: string) {
    const baseUrl = process.env.JELLYFIN_URL;
    const apiKey = process.env.JELLYFIN_API_KEY;

    if (!baseUrl || !apiKey) {
        throw new Error("JELLYFIN_URL ou JELLYFIN_API_KEY non configurées dans les variables d'environnement.");
    }

    // SECURITY: Pass API key via header instead of URL query parameter
    const url = `${baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?fillWidth=300&quality=80`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `MediaBrowser Token="${apiKey}"`,
        },
        next: { revalidate: 86400 }
    });

    return response;
}
