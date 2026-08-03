"use client"

/**
 * AnimatedCounter — compte jusqu'à une valeur cible à l'entrée dans le champ.
 *
 * INVARIANT : la valeur finale est affichée par défaut.
 *
 * L'animation est un enrichissement, jamais une condition d'affichage. Une
 * version antérieure initialisait l'état à `format(0)` et ne le corrigeait
 * qu'au déclenchement de l'IntersectionObserver : le HTML rendu côté serveur
 * annonçait donc « MRs 0 », la vraie valeur n'existant que dans l'aria-label.
 * Un visiteur voyait un prix à zéro avant l'hydratation, et définitivement si
 * l'observateur ne se déclenchait pas — seuil jamais atteint sur petit écran,
 * conteneur masqué au montage, JavaScript bloqué. Sur une page tarifaire,
 * c'est le pire défaut possible.
 *
 * Le décompte ne part donc de zéro qu'une fois le client monté et l'élément
 * effectivement visible ; à défaut, la valeur finale reste en place.
 * `prefers-reduced-motion` désactive complètement l'animation.
 */

import * as React from "react"
import {
  useMotionValue,
  useReducedMotion,
  animate,
} from "framer-motion"

type Props = {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  format?: (n: number) => string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
}

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString("fr-FR")
}

export function AnimatedCounter({
  value,
  duration = 1.4,
  prefix,
  suffix,
  format = defaultFormat,
  className,
  style,
  ariaLabel,
}: Props) {
  const ref = React.useRef<HTMLSpanElement | null>(null)
  // Valeur finale dès le premier rendu — serveur comme client.
  const [display, setDisplay] = React.useState<string>(() => format(value))
  const mv = useMotionValue(value)
  const prefersReducedMotion = useReducedMotion()

  // `format` est souvent une lambda recréée à chaque rendu du parent ; on la
  // lit via une référence pour ne pas relancer l'animation à chaque re-rendu.
  const formatRef = React.useRef(format)
  formatRef.current = format

  React.useEffect(() => {
    const unsub = mv.on("change", (v) => setDisplay(formatRef.current(v)))
    return () => unsub()
  }, [mv])

  React.useEffect(() => {
    setDisplay(formatRef.current(value))
    if (prefersReducedMotion) return

    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return

    let started = false
    const run = () => {
      if (started) return
      started = true
      mv.set(0)
      animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] })
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          run()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration, mv, prefersReducedMotion])

  return (
    <span
      ref={ref}
      className={className}
      style={style}
      aria-label={ariaLabel ?? `${prefix ?? ""}${format(value)}${suffix ?? ""}`}
    >
      {prefix}
      {display}
      {suffix}
    </span>
  )
}
