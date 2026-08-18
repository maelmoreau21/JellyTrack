import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCachedImage, saveCachedImage, deleteCachedImage } from "./imageCache";

describe("imageCache", () => {
    it("should save and retrieve cached image buffer with contentType", async () => {
        const fakeBuffer = Buffer.from("fake-jpeg-image-data-12345678");
        const serverId = "srv-1";
        const itemId = "f4983b74-a057-3a3c-2222-1bbf31fbef2c";
        const type = "Primary";

        const saved = await saveCachedImage(serverId, itemId, type, fakeBuffer, "image/jpeg");
        expect(saved).toBe(true);

        const cached = await getCachedImage(serverId, itemId, type);
        expect(cached).not.toBeNull();
        expect(cached?.contentType).toBe("image/jpeg");
        expect(cached?.data.toString()).toBe(fakeBuffer.toString());

        await deleteCachedImage(serverId, itemId, type);
        const afterDelete = await getCachedImage(serverId, itemId, type);
        expect(afterDelete).toBeNull();
    });

    it("should refuse to cache SVG placeholder 'No Image'", async () => {
        const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>No Image</text></svg>');
        const serverId = "srv-1";
        const itemId = "item-placeholder-test";
        const type = "Primary";

        const saved = await saveCachedImage(serverId, itemId, type, svgBuffer, "image/svg+xml");
        expect(saved).toBe(false);

        const cached = await getCachedImage(serverId, itemId, type);
        expect(cached).toBeNull();
    });
});
