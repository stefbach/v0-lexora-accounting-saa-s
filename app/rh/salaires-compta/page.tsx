"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Users } from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

export default function SalairesComptaPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [loading, setLoading] = useState(true)
  const [periodes, setPeriodes] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/paie?societe_id=${societe}`)
      const data = await res.json()
      const allBulletins = data.bulletins || []

      const groups: Record<string, any> = {}
      for (const b of allBulletins) {
        const p = (b.periode || '').slice(0, 7)
        if (!p) continue
        if (!groups[p]) groups[p] = { periode: p, nb: 0, basic: 0, ot: 0, primes: 0, brut: 0, net: 0, csg_sal: 0, nsf_sal: 0, paye: 0, csg_pat: 0, nsf_pat: 0, levy: 0, prgf: 0, charges: 0 }
        groups[p].nb++
        groups[p].basic += Number(b.salaire_base) || 0
        groups[p].ot += Number(b.heures_sup_montant) || 0
        groups[p].primes += Number(b.special_allowance_1) || 0
        groups[p].brut += Number(b.salaire_brut || b.salaire_base) || 0
        groups[p].net += Number(b.salaire_net) || 0
        groups[p].csg_sal += Number(b.csg_salarie) || 0
        groups[p].nsf_sal += Number(b.nsf_salarie) || 0
        groups[p].paye += Number(b.paye) || 0
        groups[p].csg_pat += Number(b.csg_patronal) || 0
        groups[p].nsf_pat += Number(b.nsf_patronal) || 0
        groups[p].levy += Number(b.training_levy) || 0
        groups[p].prgf += Number(b.prgf) || 0
        groups[p].charges += Number(b.total_charges_patronales) || 0
      }
      setPeriodes(Object.values(groups).sort((a: any, b: any) => b.periode.localeCompare(a.periode)))
    } catch {}
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  const totalBrut = periodes.reduce((s, p) => s + (p.brut || 0), 0)
  const totalNet = periodes.reduce((s, p) => s + (p.net || 0), 0)
  const totalCSGSal = periodes.reduce((s, p) => s + (p.csg_sal || 0), 0)
  const totalCSGPat = periodes.reduce((s, p) => s + (p.csg_pat || 0), 0)
  const totalNSFSal = periodes.reduce((s, p) => s + (p.nsf_sal || 0), 0)
  const totalNSFPat = periodes.reduce((s, p) => s + (p.nsf_pat || 0), 0)
  const totalPaye = periodes.reduce((s, p) => s + (p.paye || 0), 0)
  const totalLevy = periodes.reduce((s, p) => s + (p.levy || 0), 0)
  const totalPrgf = periodes.reduce((s, p) => s + (p.prgf || 0), 0)
  const totalCharges = periodes.reduce((s, p) => s + (p.charges || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.b.salcompta.title', locale)}</h1>
          <p className="text-sm text-gray-500">{t('rha.b.salcompta.subtitle', locale)}</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder={t('rha.b.salcompta.societe_ph', locale)} /></SelectTrigger>
          <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{periodes.length}</p>
          <p className="text-xs text-gray-500">{t('rha.b.salcompta.months_booked', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('rha.b.salcompta.gross_mass', locale)}</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalBrut)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">{t('rha.b.salcompta.basic', locale)}: {fmt(periodes.reduce((s, p) => s + p.basic, 0))}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('rha.b.salcompta.net_to_pay', locale)}</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalNet)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">{totalBrut > 0 ? Math.round(totalNet / totalBrut * 100) : 0}{t('rha.b.salcompta.of_gross', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('rha.b.salcompta.deductions', locale)}</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalCSGSal + totalNSFSal + totalPaye)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">CSG {fmt(totalCSGSal)} • NSF {fmt(totalNSFSal)} • PAYE {fmt(totalPaye)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Détail par période</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: NAVY }}>Période</th>
                    <th className="px-2 py-2 text-center font-medium">Nb</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">641 Basic</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">OT</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">Primes</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">CSG sal.</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">NSF sal.</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">PAYE</th>
                    <th className="px-2 py-2 text-right font-medium bg-emerald-50 font-bold">421 Net</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">CSG pat.</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">NSF pat.</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">Levy</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">PRGF</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">645 Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periodes.map(p => {
                    const mois = new Date((p.periode || '2025-01') + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
                    return (
                      <tr key={p.periode} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium capitalize">{mois}</td>
                        <td className="px-2 py-2 text-center">{p.nb}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-600">{fmt(p.basic)}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-500">{p.ot > 0 ? fmt(p.ot) : "—"}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-500">{p.primes > 0 ? fmt(p.primes) : "—"}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-600">{fmt(p.csg_sal)}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(p.nsf_sal)}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(p.paye)}</td>
                        <td className="px-2 py-2 text-right font-mono text-emerald-600 font-bold">{fmt(p.net)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-600">{fmt(p.csg_pat)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.nsf_pat)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.levy)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.prgf)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-700 font-bold">{fmt(p.charges)}</td>
                      </tr>
                    )
                  })}
                  {periodes.length > 0 && (
                    <tr className="bg-gray-100 font-bold text-xs">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-2 py-2 text-center">{periodes.reduce((s, p) => s + p.nb, 0)}</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-600">{fmt(periodes.reduce((s, p) => s + p.basic, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(periodes.reduce((s, p) => s + p.ot, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(periodes.reduce((s, p) => s + p.primes, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-600">{fmt(totalCSGSal)}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(totalNSFSal)}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(totalPaye)}</td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-600 font-bold">{fmt(totalNet)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-600">{fmt(totalCSGPat)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalNSFPat)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalLevy)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalPrgf)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-700 font-bold">{fmt(totalCharges)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {periodes.length === 0 && (
                <p className="text-center text-gray-400 py-8">Aucune donnée de salaire. Importez des fichiers de paie depuis le module RH.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Plan comptable — Comptes de personnel</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { compte: "641100", label: "Salaires de base", debit: periodes.reduce((s, p) => s + p.basic, 0), color: "text-blue-600" },
                  { compte: "641200", label: "Heures supplémentaires", debit: periodes.reduce((s, p) => s + p.ot, 0), color: "text-blue-500" },
                  { compte: "641300", label: "Primes et indemnités", debit: periodes.reduce((s, p) => s + p.primes, 0), color: "text-blue-500" },
                  { compte: "645100", label: "CSG patronale (3%/6%)", debit: totalCSGPat, color: "text-orange-600" },
                  { compte: "645200", label: "NSF patronal (2.5%)", debit: totalNSFPat, color: "text-orange-500" },
                  { compte: "645300", label: "Training Levy (1%)", debit: totalLevy, color: "text-orange-500" },
                  { compte: "645400", label: "PRGF", debit: totalPrgf, color: "text-orange-500" },
                ].map(c => (
                  <div key={c.compte} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">{c.compte}</Badge>
                      <span className="text-sm">{c.label}</span>
                    </div>
                    <span className={`font-mono font-medium ${c.color}`}>{c.debit > 0 ? `${fmt(c.debit)} MUR` : "—"}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-gray-500 font-medium mb-2">Dettes sociales (crédit)</p>
                  {[
                    { compte: "421000", label: "Net à payer", credit: totalNet, color: "text-emerald-600" },
                    { compte: "431000", label: "CSG à payer", credit: totalCSGSal + totalCSGPat, color: "text-red-600" },
                    { compte: "444000", label: "PAYE à payer", credit: totalPaye, color: "text-red-500" },
                    { compte: "432000", label: "Training Levy + PRGF à payer", credit: totalLevy + totalPrgf, color: "text-purple-600" },
                  ].map(c => (
                    <div key={c.compte} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">{c.compte}</Badge>
                        <span className="text-sm">{c.label}</span>
                      </div>
                      <span className={`font-mono font-medium ${c.color}`}>{c.credit > 0 ? `${fmt(c.credit)} MUR` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
