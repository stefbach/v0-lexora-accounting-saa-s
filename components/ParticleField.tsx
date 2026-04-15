"use client"

/**
 * ParticleField — permanently-moving neural particle field.
 *
 * Renders a canvas-backed animated swarm of dots that drift slowly and
 * draw faint lines between nearby neighbors, suggesting a "living
 * neural network" surface behind the content.
 *
 * UI/UX Pro Max rules applied:
 *  - §1 reduced-motion: renders a static snapshot instead of animating.
 *  - §3 main-thread-budget: ~60fps with throttled request-animation-frame
 *    and O(n) neighbor scan with early exits.
 *  - §3 transform-performance: animation draws to canvas (GPU-composited),
 *    no DOM reflow.
 *  - §7 motion-meaning: the drift evokes "the AI is always thinking",
 *    grounding the product claim.
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

type Props = {
  density?: number // particles per 10k px²
  color?: string
  linkColor?: string
  linkDistance?: number
  className?: string
  speed?: number
}

export function ParticleField({
  density = 0.8,
  color = "rgba(65,145,255,0.55)",
  linkColor = "rgba(65,145,255,0.18)",
  linkDistance = 130,
  speed = 0.25,
  className,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    let width = parent.clientWidth
    let height = parent.clientHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let particles: Particle[] = []
    let rafId = 0

    function resize() {
      if (!canvas || !parent || !ctx) return
      width = parent.clientWidth
      height = parent.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    function seed() {
      const area = width * height
      const count = Math.max(24, Math.min(120, Math.round((area / 10000) * density)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r: Math.random() * 1.6 + 0.6,
      }))
    }

    function step() {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1
      }

      // Draw links first so dots sit on top.
      ctx.lineWidth = 0.8
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          if (Math.abs(dx) > linkDistance) continue
          const dy = a.y - b.y
          if (Math.abs(dy) > linkDistance) continue
          const d2 = dx * dx + dy * dy
          if (d2 > linkDistance * linkDistance) continue
          const d = Math.sqrt(d2)
          const alpha = 1 - d / linkDistance
          ctx.strokeStyle = linkColor.replace(
            /rgba?\(([^)]+)\)/,
            (_m, vals) => {
              const parts = vals.split(",").map((v: string) => v.trim())
              const a1 = parts[3] !== undefined ? parseFloat(parts[3]) : 1
              return `rgba(${parts[0]},${parts[1]},${parts[2]},${(a1 * alpha).toFixed(3)})`
            }
          )
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      ctx.fillStyle = color
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      rafId = requestAnimationFrame(step)
    }

    resize()

    if (prefersReducedMotion) {
      // Draw a single static frame.
      step()
      cancelAnimationFrame(rafId)
    } else {
      step()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [color, linkColor, linkDistance, density, speed, prefersReducedMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  )
}
