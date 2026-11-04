import { describe, expect, it } from "vitest";
import { bearerToken, callTokenExpiry, signCallToken, verifyCallToken } from "@/lib/call-token";

const SECRET = "test-secret-test-secret-test-secret-123";
const CALL = "4b1f2c1e-6a1d-4c5e-9f00-0a1b2c3d4e5f";
const CLINIC = "9e8d7c6b-5a49-4382-a170-ffeeddccbbaa";
const NOW = Date.UTC(2026, 10, 5, 4, 0, 0);

describe("call token (SRS 2 section 5.3, AT-22)", () => {
  const expiresAt = callTokenExpiry(300, NOW);

  it("expiry is maxSeconds + 120 s grace", () => {
    expect(expiresAt).toBe(Math.floor(NOW / 1000) + 420);
  });

  it("round-trips a valid token", () => {
    const token = signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, SECRET);
    const res = verifyCallToken(token, SECRET, NOW);
    expect(res).toEqual({ ok: true, payload: { callId: CALL, clinicId: CLINIC, expiresAt } });
  });

  it("rejects a missing token", () => {
    expect(verifyCallToken(null, SECRET, NOW)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a malformed token", () => {
    expect(verifyCallToken("a.b.c", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyCallToken(`${CALL}.${CLINIC}.abc.sig`, SECRET, NOW)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a token signed with another secret", () => {
    const token = signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, `${SECRET}-other`);
    expect(verifyCallToken(token, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token whose callId was swapped", () => {
    const token = signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, SECRET);
    const forged = token.replace(CALL, "00000000-0000-4000-8000-000000000000");
    expect(verifyCallToken(forged, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an extended expiry", () => {
    const token = signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, SECRET);
    const forged = token.replace(`.${expiresAt}.`, `.${expiresAt + 9999}.`);
    expect(verifyCallToken(forged, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token", () => {
    const token = signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, SECRET);
    const later = (expiresAt + 1) * 1000;
    expect(verifyCallToken(token, SECRET, later)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a short secret", () => {
    expect(() => signCallToken({ callId: CALL, clinicId: CLINIC, expiresAt }, "short")).toThrow();
  });

  it("parses a Bearer header", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   xyz ")).toBe("xyz");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
