import { beforeEach, describe, expect, it } from "vitest";
import { getResolvedAuthSecret, resetCachedAuthSecret } from "./authSecret";

describe("getResolvedAuthSecret", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.NEXTAUTH_SECRET;
        delete process.env.AUTH_SECRET;
        delete process.env.JELLYTRACK_SECRET;
        resetCachedAuthSecret();
    });

    it("resolves NEXTAUTH_SECRET when present", () => {
        process.env.NEXTAUTH_SECRET = "supersecret12345678901234567890";
        const secret = getResolvedAuthSecret();
        expect(secret.value).toBe("supersecret12345678901234567890");
    });

    it("resolves JELLYTRACK_SECRET when NEXTAUTH_SECRET and AUTH_SECRET are absent", () => {
        process.env.JELLYTRACK_SECRET = "jellytrackcustomsecret123456789";
        const secret = getResolvedAuthSecret();
        expect(secret.value).toBe("jellytrackcustomsecret123456789");
    });
});
