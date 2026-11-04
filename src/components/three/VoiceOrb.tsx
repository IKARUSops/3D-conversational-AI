"use client";
/* eslint-disable react-hooks/immutability -- three.js scene objects are mutated imperatively inside useFrame by design */
/**
 * Procedural "voice orb" fallback (T4.2, FR-A5): used when byte.glb fails to load.
 * Same 4 states as the mascot: colour and motion change per state; the surface ripples with
 * the voice level. Colours come from the call-state tokens in docs/DESIGN.md.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LIGHT, StateGate, cssToken, type MascotState } from "./shared";
import type { MascotProps } from "./ByteMascot";

const TOKEN: Record<MascotState, [string, string]> = {
  idle: ["--state-idle", "#8c9ab8"],
  listening: ["--state-listening", "#2bc4a9"],
  thinking: ["--state-thinking", "#ffc24d"],
  speaking: ["--state-speaking", "#f5b700"],
};

function Orb({ mascotState, getLevel, getCallerLevel, reducedMotion }: MascotProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const stateRef = useRef(mascotState);
  useEffect(() => {
    stateRef.current = mascotState;
  }, [mascotState]);
  const gate = useRef(new StateGate("idle"));
  const level = useRef(0);

  const { geometry, base } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 24);
    return { geometry: g, base: Float32Array.from(g.attributes.position!.array as Float32Array) };
  }, []);
  const colors = useMemo(() => {
    const out = {} as Record<MascotState, THREE.Color>;
    (Object.keys(TOKEN) as MascotState[]).forEach((s) => {
      out[s] = new THREE.Color(cssToken(TOKEN[s][0], TOKEN[s][1]));
    });
    return out;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(cssToken("--navy-700", "#1c3673")),
        emissive: colors.idle.clone(),
        emissiveIntensity: 0.55,
        roughness: 0.35,
        metalness: 0.4,
      }),
    [colors],
  );

  useFrame((state, delta) => {
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const shown = gate.current.update(stateRef.current, performance.now());
    const target = shown === "speaking" ? getLevel() : shown === "listening" ? getCallerLevel() : 0;
    level.current += (target - level.current) * Math.min(1, delta * 12);

    material.emissive.lerp(colors[shown], Math.min(1, delta * 6));
    const speed = shown === "thinking" ? 3 : shown === "idle" ? 0.6 : 1.6;
    const amp = 0.04 + level.current * 0.22 + (shown === "thinking" ? 0.05 : 0);

    const pos = geometry.attributes.position!;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!;
      const y = base[i + 1]!;
      const z = base[i + 2]!;
      const n =
        Math.sin(x * 3 + t * speed) *
        Math.sin(y * 4 + t * speed * 1.3) *
        Math.sin(z * 3.5 + t * speed * 0.7);
      const k = 1 + n * amp;
      arr[i] = x * k;
      arr[i + 1] = y * k;
      arr[i + 2] = z * k;
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    if (mesh.current && !reducedMotion) mesh.current.rotation.y += delta * 0.15;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} />;
}

export default function VoiceOrb(props: MascotProps & { active?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={props.active === false ? "never" : "always"}
      camera={{ position: [0, 0, 3.4], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      aria-hidden="true"
    >
      <hemisphereLight args={[LIGHT.sky, LIGHT.ground, 0.9]} />
      <directionalLight position={[2, 3, 3]} intensity={1.6} color={LIGHT.key} />
      <Orb {...props} />
    </Canvas>
  );
}
