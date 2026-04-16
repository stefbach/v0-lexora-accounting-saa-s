# SCROLL.md — Lenis + GSAP ScrollTrigger

## POURQUOI LENIS

Le scroll natif du navigateur est saccadé sur certains OS/GPU. Lenis
ajoute un inertia scroll fluide (easing sur la vélocité) qui élève
immédiatement la qualité perçue. C'est le standard des sites Awwwards.

## 1. SETUP LENIS

```bash
npm install lenis
# package GSAP
npm install gsap
```

### Initialisation React (provider global)

```tsx
// hooks/useLenis.ts
import Lenis from 'lenis'
import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export const useLenis = () => {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    })

    lenis.on('scroll', ScrollTrigger.update)

    gsap.ticker.add((time) => { lenis.raf(time * 1000) })
    gsap.ticker.lagSmoothing(0)

    return () => { lenis.destroy() }
  }, [])
}
```

### Context Provider (scroll programmatique)

```tsx
import { createContext, useContext, useEffect, useRef } from 'react'
import Lenis from 'lenis'

const LenisContext = createContext<Lenis | null>(null)

export const LenisProvider = ({ children }) => {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    lenisRef.current = new Lenis({ duration: 1.2 })
    const raf = (t: number) => { lenisRef.current?.raf(t); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
    return () => lenisRef.current?.destroy()
  }, [])

  return <LenisContext.Provider value={lenisRef.current}>{children}</LenisContext.Provider>
}

export const useScrollTo = () => {
  const lenis = useContext(LenisContext)
  return (target: string | HTMLElement, offset = 0) => {
    lenis?.scrollTo(target, { offset, duration: 1.5 })
  }
}
```

## 2. GSAP ScrollTrigger — PATTERNS

### Reveal au scroll
```ts
gsap.utils.toArray('.reveal').forEach((el: any) => {
  gsap.from(el, {
    opacity: 0, y: 50, duration: 0.8, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 85%', once: true }
  })
})
```

### Pin + Scrub
```ts
gsap.timeline({
  scrollTrigger: {
    trigger: '.pinned', start: 'top top', end: '+=200%',
    pin: true, scrub: 1, anticipatePin: 1
  }
})
.from('.title-char', { yPercent: 100, stagger: 0.02 })
.from('.subtitle',   { opacity: 0, y: 30 }, '-=0.3')
```

### Horizontal Scroll
```ts
const panels = gsap.utils.toArray('.h-panel')
gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: '.h-track', pin: true, scrub: 1,
    snap: { snapTo: 1 / (panels.length - 1) },
    end: () => `+=${track.scrollWidth - window.innerWidth}`
  }
})
```

### Parallax multi-vitesses
```ts
;[
  { sel: '.layer-bg',   speed: -0.3 },
  { sel: '.layer-mid',  speed: -0.15 },
  { sel: '.layer-fore', speed:  0.1 },
].forEach(({ sel, speed }) => {
  gsap.to(sel, {
    yPercent: speed * 100, ease: 'none',
    scrollTrigger: {
      trigger: '.parallax', start: 'top bottom', end: 'bottom top', scrub: true
    }
  })
})
```

### Counter au scroll
```ts
gsap.from({ val: 0 }, {
  val: target, duration: 2, ease: 'power2.out',
  onUpdate: function () { el.textContent = Math.round(this.targets()[0].val).toLocaleString() },
  scrollTrigger: { trigger: el, start: 'top 80%', once: true }
})
```

### Marquee infini
```ts
gsap.to('.marquee-track', {
  xPercent: -50, duration: 20, ease: 'none', repeat: -1
})
```

## 3. SCROLL PROGRESS INDICATOR

```tsx
import { useScroll, useSpring, motion } from 'framer-motion'

const ScrollProgress = () => {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  return (
    <motion.div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
        background: 'var(--color-accent)', transformOrigin: '0%', scaleX,
        zIndex: 1000
      }}
    />
  )
}
```

## 4. DÉSACTIVER LENIS SUR MOBILE

```ts
const lenis = new Lenis({
  smoothTouch: false,   // iOS a déjà un bon scroll natif
  touchMultiplier: 2,
})
```
