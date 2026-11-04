/**
 * Small crypto helpers (server only).
 *
 * - BYOK keys: AES-256-GCM with a random 12-byte IV per value (SRS 2 section 10).
 *   Store `ciphertext`, `iv`, `authTag` (all base64) and `last4`. Never log or return the key.
 * - IP hashing: salted SHA-256 so raw IPs are never stored (SRS 1 section 5.3).
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Decodes a base64 32-byte key. Throws if the size is wrong. */
export function parseEncryptionKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64 ?? "", "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("BYOK_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): EncryptedSecret {
  const key = parseEncryptionKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws if the key is wrong or the data was changed (GCM auth check). */
export function decryptSecret(secret: EncryptedSecret, keyBase64: string): string {
  const key = parseEncryptionKey(keyBase64);
  const iv = Buffer.from(secret.iv, "base64");
  if (iv.length !== IV_BYTES) throw new Error("Invalid IV length");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** Last 4 characters for display ("...abcd"). */
export function last4(value: string): string {
  return value.trim().slice(-4);
}

/** Salted SHA-256 of an IP address (hex). */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Env wrappers used by route handlers. */
export function encryptWithEnvKey(plaintext: string): EncryptedSecret {
  return encryptSecret(plaintext, process.env.BYOK_ENCRYPTION_KEY ?? "");
}
export function decryptWithEnvKey(secret: EncryptedSecret): string {
  return decryptSecret(secret, process.env.BYOK_ENCRYPTION_KEY ?? "");
}
