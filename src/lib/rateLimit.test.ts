import { describe, expect, it } from "vitest";
import { resolveRateLimitIdentifier, checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "./rateLimit";
import { getSafeCallbackUrl, isCloudMetadataHost } from "./urlUtils";

describe("rateLimit", () => {
    it("partitions by IP when IP is known and not 'unknown'", () => {
        expect(resolveRateLimitIdentifier("192.168.1.50", "admin")).toBe("192.168.1.50");
        expect(resolveRateLimitIdentifier("10.0.0.1")).toBe("10.0.0.1");
    });

    it("partitions by username when IP is 'unknown' or empty to prevent global DoS lockout", () => {
        expect(resolveRateLimitIdentifier("unknown", "Alice")).toBe("user:alice");
        expect(resolveRateLimitIdentifier("", "Bob")).toBe("user:bob");
        expect(resolveRateLimitIdentifier("   ", "Charlie")).toBe("user:charlie");
    });

    it("falls back to 'unknown' when neither IP nor username is provided", () => {
        expect(resolveRateLimitIdentifier("unknown")).toBe("unknown");
        expect(resolveRateLimitIdentifier("")).toBe("unknown");
    });

    it("tracks rate limiting independently per user when IP is unknown", async () => {
        const userA = "testuser_a_" + Date.now();
        const userB = "testuser_b_" + Date.now();

        for (let i = 0; i < 5; i++) {
            await recordFailedLogin("unknown", userA);
        }

        const statusA = await checkLoginRateLimit("unknown", userA);
        expect(statusA.allowed).toBe(false);

        // User B should NOT be locked out!
        const statusB = await checkLoginRateLimit("unknown", userB);
        expect(statusB.allowed).toBe(true);

        await resetLoginRateLimit("unknown", userA);
        const statusAReset = await checkLoginRateLimit("unknown", userA);
        expect(statusAReset.allowed).toBe(true);
    });
});

describe("getSafeCallbackUrl", () => {
    it("allows valid relative URLs", () => {
        expect(getSafeCallbackUrl("/")).toBe("/");
        expect(getSafeCallbackUrl("/users/123")).toBe("/users/123");
        expect(getSafeCallbackUrl("/admin?tab=security")).toBe("/admin?tab=security");
    });

    it("rejects absolute external URLs", () => {
        expect(getSafeCallbackUrl("https://evil.com")).toBe("/");
        expect(getSafeCallbackUrl("http://attacker.com/steal")).toBe("/");
        expect(getSafeCallbackUrl("javascript:alert(1)")).toBe("/");
    });

    it("rejects protocol-relative and backslash URLs", () => {
        expect(getSafeCallbackUrl("//evil.com")).toBe("/");
        expect(getSafeCallbackUrl("/\\evil.com")).toBe("/");
        expect(getSafeCallbackUrl("///evil.com")).toBe("/");
    });

    it("rejects CRLF injection attempts", () => {
        expect(getSafeCallbackUrl("/dashboard\r\nSet-Cookie: evil")).toBe("/");
    });

    it("falls back to '/' on null or undefined", () => {
        expect(getSafeCallbackUrl(null)).toBe("/");
        expect(getSafeCallbackUrl(undefined)).toBe("/");
        expect(getSafeCallbackUrl("")).toBe("/");
    });
});

describe("isCloudMetadataHost", () => {
    it("identifies AWS/GCP/Azure/Alibaba cloud metadata endpoints", () => {
        expect(isCloudMetadataHost("169.254.169.254")).toBe(true);
        expect(isCloudMetadataHost("169.254.10.20")).toBe(true);
        expect(isCloudMetadataHost("metadata.google.internal")).toBe(true);
        expect(isCloudMetadataHost("100.100.100.200")).toBe(true);
        expect(isCloudMetadataHost("fd00:ec2::254")).toBe(true);
        expect(isCloudMetadataHost("[fd00:ec2::254]")).toBe(true);
    });

    it("allows standard LAN and domain addresses", () => {
        expect(isCloudMetadataHost("jellyfin.local")).toBe(false);
        expect(isCloudMetadataHost("192.168.1.100")).toBe(false);
        expect(isCloudMetadataHost("10.0.0.5")).toBe(false);
        expect(isCloudMetadataHost("auth.example.com")).toBe(false);
    });
});
