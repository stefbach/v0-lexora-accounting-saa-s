"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Gift, ArrowRight, Loader2, CalendarDays, AlertTriangle } from "lucide-react"
import { formaterMontantMUR, type EoyBonusRecap } from "@/lib/rh/eoy-bonus"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * G11 — Widget dashboard RH : visible uniquement entre octobre et
 * décembre, pour rappeler la préparation de l'EOY Bonus.
 *
 * Si des calculs existent déjà pour l'année courante, affiche le
 * total à payer. Sinon, simple CTA vers /rh/eoy-bonus.
 */
export function EoyBonusWidget() {
  const [recap, setRecap] = useState<EoyBonusRecap | null>(null)
  const [loading, setLoading] = useState(true)
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])

  // Visible uniquement oct-déc (mois 10, 11, 12 en base 1).
  const now = new Date()
  const visible = now.getMonth() + 1 >= 10

  useEffect(() => {
    if (!visible) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const socRes = await fetch('/api/comptable/societes')
        if (!socRes.ok) return
        const socData = await socRes.json()
        const list = (socData?.societes || []) as Array<{ id: string; nom: string }>
        if (cancelled) return
        setSocietes(list)
        if (list.length === 0) return

        // Charge le recap pour la première société (simplicité — l'user
        // peut choisir dans la page dédiée).
        const annee = now.getFullYear()
        const r = await fetch(`/api/rh/eoy-bonus?societe_id=${list[0].id}&annee=${annee}`)
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled && d?.recap && (d.recap.total_bonus > 0 || d.recap.nb_eligibles > 0)) {
          setRecap(d.recap as EoyBonusRecap)
        }
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (!visible) return null
  if (loading) return null

  const annee = now.getFullYear()
  const hasData = recap && recap.total_bonus > 0
  const societeNom = societes[0]?.nom || ''

  return (
    <Card className="border-2" style={{ borderColor: GOLD + '40' }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: GOLD + '20' }}>
            <Gift className="h-5 w-5" style={{ color: GOLD }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm" style={{ color: NAVY }}>
                Préparez l&apos;EOY Bonus {annee}
              </p>
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                WRA S.54
              </Badge>
            </div>

            {hasData ? (
              <>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-600">
                  <span>
                    Total : <strong className="font-mono" style={{ color: NAVY }}>{formaterMontantMUR(recap.total_bonus)}</strong>
                  </span>
                  <span>
                    {recap.nb_eligibles} éligible{recap.nb_eligibles > 1 ? 's' : ''}
                    {recap.nb_non_eligibles > 0 ? ` · ${recap.nb_non_eligibles} non` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    75% avant {fmtDate(recap.date_paiement_75pct)} · 25% avant {fmtDate(recap.date_paiement_25pct)}
                  </span>
                </div>
                {recap.nb_bulletins_manquants_total > 0 && (
                  <p className="text-[11px] mt-1 text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {recap.nb_bulletins_manquants_total} bulletin{recap.nb_bulletins_manquants_total > 1 ? 's' : ''} manquant{recap.nb_bulletins_manquants_total > 1 ? 's' : ''} ({recap.nb_employes_avec_bulletins_manquants} employé{recap.nb_employes_avec_bulletins_manquants > 1 ? 's' : ''})
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5 italic">
                  Société : {societeNom}{societes.length > 1 ? ` (+${societes.length - 1} autres)` : ''}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-gray-600 mt-1">
                Calculez le bonus fin d&apos;année pour vos employés (paiement 75% avant le 25/12).
              </p>
            )}
          </div>
          <Link href="/rh/eoy-bonus">
            <Button size="sm" variant="outline" className="shrink-0 text-xs">
              Voir <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function fmtDate(ymd: string): string {
  if (!ymd || ymd.length < 10) return '—'
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
}
