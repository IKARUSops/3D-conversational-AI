# 3D-conversational-AI

ByteVoice Bangla: a 3D, voice-first AI receptionist demo for Bangladeshi dental clinics (landing page with a live Bangla caller and a data portal).

> Work in progress. Architecture, decisions and test results will be added as the build goes on. See `docs/DECISIONS.md` and `docs/STATUS.md`.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript strict, Node runtime for APIs) |
| UI | Tailwind CSS 4, React 19 |
| 3D | three, @react-three/fiber, @react-three/drei |
| Database | Supabase Postgres (Singapore) with Prisma 7 (pg driver adapter) |
| Auth and storage | Supabase Auth (`@supabase/ssr`), Supabase Storage (private `recordings` bucket) |
| LLM | Vercel AI SDK v7 (Gemini Flash default, OpenAI fallback) |
| Speech | Browser Web Speech `bn-BD`, ElevenLabs, OpenAI, Azure (dropdowns with fallback) |
| Validation | zod 4 (shared contracts in `src/contracts`) |
| Tests | Vitest (unit), Playwright (smoke) |
| Hosting | Vercel (functions in `sin1`) |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Generate the Prisma client and build Next.js (works without env vars) |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint (no warnings allowed) |
| `pnpm typecheck` | Generate the Prisma client and run `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | Playwright smoke tests (starts `pnpm start`, or set `E2E_BASE_URL`) |
| `pnpm verify` | typecheck + lint + test + build |
| `pnpm db:generate` | Generate the Prisma client into `src/generated/prisma` |
| `pnpm db:migrate` | `prisma migrate dev` (uses `DIRECT_URL`) |
| `pnpm db:seed` | Seed clinic, doctors, schedules, services and staff users (idempotent) |
| `pnpm env:check` | Fail if a required server env var is missing or malformed |

## Environment

Copy `.env.example` to `.env` and fill in the values. Never commit `.env`.

- `DATABASE_URL`: Supabase pooled URL (port 6543). `DIRECT_URL`: direct URL (port 5432) for migrations.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public. `SUPABASE_SERVICE_ROLE_KEY`: secret, server only.
- `CALL_TOKEN_SECRET` (32+ chars), `BYOK_ENCRYPTION_KEY` (`openssl rand -base64 32`), `IP_HASH_SALT`: secrets.
- Provider keys: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY`.
- `PORTAL_HOST`: the portal domain without protocol (see "Two domains").
- Seed only: `REVIEWER_EMAIL`, `REVIEWER_PASSWORD`, `RECEPTIONIST_EMAIL`, `RECEPTIONIST_PASSWORD`. The reviewer password is shared only in the submission email.

Run `pnpm env:check` to see what is missing.

## Setup

1. `pnpm install` (also generates the Prisma client).
2. Create a Supabase project in **ap-southeast-1 (Singapore)** and fill `.env`.
3. First migration: `pnpm db:migrate --name init`.
4. Constraints and RLS: `pnpm prisma migrate dev --create-only --name constraints_rls`, paste `prisma/sql/001_constraints_rls.sql` into the new `migration.sql`, then `pnpm db:migrate`. Check every later migration for `DROP INDEX` lines on these indexes and remove them.
5. Create a private Storage bucket named `recordings`.
6. `pnpm db:seed`.
7. `pnpm dev` and open http://localhost:3000. Health check: http://localhost:3000/api/health.

### Deploy (Vercel)

1. Import the repo in Vercel. `vercel.json` pins functions to `sin1` and adds a daily cron.
2. Add all env vars (Production and Preview).
3. Optional fail-fast: set the Build Command to `pnpm env:check && pnpm build`.
4. Add both domains (see below) and set `PORTAL_HOST`.

## Two domains

One Vercel project serves two domains: `<name>.vercel.app` (landing) and `<name>-portal.vercel.app` (portal). `src/proxy.ts` redirects `/` to `/portal` when the request host equals `PORTAL_HOST`. The landing domain serves both `/` and `/portal`.

## Keep-alive (Supabase free projects pause after about 7 days without DB activity)

`GET /api/health` runs `select 1` and a count on `clinics`, is never cached, and returns `{ "ok": true, "db": true, "ts": "..." }` (503 with `ok:false` if the database fails). Three layers call it:

1. **UptimeRobot**: HTTP(s) keyword monitor on `https://<landing-domain>/api/health` every **30 minutes**, keyword `"db":true`, email alert on failure (set up by the owner).
2. **GitHub Actions**: `.github/workflows/keepalive.yml` runs every 6 hours. Set the repository variable **`APP_URL`** (GitHub > Settings > Secrets and variables > Actions > Variables), for example `https://bytevoice-bangla.vercel.app`, with no trailing slash. Optional secret `CRON_SECRET`.
3. **Vercel cron**: daily at 03:00 UTC (`vercel.json`).

If a pause still happens: Supabase dashboard > Resume project (data is kept).

## Project layout

See `docs/SRS-2-Engineering-and-Agent-Execution.md` section 3. Key folders: `src/contracts` (shared zod contracts), `src/lib` (db, env, supabase, call token, crypto, text, agent, providers, services), `src/app` (landing, portal, API), `prisma` (schema, raw SQL, seed), `tests`.

## License
Copyright (c) 2026 Sharif Mohammad Omar Faruq.
Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE): free for research, study and other noncommercial use; **commercial use is not allowed** without written permission. See [NOTICE.md](NOTICE.md).
