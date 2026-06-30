import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidMutationOrigin } from "./adminRequestGuard";

describe("hasValidMutationOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts same-origin mutating requests", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://jellytrack.example");
    const req = new Request("https://jellytrack.example/api/settings", {
      method: "POST",
      headers: { origin: "https://jellytrack.example" },
    });

    expect(hasValidMutationOrigin(req)).toBe(true);
  });

  it("rejects cross-origin mutating requests", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://jellytrack.example");
    const req = new Request("https://jellytrack.example/api/settings", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    expect(hasValidMutationOrigin(req)).toBe(false);
  });

  it("rejects missing origin and referer by default", () => {
    const req = new Request("https://jellytrack.example/api/settings", {
      method: "PATCH",
    });

    expect(hasValidMutationOrigin(req)).toBe(false);
  });
});
