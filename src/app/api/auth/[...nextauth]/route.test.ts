import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ensureNextAuthUrl } from "./route";

describe("ensureNextAuthUrl", () => {
  const originalEnv = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXTAUTH_URL = originalEnv;
    } else {
      delete process.env.NEXTAUTH_URL;
    }
  });

  it("dynamically sets NEXTAUTH_URL from x-forwarded-host and x-forwarded-proto", () => {
    const req = new NextRequest("http://localhost:3005/api/auth/signin/oidc", {
      headers: {
        "x-forwarded-host": "jellytrack.dfmag.fr",
        "x-forwarded-proto": "https",
      },
    });

    ensureNextAuthUrl(req);
    expect(process.env.NEXTAUTH_URL).toBe("https://jellytrack.dfmag.fr");
  });

  it("overwrites localhost container fallback with real forwarded host", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3005";

    const req = new NextRequest("http://localhost:3005/api/auth/callback/oidc", {
      headers: {
        "x-forwarded-host": "jellytrack.dfmag.fr",
        "x-forwarded-proto": "https",
      },
    });

    ensureNextAuthUrl(req);
    expect(process.env.NEXTAUTH_URL).toBe("https://jellytrack.dfmag.fr");
  });

  it("falls back to host header when x-forwarded headers are absent", () => {
    const req = new NextRequest("http://192.168.1.50:3005/api/auth/signin/oidc", {
      headers: {
        host: "192.168.1.50:3005",
      },
    });

    ensureNextAuthUrl(req);
    expect(process.env.NEXTAUTH_URL).toBe("http://192.168.1.50:3005");
  });

  it("detects https from referer header when reverse proxy omits x-forwarded-proto", () => {
    const req = new NextRequest("http://localhost:3005/api/auth/signin/oidc", {
      headers: {
        host: "jellytrack.dfmag.fr",
        referer: "https://jellytrack.dfmag.fr/login",
      },
    });

    ensureNextAuthUrl(req);
    expect(process.env.NEXTAUTH_URL).toBe("https://jellytrack.dfmag.fr");
  });

  it("preserves explicitly configured non-localhost custom NEXTAUTH_URL", () => {
    process.env.NEXTAUTH_URL = "https://custom-domain.com";

    const req = new NextRequest("http://localhost:3005/api/auth/signin/oidc", {
      headers: {
        "x-forwarded-host": "other-domain.com",
        "x-forwarded-proto": "https",
      },
    });

    ensureNextAuthUrl(req);
    expect(process.env.NEXTAUTH_URL).toBe("https://custom-domain.com");
  });
});
