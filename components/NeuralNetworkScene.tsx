"use client"

/**
 * NeuralNetworkScene — animated brain + connections visualization.
 *
 * Represents Lexora's 6 AI agents orbiting a central "brain" (Lexora core).
 * Data travels continuously along the connections from/to the center,
 * and each node pulses softly to suggest constant processing.
 *
 * UI/UX Pro Max rules applied:
 *  - §1 reduced-motion: all loops stop when prefers-reduced-motion is set.
 *  - §3 transform-performance: only animates transform + opacity + cx/cy
 *    on small SVG primitives — no layout thrash.
 *  - §7 motion-meaning: motion is semantic (data flowing, agents thinking),
 *    not decorative.
 *  - §4 no-emoji-icons: uses Lucide SVG icons via foreignObject.
 */

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Brain,
  FileSearch,
  GitCompareArrows,
  Scale,
  Users,
  Sparkles,
  Bot,
  type LucideIcon,
} from "lucide-react"

type AgentNode = {
  id: string
  x: number
  y: number
  icon: LucideIcon
  label: string
  accent: "blue" | "gold"
}

const CENTER_X = 400
const CENTER_Y = 230
const VIEWBOX_W = 800
const VIEWBOX_H = 460

// Six agents in a hexagonal-ish orbit around the center. Alternating
// blue/gold gives a rhythmic two-color identity consistent with the brand.
const AGENTS: AgentNode[] = [
  { id: "ocr",   x: 140, y: 110, icon: FileSearch,      label: "OCR",         accent: "blue" },
  { id: "inv",   x: 400, y: 50,  icon: Bot,             label: "Invoice",     accent: "gold" },
  { id: "rec",   x: 660, y: 110, icon: GitCompareArrows,label: "Reconcile",   accent: "blue" },
  { id: "tax",   x: 680, y: 350, icon: Sparkles,        label: "Tax",         accent: "gold" },
  { id: "hr",    x: 400, y: 410, icon: Users,           label: "HR",          accent: "blue" },
  { id: "legal", x: 120, y: 350, icon: Scale,           label: "Legal",       accent: "gold" },
]

const COLORS = {
  bg: "#0B0F2E",
  line: "rgba(65,145,255,0.35)",
  lineStrong: "rgba(65,145,255,0.65)",
  pulseBlue: "#4191FF",
  pulseGold: "#D4AF37",
  nodeFill: "#101847",
  nodeBorderBlue: "#4191FF",
  nodeBorderGold: "#D4AF37",
  coreFill: "#141C4A",
  coreRing: "#D4AF37",
  text: "#A8AFC7",
}

function buildConnectionPath(agent: AgentNode): string {
  // Build a slight curve from center toward the agent node by offsetting
  // the control point perpendicular to the direct line.
  const mx = (CENTER_X + agent.x) / 2
  const my = (CENTER_Y + agent.y) / 2
  const dx = agent.x - CENTER_X
  const dy = agent.y - CENTER_Y
  // Perpendicular normal (normalized * curvature amount).
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const curvature = 28
  const cx = mx + nx * curvature
  const cy = my + ny * curvature
  return `M ${CENTER_X} ${CENTER_Y} Q ${cx} ${cy} ${agent.x} ${agent.y}`
}

