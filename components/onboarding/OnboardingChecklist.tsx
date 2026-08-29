"use client"

/**
 * OnboardingChecklist — « Bien démarrer avec Lexora » (cible dirigeant autonome).
 *
 * Checklist guidée de mise en route affichée en tête du tableau de bord tant
 * que les étapes clés ne sont pas faites. Se masque automatiquement une fois
 * terminée (les étapes requises), avec possibilité de la masquer manuellement.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, ArrowRight, Rocket, X } from "lucide-react"

interface ChecklistItem { key: string; titre: string; description: string; fait: boolean; optionnel: boolean; lien: string }
interface Checklist { items: ChecklistItem[]; progression: number; termine: boolean; nb_requis: number; nb_requis_faits: number }

export function OnboardingChecklist({ societeId }: { societeId: string | null }) {
  const [data, setData] = useState<Checklist | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!societeId) return
    try { if (localStorage.getItem(`lexora_onboarding_hidden_${societeId}`) === "1") setHidden(true) } catch {}
    fetch(`/api/client/onboarding-status?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => { if (d?.checklist) setData(d.checklist) })
      .catch(() => {})
  }, [societeId])

  if (!societeId || hidden || !data || data.termine) return null

  function masquer() {
    setHidden(true)
    try { localStorage.setItem(`lexora_onboarding_hidden_${societeId}`, "1") } catch {}
  }

  return (
    <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/60 to-white">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-5 w-5 text-indigo-600" /> Bien démarrer avec Lexora
          </CardTitle>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-40 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${data.progression}%` }} />
            </div>
            <span className="text-xs text-slate-500">{data.nb_requis_faits}/{data.nb_requis} · {data.progression}%</span>
          </div>
        </div>
        <button onClick={masquer} className="text-slate-400 hover:text-slate-600" title="Masquer">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <Link href="/client/demarrage" className="block">
          <Button size="sm" className="w-full mb-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
            <Rocket className="h-3.5 w-3.5 mr-1.5" /> Lancer l'assistant guidé
          </Button>
        </Link>
        {data.items.map(item => (
          <div key={item.key} className={`flex items-center justify-between gap-3 p-2 rounded ${item.fait ? "opacity-60" : "hover:bg-white"}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {item.fait
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                : <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />}
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${item.fait ? "line-through text-slate-500" : ""}`}>
                  {item.titre}{item.optionnel && <span className="ml-1.5 text-[10px] text-slate-400">(optionnel)</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">{item.description}</p>
              </div>
            </div>
            {!item.fait && (
              <Link href={item.lien} className="flex-shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  Faire <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
