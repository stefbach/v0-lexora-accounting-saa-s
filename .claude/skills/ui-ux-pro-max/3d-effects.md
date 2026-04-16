# 3D-EFFECTS.md — React Three Fiber + Three.js

## QUAND UTILISER LA 3D

| Cas d'usage | Solution |
|---|---|
| Blob animé hero | R3F + shader custom |
| Particules / constellation | R3F + Points |
| Modèle GLTF/GLB produit | R3F + useGLTF (Drei) |
| Image 3D au survol (distorsion) | Three.js + PlaneGeometry + shader |
| Background noise organique | Canvas 2D + simplex-noise (plus léger) |
| Scroll 3D cinématique | R3F + useScroll (Drei) |

**RÈGLE** : Si le site n'a pas de budget GPU (mobile first, e-commerce),
utiliser Canvas 2D ou CSS 3D transform à la place.

## 1. SETUP R3F

```bash
npm install three @react-three/fiber @react-three/drei @types/three
```

```tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'

export const Scene = () => (
  <Canvas
    camera={{ position: [0, 0, 5], fov: 45 }}
    gl={{ antialias: true, alpha: true }}
    style={{ position: 'absolute', inset: 0 }}
  >
    <ambientLight intensity={0.5} />
    <directionalLight position={[10, 10, 5]} intensity={1} />
    <Environment preset="city" />
    <MyMesh />
  </Canvas>
)
```

## 2. BLOB HERO ANIMÉ (Shader)

```tsx
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Simplex-noise in GLSL, displacement along normals, colors interpolated
// between uColor1 and uColor2 by the displacement amount.
// Use icosahedronGeometry(2, 20) for smooth organic surface.
```

## 3. PARTICULES (Points)

```tsx
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export const Particles = ({ count = 5000 }) => {
  const ref = useRef<THREE.Points>(null)
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 20
      positions[i*3+1] = (Math.random() - 0.5) * 20
      positions[i*3+2] = (Math.random() - 0.5) * 20
      colors[i*3]   = Math.random()
      colors[i*3+1] = Math.random() * 0.5
      colors[i*3+2] = 1
    }
    return { positions, colors }
  }, [count])
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.05
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color"    args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}
```

## 4. GLTF AVEC ANIMATION

```tsx
import { useGLTF, useAnimations } from '@react-three/drei'

export const Model = ({ url }: { url: string }) => {
  const group = useRef()
  const { scene, animations } = useGLTF(url)
  const { actions } = useAnimations(animations, group)
  useEffect(() => { actions['idle']?.play() }, [actions])
  return <primitive ref={group} object={scene} scale={1} />
}
useGLTF.preload('/model.glb')
```

## 5. SCROLL 3D (Drei)

```tsx
import { ScrollControls, Scroll, useScroll } from '@react-three/drei'

const Anim = () => {
  const scroll = useScroll()
  const ref = useRef()
  useFrame(() => {
    const r = scroll.range(0, 1/3)
    ref.current.rotation.y = r * Math.PI * 2
    ref.current.position.z = -r * 5
  })
  return <mesh ref={ref}><boxGeometry /><meshStandardMaterial /></mesh>
}

<Canvas>
  <ScrollControls pages={5} damping={0.1}>
    <Anim />
    <Scroll html>
      <div style={{ position: 'absolute', top: '100vh' }}>Section 2</div>
    </Scroll>
  </ScrollControls>
</Canvas>
```

## 6. PERFORMANCE 3D

```tsx
// Lazy load le Canvas
const Scene3D = lazy(() => import('./Scene'))

// Réduire le pixel ratio
<Canvas dpr={[1, 1.5]} />

// Instancing > 100 objets identiques
import { Instances, Instance } from '@react-three/drei'
<Instances>
  <boxGeometry /><meshStandardMaterial />
  {positions.map((p, i) => <Instance key={i} position={p} />)}
</Instances>
```
