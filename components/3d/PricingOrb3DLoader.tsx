"use client"

import dynamic from "next/dynamic"
import { useReducedMotion } from "framer-motion"

const PricingOrb3D = dynamic(() => import("./PricingOrb3D"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: 360,
        position: "relative",
      }}
    />
  ),
})

export function PricingOrb3DLazy({ height }: { height?: number }) {
  const prefersReducedMotion = useReducedMotion()
  return <PricingOrb3D height={height} reducedMotion={!!prefersReducedMotion} />
}
