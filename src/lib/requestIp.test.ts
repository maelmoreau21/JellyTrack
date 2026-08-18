import { describe, expect, it } from "vitest";
import { isPrivateOrLocalIp, normalizeIp } from "./requestIp";

describe("requestIp utils", () => {
    describe("normalizeIp", () => {
        it("should normalize mapped ipv6 and port suffixes", () => {
            expect(normalizeIp("::ffff:192.168.1.50")).toBe("192.168.1.50");
            expect(normalizeIp("192.168.1.50:8096")).toBe("192.168.1.50");
            expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
            expect(normalizeIp("  10.0.0.1  ")).toBe("10.0.0.1");
            expect(normalizeIp(null)).toBeNull();
        });
    });

    describe("isPrivateOrLocalIp", () => {
        it("should detect localhost and loopback", () => {
            expect(isPrivateOrLocalIp("127.0.0.1")).toBe(true);
            expect(isPrivateOrLocalIp("127.0.1.1")).toBe(true);
            expect(isPrivateOrLocalIp("::1")).toBe(true);
            expect(isPrivateOrLocalIp("localhost")).toBe(true);
            expect(isPrivateOrLocalIp("0.0.0.0")).toBe(true);
        });

        it("should detect private RFC1918 IPv4 ranges", () => {
            expect(isPrivateOrLocalIp("192.168.1.1")).toBe(true);
            expect(isPrivateOrLocalIp("192.168.32.1")).toBe(true);
            expect(isPrivateOrLocalIp("192.168.254.254")).toBe(true);
            expect(isPrivateOrLocalIp("10.0.0.1")).toBe(true);
            expect(isPrivateOrLocalIp("10.200.50.1")).toBe(true);
            expect(isPrivateOrLocalIp("172.16.0.1")).toBe(true);
            expect(isPrivateOrLocalIp("172.24.5.10")).toBe(true);
            expect(isPrivateOrLocalIp("172.31.255.254")).toBe(true);
        });

        it("should detect link-local IPv4 and IPv6", () => {
            expect(isPrivateOrLocalIp("169.254.1.1")).toBe(true);
            expect(isPrivateOrLocalIp("fe80::1ff:fe23:4567:890a")).toBe(true);
            expect(isPrivateOrLocalIp("fd00::1")).toBe(true);
        });

        it("should not classify public routable IPs as private", () => {
            expect(isPrivateOrLocalIp("8.8.8.8")).toBe(false);
            expect(isPrivateOrLocalIp("1.1.1.1")).toBe(false);
            expect(isPrivateOrLocalIp("142.250.190.46")).toBe(false);
            expect(isPrivateOrLocalIp("172.32.0.1")).toBe(false);
            expect(isPrivateOrLocalIp("172.15.255.255")).toBe(false);
            expect(isPrivateOrLocalIp("192.169.1.1")).toBe(false);
            expect(isPrivateOrLocalIp("2607:f8b0:4005:805::200e")).toBe(false);
        });
    });
});
