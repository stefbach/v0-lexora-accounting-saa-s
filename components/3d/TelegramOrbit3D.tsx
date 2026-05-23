"use client"

/**
 * TelegramOrbit3D — 3D scene with a glowing core sphere and orbiting
 * message-icon planes representing all the Telegram bot capabilities.
 * The user's eye is pulled to a single luminous "command core" with
 * commands floating around it like satellites.
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Float, Html, Sparkles } from "@react-three/drei"
import * as THREE from "three"

const ORBIT_ITEMS = [
  { label: "📊 KPIs", color: "#4191FF" },
  { label: "🧾 Facture", color: "#D4AF37" },
  { label: "💰 Paie", color: "#2ECC8A" },
  { label: "🏦 Banque", color: "#4191FF" },
  { label: "📅 Agenda", color: "#D4AF37" },
  { label: "✉️ Email", color: "#2ECC8A" },
  { label: "🛫 Congés", color: "#4191FF" },
  { label: "⏰ Pointage", color: "#D4AF37" },
  { label: "📑 MRA", color: "#2ECC8A" },
  { label: "🧠 Mémoire", color: "#4191FF" },
  { label: "📷 OCR", color: "#D4AF37" },
  { label: "🎙️ Voix", color: "#2ECC8A" },
]

function CoreSphere({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Mesh>(null)
  const matRef = React.useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.rotation.y = clock.elapsedTime * 0.18
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.4) * 0.15
    if (matRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.15
      matRef.current.emissiveIntensity = 0.9 * pulse
    }
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.95, 4]} />
      <meshStandardMaterial
        ref={matRef}
        color="#4191FF"
        emissive="#4191FF"
        emissiveIntensity={0.9}
        metalness={0.7}
        roughness={0.25}
        wireframe
      />
    </mesh>
  )
}

function InnerOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.rotation.y = -clock.elapsedTime * 0.25
    ref.current.rotation.z = clock.elapsedTime * 0.12
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.65, 64, 64]} />
      <meshStandardMaterial
        color="#0B0F2E"
        emissive="#D4AF37"
        emissiveIntensity={0.35}
        metalness={0.95}
        roughness={0.15}
      />
    </mesh>
  )
}

function OrbitingChips({ reducedMotion }: { reducedMotion: boolean }) {
  const group = React.useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.rotation.y = clock.elapsedTime * 0.08
  })
  const N = ORBIT_ITEMS.length
  return (
    <group ref={group}>
      {ORBIT_ITEMS.map((item, i) => {
        const theta = (i / N) * Math.PI * 2
        const ring = i % 2 === 0 ? 2.3 : 2.9
        const yJitter = Math.sin(i * 1.7) * 0.45
        const x = Math.cos(theta) * ring
        const z = Math.sin(theta) * ring
        return (
          <Float
            key={item.label}
            speed={reducedMotion ? 0 : 1.2 + (i % 3) * 0.2}
            floatIntensity={reducedMotion ? 0 : 0.5}
            rotationIntensity={reducedMotion ? 0 : 0.25}
          >
            <group position={[x, yJitter, z]}>
              <Html
                center
                distanceFactor={6}
                style={{
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: "999px",
                  background: "rgba(11,15,46,0.92)",
                  color: "#E8EAFC",
                  border: `1px solid ${item.color}`,
                  boxShadow: `0 0 18px ${item.color}66, inset 0 0 8px ${item.color}33`,
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                {item.label}
              </Html>
            </group>
          </Float>
        )
      })}
    </group>
  )
}

function ConnectionLines({ reducedMotion }: { reducedMotion: boolean }) {
  const group = React.useRef<THREE.Group>(null)
  const N = ORBIT_ITEMS.length
  const lines = React.useMemo(() => {
    const arr: { points: Float32Array; color: string }[] = []
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2
      const ring = i % 2 === 0 ? 2.3 : 2.9
      const yJitter = Math.sin(i * 1.7) * 0.45
      const x = Math.cos(theta) * ring
      const z = Math.sin(theta) * ring
      const points = new Float32Array([0, 0, 0, x, yJitter, z])
      arr.push({ points, color: ORBIT_ITEMS[i].color })
    }
    return arr
  }, [N])
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.rotation.y = clock.elapsedTime * 0.08
  })
  return (
    <group ref={group}>
      {lines.map((l, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[l.points, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={l.color} transparent opacity={0.18} />
        </line>
      ))}
    </group>
  )
}

export default function TelegramOrbit3D({
  height = 520,
  reducedMotion = false,
}: {
  height?: number
  reducedMotion?: boolean
}) {
  return (
    <div
      aria-hidden="true"
      style={{ width: "100%", height, position: "relative" }}
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.4, 6.5], fov: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 4, 3]} intensity={0.9} color="#ffffff" />
        <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#4191FF" />
        <pointLight position={[0, 0, 0]} intensity={2} color="#D4AF37" distance={4} />

        <CoreSphere reducedMotion={reducedMotion} />
        <InnerOrb reducedMotion={reducedMotion} />
        <ConnectionLines reducedMotion={reducedMotion} />
        <OrbitingChips reducedMotion={reducedMotion} />

        {!reducedMotion && (
          <Sparkles count={70} scale={[7, 5, 7]} size={2} speed={0.4} color="#D4AF37" opacity={0.5} />
        )}
      </Canvas>

      {/* Halo behind canvas */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(65,145,255,0.22) 0%, transparent 70%), radial-gradient(ellipse 35% 35% at 50% 50%, rgba(212,175,55,0.20) 0%, transparent 65%)",
          zIndex: -1,
        }}
      />
    </div>
  )
}
