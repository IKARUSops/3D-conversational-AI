# ByteVoice Bangla: design system

Single source for colours, type, spacing, shape and components. Code uses the token names
(CSS variables in `src/app/globals.css`, mapped to the Tailwind v4 theme). No raw hex values
in components.

Source of the direction: the brief (navy #0B1B3F, gold #F5B700, glass chips like the ByteVoice
brand) and the product: a receptionist that must feel trustworthy (clinics, patients) and warm
(Bangla voice, a friendly parrot). The UXKIN library was not connected in this session, so the
direction is not based on a comparison of real sites; it follows SRS 2 section 11 and the rules
of the `web-design-system` skill. Nothing is copied from bytevoice.com.au.

## 1. Direction

- **Trustworthy:** deep navy surfaces, calm type, generous spacing, clear status colours.
- **Warm:** one gold accent used sparingly (primary actions, the waveform, highlights), warm
  off-white in light mode instead of cold grey.
- **Premium tech:** glass only where it means something (the floating chips around the mascot,
  the call panel, the price card that is recommended). Everything else is a solid surface.
- **Bangla first:** Hind Siliguri carries every Bangla string; Inter handles Latin and numbers in
  tables. Bangla needs more line height (1.6 to 1.75 for body).
- **Two contexts:**
  - Landing (`/`): always the dark brand theme (`data-theme="dark"` on the page wrapper).
  - Portal (`/portal`): light by default for long reading sessions, dark when the system asks
    or the user toggles (stored in localStorage). Same tokens, two value sets.

Avoid: purple/blue gradients, gradient text, glass on every card, three identical cards in a
row with emoji icons, everything centred.

## 2. Colour

### 2.1 Brand scales (raw values live only in globals.css)

| Token | Value | Role |
|---|---|---|
| `navy-950` | #060F26 | deepest background, footer |
| `navy-900` | #0B1B3F | brand navy, landing background |
| `navy-800` | #12275A | raised dark surface |
| `navy-700` | #1C3673 | borders and hover on dark |
| `navy-500` | #3D5A9E | muted icons on dark |
| `gold-600` | #D49A00 | gold hover on light surfaces, gold text on light |
| `gold-500` | #F5B700 | brand gold: primary button, waveform, focus ring on dark |
| `gold-300` | #FFD866 | gold text on navy (small sizes) |
| `gold-100` | #FFF3CC | gold tint background on light |
| `sand-50` | #FBF8F2 | light page background (warm) |
| `ink-900` | #0E1726 | text on light |

### 2.2 Semantic tokens (use these in components)

| Token (Tailwind name) | Light | Dark | Role |
|---|---|---|---|
| `bg` | sand-50 | navy-900 | page background |
| `surface` | #FFFFFF | navy-800 | cards, tables, inputs |
| `surface-2` | #F3EEE3 | #0F2250 | table header, sidebar, quiet blocks |
| `glass` | white 70% | white 6% | glass chips and panels (with backdrop blur) |
| `border` | #E4DCCB | white 10% | dividers, card borders |
| `border-strong` | #8F8470 | white 40% | inputs, secondary buttons (3:1, WCAG 1.4.11) |
| `fg` | ink-900 | #F4F6FB | main text |
| `fg-muted` | #4B5567 | #B5C0D8 | secondary text (AA on bg and surface) |
| `fg-subtle` | #5C6577 | #8C9AB8 | captions, timestamps (AA 4.5:1 on every surface) |
| `primary` | gold-500 | gold-500 | primary button background |
| `primary-hover` | gold-600 | gold-300 | primary hover |
| `on-primary` | navy-900 | navy-900 | text on gold (contrast 9.6:1) |
| `accent-fg` | #8A6300 | gold-300 | gold-coloured text and links |
| `link` | #1C3673 | gold-300 | links in body text |
| `focus` | navy-700 | gold-500 | 2 px focus ring, 2 px offset |
| `success` | #137A4B | #4ADE9B | success text/icons |
| `warning` | #9A5B00 | #FFC266 | warnings |
| `danger` | #B42318 | #FF8A80 | errors, destructive buttons |
| `info` | #1F5FBF | #8CB8FF | information |

### 2.3 Call states (mascot, orb, call panel)

| State | Token | Value (both themes) | Cue |
|---|---|---|---|
| idle | `state-idle` | #8C9AB8 | grey ring, slow breathing |
| listening | `state-listening` | #2BC4A9 | teal ring, caller waveform |
| thinking | `state-thinking` | #FFC24D | amber, moving dots, desk glow pulse |
| speaking | `state-speaking` | #F5B700 | gold, agent waveform, beak opens |
| error | `state-error` | #FF6B5E | red ring, message with fix |

### 2.4 Call status badges (FR-D14)

Badge = dot + text, never colour alone. Each status has `status-<name>-bg` and
`status-<name>-fg`.

