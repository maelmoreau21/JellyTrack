import "server-only";

import fs from "fs";
import path from "path";
import { compactJellyfinId } from "@/lib/jellyfinId";

function resolveImageCacheDir(): string {
    if (process.env.IMAGE_CACHE_DIR) {
        return process.env.IMAGE_CACHE_DIR;
    }
    if (fs.existsSync(/*turbopackIgnore: true*/ "/data")) {
        return "/data/cache/images";
    }
    return path.join(/*turbopackIgnore: true*/ process.cwd(), ".cache", "images");
}

const IMAGE_CACHE_DIR = resolveImageCacheDir();

function ensureCacheDir(): void {
    try {
        if (!fs.existsSync(/*turbopackIgnore: true*/ IMAGE_CACHE_DIR)) {
            fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
        }
    } catch {
        // Directory creation error handling
    }
}

function getCachePrefix(serverId?: string | null, itemId?: string, type?: string): string {
    const sId = serverId ? compactJellyfinId(serverId) : "default";
    const iId = itemId ? compactJellyfinId(itemId) : "unknown";
    const imgType = type ? type.replace(/[^a-zA-Z0-9]/g, "") : "Primary";
    return path.join(IMAGE_CACHE_DIR, `${sId}_${iId}_${imgType}`);
}

export type CachedImage = {
    data: Buffer;
    contentType: string;
};

export async function getCachedImage(serverId?: string | null, itemId?: string, type?: string): Promise<CachedImage | null> {
    if (!itemId) return null;
    try {
        const prefix = getCachePrefix(serverId, itemId, type);
        const dataPath = `${prefix}.bin`;
        const metaPath = `${prefix}.meta`;

        if (!fs.existsSync(dataPath)) {
            return null;
        }

        const data = await fs.promises.readFile(dataPath);
        if (data.length === 0) {
            return null;
        }

        let contentType = "image/jpeg";
        if (fs.existsSync(metaPath)) {
            const metaRaw = await fs.promises.readFile(metaPath, "utf-8");
            const trimmed = metaRaw.trim();
            if (trimmed.startsWith("image/")) {
                contentType = trimmed;
            }
        }

        return { data, contentType };
    } catch {
        return null;
    }
}

export async function saveCachedImage(
    serverId: string | null | undefined,
    itemId: string,
    type: string,
    data: Buffer,
    contentType: string
): Promise<boolean> {
    if (!itemId || !data || data.length === 0) return false;

    // Do not cache SVG placeholder "No Image"
    if (contentType.includes("image/svg") || data.toString("utf-8", 0, Math.min(100, data.length)).includes("<svg")) {
        return false;
    }

    try {
        ensureCacheDir();
        const prefix = getCachePrefix(serverId, itemId, type);
        const dataPath = `${prefix}.bin`;
        const metaPath = `${prefix}.meta`;

        await fs.promises.writeFile(dataPath, data);
        await fs.promises.writeFile(metaPath, contentType || "image/jpeg", "utf-8");
        return true;
    } catch {
        return false;
    }
}

export async function deleteCachedImage(serverId?: string | null, itemId?: string, type?: string): Promise<void> {
    if (!itemId) return;
    try {
        const prefix = getCachePrefix(serverId, itemId, type);
        const dataPath = `${prefix}.bin`;
        const metaPath = `${prefix}.meta`;

        if (fs.existsSync(dataPath)) {
            await fs.promises.unlink(dataPath).catch(() => {});
        }
        if (fs.existsSync(metaPath)) {
            await fs.promises.unlink(metaPath).catch(() => {});
        }
    } catch {
        // Ignore deletion error
    }
}
