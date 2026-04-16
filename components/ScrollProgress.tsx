"use client"

/**
 * ScrollProgress — thin top bar whose width tracks scroll progress.
 *
 * Uses Framer Motion's useScroll + useSpring so the bar feels elastic.
 * Respects prefers-reduced-motion (renders a static 0-width bar then
 * jumps to the final value without spring).
 */

import * as React from "react"
import {
  motion,
  useScroll,
  useSpring,
  useReducedMotion,
} from "framer-motion"

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const prefersReducedMotion = useReducedMotion()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: prefersReducedMotion ? 0 : 120,
    damping: 22,
    restDelta: 0.001,
  })

  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        originX: 0,
        scaleX,
        background:
          "linear-gradient(90deg, #4191FF 0%, #D4AF37 50%, #4191FF 100%)",
        boxShadow: "0 0 12px rgba(65,145,255,0.55)",
        zIndex: 60,
      }}
    />
  )
}
