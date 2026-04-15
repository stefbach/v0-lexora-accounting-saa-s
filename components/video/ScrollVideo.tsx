"use client"

/**
 * ScrollVideo — Apple-style frame-by-frame scroll-driven playback.
 *
 * The video is invisible; its frames are rendered into a sticky <canvas>
 * whose currentTime is driven by GSAP ScrollTrigger. Use an MP4 H.264
 * source (frame-accurate seek on all browsers; WebM seek is laggy).
 *
 * Reduced motion: we render the poster full-size, no canvas, no GSAP.
 *
 * Usage:
 *   <ScrollVideo
 *     src="/videos/product-demo.mp4"
 *     poster="/videos/product-demo-poster.avif"
 *     height="420vh"
 *   />
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"

export type ScrollVideoProps = {
  /** MP4 H.264 recommended for frame-accurate seek. */
  src: string
  /** Poster for pre-load + reduced-motion fallback. */
  poster: string
  /** Total scroll length of the pinned region. Default 500vh. */
  height?: string
  className?: string
}

export function ScrollVideo({
  src,
  poster,
  height = "500vh",
  className,
}: ScrollVideoProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  React.useEffect(() => {
    if (prefersReducedMotion) return
    if (!containerRef.current || !videoRef.current || !canvasRef.current) return

    const container = containerRef.current
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let cleanupTrigger: (() => void) | null = null
    let rafId: number | null = null

    // Lazy-import GSAP so Three.js-free pages don't ship it.
    ;(async () => {
      const { gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)

      const resize = () => {
        if (!video.videoWidth || !video.videoHeight) return
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      const drawFrame = () => {
        if (video.readyState < 2) return
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      }

      const onLoadedMeta = () => {
        resize()
        drawFrame()

        const trigger = ScrollTrigger.create({
          trigger: container,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self) => {
            const t = self.progress * video.duration
            if (Math.abs(video.currentTime - t) > 0.04) {
              // Schedule seek on the next frame for smoother playback.
              if (rafId !== null) cancelAnimationFrame(rafId)
              rafId = requestAnimationFrame(() => {
                video.currentTime = t
              })
            }
          },
        })

        cleanupTrigger = () => trigger.kill()
      }

      video.addEventListener("loadedmetadata", onLoadedMeta)
      video.addEventListener("seeked", drawFrame)
      video.addEventListener("resize", resize)

      // Kick off loading.
      video.load()

      cleanupTrigger = () => {
        video.removeEventListener("loadedmetadata", onLoadedMeta)
        video.removeEventListener("seeked", drawFrame)
        video.removeEventListener("resize", resize)
      }
    })()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (cleanupTrigger) cleanupTrigger()
    }
  }, [prefersReducedMotion])

  // Reduced motion: just show the poster at 100vh, no scroll trickery.
  if (prefersReducedMotion) {
    return (
      <div
        className={className}
        style={{
          position: "relative",
          height: "100vh",
          overflow: "hidden",
        }}
      >
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
          }}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className} style={{ height }}>
      {/* Hidden seek video. */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        muted
        playsInline
        aria-hidden="true"
        style={{ display: "none" }}
      />
      {/* Sticky canvas that actually paints. */}
      <div style={{ position: "sticky", top: 0, height: "100vh", background: "#0B0F2E" }}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    </div>
  )
}
