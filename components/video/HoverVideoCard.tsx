"use client"

/**
 * HoverVideoCard — card that autoplays a short muted preview on hover
 * (and on pointer focus for keyboard users). Shows the poster at rest.
 *
 * Good for galleries of demo clips. Pauses and rewinds on leave.
 * Respects prefers-reduced-motion (no autoplay at all, just the poster
 * + native controls shown on click).
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"
import { Play } from "lucide-react"

export type HoverVideoSrc = {
  vp9?: string
  h265?: string
  h264: string
}

export type HoverVideoCardProps = {
  src: HoverVideoSrc
  poster: string
  title?: React.ReactNode
  subtitle?: React.ReactNode
  aspectRatio?: string
  className?: string
  style?: React.CSSProperties
  /** When true, the card shows a play icon in the bottom-right corner
   *  so users know it's a video — not just an image. */
  showPlayBadge?: boolean
  /** Fired when the user clicks the card (e.g. to open a lightbox). */
  onActivate?: () => void
}

export function HoverVideoCard({
  src,
  poster,
  title,
  subtitle,
  aspectRatio = "16 / 9",
  className,
  style,
  showPlayBadge = true,
  onActivate,
}: HoverVideoCardProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [hovered, setHovered] = React.useState(false)
  const prefersReducedMotion = useReducedMotion()

  const handleEnter = () => {
    if (prefersReducedMotion) return
    setHovered(true)
    const v = videoRef.current
    if (v) v.play().catch(() => {})
  }

  const handleLeave = () => {
    setHovered(false)
    const v = videoRef.current
    if (v) {
      v.pause()
      v.currentTime = 0
    }
  }

  return (
    <div
      className={className}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (onActivate && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onActivate()
        }
      }}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "16px",
        backgroundColor: "#0B0F2E",
        border: "1px solid rgba(30,39,96,0.6)",
        cursor: onActivate ? "pointer" : "default",
        ...style,
      }}
    >
      {/* Poster image — always visible, fades out when the video plays. */}
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transition: "opacity 0.3s ease",
          opacity: hovered && !prefersReducedMotion ? 0 : 1,
        }}
      />

      {/* Video — stays mounted so hover play is instant. */}
      {!prefersReducedMotion && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          aria-hidden="true"
          style={{
            position: "relative",
            display: "block",
            width: "100%",
            aspectRatio,
            objectFit: "cover",
          }}
        >
          {src.vp9 && <source src={src.vp9} type="video/webm; codecs=vp9" />}
          {src.h265 && <source src={src.h265} type="video/mp4; codecs=hvc1" />}
          <source src={src.h264} type="video/mp4" />
        </video>
      )}

      {/* Reserve the aspect ratio even if the video isn't rendered. */}
      {prefersReducedMotion && (
        <div style={{ aspectRatio, width: "100%" }} />
      )}

      {/* Play badge. */}
      {showPlayBadge && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: "12px",
            bottom: title || subtitle ? "72px" : "12px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "999px",
            background: "rgba(11,15,46,0.60)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#FFFFFF",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            transition: "transform 0.18s ease-out",
            transform: hovered && !prefersReducedMotion ? "scale(1.1)" : "scale(1)",
          }}
        >
          <Play size={14} aria-hidden="true" />
        </span>
      )}

      {/* Optional title/subtitle bar. */}
      {(title || subtitle) && (
        <div
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            padding: "14px 16px",
            background:
              "linear-gradient(180deg, rgba(11,15,46,0) 0%, rgba(11,15,46,0.8) 80%, rgba(11,15,46,0.92) 100%)",
            color: "#E8EAFC",
            fontFamily: "'Poppins', sans-serif",
          }}
        >
          {title && (
            <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em" }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontSize: "12px", color: "#A8AFC7", marginTop: "2px" }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
