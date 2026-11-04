/** Settings (T3.6, FR-D13): default providers + BYOK keys. Admin only; reviewer sees read only. */
import { canWrite, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, ErrorState, Field, PageHeader, dbErrorDetail } from "@/components/portal/ui";
import { PROVIDER_LABEL, formatDateTime } from "../../_lib/format";
import { KeyRow } from "./KeyRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings | ByteVoice Bangla portal" };

const KEY_PROVIDERS = [
  { id: "elevenlabs", label: "ElevenLabs (voice + batch STT)" },
  { id: "openai", label: "OpenAI (STT, voice, LLM fallback)" },
  { id: "azure", label: "Azure Speech (STT, voice)" },
] as const;

export default async function SettingsPage() {
  const staff = await requireStaff("admin");
  const readOnly = !canWrite(staff);

  let clinic: { nameEn: string; nameBn: string; settings: unknown } | null = null;
  let keys: { provider: string; last4: string; validatedAt: Date | null; meta: unknown }[] = [];
  let loadError: unknown;
  try {
    [clinic, keys] = await Promise.all([
      db.clinic.findUnique({
        where: { id: staff.clinicId },
        select: { nameEn: true, nameBn: true, settings: true },
      }),
      db.providerKey.findMany({
        where: { clinicId: staff.clinicId },
        select: { provider: true, last4: true, validatedAt: true, meta: true },
      }),
    ]);
  } catch (err) {
    loadError = err;
  }
  const settings = (clinic?.settings ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader
        title="Settings"
        description={readOnly ? "Read only for the reviewer account." : "Admin only."}
      />
      {loadError ? (
        <ErrorState title="Could not load settings" detail={dbErrorDetail(loadError)} />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Clinic and defaults">
          <dl className="grid grid-cols-2 gap-4 p-5">
            <Field label="Clinic">{clinic ? `${clinic.nameBn} (${clinic.nameEn})` : "-"}</Field>
            <Field label="Hours">
              <span className="font-latin">
                {typeof settings.open === "string" ? `${settings.open} to ${settings.close}` : "-"}
              </span>
            </Field>
            <Field label="Default STT">
              {PROVIDER_LABEL[String(settings.defaultStt ?? "browser")]}
            </Field>
            <Field label="Default voice">
              {PROVIDER_LABEL[String(settings.defaultTts ?? "elevenlabs")]}
            </Field>
          </dl>
          <p className="border-t border-border px-5 py-3 text-xs text-fg-muted">
            Callers can still pick another STT or voice in the call panel. If a provider fails, the
            next one is used automatically and logged in the call timeline.
          </p>
        </Card>

        <Card title="Bring your own keys (BYOK)">
          <p className="px-5 pt-4 text-sm text-fg-muted">
            A clinic can use its own provider accounts. Keys are encrypted with AES-256-GCM before
            they are stored, are never sent back to the browser, and each call records whether it
            used the platform key or the clinic key.
          </p>
          <ul className="divide-y divide-border">
            {KEY_PROVIDERS.map((p) => {
              const k = keys.find((x) => x.provider === p.id);
              return (
                <KeyRow
                  key={p.id}
                  provider={p.id}
                  label={p.label}
                  readOnly={readOnly}
                  stored={
                    k
                      ? {
                          last4: k.last4,
                          validatedAt: k.validatedAt ? formatDateTime(k.validatedAt) : null,
                          region: (k.meta as { region?: string } | null)?.region,
                        }
                      : null
                  }
                />
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
