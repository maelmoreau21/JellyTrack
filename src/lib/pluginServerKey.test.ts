import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveScopedPluginApiKey,
  parsePluginApiKeyCandidate,
  verifyScopedPluginApiKey,
} from "./pluginServerKey";

describe("scoped plugin API keys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs the server scope without embedding the global key", () => {
    const token = deriveScopedPluginApiKey("stored-global-key-hash", "server-a");

    expect(token).toMatch(/^jts4\./);
    expect(token).not.toContain("stored-global-key-hash");
    expect(parsePluginApiKeyCandidate(token).rawKey).toBeNull();
    expect(verifyScopedPluginApiKey(token, "stored-global-key-hash")).toEqual({
      valid: true,
      jellyfinServerId: "server-a",
    });
    expect(verifyScopedPluginApiKey(token, "other-hash").valid).toBe(false);
  });
});
