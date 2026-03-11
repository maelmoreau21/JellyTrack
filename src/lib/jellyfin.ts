export function getJellyfinImageUrl(itemId: string, type: 'Primary' | 'Thumb' = 'Primary', fallbackId?: string): string {
    let url = `/api/jellyfin/image?itemId=${itemId}&type=${type}`;
    if (fallbackId) url += `&fallbackId=${fallbackId}`;
    return url;
}

export async function fetchJellyfinImage(itemId: string, type: string) {
    const baseUrl = process.env.JELLYFIN_URL;
    const apiKey = process.env.JELLYFIN_API_KEY;

    if (!baseUrl || !apiKey) {
        throw new Error("JELLYFIN_URL ou JELLYFIN_API_KEY non configurÃ©es dans les variables d'environnement.");
    }

    // SECURITY: Pass API key via header instead of URL query parameter
    const url = `${baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}?fillWidth=300&quality=80`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Emby-Token': apiKey,
        },
        next: { revalidate: 86400 }
    });

    return response;
}
