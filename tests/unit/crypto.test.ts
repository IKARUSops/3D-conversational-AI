import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashIp, last4, parseEncryptionKey } from "@/lib/crypto";

const KEY = randomBytes(32).toString("base64");

describe("BYOK AES-256-GCM (SRS 2 section 10)", () => {
  it("round-trips a key", () => {
    const enc = encryptSecret("sk_test_1234567890abcd", KEY);
    expect(enc.ciphertext).not.toContain("sk_test");
    expect(decryptSecret(enc, KEY)).toBe("sk_test_1234567890abcd");
  });

  it("uses a fresh 12-byte IV every time", () => {
    const a = encryptSecret("same", KEY);
    const b = encryptSecret("same", KEY);
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails with the wrong key", () => {
    const enc = encryptSecret("secret", KEY);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });

  it("fails when the ciphertext is changed", () => {
    const enc = encryptSecret("secret-value", KEY);
    const bytes = Buffer.from(enc.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret({ ...enc, ciphertext: bytes.toString("base64") }, KEY)).toThrow();
  });

  it("fails when the auth tag is changed", () => {
    const enc = encryptSecret("secret-value", KEY);
    const tag = Buffer.from(enc.authTag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret({ ...enc, authTag: tag.toString("base64") }, KEY)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => parseEncryptionKey(randomBytes(16).toString("base64"))).toThrow();
    expect(() => parseEncryptionKey("")).toThrow();
  });

  it("handles unicode", () => {
    const enc = encryptSecret("কী-১২৩৪", KEY);
    expect(decryptSecret(enc, KEY)).toBe("কী-১২৩৪");
  });

  it("last4 and hashIp", () => {
    expect(last4(" abcdefgh ")).toBe("efgh");
    const h = hashIp("203.0.113.5", "salt");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp("203.0.113.5", "other")).not.toBe(h);
  });
});