| Status | Hue | Light bg / fg | Dark bg / fg | Meaning |
|---|---|---|---|---|
| processing | blue grey | #E8EDF7 / #344563 | #1E2F57 / #B9C7E6 | post-call work running (dot pulses) |
| booked | green | #DDF5E8 / #0F6B40 | #0E3A2A / #6EE7A8 | new appointment |
| rescheduled | blue | #DFEBFF / #1D4E9E | #15305F / #9CC1FF | moved appointment |
| cancelled | slate | #ECEDEF / #4A5160 | #2A3346 / #C8CFDC | appointment cancelled |
| enquiry | teal | #DAF4F1 / #0D6159 | #0E3936 / #6FE0D0 | information only |
| follow_up_needed | gold | #FFF1C7 / #7A5200 | #3D300A / #FFD866 | staff must call back |
| incomplete | orange | #FFE8D6 / #8A3D00 | #40250F / #FFB27A | ended before the task finished |
| failed | red | #FDE2E0 / #A11D12 | #461A1A / #FF9A90 | technical failure |
| spam | magenta | #F8E1F0 / #8A1F65 | #3D1733 / #F59AD6 | prank or abuse |

Priority (callbacks) reuses: low = cancelled, normal = rescheduled, high = incomplete,
urgent = failed. Appointment status: booked, rescheduled, cancelled reuse the call colours;
completed = enquiry; no_show = incomplete.

## 3. Typography

- Families: **Hind Siliguri** (400, 500, 600, 700; Bengali + Latin subsets) as `--font-bangla`,
  **Inter** (variable) as `--font-latin`. Stack: `font-sans` = Hind Siliguri, Inter, system.
  Tables and numbers in the portal use `font-latin` with `tabular-nums`.
- Loaded with `next/font/google` (self-hosted at build, `display: swap`).

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | clamp(2.25rem, 5vw, 3.75rem) / 1.15 | 700 | hero headline |
| `h1` | 2rem / 1.25 | 700 | page titles, section titles |
| `h2` | 1.5rem / 1.3 | 600 | section titles in portal, card titles on landing |
| `h3` | 1.125rem / 1.4 | 600 | card titles |
| `body-lg` | 1.125rem / 1.75 | 400 | hero sub, lead text |
| `body` | 1rem / 1.7 | 400 | default |
| `sm` | 0.875rem / 1.55 | 400/500 | tables, labels |
| `xs` | 0.75rem / 1.4 | 500 | badges, captions, overlines |

Body lines max 65 characters (`max-w-prose`). Never letter-space Bangla.

## 4. Spacing and layout

- 4 px base. Use Tailwind steps 1, 2, 3, 4, 6, 8, 12, 16, 24.
- Content width: landing `max-w-6xl` (1152 px) with `px-4 sm:px-6 lg:px-8`; portal content
  `max-w-7xl`.
- Section spacing on landing: `py-20 md:py-28`. Card padding: 20 to 24 px.
- Portal: sidebar 240 px on `lg`, top bar with menu on smaller screens. Tables become cards
  below `md` (FR-D16).

## 5. Shape and depth

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 8 px | badges, inputs |
| `radius-md` | 12 px | buttons, small cards |
| `radius-lg` | 20 px | cards, panels |
| `radius-full` | 999 px | pills, chips, CTA |
| `shadow-card` | 0 1px 2px navy/6%, 0 8px 24px navy/6% | cards on light |
| `shadow-glow` | 0 10px 40px gold/25% | primary CTA hover, recommended price card |

Glass: `bg-glass` + `backdrop-blur-md` + `border border-white/10`. Only for hero chips, the
call panel and one highlighted card.

## 6. Components

- **Button primary:** gold bg, navy text, `radius-full` on landing / `radius-md` in portal,
  min height 44 px. Hover: `primary-hover` + glow. Focus: 2 px `focus` ring with offset.
  Disabled: 50% opacity, no glow, `cursor-not-allowed`.
- **Button secondary:** transparent, `border-strong`, `fg` text; hover `surface-2`.
- **Button quiet:** text only, `fg-muted`, hover `fg`.
- **Danger button:** `danger` text and border; used for Delete key.
- **Input:** `surface` bg, `border-strong`, `radius-sm`, 44 px height, label above, error text
  in `danger` under the field with `aria-describedby`.
- **Card:** `surface`, `border`, `radius-lg`, `shadow-card` on light only.
- **Badge:** `radius-full`, `xs`, dot + label, status tokens.
- **Nav (landing):** sticky, transparent over hero, `bg/80` + blur after scroll; language
  toggle as a two-option segmented control (বাংলা | EN).
- **Sidebar (portal):** `surface-2`, active item has a 3 px gold left bar and `fg` text.
- **Table:** header `surface-2`, `sm` text, row hover `surface-2`, sticky header.
- **Footer:** `navy-950`, muted text, gold links on hover.

## 7. Imagery and icons

- Icons: simple inline SVG line icons (1.75 px stroke, `currentColor`), drawn in
  `src/components/ui/icons.tsx`. No emoji, no icon font.
- Hero: the 3D Byte mascot (`public/models/byte.glb`) with a gold waveform on the laptop screen.
  Fallback: the procedural voice orb, then `public/images/byte-still.webp`.
- No stock photos. Diagrams (data model page) are drawn with the same tokens.

## 8. Motion

- Durations 150 ms (hover), 300 ms (state crossfade), 600 ms (section reveal).
- Easing `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- `prefers-reduced-motion: reduce`: no float, no orbit, no reveal; mascot holds a still pose
  (beak still follows the voice).
