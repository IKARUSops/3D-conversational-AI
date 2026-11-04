# Byte (feminine concept) - 3D mascot for the ByteVoice Bangla hero

Built 2026-11-04 in Blender 5.2.3 LTS with Python (Blender MCP), following SRS-3-3D-Mascot-Artist.md.
Concept asset for the StrategyByte assessment: an original model inspired by Byte, not a copy.

## Files
| File | What |
|---|---|
| export/byte.glb | **Use this on the website.** 0.50 MB, Draco compressed, 4 clips, morph targets, Hero_Camera |
| export/byte-nodraco.glb | Same without Draco (0.99 MB), for viewers without a Draco decoder |
| renders/byte-still-1200.png | 1200x1200 transparent still (fallback image / social image) |
| renders/state-*.png | 900x900 transparent still of each state |
| previews/state-*.mp4 | 720x720 preview of each loop (blinks and lip-sync are preview-only keys; on the web they are code-driven) |
| byte.blend | Source scene |
| byte_build.py, byte_head.py, byte_acc.py, byte_body.py, byte_props.py, byte_anim.py | Scripts that rebuild everything (re-runnable) |
| textures/screen_wave.png | Laptop screen texture (the website replaces it with a live canvas) |

## Facts
- Triangles: 38,474 (budget 60k). Units: metres. glTF +Y up, character faces +Z (towards the viewer).
- No armature: the rig is a **hierarchy of nodes (pivots)**, which three.js animates directly. Simpler and lighter than skinning for this chibi design.

## Animation clips (exact names, 30 fps, seamless loops, all 12 animated nodes keyed in every clip)
| Clip | Length | Shows |
|---|---|---|
| Idle | 4.0 s | Breathing, sway, looks at camera then at the laptop and back, small taps, feet swing |
| Listening | 3.0 s | Her right wing (camera side) on the headset, other wing typing fast, attentive nods, beak closed |
| Thinking | 2.5 s | Head tilted back and to the side, eyes rolled up, wing on chin, one brow raised, finger taps |
| Speaking | 2.0 s | Faces the camera, nods, brows lift, small open-wing gesture, beak NOT keyed (driven by voice) |

Animated nodes: Byte_BodyPivot, Byte_HeadPivot, Byte_Eye_L, Byte_Eye_R, Byte_Brow_L, Byte_Brow_R, Byte_WingPivot_L/R, Byte_HandPivot_L/R, Byte_FootPivot_L/R.

## Morph targets (on Byte_Head, all default 0)
BeakOpen, BeakSmile, Blink, Blink_L, Blink_R.
Note: Byte_Head has 8 primitives (materials), so three.js loads it as a **Group of meshes**; set the morph on every child mesh.

## Other named nodes
Byte_Root, Byte_Body (blazer, blouse, gold neck bow), Byte_Tail, Byte_Glasses, Byte_Headset, Byte_Blush, Byte_Sleeve_L/R, Byte_Hand_L/R, Byte_Foot_L/R,
Chair, Desk, Desk_Glow (emissive gold strip), Laptop_Body, Laptop_Screen (0-1 UVs, material M_Laptop_Screen), Hero_Camera.

## Three.js / React Three Fiber usage
```tsx
const { scene, animations } = useGLTF('/models/byte.glb'); // drei sets up the Draco decoder
const { actions } = useAnimations(animations, scene);
// switch state: actions[prev]?.fadeOut(0.3); actions[next]?.reset().fadeIn(0.3).play();

const headMeshes: THREE.Mesh[] = [];
scene.getObjectByName('Byte_Head')!.traverse((o: any) => { if (o.isMesh && o.morphTargetDictionary) headMeshes.push(o); });
const setMorph = (name: string, v: number) => headMeshes.forEach(m => {
  const i = m.morphTargetDictionary![name]; if (i !== undefined) m.morphTargetInfluences![i] = v; });
// every frame while Speaking: setMorph('BeakOpen', smoothedAgentLevel);  random blink: setMorph('Blink', 0..1..0 over 0.15 s)

const screen = scene.getObjectByName('Laptop_Screen') as THREE.Mesh;
// (screen.material as THREE.MeshStandardMaterial).emissiveMap = canvasTexture; .map = canvasTexture;
const glow = scene.getObjectByName('Desk_Glow') as THREE.Mesh; // pulse emissiveIntensity while Thinking
```
Camera tip: the model is framed for a camera on her right-front (see Hero_Camera), so the laptop sits on screen-right like the reference.

## Known limits (concept asset)
- Procedural modelling: clean and cute, not the film-quality look of the official Byte.
- No cloth or feather secondary motion; no full facial rig (blink, beak and brows only).
- Glass uses alpha blending for broad browser support; KHR_materials_transmission is also present.
