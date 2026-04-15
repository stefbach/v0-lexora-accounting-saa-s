# UI/UX PRO-MAX SKILL
> Stack complet pour sites de niveau studio web premium (Awwwards / FWA)

## OBJECTIF

Ce skill force Claude Code à produire des interfaces **visuellement
mémorables**, performantes, et animées avec précision — au niveau des
meilleurs studios web mondiaux (Locomotive, Active Theory, Resn, Jam3).

## QUAND CHARGER QUELS MODULES

| Type de site | Modules |
|---|---|
| Landing page / marketing | `animations.md` + `scroll.md` + `tokens.md` + `performance.md` |
| Portfolio / showcase | `animations.md` + `3d-effects.md` + `scroll.md` + `tokens.md` |
| Dashboard / app | `tokens.md` + `animations.md` + `performance.md` |
| Site institutionnel premium | `scroll.md` + `animations.md` + `tokens.md` + `performance.md` |
| Expérience interactive / immersive | `3d-effects.md` + `animations.md` + `scroll.md` |

**RÈGLE** : Toujours charger `tokens.md` et `performance.md` en premier,
quel que soit le projet.

## STACK DE BASE OBLIGATOIRE

```json
{
  "framework": "React 18 + TypeScript",
  "bundler": "Vite / Next.js",
  "styling": "Tailwind CSS + CSS Variables (tokens)",
  "components": "shadcn/ui (base) + composants custom",
  "animations": "Framer Motion (React) ou GSAP (DOM avancé)",
  "scroll": "Lenis (smooth scroll) + GSAP ScrollTrigger",
  "3d": "React Three Fiber + Drei (si nécessaire)",
  "fonts": "Variable fonts via Fontsource ou Google Fonts (jamais Inter/Roboto/Arial)",
  "icons": "Lucide React ou Phosphor Icons"
}
```

## PRINCIPES DESIGN NON-NÉGOCIABLES

### Typographie
- **INTERDIT** : Inter, Roboto, Arial, system-ui pour les titres
- **OBLIGATOIRE** : font display distinctive (Clash Display, Cabinet
  Grotesk, Syne, Playfair, Fraunces, Editorial New, Anton, Bebas Neue…)
- Toujours coupler une display font + une body font complémentaire
- Utiliser les `font-feature-settings` (ligatures, chiffres tabulaires)

### Couleurs
- Palette de 3 à 5 tokens maximum (primary, secondary, accent, bg, surface)
- Un accent couleur fort et inattendu (jamais le purple gradient générique)
- Dark theme ou light theme — jamais les deux par défaut sans raison
- Ratio de contraste WCAG AA minimum

### Espacement
- Système d'espacement basé sur une unité de base (8px grid)
- Sections généreuses : padding vertical 120–200px sur desktop
- Densité intentionnelle : soit très aéré, soit très dense — pas le milieu

### Layouts
- Asymétrie assumée : éviter les layouts centrés génériques
- Grid-breaking : éléments qui sortent du flux
- Typographic scale dramatique : ratio 1.5 minimum entre niveaux

## DÉCISIONS D'ARCHITECTURE

### Framer Motion vs GSAP
```
Framer Motion → composants React, transitions de page, animations d'état UI
GSAP          → animations scroll complexes, timelines, SVG, canvas, perf critique
```

### CSS Animation vs JS Animation
```
CSS → hover states, micro-interactions simples, transitions < 300ms
JS  → séquences, scroll-driven, interactions complexes, > 2 éléments
```

### React Three Fiber vs Canvas 2D
```
R3F    → 3D réel, shaders, particules volumiques, PBR
Canvas → formes génératives 2D, noise, grilles, effets légers
```

## CHECKLIST AVANT LIVRAISON

- [ ] Design tokens définis dans `tokens.css`
- [ ] Smooth scroll Lenis initialisé
- [ ] Animations reduced-motion respectées (`prefers-reduced-motion`)
- [ ] LCP < 2.5s (images optimisées, fonts préchargées)
- [ ] CLS = 0 (dimensions images définies, fonts avec `font-display: swap`)
- [ ] Responsive testé : 375 / 768 / 1280 / 1920
- [ ] Hover states sur tous les éléments interactifs
- [ ] Focus visible accessible (outline custom, pas supprimé)
- [ ] Pas d'Inter/Roboto/Arial dans les titres
- [ ] Pas de purple gradient générique

## MODULES DISPONIBLES

- `animations.md` — Framer Motion patterns + GSAP recipes
- `3d-effects.md` — React Three Fiber + Three.js snippets
- `scroll.md` — Lenis + GSAP ScrollTrigger
- `tokens.md` — Design tokens system complet
- `performance.md` — Web Vitals, optimisation, checklist prod
