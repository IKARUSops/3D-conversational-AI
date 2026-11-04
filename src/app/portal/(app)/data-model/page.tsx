/**
 * Data model (T3.5, FR-D11): ER diagram, table list, data flow, storage, validation rules,
 * status rules. Static content: no DB query, so it renders even before the DB is connected.
 */
import { requireStaff } from "@/lib/auth";
import { ErDiagram } from "@/components/portal/data-model/ErDiagram";
import { Card, PageHeader } from "@/components/portal/ui";
import { IconArrowRight } from "@/components/ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data model | ByteVoice Bangla portal" };

const TABLES: [string, string, string][] = [
  [
    "clinics",
    "Tenant. One row per clinic, with hours, prayer break and fixed answers in settings.",
    "Clinic",
  ],
  [
    "staff_users",
    "Portal users. id equals the Supabase auth user; role admin or receptionist; read_only for the reviewer.",
    "Clinic",
  ],
  ["doctors", "Who sees patients, with specialty and a stable code used by the agent.", "Clinic"],
  ["doctor_schedules", "Weekly availability per doctor (weekday, start, end).", "Clinic"],
  ["services", "What can be booked: duration, fee from, required specialty.", "Clinic"],
  ["patients", "Person behind calls. Identity is clinic + phone in E.164 (unique).", "People"],
  [
    "calls",
    "One row per browser call: status, providers, key source, summaries, metrics, recording path.",
    "Calls",
  ],
  [
    "transcript_turns",
    "Every agent and caller turn with mm:ss offset. source = live (main) or batch (re-transcribed).",
    "Calls",
  ],
  [
    "call_extractions",
    "Structured fields extracted after the call, with validation results and confidence.",
    "Calls",
  ],
  [
    "call_events",
    "Append-only audit trail: tool calls, fallbacks, interruptions, latency, errors.",
    "Calls",
  ],
  [
    "appointments",
    "Bookings. A partial unique index stops two active bookings for one doctor and slot.",
    "Bookings",
  ],
  [
    "appointment_history",
    "Change log: created, rescheduled, cancelled, with the call that did it.",
    "Bookings",
  ],
  [
    "callbacks",
    "Human follow-up created by the agent: category, priority, open or done with a note.",
    "Bookings",
  ],
  [
    "provider_keys",
    "BYOK keys, AES-256-GCM encrypted. Only last 4 characters are ever shown.",
    "Security",
  ],
  ["demo_requests", "Contact form on the landing page.", "Website"],
  ["rate_limits", "Fixed-window counters per hashed IP for abuse limits.", "Security"],
];

const LIVE_FLOW = [
  ["Caller speaks", "Browser mic, Chrome bn-BD speech recognition or a VAD clip"],
  ["STT", "Browser, ElevenLabs, OpenAI or Azure (auto fallback)"],
  ["POST /turn", "Signed call token, zod validation, rate limit"],
  ["LLM + tools", "Gemini (OpenAI fallback) calls tools; code checks every rule"],
  ["Services", "Availability, booking, callbacks in DB transactions"],
  ["Reply", "Sentences streamed to TTS, audio plays in the browser"],
];
const LIVE_WRITES =
  "Each turn writes transcript_turns, call_events (tool_call, tool_result, turn_latency) and calls.agent_state.";

const POST_FLOW = [
  ["Call ends", "Button, time limit, silence, or tab closed (beacon / 3 min sweep)"],
  ["Finalize", "processing_state = running, metrics from events"],
  ["Batch STT", "Recording re-transcribed into source = batch turns"],
  ["Extraction", "LLM structured output into call_extractions + summaries"],
  ["Validate", "Phone, name, date rules in code; patient upsert"],
  ["Status", "Rules from DB facts, not the LLM. Portal shows it within 2 min"],
];

const VALIDATION: [string, string][] = [
  ["All text", "Unicode NFC normalised before parsing or storage."],
  ["Digits", "Bangla digits ০-৯ converted to 0-9 for parsing; original kept in *_raw."],
  [
    "Phone",
    "Strip spaces, dashes, +. Accept 01XXXXXXXXX or 8801XXXXXXXXX; must match ^01[3-9]\\d{8}$; stored as E.164 +8801XXXXXXXXX with phone_valid.",
  ],
  [
    "Name",
    "2 to 60 characters: Bangla or Latin letters, spaces, dots, hyphens. Stored in Bangla script and romanised.",
  ],
  [
    "Date and time",
    "In the future, inside clinic hours, not Friday, not in the prayer break (1:30 to 2:30 PM), on a 30 minute boundary.",
  ],
  ["Status", "Database enum: only the 9 allowed values."],
  [
    "Appointments",
    "Unique active (booked or rescheduled) booking per doctor and slot_start (partial unique index).",
  ],
];

