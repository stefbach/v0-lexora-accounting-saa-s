"use client"

import dynamic from "next/dynamic"
import { useReducedMotion } from "framer-motion"

const TelegramOrbit3D = dynamic(() => import("./TelegramOrbit3D"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: 520,
        background:
          "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(65,145,255,0.18) 0%, transparent 70%)",
      }}
    />
  ),
})

export function TelegramOrbit3DLazy({ height }: { height?: number }) {
  const prefersReducedMotion = useReducedMotion()
  return <TelegramOrbit3D height={height} reducedMotion={!!prefersReducedMotion} />
}