export function NeuralNetworkScene({
  className,
  ariaLabel = "Animated illustration: six AI agents connected to the Lexora core brain",
}: {
  className?: string
  ariaLabel?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className={className}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
      >
        <defs>
          {/* Radial glow behind the core brain. */}
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(212,175,55,0.35)" />
            <stop offset="60%" stopColor="rgba(65,145,255,0.10)" />
            <stop offset="100%" stopColor="rgba(11,15,46,0)" />
          </radialGradient>

          {/* Line gradient: cool blue fading toward the edges. */}
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={COLORS.lineStrong} />
            <stop offset="100%" stopColor="rgba(65,145,255,0.05)" />
          </linearGradient>

          {/* Per-agent paths. We reference them by id from <circle>
              + animateMotion so data pulses travel along the curve. */}
          {AGENTS.map((a) => (
            <path
              key={`path-${a.id}`}
              id={`conn-${a.id}`}
              d={buildConnectionPath(a)}
              fill="none"
            />
          ))}
        </defs>

        {/* Ambient glow behind everything. */}
        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r={260}
          fill="url(#coreGlow)"
        />

        {/* Static background dots — give a "neural field" feel. */}
        {BACKGROUND_DOTS.map((d, i) => (
          <motion.circle
            key={`bgd-${i}`}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="rgba(168,175,199,0.25)"
            initial={{ opacity: 0.2 }}
            animate={
              prefersReducedMotion
                ? { opacity: 0.25 }
                : { opacity: [0.1, 0.45, 0.1] }
            }
            transition={{
              duration: 3 + (i % 4),
              delay: (i % 7) * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Connection lines from core to each agent. */}
        {AGENTS.map((a) => (
          <path
            key={`line-${a.id}`}
            d={buildConnectionPath(a)}
            fill="none"
            stroke={COLORS.line}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        {/* Data pulses travelling outward along each connection. */}
        {!prefersReducedMotion &&
          AGENTS.map((a, i) => (
            <React.Fragment key={`pulse-${a.id}`}>
              {/* Outbound pulse (core → agent) */}
              <circle
                r={4}
                fill={a.accent === "gold" ? COLORS.pulseGold : COLORS.pulseBlue}
                opacity={0.9}
              >
                <animateMotion
                  dur={`${2.8 + (i % 3) * 0.6}s`}
                  begin={`${i * 0.4}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#conn-${a.id}`} />
                </animateMotion>
              </circle>
              {/* Inbound pulse (agent → core), smaller + delayed */}
              <circle
                r={2.5}
                fill={a.accent === "gold" ? COLORS.pulseBlue : COLORS.pulseGold}
                opacity={0.75}
              >
                <animateMotion
                  dur={`${3.4 + (i % 2) * 0.7}s`}
                  begin={`${i * 0.55 + 1}s`}
                  repeatCount="indefinite"
                  keyPoints="1;0"
                  keyTimes="0;1"
                >
                  <mpath href={`#conn-${a.id}`} />
                </animateMotion>
              </circle>
            </React.Fragment>
          ))}

        {/* Agent nodes — pulse softly to suggest processing. */}
        {AGENTS.map((a, i) => {
          const border = a.accent === "gold" ? COLORS.nodeBorderGold : COLORS.nodeBorderBlue
          return (
            <motion.g
              key={`node-${a.id}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.08, duration: 0.5, ease: "easeOut" }}
            >
              {/* Halo */}
              <motion.circle
                cx={a.x}
                cy={a.y}
                r={26}
                fill={border}
                opacity={0.15}
                animate={
                  prefersReducedMotion
                    ? { scale: 1 }
                    : { scale: [1, 1.25, 1], opacity: [0.15, 0.05, 0.15] }
                }
                transition={{
                  duration: 2.6,
                  delay: i * 0.25,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ transformOrigin: `${a.x}px ${a.y}px` }}
              />
              {/* Node body */}
              <circle
                cx={a.x}
                cy={a.y}
                r={22}
                fill={COLORS.nodeFill}
                stroke={border}
                strokeWidth={1.5}
              />
              {/* Icon via foreignObject so we can use Lucide React icons. */}
              <foreignObject
                x={a.x - 11}
                y={a.y - 11}
                width={22}
                height={22}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: border,
                  }}
                >
                  <a.icon size={14} strokeWidth={2} aria-hidden="true" />
                </div>
              </foreignObject>
              {/* Label */}
              <text
                x={a.x}
                y={a.y + 42}
                textAnchor="middle"
                fill={COLORS.text}
                fontSize={11}
                fontFamily="Poppins, sans-serif"
                fontWeight={500}
              >
                {a.label}
              </text>
            </motion.g>
          )
        })}

        {/* Central core — larger "brain" node. */}
        <motion.g
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <motion.circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={60}
            fill="none"
            stroke={COLORS.coreRing}
            strokeWidth={1}
            opacity={0.35}
            animate={
              prefersReducedMotion
                ? { scale: 1 }
                : { scale: [1, 1.12, 1], opacity: [0.35, 0.08, 0.35] }
            }
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px` }}
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={44}
            fill={COLORS.coreFill}
            stroke={COLORS.coreRing}
            strokeWidth={1.5}
          />
          <foreignObject
            x={CENTER_X - 20}
            y={CENTER_Y - 20}
            width={40}
            height={40}
          >
            <div
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.coreRing,
              }}
            >
              <Brain size={28} strokeWidth={1.8} aria-hidden="true" />
            </div>
          </foreignObject>
          <text
            x={CENTER_X}
            y={CENTER_Y + 68}
            textAnchor="middle"
            fill="#E8EAFC"
            fontSize={13}
            fontFamily="Poppins, sans-serif"
            fontWeight={700}
            letterSpacing="0.15em"
          >
            LEXORA CORE
          </text>
        </motion.g>
      </svg>
    </div>
  )
}

// Pre-seeded (deterministic) background dots so SSR and client match.
const BACKGROUND_DOTS: { x: number; y: number; r: number }[] = [
  { x: 70, y: 60, r: 1.6 },
  { x: 220, y: 40, r: 1.2 },
  { x: 350, y: 110, r: 1.4 },
  { x: 510, y: 90, r: 1.2 },
  { x: 610, y: 50, r: 1.6 },
  { x: 740, y: 170, r: 1.4 },
  { x: 760, y: 280, r: 1.2 },
  { x: 720, y: 400, r: 1.6 },
  { x: 560, y: 440, r: 1.2 },
  { x: 320, y: 430, r: 1.4 },
  { x: 180, y: 410, r: 1.2 },
  { x: 60, y: 280, r: 1.6 },
  { x: 40, y: 180, r: 1.2 },
  { x: 260, y: 220, r: 1.4 },
  { x: 540, y: 240, r: 1.4 },
  { x: 400, y: 150, r: 1 },
  { x: 280, y: 330, r: 1 },
  { x: 500, y: 340, r: 1 },
]
