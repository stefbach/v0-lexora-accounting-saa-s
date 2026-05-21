"use client"

/**
 * SantePCMBadge — indicateur global de santé comptable.
 *
 * À placer dans la sidebar comptable. Affiche un point coloré (vert/orange/
 * rouge) qui résume l'état le pire parmi toutes les sociétés accessibles.
 * Au clic, redirige vers /comptable/sante-pcm.
 *
 * - Refresh automatique toutes les 5 minutes (et au focus de la fenêtre).
 * - Si l'API renvoie une erreur, le badge est gris ("?") — pas un faux vert.
 * - Animation pulse uniquement si rouge.
 *
 * Voir app/api/comptable/sante-pcm/route.ts.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Activity, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react"

type Couleur = "vert" | "orange" | "rouge" | "inconnu"

interface PireSociete {
  societe_id: string
  nom?: string
  sante_couleur: Couleur
  sante_score: number
  desequilibre_global: number
}

interface OverviewResponse {
  mode: "overview"
  societes: PireSociete[]
  pire: PireSociete | null
}

const REFRESH_MS = 5 * 60 * 1000 // 5 minutes

const COULEUR_STYLE: Record<Couleur, { dot: string; ring: string; label: string; pulse: boolean }> = {
  vert:    { dot: "bg-emerald-500", ring: "ring-emerald-500/30",  label: "PCM OK",       pulse: false },
  orange:  { dot: "bg-amber-500",   ring: "ring-amber-500/30",    label: "PCM à vérifier", pulse: false },
  rouge:   { dot: "bg-red-500",     ring: "ring-red-500/40",      label: "PCM déséquilibré", pulse: true  },
  inconnu: { dot: "bg-zinc-400",    ring: "ring-zinc-400/30",     label: "PCM ?",        pulse: false },
}

export interface SantePCMBadgeProps {
  /** Si true, n'affiche qu'un pastille (pour sidebar compacte). */
  compact?: boolean
  /** Classe Tailwind pour le conteneur. */
  className?: string
}

export function SantePCMBadge({ compact = false, className = "" }: SantePCMBadgeProps) {
  const [couleur, setCouleur] = useState<Couleur>("inconnu")
  const [pire, setPire] = useState<PireSociete | null>(null)
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  const fetchSante = useCallback(async () => {
    try {
      setErrored(false)
      const res = await fetch("/api/comptable/sante-pcm", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: OverviewResponse = await res.json()
      if (data.mode !== "overview") throw new Error("unexpected mode")

      if (!data.pire || data.societes.length === 0) {
        // Aucune société -> on n'affiche rien (vert par convention)
        setCouleur("vert")
        setPire(null)
      } else {
        setCouleur((data.pire.sante_couleur as Couleur) || "inconnu")
        setPire(data.pire)
      }
    } catch (e) {
      console.warn("[SantePCMBadge] fetch error", e)
      setErrored(true)
      setCouleur("inconnu")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSante()
    const id = setInterval(fetchSante, REFRESH_MS)
    const onFocus = () => fetchSante()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [fetchSante])

  const style = COULEUR_STYLE[couleur]
  const Icon =
    couleur === "rouge"  ? AlertTriangle :
    couleur === "orange" ? Activity      :
    couleur === "vert"   ? CheckCircle2  :
    HelpCircle

  const title = errored
    ? "Santé PCM : erreur de récupération"
    : pire
      ? `${style.label} — pire : ${pire.nom || pire.societe_id} (score ${pire.sante_score}/100, écart ${Number(pire.desequilibre_global).toFixed(2)} MUR)`
      : style.label

  if (compact) {
    return (
      <Link
        href="/comptable/sante-pcm"
        title={title}
        aria-label={title}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ${style.ring} ${className}`}
      >
        <span
          className={`block h-2.5 w-2.5 rounded-full ${style.dot} ${style.pulse ? "animate-pulse" : ""}`}
        />
      </Link>
    )
  }

  return (
    <Link
      href="/comptable/sante-pcm"
      title={title}
      className={`inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 shadow-sm hover:bg-white hover:ring-zinc-300 transition ${className}`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {style.pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${style.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${style.dot}`} />
      </span>
      <Icon className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      <span>{loading ? "Santé PCM…" : style.label}</span>
    </Link>
  )
}

export default SantePCMBadge
