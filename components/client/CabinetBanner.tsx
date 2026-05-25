"use client"

/**
 * <CabinetBanner /> — bandeau permanent quand un comptable est en
 * mode "Acting as client".
 *
 * Monté dans le layout /client/ : s'affiche UNIQUEMENT quand le cookie
 * lexora_acting_as_societe est posé. Action "Sortir" DELETE le cookie
 * et redirige vers /comptable/cabinet.
 *
 * Volontairement très visible (orange + texte gras + sticky top) pour
 * éliminer le risque de confusion ("j'agis pour qui en ce moment ?").
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, LogOut, Loader2 } from "lucide-react"

interface ActingAsState {
  acting_as_societe_id: string | null
  societe?: {
    id: string
    nom: string
    brn?: string | null
    vat_number?: string | null
  } | null
}

export function CabinetBanner() {
  const router = useRouter()
  const [state, setState] = useState<ActingAsState | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch("/api/comptable/act-as", { cache: "no-store" })
        const j: ActingAsState = await r.json()
        if (cancelled) return
        // Fallback : si l'API a posé le cookie mais pas chargé le nom
        // (par exemple : SELECT colonne manquante), on retrouve la
        // société dans la liste accessible /api/client/societes.
        if (j?.acting_as_societe_id && !j.societe?.nom) {
          try {
            const sr = await fetch("/api/client/societes", { cache: "no-store" })
            const sj = await sr.json()
            const match = (sj?.societes || []).find(
              (s: any) => s?.id === j.acting_as_societe_id,
            )
            if (match) {
              j.societe = { id: match.id, nom: match.nom, brn: match.brn, vat_number: match.vat_number }
            }
          } catch { /* silent fallback */ }
        }
        setState(j)
      } catch { /* noop */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!state?.acting_as_societe_id) return null

  async function exit() {
    setExiting(true)
    try {
      await fetch("/api/comptable/act-as", { method: "DELETE" })
    } catch { /* noop */ }
    // Nettoie aussi la société active normale (au cas où elle aurait
    // été synchronisée) — fail-safe pour ne pas garder un état hybride.
    document.cookie = "lexora_acting_as_societe=; max-age=0; path=/"
    router.push("/comptable/cabinet")
    router.refresh()
  }

  const societe = state.societe
  // Fallback d'affichage si on a vraiment pas le nom (cas rare) :
  // "Société #b010d75c" plutôt que l'UUID complet brut illisible.
  const displayName = societe?.nom
    || (state.acting_as_societe_id
        ? `Société #${state.acting_as_societe_id.slice(0, 8)}`
        : "Client inconnu")

  return (
    <div
      className="sticky top-0 z-50 bg-amber-500 text-amber-950 border-b-2 border-amber-700 shadow-md"
      role="alert"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 flex-shrink-0" />
          <span className="font-semibold">Vue cabinet</span>
          <span className="opacity-80">→</span>
          <span className="font-bold">{displayName}</span>
          {societe?.brn && (
            <span className="text-[11px] opacity-75 font-mono">BRN {societe.brn}</span>
          )}
        </div>
        <button
          onClick={exit}
          disabled={exiting}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950 text-amber-50 text-xs font-semibold hover:bg-amber-900 transition-colors disabled:opacity-60"
        >
          {exiting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          Sortir du dossier
        </button>
      </div>
    </div>
  )
}
