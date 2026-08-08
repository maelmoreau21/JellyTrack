import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateEnv } from "./envVal";

describe("validateEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.NEXTAUTH_SECRET;
        delete process.env.AUTH_SECRET;
        delete process.env.JELLYTRACK_SECRET;
        delete process.env.JELLYFIN_API_KEY;
        delete process.env.JELLYTRACK_JELLYFIN_API_KEY;
        delete process.env.JELLYFIN_WEBHOOK_SECRET;
        delete process.env.JELLYTRACK_WEBHOOK_SECRET;
    });

    it("passes validation when JELLYTRACK_* environment variables are supplied", () => {
        process.env.NODE_ENV = "production";
        delete process.env.NEXT_PHASE;
        process.env.JELLYTRACK_SECRET = "valid_secret_123456789012345";
        process.env.JELLYTRACK_JELLYFIN_API_KEY = "valid_api_key_1234567890";
        process.env.JELLYTRACK_WEBHOOK_SECRET = "valid_webhook_secret_12345";

        expect(() => validateEnv()).not.toThrow();
    });

    it("fails validation when required variables are missing in production", () => {
        process.env.NODE_ENV = "production";
        delete process.env.NEXT_PHASE;
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

        validateEnv();
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockRestore();
    });
});
