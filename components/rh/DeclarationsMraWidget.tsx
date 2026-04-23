"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpenCheck, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react"
import { formaterMUR, libellePeriode, deadlineMraFromPeriode } from "@/lib/rh/declarations-mra"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * G13 — Widget dashboard RH : visible dès le 1er du mois pour rappeler
 * la déclaration MRA du mois précédent à faire/payer.
 *
 * Deux états :
 *   ✅ payée → confirmation
 *   ⚠ en cours → CTA + compte à rebours deadline
 */
export function DeclarationsMraWidget() {
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<{
    societe: { id: string; nom: string } | null
    periodeIso: string
    deadline: string
    joursRestants: number
    statut: string | null
    totalMra: number
  } | null>(null)

  const now = new Date()
  // On regarde toujours le mois précédent (cycle déclaration)
  const moisPrec = now.getMonth() === 0 ? 12 : now.getMonth()
  const anneePrec = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const periodeIso = `${anneePrec}-${String(moisPrec).padStart(2, '0')}-01`
  const deadlineIso = deadlineMraFromPeriode(periodeIso)
  const joursRestants = Math.ceil(
    (new Date(deadlineIso + 'T12:00:00').getTime() - now.getTime()) / (86400 * 1000),
  )
  // Widget visible uniquement si on est après la fin du mois concerné
  const visible = now.getDate() >= 1 && joursRestants >= -5

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
        const s = list[0]

        const r = await fetch(`/api/rh/declarations-mra?societe_id=${s.id}&annee=${anneePrec}`)
        if (!r.ok) return
        const d = await r.json()
        const csg = (d?.csg || []).find((x: any) => x.periode === periodeIso)
        const paye = (d?.paye || []).find((x: any) => x.periode === periodeIso)

        const totalMra = csg
          ? (Number(csg.total_a_remettre_mra) || 0) + (Number(paye?.total_paye_retenu) || 0)
          : 0

        if (!cancelled) {
          setState({
            societe: s,
            periodeIso,
            deadline: deadlineIso,
            joursRestants,
            statut: csg?.statut || paye?.statut || null,
            totalMra,
          })
        }
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, periodeIso])

  if (!visible || loading || !state) return null

  const paye = state.statut === 'paye'
  const retard = state.joursRestants < 0
  const accentColor = paye ? '#16a34a' : retard ? '#dc2626' : GOLD
  const periodeLabel = libellePeriode(state.periodeIso)

  return (
    <Card className="border-2" style={{ borderColor: accentColor + '40' }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: accentColor + '20' }}>
            {paye
              ? <CheckCircle2 className="h-5 w-5" style={{ color: accentColor }} />
              : <BookOpenCheck className="h-5 w-5" style={{ color: accentColor }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm" style={{ color: NAVY }}>
                {paye
                  ? `✅ Déclaration MRA ${periodeLabel} payée`
                  : retard
                  ? `🚨 Déclaration MRA ${periodeLabel} EN RETARD`
                  : `⚠ Déclaration MRA ${periodeLabel} à faire`}
              </p>
              <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-300">
                MRA
              </Badge>
            </div>
            {paye ? (
              <div className="mt-1.5 text-[12px] text-gray-600">
                Total remis : <strong className="font-mono" style={{ color: NAVY }}>
                  {formaterMUR(state.totalMra)}
                </strong>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" style={{ color: accentColor }} />
                Deadline : <strong>{state.deadline}</strong>
                {retard
                  ? <span className="text-red-700 ml-1">(dépassée de {-state.joursRestants} j)</span>
                  : <span className="ml-1">(dans {state.joursRestants} j)</span>}
              </p>
            )}
            {state.societe && (
              <p className="text-[11px] text-gray-400 mt-0.5 italic">
                Société : {state.societe.nom}
              </p>
            )}
          </div>
          <Link href="/rh/declarations-mra">
            <Button size="sm" variant="outline" className="shrink-0 text-xs">
              Voir <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
