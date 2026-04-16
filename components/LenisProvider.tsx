"use client"

/**
 * LenisProvider — global smooth-scroll wrapper.
 *
 * Initializes a single Lenis instance for the whole app and drives its
 * RAF loop from GSAP's ticker so GSAP ScrollTrigger stays in perfect
 * sync with the smoothed scroll position.
 *
 * UI/UX Pro Max rules:
 *  - §1 reduced-motion: skips initialization when the user prefers
 *    reduced motion — native browser scrolling is preserved.
 *  - §3 main-thread-budget: no polling; everything is driven by the
 *    existing GSAP ticker (single RAF loop).
 *  - §9 back-behavior / deep-linking: Lenis drives document scroll so
 *    anchor links and browser back/forward still work naturally.
 *
 * Framer Motion's `useScroll` remains compatible because Lenis writes
 * to the real document scrollTop — we just smooth it.
 */

import * as React from "react"
import Lenis from "lenis"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

type LenisContextValue = Lenis | null
const LenisContext = React.createContext<LenisContextValue>(null)

/** Optional hook if a child component needs programmatic scrollTo. */
export function useLenis(): LenisContextValue {
  return React.useContext(LenisContext)
}

/** Scroll to a target (selector or element) with Lenis easing. */
export function useScrollTo() {
  const lenis = useLenis()
  return React.useCallback(
    (target: string | HTMLElement, offset = 0) => {
      if (!lenis) {
        // Fallback when Lenis is disabled (reduced-motion) or SSR.
        if (typeof target === "string") {
          document.querySelector(target)?.scrollIntoView({ behavior: "smooth" })
        } else {
          target.scrollIntoView({ behavior: "smooth" })
        }
        return
      }
      lenis.scrollTo(target, { offset, duration: 1.5 })
    },
    [lenis]
  )
}

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const [lenis, setLenis] = React.useState<Lenis | null>(null)
  const registered = React.useRef(false)

  React.useEffect(() => {
    // Respect the user's reduced-motion preference. In that case we
    // don't smooth the scroll at all — native scroll is preserved.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (media.matches) return

    // Register ScrollTrigger once (safe to call multiple times because
    // GSAP deduplicates, but we guard anyway).
    if (!registered.current) {
      gsap.registerPlugin(ScrollTrigger)
      registered.current = true
    }

    const l = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Keep native touch scroll on mobile (iOS already has inertia).
      syncTouch: false,
    })

    // Keep GSAP ScrollTrigger aware of Lenis's smoothed scroll position.
    l.on("scroll", ScrollTrigger.update)

    // Drive Lenis's RAF from GSAP's ticker so they share one loop.
    const tickerCallback = (time: number) => {
      l.raf(time * 1000)
    }
    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)

    setLenis(l)

    return () => {
      gsap.ticker.remove(tickerCallback)
      l.destroy()
      setLenis(null)
    }
  }, [])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
