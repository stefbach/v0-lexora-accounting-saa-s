"use client"

/**
 * Motion primitives — UI/UX Pro Max compliant.
 *
 * Rules applied:
 *  - duration-timing: 150–300ms micro, ≤450ms complex (rule §7)
 *  - transform-performance: only transform + opacity (no width/height/top)
 *  - easing: ease-out for enter
 *  - exit-faster-than-enter: exits ~60% of enter duration
 *  - stagger-sequence: 30–50ms per item
 *  - reduced-motion: every primitive respects prefers-reduced-motion
 *  - scale-feedback: 0.97–1.02 for press/hover
 *  - layout-shift-avoid: content renders in final position; we animate
 *    opacity + translateY only (no CLS).
 */

import * as React from "react"
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion"

// ------------------------------------------------------------------
// Reveal — fade + slight translateY on scroll-in.
// ------------------------------------------------------------------

type RevealProps = {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  as?: "div" | "section" | "article" | "header" | "footer"
}

export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  as = "div",
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion()
  const MotionTag = motion[as] as typeof motion.div

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <MotionTag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        duration: 0.45,
        delay,
        ease: [0.22, 1, 0.36, 1], // ease-out cubic
      }}
      className={className}
    >
      {children}
    </MotionTag>
  )
}

// ------------------------------------------------------------------
// StaggerGroup — container that staggers its direct children.
// ------------------------------------------------------------------

type StaggerGroupProps = {
  children: React.ReactNode
  className?: string
  staggerMs?: number // rule: 30–50ms per item
  initialDelayMs?: number
}

const staggerContainer = (stagger: number, initialDelay: number): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren: initialDelay,
    },
  },
})

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
}

export function StaggerGroup({
  children,
  className,
  staggerMs = 45,
  initialDelayMs = 0,
}: StaggerGroupProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      variants={staggerContainer(staggerMs / 1000, initialDelayMs / 1000)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  )
}

// ------------------------------------------------------------------
// HoverLift — card press/hover feedback (scale + translateY).
//   scale-feedback rule: 0.97–1.02 range.
// ------------------------------------------------------------------

type HoverLiftProps = HTMLMotionProps<"div"> & {
  children: React.ReactNode
  lift?: number
}

export function HoverLift({
  children,
  lift = 4,
  className,
  ...rest
}: HoverLiftProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift, transition: { duration: 0.2, ease: "easeOut" } }}
      whileTap={{ scale: 0.98, transition: { duration: 0.12, ease: "easeIn" } }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

// ------------------------------------------------------------------
// PressableWrap — press feedback for buttons/links (inline-block wrapper).
// ------------------------------------------------------------------

export function PressableWrap({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <span className={className}>{children}</span>
  }

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      whileHover={{ scale: 1.02, transition: { duration: 0.18, ease: "easeOut" } }}
      whileTap={{ scale: 0.97, transition: { duration: 0.12, ease: "easeIn" } }}
    >
      {children}
    </motion.span>
  )
}

// ------------------------------------------------------------------
// FadeSlide — imperative fade+slide (e.g. hero text blocks).
// ------------------------------------------------------------------

type FadeSlideProps = {
  children: React.ReactNode
  delay?: number
  y?: number
  duration?: number
  className?: string
}

export function FadeSlide({
  children,
  delay = 0,
  y = 20,
  duration = 0.5,
  className,
}: FadeSlideProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

// ------------------------------------------------------------------
// ShineSweep — gold highlight that sweeps across the parent element
// continuously. Parent must be `position: relative` + `overflow: hidden`.
// ------------------------------------------------------------------

export function ShineSweep({
  color = "rgba(255,255,255,0.12)",
  duration = 3.5,
  className,
}: {
  color?: string
  duration?: number
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()
  if (prefersReducedMotion) return null

  return (
    <motion.span
      aria-hidden="true"
      className={className}
      initial={{ x: "-120%" }}
      animate={{ x: "220%" }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
        repeatDelay: 0.8,
      }}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "50%",
        background: `linear-gradient(110deg, transparent 0%, ${color} 50%, transparent 100%)`,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    />
  )
}

