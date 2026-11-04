/**
 * Key resolution (SRS 2 section 7.7, owner decision O-06):
 * BYOK key of the clinic (AES-256-GCM, decrypted here) if present, else the platform env key,
 * else null (provider unavailable). Keys are never logged or returned to the browser.
 */
import "server-only";
import type { KeyProvider } from "@/contracts";
import { decryptWithEnvKey } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { optionalServerEnv } from "@/lib/env";
import type { ResolvedKey } from "./types";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: ResolvedKey | null }>();

/** Platform key from env (no DB). */
export function platformKey(provider: KeyProvider): ResolvedKey | null {
  const env = optionalServerEnv();
  switch (provider) {
    case "elevenlabs":
      return env.ELEVENLABS_API_KEY ? { value: env.ELEVENLABS_API_KEY, source: "platform" } : null;
    case "openai":
      return env.OPENAI_API_KEY ? { value: env.OPENAI_API_KEY, source: "platform" } : null;
    case "azure":
      return env.AZURE_SPEECH_KEY
        ? { value: env.AZURE_SPEECH_KEY, source: "platform", meta: { region: env.AZURE_SPEECH_REGION } }
        : null;
  }
}

async function byokKey(provider: KeyProvider, clinicId: string): Promise<ResolvedKey | null> {
  if (!process.env.DATABASE_URL || !process.env.BYOK_ENCRYPTION_KEY) return null;
  try {
    const row = await getDb().providerKey.findUnique({
      where: { clinicId_provider: { clinicId, provider } },
    });
    if (!row) return null;
    const value = decryptWithEnvKey({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag });
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? Object.fromEntries(
            Object.entries(row.meta as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>
        : undefined;
    if (provider === "azure" && !meta?.region) {
      return { value, source: "byok", meta: { region: optionalServerEnv().AZURE_SPEECH_REGION } };
    }
    return { value, source: "byok", ...(meta ? { meta } : {}) };
  } catch (err) {
    console.warn(`[keys] BYOK lookup failed for ${provider}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** BYOK first (cached 60 s per clinic+provider), then platform env. */
export async function resolveKey(provider: KeyProvider, clinicId?: string): Promise<ResolvedKey | null> {
  if (clinicId) {
    const k = `${clinicId}:${provider}`;
    const hit = cache.get(k);
    let byok: ResolvedKey | null;
    if (hit && Date.now() - hit.at < CACHE_MS) byok = hit.value;
    else {
      byok = await byokKey(provider, clinicId);
      cache.set(k, { at: Date.now(), value: byok });
    }
    if (byok) return byok;
  }
  return platformKey(provider);
}

/** Forget cached BYOK keys (call after a key is saved in Settings). */
export function clearKeyCache(clinicId?: string): void {
  if (!clinicId) cache.clear();
  else for (const k of cache.keys()) if (k.startsWith(`${clinicId}:`)) cache.delete(k);
}

export type KeyResolver = typeof resolveKey;
