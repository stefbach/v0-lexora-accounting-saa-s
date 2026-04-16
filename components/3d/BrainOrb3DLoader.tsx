"use client"

/**
 * Client-only dynamic loader for BrainOrb3D.
 *
 * Three.js (~570KB) is kept out of the initial bundle via next/dynamic
 * with ssr:false. A skeleton frame keeps CLS = 0 while loading.
 */

import dynamic from "next/dynamic"
import { useReducedMotion } from "framer-motion"

const BrainOrb3D = dynamic(() => import("./BrainOrb3D"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: 560,
        position: "relative",
        background:
          "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(65,145,255,0.20) 0%, transparent 70%)",
      }}
    />
  ),
})

export function BrainOrb3DLazy({
  className,
  height,
}: {
  className?: string
  height?: number
}) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <BrainOrb3D
      className={className}
      height={height}
      reducedMotion={!!prefersReducedMotion}
    />
  )
}
