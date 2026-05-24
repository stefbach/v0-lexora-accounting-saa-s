"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Gift, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react"
import { formaterMUREoy, type IAS19EoySnapshot } from "@/lib/rh/ias19-eoy-provisions"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * G8 Phase 2 — Widget dashboard RH : visible à partir du 25 du mois,
 * jan-nov uniquement (décembre = paiement réel G11).
 *
 * Signale la comptabilisation manquante ou confirmée de la provision
 * EOY Bonus IAS 19.
 */
export function IAS19EoyProvisionWidget() {
  const [snapshot, setSnapshot] = useState<IAS19EoySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [societe, setSociete] = useState<{ id: string; nom: string } | null>(null)

  const now = new Date()
  const moisCourant = now.getMonth() + 1  // 1..12
  const anneeCourante = now.getFullYear()
  const visible = now.getDate() >= 25 && moisCourant >= 1 && moisCourant <= 11

  useEffect(() => {
    if (!visible) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const socRes = await fetch('/api/comptable/societes')
        if (!socRes.ok) return
        const socData = await socRes.json()
        const list = (socData?.societes || []) as Array<{ id: string; nom: string }>
        if (cancelled || list.length === 0) return
        setSociete(list[0])

        const r = await fetch(`/api/rh/provisions/eoy?societe_id=${list[0].id}&annee=${anneeCourante}`)
        if (!r.ok) return
        const d = await r.json()
        const match = (d?.snapshots || []).find(
          (s: IAS19EoySnapshot) => s.annee === anneeCourante && s.mois === moisCourant,
        )
        if (!cancelled && match) setSnapshot(match)
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [visible, anneeCourante, moisCourant])

  if (!visible || loading) return null

  const MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]
  const comptabilise = snapshot?.statut === 'comptabilise'
  const periode = `${MOIS[moisCourant - 1]} ${anneeCourante}`
  const accentColor = comptabilise ? '#16a34a' : GOLD

  return (
    <Card className="border-2" style={{ borderColor: accentColor + '40' }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: accentColor + '20' }}>
            {comptabilise
              ? <CheckCircle2 className="h-5 w-5" style={{ color: accentColor }} />
              : <Gift className="h-5 w-5" style={{ color: accentColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm" style={{ color: NAVY }}>
                {comptabilise
                  ? `✅ Provision EOY comptabilisée — ${periode}`
                  : `⚠ Provision EOY Bonus à passer pour ${periode}`}
              </p>
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                IAS 19 · §19-24
              </Badge>
            </div>

            {comptabilise && snapshot ? (
              <div className="mt-1.5 text-[12px] text-gray-600">
                Cumul : <strong className="font-mono" style={{ color: NAVY }}>
                  {formaterMUREoy(snapshot.provision_cumulee_total)}
                </strong>
                <span className="ml-2">
                  ({snapshot.nb_employes_eligibles} éligibles · Compte 64176/4288)
                </span>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                Étalez la charge du 13e mois (1/12 × earnings). Comptabilisez avant fin de mois.
              </p>
            )}
            {societe && (
              <p className="text-[11px] text-gray-400 mt-0.5 italic">
                Société : {societe.nom}
              </p>
            )}
          </div>
          <Link href="/rh/provisions/eoy">
            <Button size="sm" variant="outline" className="shrink-0 text-xs">
              Voir <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
