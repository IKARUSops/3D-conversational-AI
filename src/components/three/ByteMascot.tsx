"use client";
/* eslint-disable react-hooks/immutability -- three.js scene objects are mutated imperatively inside useFrame by design */
/**
 * Byte, the hero mascot (T4.3, FR-A4, SRS 3 sections 4 and 8).
 *
 * - Clips Idle | Listening | Thinking | Speaking, 0.3 s crossfades, each state >= 400 ms,
 *   Thinking only after a 300 ms wait (StateGate).
 * - BeakOpen morph on every child mesh of Byte_Head (it loads as a Group of 8 meshes), driven
 *   by getLevel() every frame while speaking.
 * - Random Blink every 2 to 5 s.
 * - Live gold waveform on Laptop_Screen (CanvasTexture): caller level when listening, agent
 *   level when speaking, moving dots when thinking.
 * - Desk_Glow pulses while thinking.
 * - prefers-reduced-motion: still pose (clip paused on its first frame); the beak still moves.
 * Load this file only through next/dynamic with ssr: false (see HeroVisual).
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { LIGHT, StateGate, cssToken, drawScreen, type MascotState } from "./shared";

const MODEL_URL = "/models/byte.glb";
const DRACO_PATH = "/draco/";
const CLIP: Record<MascotState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};
const HISTORY = 40;

export interface MascotProps {
  mascotState: MascotState;
  /** Agent voice level 0..1 (TTS analyser). */
  getLevel: () => number;
  /** Caller microphone level 0..1. */
  getCallerLevel: () => number;
  reducedMotion?: boolean;
}

function Model({ mascotState, getLevel, getCallerLevel, reducedMotion }: MascotProps) {
  const { scene, animations } = useGLTF(MODEL_URL, DRACO_PATH);
  const { actions } = useAnimations(animations, scene);
  const stateRef = useRef(mascotState);
  useEffect(() => {
    stateRef.current = mascotState;
  }, [mascotState]);

  // Morph targets live on every mesh under Byte_Head.
  const headMeshes = useMemo(() => {
    const list: THREE.Mesh[] = [];
    scene.getObjectByName("Byte_Head")?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) list.push(m);
    });
    return list;
  }, [scene]);

  const setMorph = (name: string, value: number) => {
    for (const m of headMeshes) {
      const i = m.morphTargetDictionary![name];
      if (i !== undefined) m.morphTargetInfluences![i] = value;
    }
  };

  // Laptop screen: live canvas texture.
  const screen = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false; // glTF UV convention
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = scene.getObjectByName("Laptop_Screen") as THREE.Mesh | undefined;
    if (mesh) {
      const base = mesh.material as THREE.MeshStandardMaterial;
      const mat = base.clone();
      mat.map = texture;
      mat.emissiveMap = texture;
      mat.emissive = new THREE.Color(1, 1, 1);
      mat.emissiveIntensity = 1.4;
      mat.transparent = false;
      mat.opacity = 1;
      mesh.material = mat;
    }
    return { canvas, ctx: canvas.getContext("2d"), texture };
  }, [scene]);

  const glow = useMemo(() => {
    const mesh = scene.getObjectByName("Desk_Glow") as THREE.Mesh | undefined;
    if (!mesh) return null;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = mat;
    return { mat, base: mat.emissiveIntensity };
  }, [scene]);

  const colors = useMemo(
    () => ({
      bg: cssToken("--navy-950", "#060f26"),
      line: cssToken("--gold-500", "#f5b700"),
      dim: cssToken("--gold-600", "#d49a00"),
    }),
    [],
  );

  // Start Idle.
  const gate = useRef(new StateGate("idle"));
  const current = useRef<MascotState>("idle");
  useEffect(() => {
    const idle = actions[CLIP.idle];
    idle?.reset().play();
    if (idle && reducedMotion) idle.paused = true;
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
  }, [actions, reducedMotion]);

  const anim = useRef({
    beak: 0,
    nextBlink: 2.5,
    blinkStart: -1,
    history: new Array<number>(HISTORY).fill(0),
    frame: 0,
  });

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    const shown = gate.current.update(stateRef.current, performance.now());

    if (shown !== current.current) {
      const prev = actions[CLIP[current.current]];
      const next = actions[CLIP[shown]];
      if (!reducedMotion) {
        prev?.fadeOut(0.3);
        next?.reset().fadeIn(0.3).play();
      }
      current.current = shown;
    }

    // Beak follows the agent voice while speaking (also with reduced motion).
    const target = shown === "speaking" ? Math.min(1, getLevel() * 1.4) : 0;
    a.beak += (target - a.beak) * Math.min(1, delta * 18);
    setMorph("BeakOpen", a.beak);

    // Blink: 0 -> 1 -> 0 over 0.15 s every 2 to 5 s.
    if (!reducedMotion) {
      if (a.blinkStart < 0 && t >= a.nextBlink) a.blinkStart = t;
      if (a.blinkStart >= 0) {
        const p = (t - a.blinkStart) / 0.15;
        if (p >= 1) {
          setMorph("Blink", 0);
          a.blinkStart = -1;
          a.nextBlink = t + 2 + Math.random() * 3;
        } else {
          setMorph("Blink", Math.sin(p * Math.PI));
        }
      }
    }

    // Screen waveform (every second frame is plenty).
    a.frame++;
    if (screen.ctx && a.frame % 2 === 0) {
      const level =
        shown === "listening" ? getCallerLevel() : shown === "speaking" ? getLevel() : 0;
      a.history.push(level);
      a.history.shift();
      drawScreen(
        screen.ctx,
        screen.canvas.width,
        screen.canvas.height,
        shown,
        a.history,
        t,
        colors,
      );
      screen.texture.needsUpdate = true;
    }

    if (glow) {
      glow.mat.emissiveIntensity =
        shown === "thinking" ? glow.base * (0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4))) : glow.base;
    }
  });

  return <primitive object={scene} />;
}

/** Hero_Camera from the glb: position + rotation, vertical fov 39.6 degrees. */
const HERO_CAMERA = {
  position: [-0.38, 1.12, 2.05] as [number, number, number],
  quaternion: new THREE.Quaternion(-0.0781565, -0.1224396, -0.0096725, 0.9893466),
  fov: 39.6,
};

export default function ByteMascot(props: MascotProps & { active?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={props.active === false ? "never" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: HERO_CAMERA.position, fov: HERO_CAMERA.fov, near: 0.1, far: 50 }}
      onCreated={({ camera }) => {
        camera.quaternion.copy(HERO_CAMERA.quaternion);
      }}
      aria-hidden="true"
    >
      <hemisphereLight args={[LIGHT.sky, LIGHT.ground, 1.1]} />
      <directionalLight position={[2, 3, 3]} intensity={2.2} color={LIGHT.key} />
      <directionalLight position={[-3, 2, -2]} intensity={1.2} color={LIGHT.rim} />
      <ambientLight intensity={0.35} />
      <Model {...props} />
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
