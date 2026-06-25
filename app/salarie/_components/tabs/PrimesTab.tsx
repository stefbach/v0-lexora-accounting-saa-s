"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { NAVY, GOLD } from "../shared/constants"
import { fmt } from "../shared/helpers"
import { t, getLocale } from "@/lib/i18n"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel. Le filtre "année en cours" viendra en V3.1.
export function PrimesTab({
  bulletins, primes,
}: {
  bulletins: any[]
  primes: any[]
}) {
  const locale = getLocale()
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>{t('sal.primes.overtimeHistory', locale)}</CardTitle></CardHeader>
        <CardContent>
          {bulletins.filter((b: any) => Number(b.heures_sup_montant) > 0).length === 0 ? (
            <p className="text-gray-400 text-center py-4 text-sm">{t('sal.primes.noOvertime', locale)}</p>
          ) : (
            <div className="space-y-2">
              {bulletins.filter((b: any) => Number(b.heures_sup_montant) > 0).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: `${GOLD}08`, border: `1px solid ${GOLD}20` }}>
                  <div>
                    <p className="font-medium text-sm capitalize" style={{ color: NAVY }}>
                      {new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <p className="font-mono font-bold" style={{ color: GOLD }}>{fmt(b.heures_sup_montant)} MUR</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>{t('sal.primes.bonusesByMonth', locale)}</CardTitle></CardHeader>
        <CardContent>
          {bulletins.filter((b: any) => Number(b.special_allowance_1) > 0).length === 0 && primes.length === 0 ? (
            <p className="text-gray-400 text-center py-4 text-sm">{t('sal.primes.noBonus', locale)}</p>
          ) : (
            <div className="space-y-2">
              {bulletins.filter((b: any) => Number(b.special_allowance_1) > 0).map((b: any) => (
                <div key={b.id + "-primes"} className="p-3 border rounded-lg" style={{ borderLeft: `3px solid #7c3aed` }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm capitalize">{new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
                    <p className="font-mono font-bold" style={{ color: "#7c3aed" }}>{fmt(b.special_allowance_1)} MUR</p>
                  </div>
                  {b.notes && <p className="text-xs text-gray-500">{b.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {primes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>{t('sal.primes.individualBonuses', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {primes.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{p.prime?.libelle || p.libelle || t('sal.primes.bonus', locale)}</p>
                    <p className="text-xs text-gray-500">
                      {p.periode ? new Date(p.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—"}
                      {p.quantite ? ` • ${t('sal.primes.qty', locale)} ${p.quantite}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold" style={{ color: "#7c3aed" }}>{fmt(p.montant || 0)} MUR</p>
                    <Badge className={`text-[10px] ${p.approuve ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{p.approuve ? t('sal.primes.validated', locale) : t('sal.primes.pending', locale)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        // V3.1 — filtrer sur l'année courante (la version précédente
        // sommait TOUS les bulletins, ce qui falsifiait le total dès
        // qu'un historique pluriannuel était chargé).
        const year = new Date().getFullYear().toString()
        const thisYear = bulletins.filter((b: any) => String(b.periode || "").startsWith(year))
        if (thisYear.length === 0) return null
        const total = thisYear.reduce((s: number, b: any) =>
          s + (Number(b.special_allowance_1) || 0) + (Number(b.heures_sup_montant) || 0), 0)
        return (
          <Card style={{ borderLeft: `3px solid ${GOLD}` }}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">{t('sal.primes.totalReceivedIn', locale)} {year}</p>
              <p className="text-xl font-bold" style={{ color: GOLD }}>{fmt(total)} MUR</p>
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}
