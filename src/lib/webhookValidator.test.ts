import { describe, expect, it } from "vitest";
import { isValidDiscordWebhook } from "./webhookValidator";

describe("isValidDiscordWebhook", () => {
  it("accepts Discord webhook URLs", () => {
    expect(
      isValidDiscordWebhook("https://discord.com/api/webhooks/123456789/token")
    ).toBe(true);
    expect(
      isValidDiscordWebhook("https://discordapp.com/api/webhooks/123456789/token")
    ).toBe(true);
  });

  it("rejects lookalike Discord domains", () => {
    expect(
      isValidDiscordWebhook("https://evil-discord.com/api/webhooks/123456789/token")
    ).toBe(false);
    expect(
      isValidDiscordWebhook("https://discord.com.attacker.test/api/webhooks/123456789/token")
    ).toBe(false);
  });

  it("rejects non-HTTPS and non-webhook paths", () => {
    expect(
      isValidDiscordWebhook("http://discord.com/api/webhooks/123456789/token")
    ).toBe(false);
    expect(isValidDiscordWebhook("https://discord.com/api/channels/123")).toBe(false);
  });
});
