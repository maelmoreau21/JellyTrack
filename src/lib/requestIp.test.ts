import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIpFromHeaders } from "./requestIp";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe("getClientIpFromHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores proxy headers unless explicitly trusted", () => {
    expect(
      getClientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.10" }), "unknown")
    ).toBe("unknown");
  });

  it("uses the configured trusted proxy hop when enabled", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");

    expect(
      getClientIpFromHeaders(
        headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.5" }),
        "unknown"
      )
    ).toBe("203.0.113.10");
  });
});
