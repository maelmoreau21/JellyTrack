import { describe, expect, it } from "vitest";
import { redactBackupData } from "./backupSecurity";

describe("redactBackupData", () => {
  it("removes server and plugin secrets from exported backups", () => {
    const redacted = redactBackupData({
      servers: [{ id: "srv", name: "Server", jellyfinApiKey: "secret" }],
      settings: {
        id: "global",
        discordWebhookUrl: "https://discord.com/api/webhooks/1/t",
        pluginApiKey: "hash",
        pluginPreviousApiKey: "old-hash",
      },
    });

    expect(redacted.servers).toEqual([{ id: "srv", name: "Server" }]);
    expect(redacted.settings).toEqual({
      id: "global",
      discordWebhookUrl: "https://discord.com/api/webhooks/1/t",
    });
  });
});
