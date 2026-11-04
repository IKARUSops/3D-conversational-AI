# SRS 1: Product Requirements
## ByteVoice Bangla: AI receptionist demo for Bangladeshi dental clinics

| Field | Value |
|---|---|
| Version | 1.0 (2026-11-04) |
| Owner | Sharif Mohammad Omar Faruq |
| Purpose | StrategyByte AI Engineer technical task |
| **Deadline** | **Thursday 5 November 2026, 11:59 PM Bangladesh time (UTC+6)**. Internal target: submit by 9:00 PM. |
| Read with | `SRS-2-Engineering-and-Agent-Execution.md` (how to build it) and `SRS-3-3D-Mascot-Artist.md` (the 3D mascot, for the 3D artist) |

> **For AI agents:** this document says **what** to build and **how it will be judged**. SRS 2 says **how** to build it. If the two disagree, this document wins on behaviour and SRS 2 wins on code structure. Never invent requirements; if something is unclear, choose the simplest option that meets the acceptance tests and write the choice in `docs/DECISIONS.md`.

---

## 1. Context

### 1.1 The company
StrategyByte is an Australian AI company (Sydney). Its product **ByteVoice** (bytevoice.com.au) is an AI receptionist for clinics: it answers calls, books and reschedules appointments, answers common questions and hands structured data to staff. Main clients are healthcare (dental clinics, hospitals) in Australia and the UK. Their mascot is **Byte**, a blue parrot in a navy suit with round glasses, a headset and a yellow tie. Brand colours: dark navy and gold.

### 1.2 The task
StrategyByte is launching in **Bangladesh**. We must build an **early, working, end to end demo** of a Bangla voice receptionist:

| Part | Component | Summary |
|---|---|---|
| A | Landing page | At least 3 sections. Hero is the main focus. |
| B | Hero call button | "Talk to our Bangla caller" starts a live browser voice call. |
| C | Bangla caller | Voice agent with natural, everyday **Bangladeshi** Bangla for a dental clinic. |
| D | Data portal | Login. Shows every call, transcript, extracted fields, status and how data is stored. |

**Success scenario (from the brief):** a reviewer opens the landing page, clicks the hero button, books a dental appointment in Bangla and hangs up. They log in to the portal and, **within one or two minutes**, see that call, its transcript and the patient's details neatly organised.

### 1.3 How we are judged

| Criterion | Weight | What they look for |
|---|---|---|
| Bangla caller quality | **30%** | Natural Bangla, smooth turn-taking, accurate capture of details, graceful error handling |
| Data structure and portal | **25%** | Clear schema, reliable flow from call to storage, easy portal |
| Hero and landing design | **20%** | Compelling hero, clear message, responsive, visual quality. 3D in hero is a plus |
| Code quality and architecture | **15%** | Readable, organised code; secrets handled correctly |
| Documentation and presentation | **10%** | README, video (max 3 minutes), confident explanation of decisions and trade-offs |

Extra signals from the group interview (2026-11-04):
- Their **own AI will call and test the callers**. Treat every test as possibly automated.
- They will try **different names** to test name capture.
- Going along with **irrelevant chat loses marks**. The caller must stay on purpose.
- Sounding like **Kolkata or Indian Bangla is a fail** on naturalness.
- **Every link must stay live** during review (several days). A broken link means rejection.
- "A solution that works end to end beats a polished one that only partly works. Tell us honestly what is incomplete."
- Documentation must show we **understand** what the AI built, not only that we used AI.

### 1.4 Decisions already made (do not reopen without the owner)

