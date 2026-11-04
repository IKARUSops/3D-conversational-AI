# Design Skills Guide (ByteVoice Bangla)

How to use the design skills you added, and when. The SRS already tells the coding agents to use them at the right step (SRS 2 §11.2, Appendix A and E), so in most cases you do not need to ask.

## 1. What you have

| Skill | Use it for | Our step |
|---|---|---|
| `website-design:web-design-system` (command `/website-design:design-system`) | Choose a design direction and write **`docs/DESIGN.md`**: colours with roles, type, spacing, radius, shadows, components | **First**, before any landing or portal UI |
| `website-design:landing-page` (command `/website-design:landing-page`) | Build the landing page so it looks like a real product, not AI output | Landing sections + hero |
| `frontend-design:frontend-design` | Strong, intentional visual choices while coding UI (hero, call panel, portal) | All UI work |
| `design:ux-copy` | Button text, call states, error messages, empty states, in **Bangla and English** | Call panel and portal text |
| `anatomy` | An interactive isometric "how it works" figure (call → AI → portal) | Optional extra for the How it works section |
| `design:design-system` | Check the portal and landing use the DESIGN.md tokens consistently (no random colours/sizes) | After portal pages exist |
| `design:design-critique` | Structured feedback on a screenshot (hierarchy, usability, consistency) | After each page is built |
| `website-design:web-review` (command `/website-design:review-page`) | Review the **deployed** site, most important fixes first: message, generic look, mobile, contrast, speed, missing states | Before submission |
| `design:accessibility-review` | WCAG 2.1 AA check: contrast, keyboard, touch targets, screen readers | Before submission |
| `design:design-handoff`, `design:user-research`, `design:research-synthesis` | Not needed for this task (no separate designer, no user research). Skip | |

## 2. How to call a skill

In Claude Code (or here), any of these works:
1. **Just describe the task.** Skills load by themselves when the task matches, for example "Build the landing page hero".
2. **Name it:** "Use the `website-design:landing-page` skill to build the hero."
3. **Slash command** (for skills that have one): `/website-design:design-system`, `/website-design:landing-page`, `/website-design:review-page`.

**Check they work in Claude Code on your PC:** start Claude Code in the project and ask "What skills do you have?" (or type `/` and look for them). Skills added in claude.ai may not show up in Claude Code automatically. If they are missing, add them in Claude Code with `/plugin` (search for `frontend-design`, `design`, `website-design`). A skill added only in this chat helps only this chat.

## 3. The order to use them (copy these prompts)

**Step 1: Design system (15 min, before UI work)**
> Use `/website-design:design-system`. Product: ByteVoice Bangla, an AI phone receptionist for dental clinics in Bangladesh, by StrategyByte (Australia). Mood: trustworthy, warm, premium tech. Base it on dark navy (#0B1B3F) and gold (#F5B700) like bytevoice.com.au, with glass cards. Bangla-first typography: Hind Siliguri for Bangla, Inter for Latin. Light and dark. Include tokens for call states (idle, listening, thinking, speaking, error). Write docs/DESIGN.md.

**Step 2: Landing page**
> Use `/website-design:landing-page` and the `frontend-design` skill. Follow docs/DESIGN.md and SRS 1 §4.1 to §4.2. Hero: 3D Byte (public/models/byte.glb, see SRS 3 §4) on the right, headline + gold CTA "বাংলা কলারের সাথে কথা বলুন" on the left. Sections: How it works, Features, Use cases, Pricing, Contact. Bilingual toggle. Mobile first.

**Step 3: Words**
> Use the `design:ux-copy` skill. Write Bangla and English text for: call states, mic-permission error, unsupported browser, provider fallback notice, time-limit warning, call summary card, portal empty states, login errors. Polite Bangladeshi Bangla, short.

**Step 4 (optional): How it works figure**
> Use the `anatomy` skill to make an interactive isometric figure for the How it works section: a phone call goes in, the AI receptionist books in the calendar, the record appears in the portal. Navy and gold, Bangla labels.

**Step 5: Check consistency**
> Use the `design:design-system` skill to audit src/ against docs/DESIGN.md. List hardcoded colours, sizes and inconsistent components, then fix them.

**Step 6: Before submission (on the live URL)**
> Use `/website-design:review-page` on https://<your-domain> (desktop and mobile). Then use `design:accessibility-review` on the landing page, the call panel and the portal. Fix the top items, then put the results in docs/TEST-REPORT.md.

**Any time: feedback on a screenshot**
> Use the `design:design-critique` skill on this screenshot of the call panel. Focus on hierarchy and the call states.

## 4. Tips
- **Keep DESIGN.md as the single source.** Ask the agents to use its tokens (Tailwind theme), never raw hex values in components.
- **Review the live site, not localhost.** That is what reviewers see.
- **Mention the skills in the README** ("How I used AI tools"). It shows the judgment StrategyByte asks for.
- **Time box:** design system 15 min, reviews 20 min each. The caller and portal still matter most (55% of marks).
