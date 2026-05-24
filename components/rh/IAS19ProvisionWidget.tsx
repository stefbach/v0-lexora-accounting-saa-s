"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpenCheck, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react"
import { formaterMUR, type IAS19Snapshot } from "@/lib/rh/ias19-provisions"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function finDeMois(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function libellePeriode(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const m = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return m.charAt(0).toUpperCase() + m.slice(1)
}

/**
 * G8 Phase 1 — Widget dashboard RH : visible à partir du 25 du mois,
 * pour rappeler la comptabilisation de la provision congés IAS 19.
 *
 * Affichage adaptatif selon l'état :
 *   - Comptabilisé : ✅ confirmation + montant
 *   - Non comptabilisé : ⚠ CTA vers /rh/provisions/conges
 */
export function IAS19ProvisionWidget() {
  const [snapshot, setSnapshot] = useState<IAS19Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [societe, setSociete] = useState<{ id: string; nom: string } | null>(null)

  const now = new Date()
  const visible = now.getDate() >= 25

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

        const r = await fetch(`/api/rh/provisions/conges?societe_id=${list[0].id}`)
        if (!r.ok) return
        const d = await r.json()
        const dateFin = finDeMois()
        const match = (d?.snapshots || []).find((s: IAS19Snapshot) => s.date_snapshot === dateFin)
        if (!cancelled && match) setSnapshot(match)
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [visible])

  if (!visible || loading) return null

  const dateFin = finDeMois()
  const comptabilise = snapshot?.statut === 'comptabilise'
  const periode = libellePeriode(dateFin)
  const accentColor = comptabilise ? '#16a34a' : GOLD

  return (
    <Card className="border-2" style={{ borderColor: accentColor + '40' }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: accentColor + '20' }}>
            {comptabilise
              ? <CheckCircle2 className="h-5 w-5" style={{ color: accentColor }} />
              : <BookOpenCheck className="h-5 w-5" style={{ color: accentColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm" style={{ color: NAVY }}>
                {comptabilise
                  ? `✅ Provision IAS 19 comptabilisée — ${periode}`
                  : `⚠ Provision IAS 19 à passer pour ${periode}`}
              </p>
              <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-300">
                IAS 19
              </Badge>
            </div>

            {comptabilise && snapshot ? (
              <div className="mt-1.5 text-[12px] text-gray-600">
                Montant : <strong className="font-mono" style={{ color: NAVY }}>
                  {formaterMUR(snapshot.provision_total_mur)}
                </strong>
                <span className="ml-2">
                  (Compte 64175 / 4287, journal OD)
                </span>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                Le mois se termine le {dateFin.slice(8, 10)}/{dateFin.slice(5, 7)}. Comptabilisez la charge de provision congés payés.
              </p>
            )}
            {societe && (
              <p className="text-[11px] text-gray-400 mt-0.5 italic">
                Société : {societe.nom}
              </p>
            )}
          </div>
          <Link href="/rh/provisions/conges">
            <Button size="sm" variant="outline" className="shrink-0 text-xs">
              Voir <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
