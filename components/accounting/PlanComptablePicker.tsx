"use client"

/**
 * PlanComptablePicker — modale de sélection d'un compte PCM
 *
 * Ouvre un dialog avec :
 *   • Barre de recherche (match sur compte OU libellé, debounced)
 *   • Filtres rapides par classe PCM (1-8)
 *   • Liste scrollable des comptes avec sens normal D/C + type
 *   • Sélection d'un compte → callback onSelect({ compte, libelle })
 *
 * Fetches from /api/comptable/plan-comptable (lit la table plan_comptable
 * seedée par migration 166).
 *
 * Utilisé depuis le rapprochement quand l'opérateur veut classer une tx
 * sur un compte absent de la liste hardcodée CLASSIFICATION_CHOICES.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search } from "lucide-react"

interface Compte {
  compte: string
  libelle: string
  type_compte: string | null
  sens_normal: string | null
  compte_parent: string | null
  niveau: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (compte: Compte) => void
  // Optionnel : pré-filtrer par classe (ex: ['6','7'] pour charges/produits)
  classesFilter?: string[]
}

const CLASSE_LABELS: Record<string, string> = {
  "1": "Capitaux",
  "2": "Immobilisations",
  "3": "Stocks",
  "4": "Tiers",
  "5": "Trésorerie",
  "6": "Charges",
  "7": "Produits",
  "8": "Spéciaux",
}

export function PlanComptablePicker({ open, onClose, onSelect, classesFilter }: Props) {
  const [comptes, setComptes] = useState<Compte[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [classeActive, setClasseActive] = useState<string | null>(null)

  const load = useCallback(async (search: string, classe: string | null) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      if (classe) params.set("classe", classe)
      params.set("limit", "500")
      const res = await fetch(`/api/comptable/plan-comptable?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setComptes(data.comptes || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
      setComptes([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load à l'ouverture + sur changement de filtres (debounced sur q)
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => { load(q, classeActive) }, 200)
    return () => clearTimeout(id)
  }, [open, q, classeActive, load])

  // Classes disponibles (1-8 ou restreintes par props)
  const classesDisplayed = useMemo(() => {
    const all = ["1", "2", "3", "4", "5", "6", "7", "8"]
    return classesFilter && classesFilter.length > 0
      ? all.filter(c => classesFilter.includes(c))
      : all
  }, [classesFilter])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <DialogTitle className="text-[#0B0F2E]">Choisir un compte du plan comptable</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Plan Comptable Maurice (PCM) — {comptes.length} comptes
          </p>
        </DialogHeader>

        {/* Recherche + filtres classes */}
        <div className="p-4 space-y-3 border-b bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              autoFocus
              placeholder="Rechercher par code (4210) ou libellé (salaires…)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setClasseActive(null)}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border ${
                !classeActive
                  ? "bg-[#0B0F2E] text-white border-[#0B0F2E]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              Toutes
            </button>
            {classesDisplayed.map((c) => (
              <button
                key={c}
                onClick={() => setClasseActive(classeActive === c ? null : c)}
                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border ${
                  classeActive === c
                    ? "bg-[#0B0F2E] text-white border-[#0B0F2E]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {c}. {CLASSE_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Liste des comptes */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
            </div>
          )}
          {!loading && error && (
            <div className="p-6 text-center text-red-600 text-sm">❌ {error}</div>
          )}
          {!loading && !error && comptes.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              Aucun compte ne correspond à "{q}"
            </div>
          )}
          {!loading && !error && comptes.length > 0 && (
            <ul className="divide-y">
              {comptes.map((c) => (
                <li key={c.compte}>
                  <button
                    onClick={() => { onSelect(c); onClose() }}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-[#F7F9FF] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-sm font-mono font-bold text-[#0B0F2E] shrink-0 min-w-[3.5rem]">
                        {c.compte}
                      </code>
                      <span className="text-sm text-gray-700 truncate">{c.libelle}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.sens_normal && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {c.sens_normal === "D" ? "Débit" : "Crédit"}
                        </Badge>
                      )}
                      {c.type_compte && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {c.type_compte}
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t flex justify-end bg-gray-50/50">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
