# SRS 3: 3D Mascot (Byte) for the Hero Section
## Brief for the 3D artist / Blender agent

| Field | Value |
|---|---|
| Version | 1.0 (2026-11-04) |
| Owner | Sharif Mohammad Omar Faruq |
| Used by | Agent M (Blender, via Blender MCP) or a human 3D artist |
| Hands off to | Agent D (Landing & 3D, React Three Fiber). See SRS 1 FR-A4/FR-A5 and SRS 2 §11 |
| Reference | `byte-loop.webm` from bytevoice.com.au (10.04 s, 24 fps, 1000x1242). Frames in `mascot-reference/` |
| **Deadline** | **Thu 5 Nov 2026, 12:00 PM Asia/Dhaka** (the web team needs the file by midday). A first rough version by **9:00 AM**. |

> **Goal in one line:** a light, real-time 3D **concept** of Byte, the ByteVoice parrot, sitting at a desk with a glass laptop, with **4 animation states (Idle, Listening, Thinking, Speaking)** that the website switches between during a live call, and a beak that moves with the agent's voice.
>
> **Concept, not a copy.** StrategyByte invited candidates to use their mascot in this task. Build your **own** model that is clearly Byte (same character, colours, outfit, props) but do not trace or extract their render. It does not need to match exactly. A full production model is listed as future work.
>
> **Owner decision (2026-11-04 14:42): make Byte feminine.** Keep everything that makes it Byte (blue round chibi parrot, crest, big amber eyes, round glasses, headset with mic, navy jacket, gold accents, desk and glass laptop) and add a feminine touch: **eyelashes**, **soft pink cheek blush**, a slightly **smaller, softer beak**, crest feathers that **curl softly** with a small **gold bow clip**, a **white blouse** and a **gold neck bow** instead of the tie, and a fitted navy blazer. The voice is female (ElevenLabs `8U6QQz51HQvOsmbnTJ3D`), so the mascot matches it.
>
> **Priority if time runs short:** (1) the character with good proportions and materials, (2) the Speaking beak (shape key), (3) Idle, (4) Thinking, (5) Listening, (6) props polish. A static model with a working beak is better than nothing; the web team has a fallback orb.

---

## 1. What the reference video shows (frame analysis)

