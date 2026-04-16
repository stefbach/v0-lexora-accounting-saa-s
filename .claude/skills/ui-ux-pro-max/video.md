# VIDEO.md — Intégration Vidéo Haut de Gamme

## FORMATS ET PRIORITÉ

```html
<!-- Ordre obligatoire : WebM AV1 → WebM VP9 → MP4 H.265 → MP4 H.264 -->
<video autoplay muted loop playsinline preload="none">
  <source src="/hero.av1.webm"  type="video/webm; codecs=av01">
  <source src="/hero.vp9.webm"  type="video/webm; codecs=vp9">
  <source src="/hero.h265.mp4"  type="video/mp4;  codecs=hvc1">
  <source src="/hero.h264.mp4"  type="video/mp4">
</video>
```

| Format | Compression | Support | Priorité |
|---|---|---|---|
| WebM AV1 | -50% vs H.264 | Chrome, Firefox 2023+ | 1 |
| WebM VP9 | -40% | Chrome, Firefox, Edge | 2 |
| MP4 H.265 | -30% | Safari 11+, iOS | 3 |
| MP4 H.264 | baseline | Tous | **Fallback obligatoire** |

## Composants disponibles dans Lexora

| Composant | Usage |
|---|---|
| `components/video/VideoHero.tsx` | Hero full-screen, autoplay muted loop, poster AVIF, overlay sombre configurable, pause button WCAG 2.2.2, IntersectionObserver pause-hors-viewport |
| `components/video/LazyVideo.tsx` | `<video>` qui charge ses `<source>` uniquement quand l'élément entre dans le viewport (rootMargin 200 px) |
| `components/video/HoverVideoCard.tsx` | Card qui autoplay au hover/focus et rembobine au leave, avec poster + badge play |
| `components/video/ScrollVideo.tsx` | Scroll-driven frame-par-frame (style Apple), GSAP ScrollTrigger + canvas sticky. MP4 H.264 uniquement. |

Tous les composants :
- respectent `prefers-reduced-motion` (vidéo non montée → poster seul) ;
- utilisent `preload="none"` par défaut (sauf `ScrollVideo` qui a besoin de `preload="auto"` pour le seek) ;
- définissent `objectFit: "cover"` + dimensions pour éviter CLS.

## FFmpeg — commandes de référence

```bash
# H.264 (fallback)
ffmpeg -i input.mov -c:v libx264 -crf 23 -preset slow \
  -vf "scale=1920:-2,fps=24" -c:a aac -b:a 128k \
  -movflags faststart output.h264.mp4

# H.265 (Safari/iOS)
ffmpeg -i input.mov -c:v libx265 -crf 28 -preset slow \
  -vf "scale=1920:-2,fps=24" -tag:v hvc1 output.h265.mp4

# VP9
ffmpeg -i input.mov -c:v libvpx-vp9 -crf 32 -b:v 0 \
  -vf "scale=1920:-2,fps=24" -deadline best output.vp9.webm

# AV1
ffmpeg -i input.mov -c:v libaom-av1 -crf 35 -b:v 0 \
  -vf "scale=1920:-2,fps=24" -cpu-used 4 output.av1.webm

# Poster frame 1
ffmpeg -i input.mov -vframes 1 poster.jpg
```

## Poids cibles

```
Hero background loop  : < 5 MB H.264, < 2 MB VP9/AV1
Section feature 10-20s: < 15 MB H.264, < 6 MB VP9/AV1
Scroll-driven 150f    : < 8 MB H.264 UNIQUEMENT
Card hover 3-5s       : < 1 MB VP9/AV1
```

## Checklist production vidéo

- [ ] Formats : WebM VP9 + MP4 H.264 minimum (AV1 en plus si possible)
- [ ] Poster AVIF fourni
- [ ] `preload="none"` sauf sur hero above-the-fold (`"metadata"`)
- [ ] Lazy load via IntersectionObserver hors hero
- [ ] `prefers-reduced-motion` respecté
- [ ] Bouton pause accessible (WCAG 2.2.2) si autoplay > 5s
- [ ] `aria-hidden="true"` sur vidéos décoratives
- [ ] `-movflags faststart` sur tous les MP4
- [ ] Testé iOS Safari (H.265 ou H.264, pas VP9)
- [ ] Testé 3G : poster visible immédiatement
