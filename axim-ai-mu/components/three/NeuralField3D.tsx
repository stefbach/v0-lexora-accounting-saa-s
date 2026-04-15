"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"

/**
 * 3D animated neural network with bloom post-processing.
 * Nodes orbit around a central core, signals travel along edges.
 */
function NeuralNetwork() {
  const groupRef = useRef<THREE.Group>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)

  // 1. Generate static node positions distributed on a sphere (Fibonacci).
  const { positions, edges, edgeColors } = useMemo(() => {
    const NODE_COUNT = 120
    const RADIUS = 2.2
    const pts = new Float32Array(NODE_COUNT * 3)

    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / NODE_COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const x = Math.cos(theta) * Math.sin(phi) * RADIUS
      const y = Math.sin(theta) * Math.sin(phi) * RADIUS
      const z = Math.cos(phi) * RADIUS
      pts[i * 3 + 0] = x
      pts[i * 3 + 1] = y
      pts[i * 3 + 2] = z
    }

    // 2. Build edges between nodes that are close enough.
    const edgePairs: number[] = []
    const edgeCols: number[] = []
    const PALETTE: [number, number, number][] = [
      [0.42, 0.31, 0.94], // violet
      [0.0, 0.73, 0.93], // cyan
      [0.0, 0.83, 0.42] // green
    ]
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dx = pts[i * 3] - pts[j * 3]
        const dy = pts[i * 3 + 1] - pts[j * 3 + 1]
        const dz = pts[i * 3 + 2] - pts[j * 3 + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 0.85) {
          const c = PALETTE[(i + j) % PALETTE.length]
          edgePairs.push(
            pts[i * 3],
            pts[i * 3 + 1],
            pts[i * 3 + 2],
            pts[j * 3],
            pts[j * 3 + 1],
            pts[j * 3 + 2]
          )
          edgeCols.push(...c, ...c)
        }
      }
    }

    return {
      positions: pts,
      edges: new Float32Array(edgePairs),
      edgeColors: new Float32Array(edgeCols)
    }
  }, [])

  // 3. Animate rotation + pulse.
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.08
      groupRef.current.rotation.x = Math.sin(t * 0.15) * 0.15
    }
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial
      mat.size = 0.055 + Math.sin(t * 1.5) * 0.012
    }
    if (linesRef.current) {
      const mat = linesRef.current.material as THREE.LineBasicMaterial
      mat.opacity = 0.35 + Math.sin(t * 0.8) * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      {/* glowing central core */}
      <mesh>
        <icosahedronGeometry args={[0.45, 2]} />
        <meshBasicMaterial
          color="#AE9BFF"
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshBasicMaterial color="#6C4FF0" />
      </mesh>

      {/* edges */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[edges, 3]}
            count={edges.length / 3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[edgeColors, 3]}
            count={edgeColors.length / 3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* nodes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#40D4FF"
          size={0.055}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* traveling signals */}
      <SignalPulses />
    </group>
  )
}

/**
 * Bright packets traveling across random chords.
 */
function SignalPulses() {
  const ref = useRef<THREE.Points>(null)
  const { positions, targets, speeds, colors } = useMemo(() => {
    const N = 48
    const pos = new Float32Array(N * 3)
    const tgt = new Float32Array(N * 3)
    const sp = new Float32Array(N)
    const col = new Float32Array(N * 3)
    const palette: [number, number, number][] = [
      [1, 0.85, 0.35], // amber
      [1, 0.3, 0.5], // rose
      [0.42, 0.31, 0.94], // violet
      [0, 0.83, 0.42] // green
    ]
    for (let i = 0; i < N; i++) {
      const r = 2.2
      const phi1 = Math.random() * Math.PI
      const th1 = Math.random() * Math.PI * 2
      const phi2 = Math.random() * Math.PI
      const th2 = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(th1) * Math.sin(phi1) * r
      pos[i * 3 + 1] = Math.sin(th1) * Math.sin(phi1) * r
      pos[i * 3 + 2] = Math.cos(phi1) * r
      tgt[i * 3] = Math.cos(th2) * Math.sin(phi2) * r
      tgt[i * 3 + 1] = Math.sin(th2) * Math.sin(phi2) * r
      tgt[i * 3 + 2] = Math.cos(phi2) * r
      sp[i] = 0.2 + Math.random() * 0.4
      const c = palette[i % palette.length]
      col[i * 3] = c[0]
      col[i * 3 + 1] = c[1]
      col[i * 3 + 2] = c[2]
    }
    return { positions: pos, targets: tgt, speeds: sp, colors: col }
  }, [])

  const progress = useRef<Float32Array>(
    new Float32Array(Array.from({ length: 48 }, () => Math.random()))
  )

  useFrame((_state, delta) => {
    if (!ref.current) return
    const posAttr = ref.current.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute

    for (let i = 0; i < 48; i++) {
      progress.current[i] += delta * speeds[i]
      if (progress.current[i] >= 1) {
        progress.current[i] = 0
        // pick new target
        const r = 2.2
        const phi = Math.random() * Math.PI
        const th = Math.random() * Math.PI * 2
        positions[i * 3] = posAttr.getX(i)
        positions[i * 3 + 1] = posAttr.getY(i)
        positions[i * 3 + 2] = posAttr.getZ(i)
        targets[i * 3] = Math.cos(th) * Math.sin(phi) * r
        targets[i * 3 + 1] = Math.sin(th) * Math.sin(phi) * r
        targets[i * 3 + 2] = Math.cos(phi) * r
      }
      const t = progress.current[i]
      const x = positions[i * 3] + (targets[i * 3] - positions[i * 3]) * t
      const y =
        positions[i * 3 + 1] +
        (targets[i * 3 + 1] - positions[i * 3 + 1]) * t
      const z =
        positions[i * 3 + 2] +
        (targets[i * 3 + 2] - positions[i * 3 + 2]) * t
      posAttr.setXYZ(i, x, y, z)
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.slice(), 3]}
          count={48}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={48}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.14}
        sizeAttenuation
        vertexColors
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function NeuralField3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#6C4FF0" />
      <pointLight position={[-5, -5, -5]} intensity={0.9} color="#00BBEE" />

      <NeuralNetwork />

      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.1} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  )
}
