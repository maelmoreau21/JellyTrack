import { describe, expect, it } from "vitest";
import { normalizeBitrateToKbps } from "./bitrate";

describe("normalizeBitrateToKbps", () => {
    it("keeps values that are already expressed as kbps", () => {
        expect(normalizeBitrateToKbps(597)).toBe(597);
    });

    it("converts Jellyfin bitrates from bits per second to kbps", () => {
        expect(normalizeBitrateToKbps(597000)).toBe(597);
        expect(normalizeBitrateToKbps(3249223)).toBe(3249);
    });

    it("ignores invalid values", () => {
        expect(normalizeBitrateToKbps(null)).toBeNull();
        expect(normalizeBitrateToKbps(0)).toBeNull();
        expect(normalizeBitrateToKbps("nope")).toBeNull();
    });
});
