"use client"

/**
 * AnimatedCounter — count up to a target number when scrolled into view.
 *
 * Uses a Framer Motion `useMotionValue` + `animate()` so the transition is
 * interruptible and respects `prefers-reduced-motion` (renders the final
 * value immediately for reduced-motion users).
 */

import * as React from "react"
import {
  useMotionValue,
  useReducedMotion,
  animate,
} from "framer-motion"

type Props = {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  format?: (n: number) => string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
}

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString("fr-FR")
}

export function AnimatedCounter({
  value,
  duration = 1.4,
  prefix,
  suffix,
  format = defaultFormat,
  className,
  style,
  ariaLabel,
}: Props) {
  const ref = React.useRef<HTMLSpanElement | null>(null)
  const [display, setDisplay] = React.useState<string>(format(0))
  const mv = useMotionValue(0)
  const prefersReducedMotion = useReducedMotion()
  const [started, setStarted] = React.useState(false)

  React.useEffect(() => {
    const unsub = mv.on("change", (v) => setDisplay(format(v)))
    return () => unsub()
  }, [mv, format])

  React.useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started) {
            setStarted(true)
            if (prefersReducedMotion) {
              mv.set(value)
            } else {
              animate(mv, value, {
                duration,
                ease: [0.22, 1, 0.36, 1],
              })
            }
            io.disconnect()
          }
        })
      },
      { threshold: 0.3 }
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [value, duration, mv, started, prefersReducedMotion])

  return (
    <span
      ref={ref}
      className={className}
      style={style}
      aria-label={ariaLabel ?? `${prefix ?? ""}${format(value)}${suffix ?? ""}`}
    >
      {prefix}
      {display}
      {suffix}
    </span>
  )
}
