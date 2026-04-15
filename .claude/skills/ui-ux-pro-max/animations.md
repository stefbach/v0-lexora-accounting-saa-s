# ANIMATIONS.md — Framer Motion + GSAP

## 1. FRAMER MOTION — PATTERNS

### Setup de base
```tsx
import { AnimatePresence } from 'framer-motion'

<AnimatePresence mode="wait">
  <Component key={router.pathname} />
</AnimatePresence>
```

### Page Transition
```tsx
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -10, transition: { duration: 0.3 } }
}
```

### Stagger Children
```tsx
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }
const item = {
  hidden: { opacity: 0, y: 30 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
}
```

### Text Reveal (mot par mot)
```tsx
const WordReveal = ({ text }: { text: string }) => {
  const words = text.split(' ')
  return (
    <motion.p
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      initial="hidden" animate="show"
    >
      {words.map((w, i) => (
        <motion.span
          key={i} style={{ display: 'inline-block', marginRight: '0.25em' }}
          variants={{
            hidden: { opacity: 0, y: '100%' },
            show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } }
          }}
        >
          {w}
        </motion.span>
      ))}
    </motion.p>
  )
}
```

### Magnetic Hover
```tsx
const MagneticButton = ({ children }) => {
  const ref = useRef(null)
  const x = useMotionValue(0); const y = useMotionValue(0)
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * 0.3)
    y.set((e.clientY - (r.top  + r.height / 2)) * 0.3)
  }
  return (
    <motion.div ref={ref} style={{ x, y }}
      onMouseMove={onMove} onMouseLeave={() => { x.set(0); y.set(0) }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      {children}
    </motion.div>
  )
}
```

### Reveal on Scroll
```tsx
<motion.div
  initial={{ opacity: 0, y: 40 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-100px' }}
  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
/>
```

### Custom Cursor
```tsx
const CustomCursor = () => {
  const x = useMotionValue(-100); const y = useMotionValue(-100)
  const [hover, setHover] = useState(false)
  const size = useSpring(hover ? 60 : 16, { stiffness: 200, damping: 20 })
  useEffect(() => {
    const m = (e) => { x.set(e.clientX); y.set(e.clientY) }
    window.addEventListener('mousemove', m)
    return () => window.removeEventListener('mousemove', m)
  }, [])
  return (
    <motion.div style={{
      position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999,
      x, y, width: size, height: size, translateX: '-50%', translateY: '-50%',
      borderRadius: '50%', background: 'var(--color-accent)',
      mixBlendMode: 'difference'
    }} />
  )
}
```

## 2. GSAP — RECIPES

### Setup
```ts
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)
```

### Hero Text Cinematic Reveal
```ts
useLayoutEffect(() => {
  const ctx = gsap.context(() => {
    gsap.timeline()
      .from('.hero-line', { yPercent: 110, duration: 1, stagger: 0.12, ease: 'power4.out' })
      .from('.hero-sub',  { opacity: 0, y: 20, duration: 0.8 }, '-=0.4')
      .from('.hero-cta',  { opacity: 0, y: 20, duration: 0.6 }, '-=0.5')
  }, containerRef)
  return () => ctx.revert()
}, [])
```

### Parallax
```ts
gsap.to('.parallax-bg', {
  yPercent: -30, ease: 'none',
  scrollTrigger: { trigger: '.section', start: 'top bottom', end: 'bottom top', scrub: true }
})
```

## 3. EASING CURVES

```ts
const EASE = {
  outExpo:    [0.16, 1, 0.3, 1],
  outQuart:   [0.22, 1, 0.36, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
  spring:     { type: 'spring', stiffness: 200, damping: 25 },
  snappy:     { type: 'spring', stiffness: 400, damping: 30 },
}
```

## 4. REDUCED MOTION (OBLIGATOIRE)

```tsx
import { MotionConfig } from 'framer-motion'
<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

```ts
// GSAP
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.globalTimeline.timeScale(0)
}
```
