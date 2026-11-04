/**
 * Server environment, validated with zod.
 *
 * LAZY on purpose: nothing is read at import time, so `next build` works without any env vars.
 * Call `serverEnv()` inside a request handler (it throws a clear error if something required
 * is missing) or `optionalServerEnv()` when a missing value should only disable a feature.
 */
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const intWithDefault = (d: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(d));

/** Variables that are optional for the app to boot (features turn off without them). */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  // LLM
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  LLM_PRIMARY: z.preprocess(emptyToUndefined, z.string().default("google:gemini-2.5-flash")),
  LLM_FALLBACK: z.preprocess(emptyToUndefined, z.string().default("openai:gpt-4.1-mini")),

  // Speech
  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_VOICE_ID: z.preprocess(emptyToUndefined, z.string().default("cgSgspJ2msm6clMCkdW9")),
  ELEVENLABS_TTS_MODEL: z.preprocess(emptyToUndefined, z.string().default("eleven_v4")),
  AZURE_SPEECH_KEY: optionalString,
  AZURE_SPEECH_REGION: z.preprocess(emptyToUndefined, z.string().default("southeastasia")),
  // Provider model/voice overrides (read through providerSetting in src/lib/providers/common.ts)
  ELEVENLABS_STT_MODEL: z.preprocess(emptyToUndefined, z.string().default("scribe_v2")),
  /** Sent to ElevenLabs TTS only when set (verify eleven_v4 support, DECISIONS B-13). */
  ELEVENLABS_TTS_LANGUAGE_CODE: optionalString,
  OPENAI_STT_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-transcribe")),
  OPENAI_TTS_MODEL: z.preprocess(emptyToUndefined, z.string().default("gpt-4o-mini-tts")),
  OPENAI_TTS_VOICE: z.preprocess(emptyToUndefined, z.string().default("nova")),

  // Security
  CALL_TOKEN_SECRET: optionalString,
  BYOK_ENCRYPTION_KEY: optionalString,
  IP_HASH_SALT: optionalString,
  CRON_SECRET: optionalString,
  REVIEW_KEY: optionalString,

  // Limits
  MAX_CALL_SECONDS: intWithDefault(300),
  RATE_LIMIT_CALLS_PER_IP_HOUR: intWithDefault(30),
  DAILY_CALL_CAP: intWithDefault(300),

  // Domains
  PORTAL_HOST: optionalString,

  // Seed only (prisma/seed.ts); never needed at runtime
  REVIEWER_EMAIL: optionalString,
  REVIEWER_PASSWORD: optionalString,
  RECEPTIONIST_EMAIL: optionalString,
  RECEPTIONIST_PASSWORD: optionalString,

  // Optional
  SENTRY_DSN: optionalString,
});

export type OptionalServerEnv = z.infer<typeof baseSchema>;

/** Variables the deployed app cannot work without (checked by `pnpm env:check`). */
export const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CALL_TOKEN_SECRET",
  "BYOK_ENCRYPTION_KEY",
  "IP_HASH_SALT",
] as const satisfies readonly (keyof OptionalServerEnv)[];

/** Every other variable the app reads (features or defaults apply when missing). */
export const OPTIONAL_SERVER_VARS = (Object.keys(baseSchema.shape) as (keyof OptionalServerEnv)[]).filter(
  (k) => k !== "NODE_ENV" && !(REQUIRED_SERVER_VARS as readonly string[]).includes(k),
);

type RequiredVar = (typeof REQUIRED_SERVER_VARS)[number];
export type ServerEnv = OptionalServerEnv & { [K in RequiredVar]: string };

/** Extra rules on top of "present". Returns human-readable problems. */
export function checkEnv(source: Record<string, string | undefined>): string[] {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  }
  const env = parsed.data;
  const problems: string[] = [];
  for (const name of REQUIRED_SERVER_VARS) {
    if (!env[name]) problems.push(`${name} is missing`);
  }
  if (env.CALL_TOKEN_SECRET && env.CALL_TOKEN_SECRET.length < 32) {
    problems.push("CALL_TOKEN_SECRET must be at least 32 characters");
  }
  if (env.BYOK_ENCRYPTION_KEY && Buffer.from(env.BYOK_ENCRYPTION_KEY, "base64").length !== 32) {
    problems.push("BYOK_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY && !env.OPENAI_API_KEY) {
    problems.push("Set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY (at least one LLM key)");
  }
  return problems;
}

let cachedOptional: OptionalServerEnv | undefined;

/** Parsed env where every secret may be missing. Never throws for missing values. */
export function optionalServerEnv(): OptionalServerEnv {
  cachedOptional ??= baseSchema.parse(process.env);
  return cachedOptional;
}

/** Parsed env with all REQUIRED_SERVER_VARS present. Throws a clear error otherwise. */
export function serverEnv(): ServerEnv {
  const problems = checkEnv(process.env);
  if (problems.length > 0) {
    throw new Error(`Server environment is not configured:\n- ${problems.join("\n- ")}`);
  }
  return optionalServerEnv() as ServerEnv;
}

/** Reset the cache (tests only). */
export function resetEnvCache(): void {
  cachedOptional = undefined;
}
