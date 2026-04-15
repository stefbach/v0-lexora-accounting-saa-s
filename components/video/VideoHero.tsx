"use client"

/**
 * VideoHero — full-screen hero with a looping background video.
 *
 * Follows the UI/UX Pro Max video.md skill:
 *  - Multi-format source order AV1 → VP9 → H.265 → H.264 (MP4 fallback
 *    always last, always provided).
 *  - AVIF/WebP poster shown while the video is loading so LCP stays
 *    under 2.5s and CLS stays at 0 (poster occupies the final box).
 *  - Respects prefers-reduced-motion: the video is not mounted at all
 *    when the user asked for reduced motion; the poster stays.
 *  - WCAG 2.2.2 pause button (visible when autoplay > 5s and the user
 *    chose to keep motion).
 *  - aria-hidden=true + role=presentation when children have the
 *    actual accessible content.
 *
 * Usage:
 *   <VideoHero
 *     src={{
 *       av1: '/videos/hero.av1.webm',
 *       vp9: '/videos/hero.vp9.webm',
 *       h265: '/videos/hero.h265.mp4',
 *       h264: '/videos/hero.h264.mp4',
 *     }}
 *     poster="/images/hero-poster.avif"
 *     overlay={0.45}
 *   >
 *     <HeroCopy />
 *   </VideoHero>
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"
import { Pause, Play } from "lucide-react"

export type VideoHeroSrc = {
  av1?: string
  vp9?: string
  h265?: string
  /** Required — universal fallback. */
  h264: string
}

export type VideoHeroProps = {
  src: VideoHeroSrc
  /** AVIF/WebP poster. Used as the `poster` attribute + rendered as
   *  fallback image while the video is loading (prevents CLS). */
  poster: string
  /** Dark overlay opacity (0–1). Default 0.4. */
  overlay?: number
  /** Height: '100svh' by default. Accepts any CSS height value. */
  height?: string
  /** Optional accessible label describing the background media. */
  ariaLabel?: string
  /** `children` are rendered above the video overlay. */
  children?: React.ReactNode
  /** Disable the WCAG pause/play button (not recommended). */
  hideControls?: boolean
  /** Extra class for the root <section>. */
  className?: string
}

export function VideoHero({
  src,
  poster,
  overlay = 0.4,
  height = "100svh",
  ariaLabel,
  children,
  hideControls = false,
  className,
}: VideoHeroProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [playing, setPlaying] = React.useState(true)
  const prefersReducedMotion = useReducedMotion()

  // Pause when out of viewport to save CPU/bandwidth.
  React.useEffect(() => {
    if (!videoRef.current) return
    const el = videoRef.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (playing) el.play().catch(() => {})
          } else {
            el.pause()
          }
        }
      },
      { threshold: 0.1 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [playing])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => {})
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  return (
    <section
      className={className}
      aria-label={ariaLabel}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
      }}
    >
      {/* Poster (always rendered — prevents CLS, stays visible for
          reduced-motion users since they don't get the video). */}
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
          transition: "opacity 0.8s ease",
          opacity: loaded && !prefersReducedMotion ? 0 : 1,
          zIndex: 1,
        }}
      />

      {/* Video (skipped entirely when the user prefers reduced motion). */}
      {!prefersReducedMotion && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster={poster}
          aria-hidden="true"
          role="presentation"
          onCanPlay={() => setLoaded(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "opacity 0.8s ease",
            opacity: loaded ? 1 : 0,
            zIndex: 2,
          }}
        >
          {src.av1 && <source src={src.av1} type="video/webm; codecs=av01" />}
          {src.vp9 && <source src={src.vp9} type="video/webm; codecs=vp9" />}
          {src.h265 && <source src={src.h265} type="video/mp4; codecs=hvc1" />}
          <source src={src.h264} type="video/mp4" />
        </video>
      )}

      {/* Dark overlay for text legibility. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${overlay})`,
          zIndex: 3,
        }}
      />

      {/* Content above the overlay. */}
      <div
        style={{
          position: "relative",
          zIndex: 4,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>

      {/* WCAG 2.2.2 pause button (only when video is actually playing). */}
      {!prefersReducedMotion && !hideControls && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Mettre en pause la vidéo" : "Lire la vidéo"}
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 5,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.22)",
            backgroundColor: "rgba(11,15,46,0.55)",
            color: "#FFFFFF",
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            transition: "transform 0.18s ease-out, background-color 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(11,15,46,0.75)"
            e.currentTarget.style.transform = "scale(1.05)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(11,15,46,0.55)"
            e.currentTarget.style.transform = "scale(1)"
          }}
        >
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      )}
    </section>
  )
}
