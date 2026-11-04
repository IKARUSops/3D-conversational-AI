# ByteVoice Bangla: agent rules

## Read first
- docs/SRS-1-Product-Requirements.md (what; FR/NFR/AT ids)
- docs/SRS-2-Engineering-and-Agent-Execution.md (how; your role, folders, tasks)
- docs/STATUS.md (who does what now). Update your line when you start/finish a task.
- docs/DECISIONS.md (binding decisions, including version notes below)
- AGENTS.md (Next.js 16 note: read node_modules/next/dist/docs before using a Next API)

## Commands
- pnpm dev | pnpm build | pnpm typecheck | pnpm lint | pnpm test | pnpm e2e | pnpm verify (all checks)
- pnpm db:generate | pnpm db:migrate | pnpm db:seed | pnpm env:check
- E2E against a running server: E2E_BASE_URL=http://localhost:3000 pnpm e2e
  (set PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome if Playwright's browser is missing)

## Build location and git (owner decision)
- Build only in the cloud workspace repo. Commit locally on your branch with clear messages.
- NEVER add a git remote and NEVER push. The owner copies code to his repo and pushes himself.

## Two domains (owner decision)
- One Vercel project, two domains: `<name>.vercel.app` (landing) and `<name>-portal.vercel.app` (portal).
- src/proxy.ts redirects `/` to `/portal` when the host equals env PORTAL_HOST. The landing host
  serves `/` and `/portal`. Never hard-code a domain; use relative links.

## Versions that differ from older docs (see docs/DECISIONS.md)
- Next.js 16: middleware is `src/proxy.ts` (export `proxy`). Cache Components is OFF, so
  `export const dynamic = "force-dynamic"` works as in SRS 2.
- Prisma 7: no `url` in schema.prisma. CLI url is in prisma.config.ts (DIRECT_URL). The app uses
  `db` / `getDb()` from src/lib/db.ts (pg driver adapter, DATABASE_URL). Generated client:
  `@/generated/prisma/client` (gitignored, made by `pnpm db:generate` / postinstall).
- AI SDK is v7 (`ai@7`, `@ai-sdk/google@4`, `@ai-sdk/openai@4`). zod is v4. Check option names in
  node_modules types before coding.

## Hard rules
1. Working end to end beats polished and partial. Ship the vertical slice first.
2. Write only in your role's folders (SRS 2 section 12.1). Contracts in src/contracts/ are Lead-only.
   Ask for changes in docs/STATUS.md "Requests to Lead".
3. No secrets in code or git. Server-only modules import 'server-only'. Never NEXT_PUBLIC_ a secret.
4. The LLM talks; code decides: dates, phones, availability, booking, status are deterministic and tested.
5. All text: NFC normalise; convert Bangla digits before parsing.
6. Every API: zod-validate input (schemas from @/contracts), check auth (call token or staff session),
   rate-limit public endpoints. Use helpers in src/lib/http.ts for errors.
7. Put requirement IDs in commit messages and test names.
8. Verify external API/model names against current docs before coding an adapter.
9. If unsure, choose the simplest option that passes acceptance tests and log it in docs/DECISIONS.md.
10. Before saying "done": pnpm verify passes and it works on the deployed URL.
11. `pnpm build` must pass with NO env vars. Read env lazily (src/lib/env.ts), never at import time.
12. Simple English in docs. Do not use the long dash character.

## Design skills (load them yourself at these steps; see SRS 2 section 11.2)
- Before any UI: website-design:web-design-system -> docs/DESIGN.md. Use its tokens only.
- Landing/hero: website-design:landing-page + frontend-design:frontend-design.
- Any user-facing text: design:ux-copy (Bangla + English).
- After building a page: design:design-critique on a screenshot; portal consistency: design:design-system.
- Before submission, on the live URL: website-design:web-review + design:accessibility-review.

## Style
- TypeScript strict, small pure functions in src/lib, React server components for portal data.
- UI text through the i18n dictionary (bn/en). Default Bangla on landing, English in portal with Bangla data.
- Use plan mode for any task touching more than 3 files.
