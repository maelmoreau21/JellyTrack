import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJellyfinSystemInfo } from "./jellyfinServers";

describe("fetchJellyfinSystemInfo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not put the API key in the URL", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response("{}", { status: 401 });
    }));

    await fetchJellyfinSystemInfo({ url: "https://jellyfin.example", apiKey: "secret-key" });

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => !/[?&]ApiKey=/i.test(url))).toBe(true);
  });

  it("masks secrets correctly", async () => {
    const { maskSecret } = await import("./jellyfinServers");
    expect(maskSecret("")).toBe("");
    expect(maskSecret("123456")).toBe("******");
    expect(maskSecret("my-secret-key-12345")).toBe("my-*************345");
  });
});
