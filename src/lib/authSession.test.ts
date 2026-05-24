import { describe, expect, it } from "vitest";
import { isSessionTokenActive } from "./authSession";

describe("isSessionTokenActive", () => {
  it("treats explicitly expired sessions as inactive even with a future expiry", () => {
    expect(
      isSessionTokenActive({ sessionExpiresAt: 9_999_999_999, sessionExpired: true }, 1_700_000_000)
    ).toBe(false);
  });
});
