"use client"

/**
 * LogoMarquee — infinite horizontally-scrolling strip of compatibility
 * logos / trust signals. Uses pure CSS transform for 60fps; duplicates
 * the list once so the wrap is seamless.
 *
 * Respects prefers-reduced-motion (static grid instead of scroll).
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"
import {
  Landmark,
  Scale,
  Building2,
  BookOpen,
  Globe,
  ShieldCheck,
  Cpu,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

type Item = {
  icon: LucideIcon
  label: string
}

const ITEMS: Item[] = [
  { icon: Landmark, label: "MRA" },
  { icon: Scale, label: "WRA 2019" },
  { icon: Building2, label: "ROC" },
  { icon: BookOpen, label: "IFRS · IAS" },
  { icon: Globe, label: "IAS 21" },
  { icon: ShieldCheck, label: "DPA 2017" },
  { icon: Cpu, label: "AI · ML" },
  { icon: BarChart3, label: "e-MRA" },
]

export function LogoMarquee({
  className,
  durationSec = 28,
}: {
  className?: string
  durationSec?: number
}) {
  const prefersReducedMotion = useReducedMotion()
  const list = [...ITEMS, ...ITEMS]

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        maskImage:
          "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "40px",
          width: "max-content",
          animation: prefersReducedMotion
            ? undefined
            : `lexora-marquee ${durationSec}s linear infinite`,
        }}
      >
        {list.map((it, i) => (
          <div
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 18px",
              borderRadius: "999px",
              border: "1px solid rgba(232,234,252,0.12)",
              backgroundColor: "rgba(232,234,252,0.04)",
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            <it.icon size={14} color="#D4AF37" strokeWidth={1.8} />
            <span>{it.label}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes lexora-marquee {
          from {
            transform: translateX(0);
          }
          to {
            /* Translate by half since we duplicated the list. */
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}
