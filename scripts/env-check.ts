/**
 * pnpm env:check : lists required and optional server env vars and fails (exit 1) when a
 * required one is missing or malformed. Reads .env locally; on Vercel it reads the project env.
 * Use it as a pre-build step on Vercel:
 *   Build Command: pnpm env:check && pnpm build
 * Values are never printed, only "set" or "not set".
 */
import "dotenv/config";
import { checkEnv, OPTIONAL_SERVER_VARS, REQUIRED_SERVER_VARS } from "../src/lib/env";

const isSet = (name: string) => Boolean(process.env[name]?.trim());
const mark = (name: string) => (isSet(name) ? "set    " : "not set");

console.log("Required:");
for (const name of REQUIRED_SERVER_VARS) console.log(`  [${mark(name)}] ${name}`);
console.log("Optional (defaults or feature off when not set):");
for (const name of OPTIONAL_SERVER_VARS) console.log(`  [${mark(name)}] ${name}`);

const problems = checkEnv(process.env);
if (problems.length > 0) {
  console.error("\nenv:check failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\nenv:check ok (${REQUIRED_SERVER_VARS.length} required vars present)`);