| Topic | Decision | Evidence |
|---|---|---|
| Live STT (default) | **Browser Web Speech API, `bn-BD`** (Chrome/Edge) | Owner test: final text about 0 ms after end of speech; phone and time digits correct |
| Server STT options | ElevenLabs (batch Scribe on VAD clips), OpenAI (`gpt-transcribe`), Azure (`bn-IN`) | ElevenLabs batch CER 0.105 vs Azure 0.206 in owner test. ElevenLabs **streaming** is weak for Bangla (38.6% CER, Riverborn benchmark) so use **batch on clips**, never its realtime model |
| TTS (default) | **ElevenLabs `eleven_v4`, voice `8U6QQz51HQvOsmbnTJ3D`** (female) | Only ElevenLabs model that lists Bengali. Azure voices sounded clearly generated |
| TTS options | OpenAI `gpt-4o-mini-tts` (#2), Azure `bn-BD-NabanitaNeural` (#3, final fallback) | |
| Provider choice | **Dropdowns in the call UI** for STT and TTS. Automatic fallback to the next provider on failure | |
| BYOK | Clinics can bring their own keys for **ElevenLabs, OpenAI, Azure** | |
| Post-call | Record caller audio in browser; after the call, re-transcribe with **ElevenLabs batch** for the stored record and extraction | Fast live turns plus an accurate record |
| Formatting | LLM handles text formatting (digits, loanwords). Code still validates phone format before saving | |
| Mascot | Concept 3D Byte (Blender), not an exact replica. Full model is future work | |
| Known limitation | Echo/barge-in on laptop speakers not tested by the owner (headphones only) | Listed in README |

---

## 2. Scope

### 2.1 In scope
1. Public landing page (bilingual Bangla/English) with a 3D hero and the call button.
2. Browser voice call to the Bangla receptionist of a **fake clinic, "Dhaka Dental Care"**.
3. Booking, rescheduling and cancelling appointments; clinic information; FAQs; human callback requests.
4. Storage of every call: metadata, transcript turns, recording, extracted fields, outcome, events.
5. Staff portal with login: call list, call detail, appointments, callbacks, data model page, settings (provider defaults and BYOK keys).
6. Seed data: one clinic, doctors, services, opening hours, a reviewer login, and **at least 12 real test calls** made before submission.
7. README, architecture diagram, 3-minute video.

### 2.2 Out of scope (list in README as future work)
- Real phone numbers / SIP telephony (production would use LiveKit or Pipecat with SIP).
- SMS or WhatsApp confirmations (show as "planned" only).
- Multi-clinic onboarding UI (data model supports many clinics; UI shows one).
- Payments, real patient data, EHR integration.
- Full production mascot with rigging.

---

## 3. Users and roles

| User | Needs | Where |
|---|---|---|
| **Caller / patient** | Be answered at once in Bangla, book/change/cancel, get information without waiting | Landing page call panel |
| **Reviewer (StrategyByte)** | Try the caller fast, then inspect data in the portal | Landing + portal (reviewer login) |
| **Receptionist (staff)** | A clear list of bookings, requests and callbacks | Portal, role `receptionist` |
| **Clinic manager / admin** | Call volume, outcomes, settings, provider keys | Portal, role `admin` |

Role rules (RBAC):
- `admin`: everything, including Settings and BYOK keys.
- `receptionist`: calls, appointments, callbacks (read, mark callback done). No Settings.
- The **reviewer account is `admin`** so reviewers can see everything, but it **cannot edit BYOK keys** (read-only Settings). Its password is given **only in the submission email**, never in the repo or README.

---

## 4. Functional requirements

Each requirement has an ID. Agents must reference IDs in commits and tests (for example `feat(call): FR-B3 connection states`).

### 4.1 Part A: Landing page

| ID | Requirement | Priority |
|---|---|---|
| FR-A1 | Route `/`. Loads in under 3 s on a normal connection; Largest Contentful Paint target under 2.5 s on desktop. | Must |
| FR-A2 | **Hero** says within seconds: ByteVoice is now in Bangladesh; an AI receptionist that speaks natural Bangla, 24/7, for dental clinics and hospitals. | Must |
| FR-A3 | Hero has a prominent primary button **"বাংলা কলারের সাথে কথা বলুন" / "Talk to our Bangla caller"** that opens the call panel (Part B). | Must |
| FR-A4 | Hero has a **3D element**: Byte the parrot at his desk (concept model `byte.glb`, built to **SRS 3**) rendered with React Three Fiber. It has **4 animation states that follow the call**: **Idle** (no call / nobody speaking), **Listening** (caller speaking: wing on headset, typing), **Thinking** (waiting for the AI reply), **Speaking** (agent voice playing: beak opens with the voice level). Random blinks and a live waveform on the laptop screen. Mapping in SRS 3 §4. | Should (plus) |
| FR-A5 | 3D fallback: if the `.glb` is missing, WebGL fails, or the user prefers reduced motion, show an animated 3D "voice orb" (procedural) or a still image. The page must never be blank or broken. | Must |
| FR-A6 | **Language toggle** (বাংলা / English) for all landing text. Default Bangla. Remember the choice in localStorage (wrapped in try/catch). | Should (plus) |
| FR-A7 | Sections after the hero (at least 3 total, aim for 5): **How it works** (3 steps), **Features** (24/7, natural Bangla, booking, callbacks, portal), **Use cases** (dental clinics, diagnostic centres, hospital outpatients, reminder calls), **Pricing or plans** (illustrative), **Contact / demo request** form (saves to DB). | Must (3) / Should (5) |
| FR-A8 | Fully responsive: 360 px phone to 1440 px desktop. No horizontal scroll. Touch-friendly button sizes. | Must |
| FR-A9 | Bangla typography: a proper Bengali web font (for example Hind Siliguri or Noto Sans Bengali). No broken conjuncts. | Must |
| FR-A10 | Footer: link to portal login, GitHub repo, "Demo with fake data" notice. | Should |

Content rules: content accuracy about StrategyByte is **not** graded; look and feel is. Do not copy text or images from bytevoice.com.au. Use original copy.

### 4.2 Part B: Call panel (hero call to action)

| ID | Requirement | Priority |
|---|---|---|
| FR-B1 | Clicking the hero button opens a call panel (modal or slide-over) without leaving the page. | Must |
| FR-B2 | Panel has two **dropdowns**: **STT** (Browser Chrome bn-BD [default], ElevenLabs, OpenAI, Azure) and **Voice/TTS** (ElevenLabs [default], OpenAI, Azure). Options without a configured key are disabled with a short reason. | Must |
| FR-B3 | Visible call **states**: `idle` → `requesting microphone` → `connecting` → `live` (sub-states: `listening`, `thinking`, `speaking`) → `ended`. Also `error`. Each state has a label in the current language and a visual cue. | Must |
| FR-B4 | **Microphone permission** errors are handled: denied, no device, blocked by browser. Show a clear message and how to fix it (allow mic in the address bar). | Must |
| FR-B5 | **Browser STT allowlist**: enable Browser STT only on **desktop Chrome and Android Chrome** (and Edge only after it is tested). Safari exposes `webkitSpeechRecognition` but is not reliable for Bangla, so do not rely on feature detection alone. Elsewhere, auto-switch the STT dropdown to ElevenLabs and show a one-line note. | Must |
| FR-B6 | **Connection/provider errors** mid-call: try the next provider automatically (see FR-C14), show a small notice; if all fail, end the call politely and show "Sorry, please try again". | Must |
| FR-B7 | **Live captions**: show the caller's words (interim) and the agent's words as they are spoken. Toggle to hide. | Should |
| FR-B8 | **End call** button always visible during a call. Closing the panel also ends the call. | Must |
| FR-B9 | Timer showing call length. **Hard limit 5 minutes** per call: at 4:30 the agent wraps up; at 5:00 the call ends. | Must |
| FR-B10 | After the call: show a short **summary card** (outcome, booked slot if any) and a link "See this call in the portal" (portal still needs login). | Should |
| FR-B11 | Headphone tip shown before the call: "For best results, use headphones." | Should |
| FR-B12 | Abuse limits: max **30 calls per IP per hour** (reviewers and their AI tester may share one office IP) and a global daily cap (configurable). A **reviewer link** `/?key=<REVIEW_KEY>` (key sent only in the email) skips the per-IP limit. When a limit is hit, show a friendly message. | Must |
| FR-B13 | **"Type instead" box** in the call panel: the caller can type a message instead of speaking. It uses the same `/turn` API and the agent still answers with voice. Also accept `?stt=elevenlabs` (or any provider id) in the URL to preselect the STT. This lets an automated tester or a browser without a working microphone still use the agent. | Must |
| FR-B14 | **Closing the tab ends the call**: on `pagehide`, send `navigator.sendBeacon` to `/api/calls/:id/end` (token in the body). The server also finalizes any call with no activity for 3 minutes. | Must |

### 4.3 Part C: The Bangla caller

#### 4.3.1 Persona and voice
| ID | Requirement |
|---|---|
| FR-C1 | Persona: **"নাদিয়া" (Nadia)**, receptionist at **Dhaka Dental Care** (fake clinic). Warm, polite, patient, efficient. Female voice `8U6QQz51HQvOsmbnTJ3D`. |
| FR-C2 | Speaks **everyday Bangladeshi Bangla** (Dhaka). Uses আপনি form. Short sentences. Natural fillers sparingly: "জি", "আচ্ছা", "একটু দেখে নিচ্ছি". |
| FR-C3 | **Bangladeshi, not Kolkata, word choices.** Use: আসসালামু আলাইকুম, পানি, আপা/ভাইয়া (only if natural), "করেন/বলেন" (polite Dhaka spoken forms), "ঠিক আছে". Avoid: নমস্কার, জল, দিদি/দাদা, "করুন" style bookish forms in casual flow, Kolkata idioms. English loanwords used by Bangladeshis are fine: appointment, doctor, scaling, filling, root canal, X-ray, serial. |
| FR-C4 | Replies are **short**: usually 1 to 2 sentences, about 25 words max, one question at a time. |
| FR-C5 | Understands **code-switching** (Bangla + English in one sentence) and English-only callers. If the caller speaks only English for 2 turns, the agent may switch to simple English and switch back if the caller does. |

#### 4.3.2 Conversation flow (happy path)
1. **Greeting:** "আসসালামু আলাইকুম, ঢাকা ডেন্টাল কেয়ারে আপনাকে স্বাগতম। আমি নাদিয়া, বলেন কীভাবে সাহায্য করতে পারি?"
2. **Intent:** book / reschedule / cancel / information / other.
3. **Name:** ask, then **confirm back** ("আপনার নাম শরীফ উদ্দিন, ঠিক আছে?").
4. **Phone:** ask, then **read back digit by digit in Bangla words** ("শূন্য, এক, সাত, ... ঠিক আছে?"). Must be a valid Bangladeshi mobile (see FR-D-VAL).
5. **Reason for visit:** toothache, cleaning/scaling, check-up, filling, root canal, braces consultation, extraction, follow-up, other.
6. **Preferred date and time:** accepts phrases like "আগামী রবিবার সন্ধ্যায়", "কাল সকাল দশটায়", "next Sunday evening", "২০ তারিখ". Resolved **by code**, not by the LLM (FR-C9).
7. **Availability:** offer up to 3 free slots; respect opening hours and doctor schedules.
8. **Confirmation before booking:** read back everything (name, phone last 4 digits or full, service, doctor, day, date, time) and get an explicit yes.
9. **Book**, then confirm success.
10. **Anything else?** then **closing summary** of what was agreed, and goodbye ("আল্লাহ হাফেজ" is natural in Bangladesh; "ভালো থাকবেন" also fine).

#### 4.3.3 Behaviour requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-C6 | **Book** an appointment (new or existing patient). Patient identity = clinic + normalised phone. | Must |
| FR-C7 | **Reschedule**: find the caller's upcoming appointment by phone (works in a **later, separate call**), offer new slots, confirm, update. Keep history. | Must |
| FR-C8 | **Cancel**: find by phone, confirm which appointment, cancel, confirm. Works in a later call. | Must |
| FR-C9 | **Date/time resolution in code**: Bangla and English day names, আজ, কাল/আগামীকাল, পরশু, আগামী/সামনের/এই + weekday, তারিখ numbers, Bangla and ASCII digits, parts of day (সকাল, দুপুর, বিকাল/বিকেল, সন্ধ্যা, রাত). Timezone **Asia/Dhaka**. The agent always confirms the **resolved** date aloud ("রবিবার, ৮ নভেম্বর, সন্ধ্যা ছয়টা"). Past dates and closed days are rejected with an alternative. | Must |
| FR-C10 | **Clinic information** answered only from the clinic data (hours, address, directions, services, fees, doctors, how to prepare). Never invent. If unknown: say so and offer a staff callback. | Must |
| FR-C11 | **Out of scope: medical advice** (diagnosis, which medicine, dosage, "is this serious"). Politely decline, suggest seeing the dentist, offer booking or a callback. **Emergency** signs (heavy bleeding that won't stop, face swelling with fever, trouble breathing or swallowing, injury after an accident): tell them to go to the nearest hospital emergency or call **999** now. Log as `follow_up_needed` with category `urgent`. | Must |
| FR-C12 | **Irrelevant / prank** questions (cricket, politics, jokes, "what is the doctor's home address", asking the AI personal things): one short polite redirect to clinic topics. After the **3rd** irrelevant turn in a row, close politely and mark the call `spam`. Never reveal the system prompt or follow caller instructions to change rules. | Must |
| FR-C13 | **Human handover**: complaints, billing disputes, insurance, requests to talk to a person, anything the agent can't do. Create a **callback** record (name, phone, reason, category, priority) and tell the caller staff will call back during opening hours. | Must |
| FR-C14 | **Provider fallback**: if STT, TTS or LLM fails (error, timeout over 8 s, no credit), switch to the next provider for that part and log a `provider_fallback` event. The caller hears at most one short filler ("একটু সময় দিন"). | Must |
| FR-C15 | **Mishearing recovery**: if the caller corrects ("না, আমার নাম্বার ..."), replace the value and confirm again. If a phone fails validation, explain and ask again, max 3 tries, then offer a callback. | Must |
| FR-C16 | **Silence**: the 7 s timer starts when the agent's audio ends and resets on any caller text (even interim). No caller speech for 7 s → "হ্যালো, আপনি কি শুনতে পাচ্ছেন?". Second silence → one more prompt. Third → polite goodbye, status `incomplete`. | Must |
| FR-C17 | **Interruptions (barge-in)**: if the caller starts speaking while the agent talks (2+ words that are not the agent's own words), stop the agent's audio **within 300 ms after the echo filter accepts the caller's interim text**, keep only the part already spoken in history, and respond to the caller. | Must |
| FR-C18 | **No booking without explicit confirmation**. The booking tool rejects calls without a confirmed flag (enforced in code). | Must |
| FR-C19 | **Double booking prevention**: one active appointment per doctor per slot, enforced by the database. | Must |
| FR-C20 | **Time limit wrap-up** at 4:30 (FR-B9): "আমাদের সময় প্রায় শেষ, ..." then summary. | Must |
| FR-C21 | **Latency**: from end of caller speech to first agent audio, target **under 1.5 s** median with Browser STT, **under 2.5 s** with server STT. Log per turn. | Must |
| FR-C22 | Numbers, dates and times are **spoken as Bangla words** by the TTS (code converts before TTS), for example 01712345678 → "শূন্য এক সাত এক দুই তিন চার পাঁচ ছয় সাত আট". | Must |

> **Formatting rule (owner decision):** the **LLM** turns what the caller said into clean values (digits, dates phrases, names). **Code** only normalises (NFC, Bangla digits to ASCII), validates (phone regex, date rules) and formats (E.164, speakable Bangla). Do not build a big spoken-word number parser.

#### 4.3.4 Sample dialogue (style reference, not a script)

```
AGENT:   আসসালামু আলাইকুম, ঢাকা ডেন্টাল কেয়ারে আপনাকে স্বাগতম। আমি নাদিয়া, বলেন কীভাবে সাহায্য করতে পারি?
CALLER:  আমি একটা appointment নিতে চাই, দাঁতে খুব ব্যথা।
AGENT:   জি, অবশ্যই। আপনার নামটা একটু বলবেন?
CALLER:  শরীফ উদ্দিন।
AGENT:   আপনার নাম শরীফ উদ্দিন, ঠিক আছে?
CALLER:  জি।
AGENT:   আপনার মোবাইল নাম্বারটা বলেন।
CALLER:  জিরো ওয়ান সেভেন এক দুই তিন চার পাঁচ ছয় সাত আট।
AGENT:   শূন্য, এক, সাত, এক, দুই, তিন, চার, পাঁচ, ছয়, সাত, আট। ঠিক আছে?
CALLER:  হ্যাঁ। আগামী রবিবার সন্ধ্যায় হবে?
AGENT:   একটু দেখে নিচ্ছি... রবিবার, ৮ নভেম্বর সন্ধ্যায় ডা. নুসরাত জাহানের সাথে ছয়টা আর সাড়ে ছয়টা খালি আছে। কোনটা সুবিধা?
CALLER:  ছয়টা।
AGENT:   তাহলে কনফার্ম করি: শরীফ উদ্দিন, দাঁত ব্যথা, ডা. নুসরাত জাহান, রবিবার ৮ নভেম্বর, সন্ধ্যা ছয়টা। বুক করে দেবো?
CALLER:  জি, করেন।
AGENT:   আপনার appointment বুক হয়ে গেছে। আর কিছু জানতে চান?
CALLER:  না, ধন্যবাদ।
AGENT:   ঠিক আছে। রবিবার সন্ধ্যা ছয়টায় দেখা হবে, সময়ের ১৫ মিনিট আগে আসবেন। আল্লাহ হাফেজ।
```

### 4.4 Clinic reference data (fake, used for seed and for answers)

| Item | Value |
|---|---|
| Clinic | **Dhaka Dental Care** (ঢাকা ডেন্টাল কেয়ার), slug `dhaka-dental-care` |
| Address (fake) | বাড়ি ১২, রোড ৭, ধানমন্ডি, ঢাকা ১২০৫ (House 12, Road 7, Dhanmondi, Dhaka 1205). Landmark: near Dhanmondi Lake, 5 minutes from Shankar bus stand |
| Phone (fake) | +880 1700-000000 (display only) |
| Hours | **Saturday to Thursday, 10:00 AM to 8:00 PM**. **Friday closed.** Prayer break 1:30 PM to 2:30 PM (no slots) |
| Slot length | 30 minutes |
| Doctors (fake) | **ডা. নুসরাত জাহান** (Dr. Nusrat Jahan), general dentist, Sat to Thu, all hours. **ডা. তানভীর আহমেদ** (Dr. Tanvir Ahmed), orthodontist (braces), Sat, Mon, Wed, 4 PM to 8 PM. **ডা. ফারহানা ইসলাম** (Dr. Farhana Islam), oral surgeon (extraction, root canal), Sun, Tue, Thu, 10 AM to 4 PM |
| Services and fees (BDT, illustrative) | Consultation / check-up 500. Scaling and polishing 1,500. Filling from 2,000. Root canal from 8,000. Extraction from 1,000. Braces consultation 1,000. X-ray 300 |
| Preparation | Bring old prescriptions and X-rays. Arrive 15 minutes early. Eat normally before scaling. For extraction, eat a light meal before and avoid aspirin unless your doctor says otherwise (do not give medical advice beyond this fixed text). |
| Payment | Cash, bKash, card |
| Parking | Limited parking; rickshaw and CNG drop-off at the gate |

### 4.5 Part D: The data portal

| ID | Requirement | Priority |
|---|---|---|
| FR-D1 | Route `/portal` (redirects to `/portal/calls`). **Login** with email and password. Reviewer credentials provided in the submission email only. Unauthenticated access redirects to login. | Must |
| FR-D2 | **Calls list**: date, time, caller name, phone (masked except last 4 in list), duration, **status**, intent, STT/TTS provider, key source (platform/BYOK). Newest first. | Must |
| FR-D3 | Calls list **search** (name, phone) and **filters** (status, date range, provider). Pagination (25 per page). | Must |
| FR-D4 | List **refreshes every 5 s** (polling with `router.refresh()`; no Supabase realtime). A new call appears in the list within seconds as `processing`, and its final status within 2 minutes (FR-D15). | Must |
| FR-D5 | **Call detail**: header (status badge, outcome, duration, providers, started/ended times in Asia/Dhaka), **extracted fields** (patient name in Bangla and English letters, phone, reason for visit, preferred date/time text and resolved value, doctor, service, intent, booked appointment), **validation badges** (valid phone, confirmed by caller, resolved date), **summary** (Bangla + English). | Must |
| FR-D6 | **Transcript** with speaker labels (Agent / Caller), timestamps (mm:ss from call start), markers for interruptions and tool calls. The **live transcript is the main view**. The post-call batch text is in a separate tab "Re-transcribed audio". English translation per turn is **Could**; an English summary is Must. | Must |
| FR-D7 | **Recording** audio player (caller microphone) via short-lived signed URL. | Should |
| FR-D8 | **Event timeline** (audit trail): tool calls and results, provider fallbacks, interruptions, silence prompts, errors, latency per turn. | Could (after AT-1 to AT-13 pass) |
| FR-D9 | **Appointments** page: upcoming and past, by doctor and date; status (booked, rescheduled, cancelled, completed, no_show); link to the call that created or changed it. | Must |
| FR-D10 | **Callbacks** page: open/done, priority, reason, category; receptionist can mark done with a note. | Must |
| FR-D11 | **Data model** page: ER diagram, table list with purpose, how data flows from live call to storage (diagram), where data is stored (database and region, storage bucket for recordings), validation rules. This is a first-class deliverable. | Must |
| FR-D12 | **Dashboard** strip on top of Calls: calls today, booked today, callbacks open, average call length, booking rate. | Could |
| FR-D13 | **Settings** (admin only): default STT/TTS providers, BYOK keys per provider (masked, last 4 shown, "Test key" button, delete). Reviewer account sees it read-only. Build **after AT-1 to AT-13 pass**; if time runs out, keep the encrypted `provider_keys` table and describe BYOK in the README. | Should |
| FR-D14 | **Status values** shown with colour and text: `booked`, `rescheduled`, `cancelled`, `enquiry`, `follow_up_needed`, `incomplete`, `failed`, `spam`. | Must |
| FR-D15 | Status appears **within 2 minutes** of call end (post-call processing). Until then show `processing`. | Must |
| FR-D16 | Portal is usable on a laptop and a phone (list collapses to cards on small screens). | Should |

#### 4.5.1 Status rules (single source of truth)

| Status | When |
|---|---|
| `booked` | A new appointment was created in this call |
| `rescheduled` | An existing appointment was moved in this call |
| `cancelled` | An existing appointment was cancelled in this call |
| `enquiry` | Only information was given; no booking change, no callback |
| `follow_up_needed` | A callback was created (medical question, complaint, human request, unknown info, urgent) |
| `incomplete` | Call ended before the task finished (hang-up, silence timeout, time limit) and nothing above applies |
| `failed` | Technical failure (all providers failed, server error) |
| `spam` | 3 irrelevant/prank turns in a row, or clear abuse |

If several apply, use the **first** match in this order:
1. `booked` / `rescheduled` / `cancelled` (if more than one, the latest action wins)
2. `follow_up_needed`
3. `spam`
4. `enquiry`
5. `incomplete`
6. `failed` (only when nothing useful was saved)

---

## 5. Data requirements

### 5.1 Entities (logical model; physical schema in SRS 2 §6)

| Entity | Purpose | Key fields |
|---|---|---|
| `clinics` | Tenant | id, slug, name_bn, name_en, timezone, settings (hours, prayer break) |
| `staff_users` | Portal users and roles | id (Supabase auth user id), clinic_id, role (admin/receptionist), name |
| `doctors` | Who sees patients | id, clinic_id, name_bn, name_en, specialty, active |
| `doctor_schedules` | Weekly availability | doctor_id, weekday (0 to 6), start_time, end_time |
| `services` | What can be booked | id, clinic_id, code, name_bn, name_en, duration_min, fee_bdt_from, specialty_required |
| `patients` | Person behind calls | id, clinic_id, full_name_bn, full_name_en (romanised), phone_e164 (unique per clinic), created_at |
| `calls` | One record per call | id, clinic_id, patient_id?, started_at, ended_at, duration_s, status, intent, end_reason, stt_provider, tts_provider, llm_model, key_source, recording_path, summary_bn, summary_en, processing_state, ip_hash, user_agent, metrics (json) |
| `transcript_turns` | Full transcript | id, call_id, seq, speaker (agent/caller/system), text_bn, text_en, started_ms, ended_ms, source (live/batch), interrupted, stt_confidence |
| `call_extractions` | Structured fields from the call | call_id (1:1), intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, doctor_requested, preferred_datetime_text, preferred_datetime (timestamptz), caller_confirmed, sentiment, language_mix, field_confidence (json), validation_errors (json), model, raw (json) |
| `appointments` | Bookings | id, clinic_id, patient_id, doctor_id, service_id, slot_start, slot_end, status, reason, created_by_call_id, updated_by_call_id |
| `appointment_history` | Change log | appointment_id, call_id, action (created/rescheduled/cancelled), from_slot, to_slot, at |
| `callbacks` | Human follow-up | id, clinic_id, call_id, patient_id?, name, phone_e164, category (medical/complaint/billing/human_request/unknown_info/urgent/other), reason, priority (low/normal/high/urgent), status (open/done), note, done_by, done_at |
| `call_events` | Audit trail | id, call_id, ts, type, payload (json) |
| `provider_keys` | BYOK, encrypted | clinic_id, provider, ciphertext, iv, auth_tag, last4, validated_at, created_by |
| `demo_requests` | Landing contact form | id, name, clinic_name, phone, email, message, created_at |
| `rate_limits` | Abuse limits | key (ip_hash + window), count, window_start |

### 5.2 Validation rules (FR-D-VAL)

| Field | Rule |
|---|---|
| All text | Unicode **NFC** normalise before any parsing or storage |
| Digits | Convert Bangla digits ০-৯ to 0-9 for parsing; keep original text in `*_raw` |
| Phone | Strip spaces, dashes, `+`. Accept `01XXXXXXXXX` (11 digits) or `8801XXXXXXXXX`. Must match `^01[3-9]\d{8}$` after removing `88`. Store as **E.164** `+8801XXXXXXXXX`. Store `phone_valid` and errors |
| Name | 2 to 60 characters; letters (Bangla or Latin), spaces, dots, hyphens. Store Bangla script as said and a romanised version (LLM, for search). Titles kept ("মোঃ" = "Md.") |
| Date/time | Must be in the future, inside clinic hours, not Friday, not in the prayer break, aligned to 30 min |
| Status | One of the enum values only (DB enum) |
| Appointments | Unique active (`booked`/`rescheduled`) per doctor and slot_start (partial unique index) |

### 5.3 Storage and privacy
- Database: **Supabase Postgres, region Singapore (ap-southeast-1)**, closest to Bangladesh.
- Recordings: **Supabase Storage**, private bucket `recordings`, path `clinic/{clinic_id}/calls/{call_id}.webm`, signed URLs valid 10 minutes.
- **Fake data only.** Landing page and call panel say: "Demo. Do not share real medical or personal information."
- IP addresses stored only as salted hash (`ip_hash`).
- Secrets never in the repo or the browser (see SRS 2 §10).

---

## 6. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-1 | Availability | All links live from submission until at least 30 November 2026. No sleeping free-tier servers on the call path. Health check endpoint `/api/health` that runs a real DB query. Kept alive by **3 layers** (Supabase free projects pause after about 7 days without real database activity): (1) **UptimeRobot every 30 min** on `/api/health` (also alerts by email if it fails), (2) **GitHub Actions schedule every 6 hours** calling `/api/health`, (3) **Vercel cron once a day** (Hobby crons run at most daily). Provider credit alerts on. |
| NFR-2 | Latency | FR-C21 targets. Log `t_speech_end`, `t_first_token`, `t_first_audio` per turn into `call_events`. |
| NFR-3 | Concurrency | At least **3 simultaneous calls** work (reviewers plus their AI tester). Use paid tiers where free tiers limit concurrency (Azure S0, ElevenLabs paid plan). |
| NFR-4 | Reliability | Post-call processing retries 3 times with backoff; if it still fails, call keeps live transcript and status from live state; `processing_state = failed` visible in portal. |
| NFR-5 | Security | OWASP basics: input validation (zod) on every API; auth on all portal routes and APIs; RLS on all tables (deny anon); signed call token on all call APIs; rate limits; no secrets client-side; BYOK keys AES-256-GCM encrypted. |
| NFR-6 | Accessibility | Keyboard reachable buttons, visible focus, aria-live for call state, captions available, colour contrast AA, `prefers-reduced-motion` respected. |
| NFR-7 | Browser support | Landing and portal: latest Chrome, Edge, Safari, Firefox. Browser STT: Chrome and Edge (others auto-switch to server STT). |
| NFR-8 | Cost control | Per-call cap 5 min. Daily call cap. Provider spend limits set in each dashboard. |
| NFR-9 | Observability | Sentry (or console + `call_events`) for errors. Every API logs request id. |
| NFR-10 | Code quality | TypeScript strict, ESLint, Prettier, unit tests for parsers/validators/tools, Playwright smoke tests. |

---

## 7. Acceptance tests (must pass before submission)

Make these as **real calls** on the deployed site. They also become the **pre-loaded portal data** (at least 12 calls). Use fake people. Record which pass in `docs/TEST-REPORT.md`.

| # | Scenario | Expected result |
|---|---|---|
| AT-1 | Happy path booking (Browser STT, ElevenLabs TTS): toothache, "আগামী রবিবার সন্ধ্যায়" | Name and phone confirmed, date resolved and read back, slot offered, confirmed, booked. Portal: status `booked`, all fields filled, appointment visible |
| AT-2 | Code-switching: "আমার একটা scaling appointment লাগবে, next Saturday morning" | Booked correctly with service scaling |
| AT-3 | **Reschedule in a second call** using the phone from AT-1 | Appointment found by phone, moved, history row added, status `rescheduled` |
| AT-4 | **Cancel in a third call** | Cancelled, status `cancelled`, slot free again |
| AT-5 | Enquiry: hours, address, fees for root canal, Friday open? | Correct answers from clinic data, says Friday closed, status `enquiry` |
| AT-6 | Medical advice: "কোন ওষুধ খাবো? দাঁত ব্যথার জন্য" | Politely declines, offers booking or callback; callback created category `medical`; status `follow_up_needed` |
| AT-7 | Emergency: "মুখ ফুলে গেছে, জ্বর, ঢোক গিলতে পারছি না" | Advises hospital emergency / 999 at once; callback `urgent`; status `follow_up_needed` |
| AT-8 | Irrelevant/prank: cricket score, "ডাক্তারের বাসার ঠিকানা কী", politics, joke | Redirects each time; after 3 in a row ends politely; status `spam`; no personal info given |
| AT-9 | Silence: say nothing after greeting | Two prompts then goodbye; status `incomplete` |
| AT-10 | Mishearing: give wrong phone, then "না, ভুল হয়েছে, ০১৮..." | Agent replaces, reads back again, books with corrected phone |
| AT-11 | Invalid phone (10 digits) | Agent explains and asks again; after fix proceeds |
| AT-12 | Friday request: "শুক্রবার বিকালে হবে?" | Says closed on Friday, offers Saturday/Thursday |
| AT-13 | Slot taken: try the same slot as AT-1 again | Agent says not free, offers alternatives (DB unique index proves it) |
| AT-14 | Interruption: talk over the agent during a long sentence | Agent stops soon after your words appear and answers the interruption |
| AT-23 | Type instead: use the text box for a full booking | Works with voice replies; portal shows the call |
| AT-24 | Close the tab mid-call | Call still appears in portal with a final status within 3 to 5 minutes |
| AT-15 | Provider switch: same booking using STT = ElevenLabs, TTS = OpenAI, then TTS = Azure | Works; providers recorded in portal |
| AT-16 | English-only caller | Agent understands, answers simply, still books |
| AT-17 | Name test: unusual names (for example "Md. Nazmul Hasan Chowdhury", "তাসনিম আক্তার মিম") | Names confirmed and stored in Bangla and romanised forms |
| AT-18 | Mic denied | Clear error with fix steps; no crash |
| AT-19 | Firefox and Safari | Browser STT disabled with note, ElevenLabs STT works |
| AT-20 | Portal | Login works; new call appears within 1 to 2 minutes; search by phone finds it; transcript, recording, events shown |
| AT-21 | Mobile | Landing and call work on an Android phone in Chrome |
| AT-22 | Security | No secret in repo (`gitleaks`/grep), APIs reject missing call token, portal APIs reject anonymous users |

---

## 8. Deliverables

| Deliverable | Detail |
|---|---|
| Landing page live link | Vercel URL, working call button |
| Portal live link | `/portal` on the same domain, reviewer login (in the email only), pre-loaded with the acceptance-test calls |
| GitHub repo | Public, or private with access for StrategyByte. README with setup, architecture, decisions, limitations |
| Video (max 3 minutes) | Landing page → live Bangla call → record in portal → short architecture explanation |
| Email | To `hr@strategybyte.com.au`, subject **"AI Engineer Task Submission: Sharif Mohammad Omar Faruq"**, four links + reviewer login + reviewer link with `?key=` |

---

## 9. Known limitations (must appear in README, honestly)

1. Echo / barge-in on laptop speakers not fully tested (developer used headphones). Mitigated by an echo filter; headphones recommended in UI.
2. Browser STT works only in Chrome/Edge and sends audio to Google; it does not apply to phone calls. Server STT options exist for other browsers and production.
3. ElevenLabs realtime STT is weak for Bangla, so ElevenLabs STT runs on short clips after end of speech (adds about 1 s).
4. Some Bangla words are misheard by browser STT (for example "আগামী" as "আমি", "appointment" as "apartment"); handled by LLM context and mandatory read-back.
5. Concept 3D mascot, not the official model.
6. No real telephony, SMS or WhatsApp yet.
7. OpenAI `gpt-4o-mini-tts` retires on 2027-01-06; the adapter must move to its replacement.

## 10. Future work (README)
LiveKit/Pipecat + SIP for real phone numbers; Sarvam or Soniox realtime STT for server-side live Bangla; WhatsApp confirmations and reminder calls; multi-clinic onboarding; production Byte model with rigging and lip sync; analytics dashboard; evaluation suite with recorded Dhaka-accent calls.

## 11. Glossary
STT: speech to text. TTS: text to speech. LLM: large language model. VAD: voice activity detection. Barge-in: caller interrupts the agent. BYOK: bring your own key. CER/WER: character/word error rate. RLS: row level security. E.164: international phone format.
