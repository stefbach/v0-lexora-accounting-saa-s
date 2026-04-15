"use client"

/**
 * LazyVideo — lightweight <video> wrapper that only attaches sources
 * when the element enters the viewport (IntersectionObserver, 200px
 * rootMargin). Aggressive bandwidth saver for below-the-fold media.
 *
 * Respects prefers-reduced-motion by disabling autoplay and rendering
 * the poster only. Still loads the video file so the user can click
 * play if they want.
 */

import * as React from "react"
import { useReducedMotion } from "framer-motion"

export type LazyVideoSrc = {
  av1?: string
  vp9?: string
  h265?: string
  /** Required fallback. */
  h264: string
}

export type LazyVideoProps = {
  src: LazyVideoSrc
  poster: string
  /** Aspect ratio CSS value — reserves space to prevent CLS. */
  aspectRatio?: string
  /** autoplay muted loop by default (true). Set false to require click. */
  autoplay?: boolean
  className?: string
  style?: React.CSSProperties
  rounded?: boolean
  /** Root margin for the IntersectionObserver. Default "200px". */
  rootMargin?: string
  /** Optional fixed aspect ratio: sets width+height attributes to help
   *  the browser reserve exact pixel space. Example: [16, 9]. */
  dimensions?: [number, number]
  /** Human-readable description if the video carries meaning. */
  title?: string
}

export function LazyVideo({
  src,
  poster,
  aspectRatio = "16 / 9",
  autoplay = true,
  className,
  style,
  rounded = true,
  rootMargin = "200px",
  dimensions,
  title,
}: LazyVideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const prefersReducedMotion = useReducedMotion()
  const effectiveAutoplay = autoplay && !prefersReducedMotion

  React.useEffect(() => {
    if (!videoRef.current) return
    if (shouldLoad) return
    const el = videoRef.current
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true)
          io.disconnect()
        }
      },
      { rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shouldLoad, rootMargin])

  return (
    <video
      ref={videoRef}
      poster={poster}
      preload="none"
      muted
      loop
      playsInline
      autoPlay={effectiveAutoplay && shouldLoad}
      controls={!effectiveAutoplay}
      aria-label={title}
      width={dimensions?.[0]}
      height={dimensions?.[1]}
      className={className}
      style={{
        display: "block",
        width: "100%",
        aspectRatio,
        objectFit: "cover",
        borderRadius: rounded ? "16px" : undefined,
        backgroundColor: "#0B0F2E",
        ...style,
      }}
    >
      {shouldLoad && (
        <>
          {src.av1 && <source src={src.av1} type="video/webm; codecs=av01" />}
          {src.vp9 && <source src={src.vp9} type="video/webm; codecs=vp9" />}
          {src.h265 && <source src={src.h265} type="video/mp4; codecs=hvc1" />}
          <source src={src.h264} type="video/mp4" />
        </>
      )}
    </video>
  )
}
