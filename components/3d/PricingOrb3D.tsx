"use client"

/**
 * PricingOrb3D — a slimmer 3D accent scene for the /tarifs hero.
 *
 * Wireframe icosahedron rotating + orbital gold particles.
 * Smaller than BrainOrb3D: uses a wireframe (no shader) so the bundle
 * + GPU cost stay minimal on a page that already has heavy content
 * (pricing table, calculator, matrix).
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

function WireOrb({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.LineSegments>(null)
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.rotation.y = clock.elapsedTime * 0.2
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.15) * 0.3
  })
  return (
    <lineSegments ref={ref}>
      <edgesGeometry args={[new THREE.IcosahedronGeometry(1.5, 2)]} />
      <lineBasicMaterial color="#D4AF37" transparent opacity={0.65} />
    </lineSegments>
  )
}

function InnerCore({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    if (!reducedMotion) {
      ref.current.rotation.y = clock.elapsedTime * -0.3
      const s = 1 + Math.sin(clock.elapsedTime * 1.5) * 0.03
      ref.current.scale.setScalar(s)
    }
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.9, 1]} />
      <meshPhongMaterial
        color="#4191FF"
        emissive="#0B0F2E"
        emissiveIntensity={0.6}
        flatShading
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}

function GoldParticles({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = React.useRef<THREE.Points>(null)
  const count = 180
  const positions = React.useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 1.9 + Math.random() * 1.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.rotation.y = clock.elapsedTime * 0.1
    ref.current.rotation.z = clock.elapsedTime * 0.05
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#D4AF37"
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

export default function PricingOrb3D({
  height = 360,
  reducedMotion = false,
}: {
  height?: number
  reducedMotion?: boolean
}) {
  return (
    <div
      style={{ width: "100%", height, position: "relative" }}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[4, 4, 4]} intensity={1.2} color="#D4AF37" />
        <pointLight position={[-4, -3, 3]} intensity={0.8} color="#4191FF" />
        <InnerCore reducedMotion={reducedMotion} />
        <WireOrb reducedMotion={reducedMotion} />
        <GoldParticles reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
