import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkEnv, OPTIONAL_SERVER_VARS, REQUIRED_SERVER_VARS } from "@/lib/env";

const full = {
  DATABASE_URL: "postgres://x",
  DIRECT_URL: "postgres://y",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CALL_TOKEN_SECRET: "x".repeat(40),
  BYOK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  IP_HASH_SALT: "salt",
  GOOGLE_GENERATIVE_AI_API_KEY: "g",
};

describe("env check", () => {
  it("passes with all required vars", () => {
    expect(checkEnv(full)).toEqual([]);
  });

  it("lists missing vars (empty string counts as missing)", () => {
    const problems = checkEnv({ ...full, DATABASE_URL: "", IP_HASH_SALT: undefined });
    expect(problems).toContain("DATABASE_URL is missing");
    expect(problems).toContain("IP_HASH_SALT is missing");
  });

  it("checks secret sizes and an LLM key", () => {
    const problems = checkEnv({
      ...full,
      CALL_TOKEN_SECRET: "short",
      BYOK_ENCRYPTION_KEY: "abc",
      GOOGLE_GENERATIVE_AI_API_KEY: "",
    });
    expect(problems).toHaveLength(3);
  });
});

describe("env lists (I-05)", () => {
  it(".env.example and env.ts list the same variables", () => {
    const example = readFileSync(".env.example", "utf8")
      .split("\n")
      .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
      .filter((x): x is string => Boolean(x))
      .sort();
    const known = [...REQUIRED_SERVER_VARS, ...OPTIONAL_SERVER_VARS].map(String).sort();
    expect(example).toEqual(known);
  });
});
