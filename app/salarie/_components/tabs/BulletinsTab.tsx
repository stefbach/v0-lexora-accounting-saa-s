"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Download } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"
import { fmt } from "../shared/helpers"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function BulletinsTab({
  bulletins, employe, onMarkRead,
}: {
  bulletins: any[]
  employe: any
  onMarkRead: () => void
}) {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4" style={{ color: NAVY }}>Mes bulletins de salaire</h2>
      {bulletins.length === 0 ? (
        <Card className="rounded-xl shadow-sm"><CardContent><p className="text-gray-400 text-center py-8">Aucun bulletin disponible</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bulletins.map((b: any) => {
            const isRead = !!b.lu_le
            const periodeLabel = new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
            return (
              <Card key={b.id} className="rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md" style={{ borderLeft: `4px solid ${isRead ? GREEN : GOLD}` }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-lg md:text-base font-bold capitalize" style={{ color: NAVY }}>{periodeLabel}</p>
                      {isRead ? (
                        <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>Lu</Badge>
                      ) : (
                        <Badge className="text-[10px] px-1.5 py-0 font-semibold" style={{ backgroundColor: `${GOLD}25`, color: GOLD }}>Nouveau</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-bold font-mono mb-2" style={{ color: NAVY }}>{fmt(b.salaire_net || 0)} <span className="text-sm font-normal text-gray-400">MUR net à payer</span></p>
                  <div className="flex flex-wrap gap-2 text-xs mb-4">
                    <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-600">Base: {fmt(b.salaire_base || 0)}</span>
                    {Number(b.heures_sup_montant) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#ea580c10", color: "#ea580c" }}>OT: {fmt(b.heures_sup_montant)}</span>}
                    {Number(b.special_allowance_1) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#7c3aed10", color: "#7c3aed" }}>Primes: {fmt(b.special_allowance_1)}</span>}
                    <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: `${BLUE}10`, color: BLUE }}>Brut total: {fmt(b.salaire_brut || 0)}</span>
                    {Number(b.total_deductions) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#dc262610", color: "#dc2626" }}>Déductions: -{fmt(b.total_deductions)}</span>}
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Button variant="outline" className="h-11 md:h-9 rounded-xl w-full md:w-auto transition-all duration-200" onClick={() => {
                      window.open(`/api/rh/paie/pdf?employe_id=${employe.id}&periode=${b.periode}&bulletin_id=${b.id}&view=1`, '_blank')
                      if (!b.lu_le) { fetch(`/api/rh/paie?action=mark_read&bulletin_id=${b.id}`, { method: "POST" }).catch(() => {}); onMarkRead() }
                    }}>
                      <Eye className="h-4 w-4 mr-2" />Voir le bulletin
                    </Button>
                    <Button variant="outline" className="h-11 md:h-9 rounded-xl w-full md:w-auto transition-all duration-200" onClick={() => window.open(`/api/rh/paie/pdf?employe_id=${employe.id}&periode=${b.periode}&bulletin_id=${b.id}`, '_blank')}>
                      <Download className="h-4 w-4 mr-2" />Telecharger PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
