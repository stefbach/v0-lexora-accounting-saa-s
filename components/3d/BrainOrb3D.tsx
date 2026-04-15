"use client"

/**
 * BrainOrb3D — animated 3D orb with shader-noise displacement, slowly
 * rotating points constellation around it, and a pulse ring.
 *
 * This is the hero's 3D centerpiece: it evokes the "Lexora core brain"
 * (the AI engine) alive in 3D space.
 *
 * Performance notes:
 *  - dpr capped at [1, 1.5] so retina devices don't burn GPU.
 *  - 64-segment icosahedron — smooth but under 100k triangles.
 *  - Simplex noise runs in the vertex shader, no CPU cost per frame.
 *  - Canvas is dynamic()-imported with ssr:false by the caller to keep
 *    Three.js (~570KB) out of the initial bundle.
 *  - Respects prefers-reduced-motion by freezing the time uniform.
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Float } from "@react-three/drei"
import * as THREE from "three"

// ------------------------------------------------------------------
// Shaders — organic blob surface with simplex noise displacement
// ------------------------------------------------------------------

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec3 vNormal;
  varying float vDisplacement;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    float n = snoise(position * 1.1 + vec3(uTime * 0.25));
    float n2 = snoise(position * 2.6 + vec3(uTime * 0.4));
    vDisplacement = n * 0.7 + n2 * 0.3;

    vec3 newPos = position + normal * vDisplacement * uStrength;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  varying vec3 vNormal;
  varying float vDisplacement;

  void main() {
    float t = (vDisplacement + 1.0) * 0.5;
    vec3 base = mix(uColorA, uColorB, t);
    vec3 color = mix(base, uColorC, smoothstep(0.55, 0.95, t));

    // Rim light — highlights silhouette against dark bg
    vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
    float rim = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.2);
    color += uColorC * rim * 0.9;

    gl_FragColor = vec4(color, 0.96);
  }
`

// ------------------------------------------------------------------
// Blob mesh
// ------------------------------------------------------------------

function Blob({ reducedMotion }: { reducedMotion: boolean }) {
  const matRef = React.useRef<THREE.ShaderMaterial>(null)
  const meshRef = React.useRef<THREE.Mesh>(null)

  const uniforms = React.useMemo(
    () => ({
      uTime: { value: 0 },
      uStrength: { value: 0.28 },
      uColorA: { value: new THREE.Color("#0B0F2E") }, // deep navy
      uColorB: { value: new THREE.Color("#4191FF") }, // brand blue
      uColorC: { value: new THREE.Color("#D4AF37") }, // brand gold
    }),
    []
  )

  useFrame(({ clock, pointer }) => {
    if (!matRef.current || !meshRef.current) return
    if (!reducedMotion) {
      matRef.current.uniforms.uTime.value = clock.elapsedTime
    }
    // Gentle rotation + subtle mouse parallax.
    const rotSpeed = reducedMotion ? 0 : 0.12
    meshRef.current.rotation.y += 0.002 * rotSpeed * 60
    meshRef.current.rotation.x = THREE.MathUtils.lerp(
      meshRef.current.rotation.x,
      -pointer.y * 0.25,
      0.04
    )
    meshRef.current.rotation.z = THREE.MathUtils.lerp(
      meshRef.current.rotation.z,
      pointer.x * 0.15,
      0.04
    )
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.6, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  )
}

// ------------------------------------------------------------------
// Orbiting particles (gold motes)
// ------------------------------------------------------------------

function OrbitingParticles({
  count = 280,
  reducedMotion,
}: {
  count?: number
  reducedMotion: boolean
}) {
  const ref = React.useRef<THREE.Points>(null)

  const { positions } = React.useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Shell around the blob at radius 2.2–3.8.
      const r = 2.2 + Math.random() * 1.6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    return { positions }
  }, [count])

  useFrame(({ clock }) => {
    if (!ref.current) return
    if (reducedMotion) return
    ref.current.rotation.y = clock.elapsedTime * 0.08
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.15
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#D4AF37"
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ------------------------------------------------------------------
// Glow ring behind the blob
// ------------------------------------------------------------------

function GlowRing({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    const s = 1 + Math.sin(clock.elapsedTime * 1.2) * 0.03
    ref.current.scale.setScalar(s)
  })
  return (
    <mesh ref={ref} position={[0, 0, -1.2]}>
      <ringGeometry args={[1.9, 2.05, 128]} />
      <meshBasicMaterial color="#4191FF" transparent opacity={0.25} />
    </mesh>
  )
}

// ------------------------------------------------------------------
// Root scene component (client-only, wrapped with dynamic() by caller)
// ------------------------------------------------------------------

export default function BrainOrb3D({
  className,
  height = 560,
  reducedMotion = false,
}: {
  className?: string
  height?: number
  reducedMotion?: boolean
}) {
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height,
        position: "relative",
      }}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 4]} intensity={0.9} color="#ffffff" />
        <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#4191FF" />

        {reducedMotion ? (
          <Blob reducedMotion={true} />
        ) : (
          <Float
            speed={1.2}
            rotationIntensity={0.4}
            floatIntensity={0.5}
          >
            <Blob reducedMotion={false} />
          </Float>
        )}

        <OrbitingParticles reducedMotion={reducedMotion} />
        <GlowRing reducedMotion={reducedMotion} />
      </Canvas>

      {/* Corner radial glow layered behind the canvas */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(65,145,255,0.20) 0%, transparent 70%)",
          zIndex: -1,
        }}
      />
    </div>
  )
}