`byte-loop.webm` is one seamless 10-second loop on a near-black background (#020D02). Camera is fixed. Byte sits in a black leather office chair behind a dark glass desk, typing on a transparent glass laptop that shows a gold audio waveform.

### 1.1 Timeline (see `ref-01-timeline-2fps.png` and `ref-02-head-8fps.png`)

| Time (s) | Head / face | Wings (hands) | Notes for our states |
|---|---|---|---|
| 0.00 | Faces camera, eyes to camera, beak slightly open, happy | Both on keyboard | **Idle / Speaking start pose** |
| 0.25 to 0.375 | **Blink** (upper lids close, about 6 frames) | Typing | Blink length about 0.25 s |
| 0.50 to 1.00 | Head turns about 25° to his left (viewer's right), eyes down to laptop | Typing | Look at screen |
| 1.00 to 2.00 | Eyes on screen, **beak opens and closes** in rhythm | Typing | **Speaking** while working |
| 2.00 to 2.25 | Blink | Typing | |
| 2.375 to 3.50 | **Head tilts back and to the side, eyes roll up to the upper right**, beak open "hmm" | Typing slows | **Thinking** pose reference |
| 3.50 to 3.75 | Blink; his left wing starts to rise | One wing lifts | |
| 3.75 to 6.25 | Head slightly tilted, eyes on screen, attentive | **Left wing (viewer's right) pressed to the headset earcup**, other wing types | **Listening** pose reference ("I'm listening to the caller") |
| 5.00, 6.125 | Blinks | | Blink every 1.5 to 2.5 s |
| 6.25 to 7.00 | Eyes on screen | Wing returns to keyboard | Transition back |
| 7.00 to 8.75 | Looking down at screen, beak moving | **Both wings typing** | **Typing** reference |
| 8.875 | Blink | | |
| 9.00 to 9.875 | Head turns back to camera, eyes to camera, smile | Typing | Returns to the 0.00 pose (seamless loop) |

Other motion seen in every frame: very small body sway and breathing; the **feet dangle and swing slightly** under the desk; the waveform on the laptop screen changes shape; reflections move on the glossy desk.

### 1.2 Character design (from `ref-frame-0.0s.png`, `ref-frame-4.5s.png`)

| Part | Description | Colour (sampled, adjust by eye) |
|---|---|---|
| Proportions | Chibi. **Head is a large, slightly squashed sphere, about 45% of total sitting height** and wider than the shoulders. Short body, no visible neck | |
| Head / body feathers | Smooth, glossy, soft "vinyl toy" look with a soft sheen and gentle light-through-skin feel | Lit **#98A6D6**, shadow **#8487B8** (periwinkle blue) |
| Crest | 3 to 5 pointed feather tufts on top of the head, centre one tallest, slightly fanned | #8E92C6 (a bit darker than head) |
| Eyebrows | Small thin arcs above each eye, darker blue, they move with expressions | #6E78B8 |
| Eyes | Large, round, glossy, slightly bulging. White sclera, **amber-brown iris**, big black pupil, 1 to 2 white catch-light highlights | Iris **#AB7B45**, pupil #111 |
| Glasses | **Round, thin wire frames**, slightly oversized, sitting low on the face, navy rim, **small gold bridge** over the beak, clear lenses | Rim #2F3A6E, bridge #D6A743 |
| Beak | Short, rounded, **yellow-orange**, upper and lower parts. When open: **pink-red mouth with a tongue** | Beak **#E7A928** (lit) / #D29D2C, mouth #A14C4B, tongue #C76A6A |
| Cheeks / chin | Slightly lighter blue area around the beak | #A8B4E2 |
| Headset | Thin black headband over the crest base, **black ear cups with cream outer cushion ring**, **mic boom from his right ear cup (viewer's left)** curving to the beak with a black foam tip | Band/cups #1E1E24, cushion #E8DCC0, boom #2A2A30 |
| Jacket | Navy suit jacket with lapels, buttoned, soft cloth (matte) | **#2B2F55** |
| Shirt / blouse | White blouse collar and **white cuffs** at the wrists | #E4DAD0 |
| Neck bow (feminine version, replaces the tie) | **Gold-yellow soft bow** at the blouse collar, two loops and two short tails, slightly shiny | **#C9932F** |
| Eyelashes (feminine) | 3 small curved lashes at the outer top of each eye, above the glasses line | #1E2347 |
| Cheek blush (feminine) | Soft pink oval on each cheek, under the glasses | #F2A7B8 |
| Crest clip (feminine) | Small gold bow clip at the base of the crest | #D6A743 |
| Wings as hands | Blue wing tips coming out of the sleeves, shaped like **hands with 3 to 4 feather fingers**, can type and press the headset | Same as head blue |
| Tail | Small blue tail feathers visible beside the chair | Head blue |
| Feet | **Orange bird feet, 3 toes forward**, dangling below the seat (legs hidden by jacket) | #D07A35 |

### 1.3 Props

| Prop | Description |
|---|---|
| Chair | Black leather executive chair, quilted horizontal panels on the back, padded arms, chrome stem and base under the seat. Matte-satin black #282124 |
| Desk | Dark **glossy glass/black** top with rounded corners and a thin **glowing gold edge strip** (emissive #E9C46A). Strong reflections |
| Laptop | **Transparent glass laptop** with a teal tint (#91B0A6 at low opacity), thin edges, a faint glass keyboard. The screen shows a **gold glowing waveform**. The screen must be a **separate mesh named `Laptop_Screen`** with clean 0-1 UVs, so the website can draw a live waveform onto it |
| Background | None in the model. The website provides the background (navy). Do not bake the near-black background |

---

## 2. The 4 required animation states

The website plays one state at a time and **crossfades** between them (0.25 to 0.35 s). Each state is a **seamless loop** (first frame = last frame) exported as its own glTF animation (Action). **30 fps.**

| # | Action name (exact) | When the website plays it | Length | Must show |
|---|---|---|---|---|
| 1 | `Idle` | Page loaded, no call; call is live but nobody is speaking | 4.0 s | Breathing, small body sway, head looks around gently (camera → screen → camera), wings resting on keyboard with an occasional tap, feet swing. **Beak closed or slightly open smile.** Friendly |
| 2 | `Listening` | The **caller is speaking** (website detects caller voice / live captions) | 3.0 s | **One wing (his left, viewer's right) pressed to the headset ear cup** (ref 3.75 to 6.25 s), head tilted a little toward that side, eyes on the screen, small attentive nods (2 per loop), **other wing typing fast** ("transcribing"). **Beak closed** (he is listening, not talking) |
| 3 | `Thinking` | Caller finished, waiting for the AI reply (processing delay, tool calls) | 2.5 s | **Head tilts back and to the side, eyes roll up to the upper right** (ref 2.375 to 3.5 s), eyebrows raised on one side, beak closed in a small "hmm", one wing tip **taps the desk** or touches the chin; the other stays on the keyboard. Slow, calm |
| 4 | `Speaking` | The **agent's voice is playing** | 2.0 s | Faces the camera (or 3/4 toward camera), lively but small head nods and tilts on emphasis, eyebrows lift, wings make small open-palm gestures then return to keyboard. **Do not key the beak in this action**: the website opens the beak from the voice level (see §3.3) |

Optional extra (only if time allows): `Wave` (1.5 s, not looping): he lifts a wing and waves, used once when the page first loads.

### 2.1 Animation rules
- All actions animate the **same rig**; keep the rest pose identical across actions so crossfades do not pop.
- Each loop starts and ends in a pose close to **the 0.00 s reference pose** (seated, wings on keyboard, head forward), so any state can blend into any other.
- **Do not key blinks** in the actions. Blinks are random and driven by the website using the `Blink` shape key.
- **Do not key the `BeakOpen` shape key or the jaw** in any action. Beak opening is driven live by the website.
- Do not key the laptop screen. The website animates it.
- Motion should be **subtle and soft** (ease in/out, overlapping action on the crest feathers and tie). Reference the gentle style of the video; nothing fast or bouncy except the typing fingers.
- Feet: small slow swing in `Idle` and `Thinking`, still in `Listening`, small in `Speaking`.

---

## 3. Technical requirements (for real-time web use)

### 3.1 Output files

| File | Content | Target size |
|---|---|---|
| `byte.glb` | Character + chair + desk + laptop, rig, 4 actions, shape keys, materials | **Under 4 MB** (use Draco or Meshopt compression) |
| `byte.blend` | Source file with everything (unpacked textures ok) | any |
| `byte-still-1200.png` | 1200x1200, **transparent background**, 3/4 front view like the reference, Idle pose. Used as fallback image and social share image | under 1 MB |
| `byte-states-preview.mp4` (optional) | 4 states played one after another, 12 s | under 5 MB |

Save all files in one folder: **`G:\Bytevoice\ByteVoice-Mascot\`** (owner's machine) (and the web team copies `byte.glb` to `public/models/byte.glb`).

### 3.2 Scene, scale and orientation
- Units: metres. Character sitting height (chair seat to crest tip) about **1.0 m**; whole set (chair + desk) about 1.4 m wide.
- **+Y up, character faces −Y in Blender** (the glTF exporter converts to +Z forward). The camera/viewer is in front of the character.
- Origin (0,0,0) at the floor under the chair centre. Apply all transforms (scale = 1, rotation = 0) before export.
- Include a camera named `Hero_Camera` matching the reference framing (3/4 front, slightly above eye level, character slightly left of centre, laptop on the right). The website may use or ignore it.

### 3.3 Rig, shape keys and object names (the website depends on these exact names)

**Armature `Byte_Rig`** bones (minimum):
`root`, `body`, `chest`, `head`, `crest_01..03`, `eye_L`, `eye_R` (rotate to look around), `brow_L`, `brow_R`, `wing_upper_L/R`, `wing_lower_L/R`, `wing_hand_L/R`, `finger_01..03_L/R` (optional), `foot_L`, `foot_R`, `bow` (the neck bow; was `tie`).
(Left/Right = the character's own left/right.)

**Shape keys** on the head mesh `Byte_Head` (all 0 at rest, 1 = full):

| Shape key | What it does | Driven by |
|---|---|---|
| `BeakOpen` | Lower beak opens (about 25°), mouth and tongue visible | **Website, from voice level** |
| `BeakSmile` | Corners lift, happy | Actions or website |
| `Blink` | Both upper eyelids fully close | Website, random every 2 to 5 s, 0.15 s |
| `Blink_L`, `Blink_R` (optional) | One eye | Website (wink) |
| `BrowUp` | Both brows raise | Actions |

Export rule: glTF exports shape keys as morph targets. Morph targets must be on the mesh that the website can find by name (`Byte_Head`). Keep the beak as part of `Byte_Head` (same mesh) so the shape key moves it. If the beak must be a separate object, give it its **own** `BeakOpen` shape key and name it `Byte_Beak`.

**Object names (exact):** `Byte_Head`, `Byte_Body` (jacket, blouse, neck bow can be one mesh with multiple materials), `Byte_Lashes`, `Byte_Blush`, `Byte_Glasses`, `Byte_Headset`, `Byte_Wings`, `Byte_Feet`, `Byte_Tail`, `Chair`, `Desk`, `Desk_Glow` (the gold strip, separate so the site can pulse it), `Laptop_Body`, `Laptop_Screen`.

### 3.4 Materials (glTF-compatible only)
Use only the **Principled BSDF** with plain inputs (Base Color, Metallic, Roughness, Normal, Emission, Alpha/Transmission, Clearcoat). Custom node tricks (subsurface scattering, procedural noise, ramps) do not export to glTF; bake them to textures if you use them.

| Material | Settings |
|---|---|
| `M_Feather` | Base #98A6D6, roughness 0.35, clearcoat 0.3 (soft glossy toy look) |
| `M_Beak` | Base #E7A928, roughness 0.3 |
| `M_Mouth` | Base #A14C4B, roughness 0.5 |
| `M_Eye` | White sclera texture with iris/pupil, roughness 0.05, clearcoat 1 (wet look) |
| `M_Glass_Lens` | Transmission 1, roughness 0.05, IOR 1.45 (KHR_materials_transmission) |
| `M_Glass_Rim` | Base #2F3A6E, metallic 0.6, roughness 0.3 |
| `M_Gold` | Base #D6A743, metallic 1, roughness 0.25 (glasses bridge) |
| `M_Jacket` | Base #2B2F55, roughness 0.8 (cloth), optional fabric normal map |
| `M_Shirt` | Base #E4DAD0, roughness 0.7 |
| `M_Bow` | Base #C9932F, roughness 0.4, slight sheen (neck bow) |
| `M_Lash` | Base #1E2347, roughness 0.6 |
| `M_Blush` | Base #F2A7B8, roughness 0.6 |
| `M_Headset` | Base #1E1E24, roughness 0.5; cushion ring #E8DCC0 roughness 0.8 |
| `M_Feet` | Base #D07A35, roughness 0.5 |
| `M_Chair_Leather` | Base #282124, roughness 0.45; chrome parts metallic 1 roughness 0.15 |
| `M_Desk_Glass` | Base #0E0E14, roughness 0.05, metallic 0.2 (dark mirror look) |
| `M_Desk_Glow` | Emission #E9C46A strength 3 |
| `M_Laptop_Glass` | Base #91B0A6, transmission 0.85, roughness 0.1 |
| `M_Laptop_Screen` | Emission #F0D27A on a **waveform texture** (black background, gold line); the website replaces this texture live |

Textures: max **1024x1024**, PNG or JPG (KTX2 optional). Total texture memory small.

### 3.5 Polygon and performance budget

| Item | Budget |
|---|---|
| Whole scene | **Under 60,000 triangles** (aim 40k) |
| Character (with glasses, headset) | about 25k |
| Chair + desk + laptop | about 15k |
| Bones | under 60 |
| Morph targets | 6 max |
| Draw calls (materials x meshes) | under 30 |
| Smooth look | use shade smooth + weighted normals instead of high subdivision; apply subdivision at level 1 at most before export |

### 3.6 Export settings (Blender glTF exporter)
- Format: **glTF Binary (.glb)**.
- Include: Selected objects or Visible objects; **+Y Up** on; Apply Modifiers on; UVs, Normals, Vertex Colors as needed; **Shape Keys on**; **Skinning on**; Animations on with **"Group by NLA Track"** or **actions as separate clips**, each named exactly `Idle`, `Listening`, `Thinking`, `Speaking`; Always Sample Animations on; **Compression: Draco** (level 6) or export without and let the web team run `gltf-transform optimize`.
- Materials: Export. Images: Automatic.
- After export, **check the file at https://gltf-viewer.donmccurdy.com** (or the three.js editor): all 4 clips play, morph targets listed, no missing textures, file size under 4 MB.

---

## 4. How the website will use the model (contract with Agent D)

```ts
const { scene, animations } = useGLTF('/models/byte.glb');
const { actions } = useAnimations(animations, scene);
// state from the call: 'idle' | 'listening' | 'thinking' | 'speaking'
actions[current].fadeOut(0.3); actions[next].reset().fadeIn(0.3).play();

const head = scene.getObjectByName('Byte_Head') as THREE.SkinnedMesh;
const i = head.morphTargetDictionary!['BeakOpen'];
head.morphTargetInfluences![i] = smooth(audioLevel);   // 0..1 from the TTS audio analyser, every frame
// random blink: Blink 0 -> 1 -> 0 over 0.15 s every 2 to 5 s
// Laptop_Screen material map = CanvasTexture with a live gold waveform (caller level in Listening, agent level in Speaking)
// Desk_Glow emission pulses softly in Thinking
```

State mapping from the call client (SRS 2 §8.1):

| Call state | Mascot action | Screen waveform | Extra |
|---|---|---|---|
| No call / `idle` | `Idle` | slow gentle line | random blinks |
| `live.listening`, **no caller speech** | `Idle` | flat line | |
| `live.listening`, **caller speaking** (interim text or VAD speech) | `Listening` | **caller mic level** | |
| `live.thinking` (shown only if the delay is over 300 ms) | `Thinking` | three gold dots moving | `Desk_Glow` pulses |
| `live.speaking` | `Speaking` | **agent voice level** | `BeakOpen` from voice level |
| `ended` | `Idle` (or `Wave` once) | flat line | |

Rules on the web side: keep each state at least 400 ms (no flicker); `prefers-reduced-motion` → still pose, no head motion, beak still moves.

---

## 5. Step-by-step plan for Agent M (Blender MCP)

Work in small steps and **take a viewport screenshot after each step** to check the look. Save the .blend after every step (`G:\Bytevoice\ByteVoice-Mascot\byte.blend`).

1. **Setup** (10 min): new scene, metric units, delete defaults, add the `Hero_Camera` (50 mm, 3/4 front) and a simple 3-light studio setup (key, fill, rim) plus an HDRI-like world colour, only for preview renders.
2. **Head** (40 min): UV sphere, squash to about 1.0 x 0.95 x 0.9, smooth; crest tufts (3 to 5 tapered cones/curved planes); eyes (spheres with iris texture or simple material split), eyebrows (curved tubes); beak upper and lower (sculpted cones, rounded), mouth cavity and tongue inside. Add shape keys `BeakOpen`, `BeakSmile`, `Blink`, `BrowUp`.
3. **Glasses and headset** (30 min): torus rims scaled to circles, gold bridge, thin temple arms; headset band (curve with bevel), ear cups (cylinders with cream ring), mic boom (curve with bevel) to a small foam sphere near the beak.
4. **Body and outfit** (40 min): rounded body; jacket with lapels (shrink-wrapped shell, solidify), white collar, gold tie; sleeves ending in white cuffs; wing-hands with 3 to 4 feather fingers; small tail; orange feet with 3 toes.
5. **Props** (40 min): chair (back with 4 horizontal padded panels, seat, arms, chrome stem and 5-star base), desk (rounded rectangle top, glowing gold edge as separate `Desk_Glow`), glass laptop (base, hinge, screen `Laptop_Screen` with 0-1 UVs) and a faint keyboard.
6. **Materials** (30 min): §3.4 only. Make a waveform texture (1024x512, black with a gold line) for the screen.
7. **Rig** (45 min): `Byte_Rig` per §3.3, automatic weights, then fix weights on the beak, glasses (parent to head bone), headset (head bone), tie and wings.
8. **Animations** (90 min): reference pose at frame 0 = video 0.00 s. Make `Idle`, `Listening`, `Thinking`, `Speaking` per §2 as separate actions; push each to an NLA track with the exact name. Check every loop is seamless.
9. **Optimise and export** (20 min): triangle count, decimate props if needed, apply transforms, export `byte.glb` per §3.6, render `byte-still-1200.png` (transparent film).
10. **Verify** (15 min): re-import the glb into a new Blender scene, play each action, test the shape keys, check size. Write a short `README-mascot.md` in the folder listing objects, actions, shape keys, triangle count and file size.

---

## 6. Acceptance checklist

- [ ] Clearly reads as **Byte**: blue round chibi parrot, crest, big amber eyes, round glasses with gold bridge, headset with mic, navy blazer, white blouse, gold neck bow, orange feet, at a desk with a glass laptop
- [ ] Feminine touches present: eyelashes, cheek blush, soft crest with gold bow clip, smaller beak
- [ ] Original model (not traced), looks good from the hero camera angle
- [ ] `byte.glb` **under 4 MB**, **under 60k triangles**, opens in the glTF viewer with no errors
- [ ] 4 clips named exactly `Idle`, `Listening`, `Thinking`, `Speaking`, each a seamless loop at 30 fps, same rest pose
- [ ] Clips do not key blinks, `BeakOpen`, or the screen
- [ ] Shape keys `BeakOpen`, `BeakSmile`, `Blink`, `BrowUp` on `Byte_Head` and exported as morph targets
- [ ] Separate meshes `Laptop_Screen` (0-1 UVs) and `Desk_Glow`
- [ ] Only glTF-compatible materials; glass uses transmission
- [ ] `byte-still-1200.png` with transparent background
- [ ] `README-mascot.md` with the facts above
- [ ] Files saved in `G:\Bytevoice\ByteVoice-Mascot\`

## 7. Reference files (in `mascot-reference/`)

| File | Use |
|---|---|
| `ref-01-timeline-2fps.png` | Whole 10 s loop, one frame every 0.5 s, timestamps in red |
| `ref-02-head-8fps.png` | Head close-up every 0.125 s: blinks, beak, eye directions |
| `ref-frame-0.0s.png` | Main pose and full design (Idle / Speaking) |
| `ref-frame-0.30s.png` | Blink |
| `ref-frame-1.5s.png` | Looking at screen, typing, beak open |
| `ref-frame-2.9s.png` | Thinking look (eyes up and to the side) |
| `ref-frame-4.5s.png` | Listening (wing on headset) |
| `ref-frame-9.5s.png` | Back to camera, smile |

---

## 8. As built (2026-11-04, Blender 5.2.3 via Blender MCP). This section wins over §3.3 where they differ

Files on the owner's PC in `G:\Bytevoice\ByteVoice-Mascot\` (full details in `README-mascot.md` there):

| File | Facts |
|---|---|
| `export/byte.glb` | **Use on the website.** 0.50 MB (Draco), 38,474 triangles, clips `Idle` 4.0 s, `Listening` 3.0 s, `Thinking` 2.5 s, `Speaking` 2.0 s, 30 fps, every clip keys all 12 animated nodes (36 channels) |
| `export/byte-nodraco.glb` | Same, no Draco (0.99 MB) |
| `renders/byte-still-1200.png`, `renders/state-*.png` | Transparent stills |
| `previews/state-*.mp4` | 720x720 loop previews (blink and lip-sync keyed only for the preview) |
| `byte.blend` + `byte_*.py` | Source and rebuild scripts |

Differences from §3.3 (agreed in the build):
- **No armature.** The rig is a hierarchy of pivot nodes, animated directly by three.js: `Byte_Root` → `Byte_BodyPivot` → `Byte_HeadPivot` (head, eyes, brows, glasses, headset, blush), `Byte_WingPivot_L/R` → `Byte_HandPivot_L/R`, `Byte_FootPivot_L/R`. Eyes (`Byte_Eye_L/R`) and brows (`Byte_Brow_L/R`) are separate nodes, so gaze and brow lifts are part of the clips (no `BrowUp` shape key).
- **Morph targets on `Byte_Head`:** `BeakOpen`, `BeakSmile`, `Blink`, `Blink_L`, `Blink_R` (all 0). `Byte_Head` has 8 primitives, so three.js loads it as a **Group**: set the morph on every child mesh (snippet in README-mascot.md).
- **Listening uses her right wing** (the camera side) on the headset, because the hero camera is on her right-front. The video used the other wing because its camera was on the other side.
- Feminine design as decided: eyelashes, blush, softer beak, curled crest with gold bow clip, white blouse, gold neck bow, navy blazer.
- Laptop screen: `Laptop_Screen` with material `M_Laptop_Screen` (0-1 UVs, emissive waveform texture). Desk strip: `Desk_Glow` (emissive).
- Known limits: procedural concept quality; no cloth/feather secondary motion; no full facial rig.
