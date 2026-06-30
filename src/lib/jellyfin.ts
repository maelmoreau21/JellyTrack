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