const STATUS_RULES: [string, string][] = [
  [
    "booked / rescheduled / cancelled",
    "An appointment was created, moved or cancelled in this call (latest action wins).",
  ],
  ["follow_up_needed", "A callback was created."],
  ["spam", "3 irrelevant or prank turns in a row, or clear abuse."],
  ["enquiry", "Only information was given."],
  ["incomplete", "Ended before the task finished (hang up, silence, time limit)."],
  ["failed", "Technical failure and nothing useful saved."],
];

function Flow({ steps }: { steps: string[][] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {steps.map(([title, detail], i) => (
        <li
          key={title}
          className="relative flex gap-3 rounded-md border border-border bg-surface-2 p-3"
        >
          <span className="font-latin flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{title}</span>
            <span className="block text-xs leading-relaxed text-fg-muted">{detail}</span>
          </span>
          {i < steps.length - 1 ? (
            <IconArrowRight
              size={16}
              className="absolute top-1/2 -right-3 z-10 hidden -translate-y-1/2 rounded-full bg-bg text-accent-fg 2xl:block"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default async function DataModelPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="Data model"
        description="How a phone conversation becomes structured, searchable clinic data, and where it lives."
      />

      <div className="space-y-6">
        <Card
          title="Entity relationship diagram"
          aside={<span className="text-xs text-fg-subtle">16 tables · PostgreSQL</span>}
        >
          <div className="overflow-x-auto p-4">
            <ErDiagram />
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-fg-muted">
            Bar = one, crow&apos;s foot = many. Every tenant table also has <code>clinic_id</code>{" "}
            to <code>clinics</code> (only some lines drawn). Every table has uuid ids and{" "}
            <code>created_at</code> / <code>updated_at</code> (timestamptz).{" "}
            <code>demo_requests</code> and <code>rate_limits</code> stand alone.
          </p>
        </Card>

        <Card title="How data flows">
          <div className="space-y-6 p-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                During the call{" "}
                <span className="font-normal text-fg-muted">(every turn, target under 1.5 s)</span>
              </h3>
              <Flow steps={LIVE_FLOW} />
              <p className="mt-3 text-xs text-fg-muted">{LIVE_WRITES}</p>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                After the call{" "}
                <span className="font-normal text-fg-muted">
                  (post-call pipeline, retries 3 times)
                </span>
              </h3>
              <Flow steps={POST_FLOW} />
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Where data is stored">
            <dl className="space-y-4 p-5 text-sm">
              <div>
                <dt className="font-semibold">Database</dt>
                <dd className="text-fg-muted">
                  Supabase Postgres, region Singapore (ap-southeast-1), the closest region to
                  Bangladesh. Prisma on the server; Row Level Security denies all browser access.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Recordings</dt>
                <dd className="text-fg-muted">
                  Supabase Storage, private bucket <code>recordings</code>, path{" "}
                  <code className="break-all">
                    clinic/&#123;clinic_id&#125;/calls/&#123;call_id&#125;.webm
                  </code>
                  . The portal plays them through signed URLs that expire after 10 minutes.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Privacy</dt>
                <dd className="text-fg-muted">
                  Fake demo data only. IP addresses are stored as salted hashes. Provider keys are
                  encrypted with AES-256-GCM and never sent to the browser. Phones are masked in the
                  calls list.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Time</dt>
                <dd className="text-fg-muted">Stored as UTC timestamptz, shown in Asia/Dhaka.</dd>
              </div>
            </dl>
          </Card>

          <Card title="Status rules (first match wins)">
            <ol className="divide-y divide-border text-sm">
              {STATUS_RULES.map(([s, rule], i) => (
                <li key={s} className="flex gap-3 px-5 py-2.5">
                  <span className="font-latin w-4 shrink-0 text-fg-subtle">{i + 1}</span>
                  <span>
                    <code className="font-semibold">{s}</code>
                    <span className="block text-fg-muted">{rule}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card title="Tables">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Table
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Area
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {TABLES.map(([name, purpose, area]) => (
                  <tr key={name}>
                    <td className="px-5 py-2.5 font-latin font-medium whitespace-nowrap">{name}</td>
                    <td className="px-5 py-2.5 text-fg-muted">{area}</td>
                    <td className="px-5 py-2.5 text-fg-muted">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Validation rules">
          <dl className="divide-y divide-border text-sm">
            {VALIDATION.map(([field, rule]) => (
              <div key={field} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">{field}</dt>
                <dd className="text-fg-muted">{rule}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
