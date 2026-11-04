# Status board

Update your row when you start or finish a task. Times are Asia/Dhaka.

| Agent | Task | State | Branch | Notes / blockers | Updated |
|---|---|---|---|---|---|
| L | T0.1 scaffold, tooling, health, keep-alive files | done | main | Vercel deploy and Supabase project are owner steps (no network from the build machine). See README "Setup" | 2026-11-04 17:30 |
| L | T0.2 contracts | done | main | src/contracts/{enums,api,agent}.ts | 2026-11-04 17:30 |
| A | T1.1 Prisma schema + SQL migration | done | agent/a-backend | Schema unchanged (matches SRS). prisma/migrations/0001_init + 0002_constraints_rls (+ lock file). Owner: `pnpm db:deploy` on Supabase | 2026-11-04 |
| A | T1.2 seed | done | agent/a-backend | Seed checked vs SRS 1 section 4.4, idempotent; now also creates private `recordings` bucket. Owner: `pnpm db:seed` | 2026-11-04 |
| A | T1.3 availability.ts + tests | done | agent/a-backend | Pure computeSlots + 26 tests; spoken-bn.ts local speaker | 2026-11-04 |
| A | T1.4 booking.ts + tests | done | agent/a-backend | book/find/reschedule/cancel, clinic info, callbacks, logEvent; 24 PGlite tests (unique index proven) | 2026-11-04 |
| A | T1.5 call APIs (start, end, recording-url), rate limit | done | agent/a-backend | + demo-requests; 14 route tests. `authorizeCall` in services/call-auth.ts for B's routes | 2026-11-04 |
| A | T1.6 finalize.ts + status.ts + tests | done | agent/a-backend | All 8 statuses tested; retries, stale sweep; 38 tests | 2026-11-04 |
| B | T2.1 text utils + tests | done | agent/b-voice | src/lib/text: normalize, phone, bangla-numbers, tts-normalize, sentence-split. 24 tests (tests/unit/text-utils.test.ts) incl. NFC/NFD য় | 2026-11-04 23:55 |
| B | T2.2 datetime-bn + tests | done | agent/b-voice | src/lib/text/datetime-bn.ts `resolve(phrase, now, settings)`. 27 tests incl. owner phrases and misheard আমি রবিবার | 2026-11-04 23:55 |
| B | T2.3 providers + registry + fallback | done | agent/b-voice | STT/TTS/LLM adapters, BYOK keys, fallback with timeouts, /api/stt /api/tts /api/providers. 13 mocked-fetch tests. Provider details marked (verify) in DECISIONS B-xx | 2026-11-04 23:55 |
| B | T2.4 prompt, tools, turn loop, SSE | done | agent/b-voice | system-prompt, state, tools, store, turn (SSE route), postcall ports implemented. 31 tests incl. mock-LLM turn loop. Needs Agent A services (loadClinicContext etc.) + DB to run live | 2026-11-04 23:55 |
| B | T2.5 call client | done | agent/b-voice | src/components/call: CallPanel, useCall (mascotState, getAgentLevel, getCallerLevel), callSession, audioQueue, echoFilter, browserStt, vadStt (energy VAD), recorder. 20 tests. Not yet tested in a real browser with real keys | 2026-11-04 23:55 |
| C | T3.1 Supabase auth, login, guard, layout | done | agent/c-portal | Server-action login, requireStaff(role) reads staff_users incl. read_only, proxy refreshes the session on /portal/*. e2e: anonymous to login | 2026-11-04 |
| C | T3.2 calls list | done | agent/c-portal | Search, filters, 25 per page, 5 s refresh, stats strip, 9 status badges. Stale sweep wired in I-04 | 2026-11-04 |
| C | T3.3 call detail | done | agent/c-portal | Fields + validation badges, summaries bn/en, live and "Re-transcribed audio" tabs, tool/interruption markers, signed recording URL (10 min), event timeline, linked appointment and callbacks | 2026-11-04 |
| C | T3.4 appointments, callbacks | done | agent/c-portal | Mark done with note; blocked for read_only | 2026-11-04 |
| C | T3.5 data model page | done | agent/c-portal | Hand-built SVG ER diagram (no mermaid dependency), flows, storage, status and validation rules | 2026-11-04 |
| C | T3.6 settings + BYOK | done (untested live) | agent/c-portal | Save (AES-256-GCM), Test (one free provider request), Delete; admin only; reviewer read only. Not tested against real providers (no network to them here) | 2026-11-04 |
| D | T4.0 DESIGN.md (website-design:web-design-system) | done | agent/c-portal | docs/DESIGN.md + tokens in globals.css (Tailwind v4 @theme). UXKIN not connected, direction from SRS 2 section 11 | 2026-11-04 |
| D | T4.1 landing sections, bilingual toggle | done | agent/c-portal | Hero, How it works, Features, Use cases, Pricing (illustrative), Contact form to POST /api/demo-requests (Agent A builds the API), Footer. bn default, localStorage | 2026-11-04 |
| D | T4.2 VoiceOrb + hero layout | done | agent/c-portal | VoiceOrb fallback, still image if no WebGL | 2026-11-04 |
| D | T4.3 ByteMascot glb | done | agent/c-portal | 4 clips with 0.3 s crossfade, 400 ms min state, BeakOpen on all Byte_Head meshes, blink, screen waveform, desk glow, reduced motion. Draco decoder self-hosted in public/draco. Call panel wired to the real CallPanel in I-01 | 2026-11-04 |
| I | I-01 hero call panel wired | done | main | HeroCallPanel: shared useCall, MascotBridge gets mascotState + level getters, StateGate smoothing on the mascot side, ?key= / ?stt=, panel on design tokens. e2e + screenshots docs/screenshots/integration-*.png | 2026-11-04 |
| I | I-02..I-09 integration fixes | done | main | Start-call state + greeting seq 0 + ttsNormalize; one call-auth module; stale sweep wired; env lists; footer repo; feeIsFrom; agent state carries slot doctorIds and appointment ids; 503 "not configured" | 2026-11-04 |
| I | Full-flow test | done | main | tests/unit/full-flow.test.ts: real routes on PGlite + scripted mock LLM: booked, rescheduled, follow_up_needed | 2026-11-04 |

## Owner to do (blocks deploy)
- Create Supabase project (Singapore), set env in Vercel and local .env, run first migration + SQL + seed (README "Setup").
- Import repo into Vercel (functions region sin1 is set in vercel.json), add both domains, set PORTAL_HOST.
- GitHub repo variable APP_URL for the keep-alive workflow; UptimeRobot monitor every 30 min.

## Design skills
The design skills listed in SRS 2 section 11.2 were visible in the Lead's session. Each agent checks its own session; if a skill is missing, note it here and continue with SRS 3 and SRS 2 section 11 as the rules.
- C/D used: web-design-system (no UXKIN), landing-page, frontend-design, design-critique (top 3 fixed: hero desk fade, hero spacing, login eyebrow and image). ux-copy was not run separately; copy written by hand in src/lib/i18n/dictionary.ts.

## Requests to Lead
- None open. Done in integration (see DECISIONS I-01..I-09): feeIsFrom in ClinicContext (A), /turn updates last_activity_at (A for B), B's optional env vars, greeting ttsText + seq 0 + initial agent state (B), call-adapter, stale sweep and footer URL (C/D).

## Known gaps (need real keys or a real DB; owner checks on the deployed URL)
- Real providers: ElevenLabs/OpenAI/Azure STT and TTS ids and options marked (verify) in DECISIONS B-13; Gemini/OpenAI LLM ids in LLM_PRIMARY/LLM_FALLBACK.
- Real Supabase: migrations + seed, storage signed upload + download of recordings, portal login, RLS.
- Real browser audio: Web Speech bn-BD, barge-in and echo filter, mic level on Android, recording upload.
- Latency targets (NFR-2) and the 60 s function limit for finalize on Vercel.
