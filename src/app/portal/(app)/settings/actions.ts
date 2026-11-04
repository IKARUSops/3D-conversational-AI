"use server";
/**
 * BYOK key management (T3.6, FR-D13, SRS 2 section 10). Admin only; the reviewer (read_only)
 * is blocked. Keys are AES-256-GCM encrypted (src/lib/crypto.ts), never logged or returned.
 */
import { revalidatePath } from "next/cache";
import { KeyProviderSchema, ProviderKeyUpsertRequestSchema, type KeyProvider } from "@/contracts";
import { canWrite, requireStaff } from "@/lib/auth";
import { decryptWithEnvKey, encryptWithEnvKey, last4 } from "@/lib/crypto";
import { db } from "@/lib/db";

export interface KeyActionState {
  ok?: boolean;
  message?: string;
}

async function guard() {
  const staff = await requireStaff("admin");
  if (!canWrite(staff))
    return { staff, error: "The reviewer account cannot change provider keys." };
  return { staff, error: undefined };
}

async function audit(clinicId: string, staffId: string, provider: KeyProvider, action: string) {
  try {
    await db.callEvent.create({
      data: {
        callId: null,
        type: "byok_key_updated",
        payload: { clinicId, staffId, provider, action },
      },
    });
  } catch (err) {
    console.error("[byok] audit log failed", err);
  }
}

export async function saveProviderKey(
  _prev: KeyActionState,
  form: FormData,
): Promise<KeyActionState> {
  const { staff, error } = await guard();
  if (error) return { message: error };
  const parsed = ProviderKeyUpsertRequestSchema.safeParse({
    provider: form.get("provider"),
    key: form.get("key"),
    region: String(form.get("region") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { message: "Paste a valid key (8 to 500 characters)." };
  if (!process.env.BYOK_ENCRYPTION_KEY)
    return { message: "BYOK_ENCRYPTION_KEY is not set on the server." };
  try {
    const enc = encryptWithEnvKey(parsed.data.key);
    const data = {
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      last4: last4(parsed.data.key),
      meta: parsed.data.region ? { region: parsed.data.region } : undefined,
      validatedAt: null,
      createdById: staff.id,
    };
    await db.providerKey.upsert({
      where: { clinicId_provider: { clinicId: staff.clinicId, provider: parsed.data.provider } },
      create: { clinicId: staff.clinicId, provider: parsed.data.provider, ...data },
      update: data,
    });
  } catch (err) {
    console.error("[byok] save failed", err instanceof Error ? err.message : "unknown");
    return { message: "Could not save the key." };
  }
  await audit(staff.clinicId, staff.id, parsed.data.provider, "saved");
  revalidatePath("/portal/settings");
  return { ok: true, message: "Key saved. Press Test to check it." };
}

export async function deleteProviderKey(
  _prev: KeyActionState,
  form: FormData,
): Promise<KeyActionState> {
  const { staff, error } = await guard();
  if (error) return { message: error };
  const provider = KeyProviderSchema.safeParse(form.get("provider"));
  if (!provider.success) return { message: "Unknown provider." };
  try {
    await db.providerKey.deleteMany({
      where: { clinicId: staff.clinicId, provider: provider.data },
    });
  } catch {
    return { message: "Could not delete the key." };
  }
  await audit(staff.clinicId, staff.id, provider.data, "deleted");
  revalidatePath("/portal/settings");
  return { ok: true, message: "Key deleted. Calls use the platform key again." };
}

/** One cheap, free request per provider to check the key works. */
async function probe(provider: KeyProvider, key: string, region?: string): Promise<boolean> {
  const signal = AbortSignal.timeout(8000);
  let res: Response;
  if (provider === "elevenlabs") {
    res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
      signal,
    });
  } else if (provider === "openai") {
    res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
  } else {
    const r = (region ?? "southeastasia").replace(/[^a-z0-9]/gi, "");
    res = await fetch(`https://${r}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
      signal,
    });
  }
  return res.ok;
}

export async function testProviderKey(
  _prev: KeyActionState,
  form: FormData,
): Promise<KeyActionState> {
  const staff = await requireStaff("admin");
  const provider = KeyProviderSchema.safeParse(form.get("provider"));
  if (!provider.success) return { message: "Unknown provider." };
  try {
    const row = await db.providerKey.findUnique({
      where: { clinicId_provider: { clinicId: staff.clinicId, provider: provider.data } },
    });
    if (!row) return { message: "No key saved for this provider." };
    const key = decryptWithEnvKey(row);
    const region = (row.meta as { region?: string } | null)?.region;
    const ok = await probe(provider.data, key, region);
    if (ok && canWrite(staff)) {
      await db.providerKey.update({ where: { id: row.id }, data: { validatedAt: new Date() } });
      revalidatePath("/portal/settings");
    }
    return ok
      ? { ok: true, message: "The key works." }
      : { message: "The provider rejected this key." };
  } catch (err) {
    console.error("[byok] test failed", err instanceof Error ? err.name : "unknown");
    return { message: "Could not reach the provider or decrypt the key." };
  }
}
