# UI/UX Pro Max - Design Intelligence

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Comprehensive design guide for web and mobile applications. Contains 50+ styles,
161 color palettes, 57 font pairings, 161 product types with reasoning rules,
99 UX guidelines, and 25 chart types across 10 technology stacks.

## When to Apply

Use this Skill when a task involves **UI structure, visual design decisions,
interaction patterns, or user experience quality control**.

## Rule Categories by Priority

| Priority | Category | Impact |
|----------|----------|--------|
| 1  | Accessibility         | CRITICAL |
| 2  | Touch & Interaction   | CRITICAL |
| 3  | Performance           | HIGH     |
| 4  | Style Selection       | HIGH     |
| 5  | Layout & Responsive   | HIGH     |
| 6  | Typography & Color    | MEDIUM   |
| 7  | Animation             | MEDIUM   |
| 8  | Forms & Feedback      | MEDIUM   |
| 9  | Navigation Patterns   | HIGH     |
| 10 | Charts & Data         | LOW      |

## Quick Reference (key rules applied in this project)

### 1. Accessibility (CRITICAL)
- `color-contrast` — minimum 4.5:1 ratio for body text (3:1 for large).
- `focus-states` — visible 2–4px focus rings on all interactive elements.
- `aria-labels` — icon-only buttons must expose an accessible name.
- `reduced-motion` — respect `prefers-reduced-motion`; reduce/disable motion.
- `keyboard-nav` — tab order matches visual order; full keyboard support.
- `color-not-only` — never convey meaning by color alone; pair with icon/text.

### 2. Touch & Interaction (CRITICAL)
- `touch-target-size` — min 44×44px interactive area.
- `touch-spacing` — minimum 8px gap between targets.
- `loading-buttons` — disable + show spinner during async.
- `press-feedback` — visible state within ~100ms of tap (opacity/scale/ripple).
- `hover-vs-tap` — never rely on hover alone for critical actions.

### 3. Performance (HIGH)
- `image-dimension` — reserve width/height or aspect-ratio (avoid CLS).
- `lazy-loading` — defer below-the-fold and non-critical assets.
- `content-jumping` — reserve space for async content.
- `main-thread-budget` — keep per-frame work under 16ms (60fps).
- `debounce-throttle` — scroll/resize/input handlers must be throttled.

### 5. Layout & Responsive (HIGH)
- `mobile-first` — design for 375px first, scale up.
- `readable-font-size` — min 16px body on mobile (avoids iOS auto-zoom).
- `line-length-control` — 35–60 chars mobile; 60–75 chars desktop.
- `horizontal-scroll` — never on mobile.
- `spacing-scale` — 4/8px rhythm.
- `z-index-management` — defined layered scale.

### 6. Typography & Color (MEDIUM)
- `line-height` — 1.5–1.75 for body.
- `contrast-readability` — darker text on light backgrounds.
- `color-semantic` — tokens, not raw hex in components.
- `color-accessible-pairs` — verify every fg/bg pair meets WCAG AA.

### 7. Animation (MEDIUM)
- `duration-timing` — 150–300ms micro; ≤400ms complex; avoid >500ms.
- `transform-performance` — animate `transform`/`opacity` only.
- `motion-meaning` — every animation expresses cause-effect, not decoration.
- `easing` — ease-out for enter, ease-in for exit; avoid linear for UI.
- `exit-faster-than-enter` — exit ~60–70% of enter duration.
- `stagger-sequence` — list/grid items stagger 30–50ms per item.
- `scale-feedback` — 0.95–1.05 press scale for tappable cards/buttons.
- `interruptible` — user tap/gesture cancels animation.
- `layout-shift-avoid` — use transform for position changes (no reflow).

### 9. Navigation Patterns (HIGH)
- `bottom-nav-limit` — max 5 items (mobile).
- `nav-state-active` — current page clearly highlighted.
- `persistent-nav` — core nav reachable from deep pages.
- `back-behavior` — predictable, preserves scroll/state.

## Pre-Delivery Checklist

- [ ] No emojis used as icons (use SVG/Lucide).
- [ ] Tap targets ≥ 44×44px with 8px spacing.
- [ ] Focus ring visible on every interactive element.
- [ ] `prefers-reduced-motion` honored by every animation.
- [ ] Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text, in light AND dark.
- [ ] Micro-interactions stay in 150–300ms range.
- [ ] No animation targets width/height/top/left.
- [ ] Primary CTA clearly dominant on each section; one per screen.
- [ ] No broken/dead buttons (every button has an action or link).
- [ ] Mobile menu present ≤ md breakpoint; nav items reachable.
- [ ] Tested on 375px, 768px, 1024px, 1440px widths.
