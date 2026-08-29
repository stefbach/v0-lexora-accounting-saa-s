"use client"

/**
 * ConformiteMRA — panneau « Suis-je en règle ? » pour dirigeant autonome.
 *
 * Affiche les obligations fiscales & sociales mauriciennes à venir / en retard
 * (TVA, paie PAYE/CSG/NSF, TDS, IT Form 3, impôt sociétés) dérivées du profil
 * de la société, en langage clair et sans jargon comptable.
 */

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShieldCheck, AlertTriangle, Clock, CalendarDays, Loader2, RefreshCw } from "lucide-react"

type Statut = "en_retard" | "proche" | "a_venir"
interface Echeance {
  id: string; type: string; titre: string; detail: string
  periode: string; date_echeance: string; statut: Statut
}
interface Data {
  profil: { tva_assujetti: boolean; tva_frequence: string; a_salaries: boolean; applique_tds: boolean; date_fin_exercice: string | null }
  echeances: Echeance[]
  resume: { en_retard: number; proche: number; a_venir: number }
}

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) }
  catch { return d }
}

const STATUT_META: Record<Statut, { label: string; badge: string; dot: string }> = {
  en_retard: { label: "En retard", badge: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  proche: { label: "Bientôt", badge: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  a_venir: { label: "À venir", badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-300" },
}

export function ConformiteMRA({ societeId }: { societeId: string | null }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freq, setFreq] = useState<"mensuelle" | "trimestrielle" | null>(null)

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ societe_id: societeId })
      if (freq) qs.set("tva_frequence", freq)
      const r = await fetch(`/api/client/echeances-fiscales?${qs.toString()}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Erreur")
      setData(d)
      if (!freq && d?.profil?.tva_frequence) setFreq(d.profil.tva_frequence)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [societeId, freq])

  useEffect(() => { load() }, [load])

  if (!societeId) return null

  const enRetard = data?.resume.en_retard ?? 0
  const proche = data?.resume.proche ?? 0
  const enRegle = !loading && !error && enRetard === 0 && proche === 0

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          Suis-je en règle&nbsp;? — obligations MRA
        </CardTitle>
        <div className="flex items-center gap-2">
          {data?.profil.tva_assujetti && (
            <div className="flex rounded-md border overflow-hidden text-xs">
              {(["trimestrielle", "mensuelle"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`px-2 py-1 ${freq === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  title="Périodicité de votre TVA"
                >
                  TVA {f === "mensuelle" ? "mensuelle" : "trimestrielle"}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Analyse de vos obligations…</div>
        ) : error ? (
          <div className="text-sm text-red-600 flex gap-2"><AlertTriangle className="h-4 w-4" />{error}</div>
        ) : (
          <>
            {/* Bandeau de synthèse */}
            {enRegle ? (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2 mb-3">
                <ShieldCheck className="h-4 w-4" /> Rien d'urgent : aucune obligation en retard ni imminente. ✅
              </div>
            ) : (
              <div className="flex gap-2 mb-3 flex-wrap">
                {enRetard > 0 && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /><b>{enRetard}</b> en retard
                  </div>
                )}
                {proche > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
                    <Clock className="h-4 w-4" /><b>{proche}</b> à échéance proche
                  </div>
                )}
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" /><b>{data?.resume.a_venir ?? 0}</b> à venir
                </div>
              </div>
            )}

            {/* Liste des échéances */}
            {(!data || data.echeances.length === 0) ? (
              <p className="text-sm text-slate-500 py-2">Aucune obligation identifiée à partir de votre profil (TVA, salariés, clôture). Complétez la fiche société si besoin.</p>
            ) : (
              <div className="divide-y rounded border">
                {data.echeances.map(e => {
                  const m = STATUT_META[e.statut]
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 p-2.5 hover:bg-slate-50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${m.dot}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{e.titre}</p>
                          <p className="text-xs text-slate-500 truncate">{e.detail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-600 whitespace-nowrap">{fmtDate(e.date_echeance)}</span>
                        <Badge variant="outline" className={`text-[10px] ${m.badge}`}>{m.label}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-2">
              Dates indicatives (repères MRA « fin du mois suivant »). Vérifiez le calendrier officiel MRA de l'année pour l'e-paiement.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
