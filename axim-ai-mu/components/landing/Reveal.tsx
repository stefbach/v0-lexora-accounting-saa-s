"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"

/**
 * Fade + rise in when element enters viewport.
 */
export function Reveal({
  children,
  delay = 0,
  className
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
