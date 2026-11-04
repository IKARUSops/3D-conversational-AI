import { describe, expect, it } from "vitest";
import { portalRedirectPath } from "@/lib/host-redirect";

describe("two domains: portal host redirect", () => {
  const PORTAL = "bytevoice-bangla-portal.vercel.app";

  it("redirects / on the portal host to /portal", () => {
    expect(portalRedirectPath(PORTAL, "/", PORTAL)).toBe("/portal");
    expect(portalRedirectPath("ByteVoice-Bangla-Portal.vercel.app:443", "/", PORTAL)).toBe(
      "/portal",
    );
  });

  it("does nothing on the landing host", () => {
    expect(portalRedirectPath("bytevoice-bangla.vercel.app", "/", PORTAL)).toBeNull();
  });

  it("does nothing for other paths or when PORTAL_HOST is unset", () => {
    expect(portalRedirectPath(PORTAL, "/portal/calls", PORTAL)).toBeNull();
    expect(portalRedirectPath(PORTAL, "/", undefined)).toBeNull();
    expect(portalRedirectPath(null, "/", PORTAL)).toBeNull();
  });

  it("accepts a comma separated list of hosts", () => {
    expect(portalRedirectPath("portal.example.com", "/", `${PORTAL}, portal.example.com`)).toBe(
      "/portal",
    );
  });
});
