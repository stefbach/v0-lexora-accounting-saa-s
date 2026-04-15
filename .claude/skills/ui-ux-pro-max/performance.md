# PERFORMANCE.md — Web Vitals & Optimisation Prod

## MÉTRIQUES CIBLES (Core Web Vitals 2025)

| Métrique | Cible | Ce qui la détruit |
|---|---|---|
| **LCP** | < 2.5s | Images non optimisées, fonts bloquantes, JS lourd |
| **CLS** | < 0.1 | Images sans dimensions, fonts sans font-display |
| **INP** | < 200ms | Handlers lourds sur main thread, animations JS non-GPU |
| **FID** | < 100ms | Bundle JS trop gros, pas de code splitting |
| **TTFB** | < 800ms | Hébergement, pas de CDN |

## 1. IMAGES

```tsx
// Next.js — TOUJOURS spécifier width + height (évite CLS)
import Image from 'next/image'

<Image
  src="/hero.jpg" alt="Hero"
  width={1920} height={1080}
  priority sizes="100vw" quality={85}
  placeholder="blur"
/>

// Below-the-fold
<Image src="/card.jpg" alt="" width={800} height={600} loading="lazy" />
```

### Formats optimaux
AVIF (50% plus petit que WebP, support 95%+) → WebP → JPG fallback.

```html
<picture>
  <source srcset="/hero.avif" type="image/avif" />
  <source srcset="/hero.webp" type="image/webp" />
  <img src="/hero.jpg" alt="Hero" width="1920" height="1080" />
</picture>
```

## 2. FONTS

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="font" type="font/woff2"
      href="/fonts/clash-display-variable.woff2" crossorigin />

<style>
  @font-face {
    font-family: 'Clash Display';
    src: url('/fonts/clash-display-variable.woff2') format('woff2-variations');
    font-weight: 200 700;
    font-display: swap;   /* OBLIGATOIRE pour CLS */
  }
</style>
```

## 3. CODE SPLITTING & LAZY LOADING

```tsx
import { lazy, Suspense } from 'react'
const Home = lazy(() => import('./pages/Home'))

<Suspense fallback={<PageSkeleton />}>
  <Home />
</Suspense>
```

```ts
// Charger GSAP seulement si l'animation est visible
const loadGSAP = async () => {
  const { gsap } = await import('gsap')
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  return { gsap, ScrollTrigger }
}
```

## 4. ANIMATIONS GPU-ONLY

```css
/* INTERDIT : margin, padding, width, height, top, left, font-size */
/* AUTORISÉ : transform, opacity */
.animatable {
  will-change: transform, opacity;   /* à activer/désactiver dynamiquement */
  transform: translateZ(0);
}
```

```tsx
// ❌ Mauvais — animé width = layout shift
<motion.div animate={{ width: '100%', height: 200 }} />

// ✅ Bon — scaleX/scaleY = GPU only
<motion.div style={{ originX: 0 }} animate={{ scaleX: 1, scaleY: 1 }} />
```

## 5. BUNDLE SIZE

```
Bundle initial (gzip):
  JS  < 150KB   ← strict
  CSS < 30KB

Par route lazy (gzip):
  JS  < 50KB
  CSS < 10KB

Three.js : ~570KB non-gzip → toujours lazy load
GSAP     : ~80KB  non-gzip → acceptable
Framer   : ~120KB non-gzip → acceptable si utilisé massivement
```

```ts
// ❌ importe tout Three.js
import * as THREE from 'three'

// ✅ import sélectif
import { WebGLRenderer, PerspectiveCamera, Scene } from 'three'
```

## 6. RESSOURCES CRITIQUES (preload)

```html
<link rel="preload" as="image" href="/hero.avif" fetchpriority="high" />
<link rel="preload" as="font" type="font/woff2" href="/fonts/display.woff2" crossorigin />
<link rel="preload" as="fetch" href="/model.glb" crossorigin />
<link rel="dns-prefetch" href="https://api.example.com" />
```

## 7. CHECKLIST PRODUCTION

### Performance
- [ ] Images en AVIF/WebP + fallback JPG
- [ ] Toutes les images avec `width` + `height`
- [ ] Image hero avec `fetchpriority="high"`
- [ ] Below-fold avec `loading="lazy"`
- [ ] Fonts avec `font-display: swap`
- [ ] Variable fonts (un seul fichier par famille)
- [ ] Code splitting par route (lazy + Suspense)
- [ ] Three.js / GSAP chargés dynamiquement
- [ ] Bundle JS initial < 150KB gzip
- [ ] `will-change` retiré après animation

### Accessibilité
- [ ] Contraste WCAG AA (4.5:1 texte / 3:1 grand texte)
- [ ] `prefers-reduced-motion` respecté sur toutes les animations
- [ ] `focus-visible` custom (jamais `outline: none` seul)
- [ ] Alt text sur toutes les images
- [ ] Landmarks HTML (main, nav, header, footer, section)
- [ ] Tab order logique

### SEO
- [ ] `<title>` + `<meta description>` par page
- [ ] Open Graph (og:title, og:description, og:image 1200×630)
- [ ] `robots.txt` + `sitemap.xml`
- [ ] Schema.org JSON-LD

### Cross-browser
- [ ] Chrome, Firefox, Safari, Edge
- [ ] iOS Safari, Android Chrome
- [ ] 375 / 768 / 1280 / 1920

### Sécurité
- [ ] CSP headers configurés
- [ ] HTTPS forced
- [ ] Env variables non exposées côté client
