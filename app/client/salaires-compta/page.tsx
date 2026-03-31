"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Users, Banknote, CreditCard, TrendingUp } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

export default function SalairesComptaPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [loading, setLoading] = useState(true)
  const [ecritures, setEcritures] = useState<any[]>([])
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
      // Get all SAL journal ecritures for this société
      const { data: dossiers } = await fetch(`/api/comptable/societes`).then(r => r.json()).catch(() => ({ societes: [] }))
      // Use import-paie history to get periods
      const histRes = await fetch(`/api/rh/import-paie?action=history&societe_id=${societe}`).then(r => r.json()).catch(() => ({ history: [] }))
      setPeriodes((histRes.history || []).sort((a: any, b: any) => b.periode.localeCompare(a.periode)))
    } catch {}
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  // Totaux globaux
  const totalBrut = periodes.reduce((s, p) => s + (p.total_brut || 0), 0)
  const totalNet = periodes.reduce((s, p) => s + (p.total_net || 0), 0)
  const totalCharges = periodes.reduce((s, p) => s + (p.total_charges || 0), 0)
  const totalCSG = periodes.reduce((s, p) => s + (p.total_csg || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Salaires — Plan comptable</h1>
          <p className="text-sm text-gray-500">Écritures comptables des salaires et charges patronales (Journal SAL)</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
          <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{periodes.length}</p>
          <p className="text-xs text-gray-500">Mois comptabilisés</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Banknote className="h-5 w-5 mx-auto mb-1 text-blue-600" />
          <p className="text-2xl font-bold text-blue-600">{fmt(totalBrut)} MUR</p>
          <p className="text-xs text-gray-500">641 — Rémunérations</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <CreditCard className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalNet)} MUR</p>
          <p className="text-xs text-gray-500">421 — Net à payer</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-600" />
          <p className="text-2xl font-bold text-orange-600">{fmt(totalCharges)} MUR</p>
          <p className="text-xs text-gray-500">645 — Charges patronales</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          {/* Tableau des comptes de salaires */}
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Comptes de salaires par période</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>Période</th>
                    <th className="px-3 py-2 text-center font-medium">Employés</th>
                    <th className="px-3 py-2 text-right font-medium text-blue-600">641 Salaires</th>
                    <th className="px-3 py-2 text-right font-medium text-orange-600">645 Charges pat.</th>
                    <th className="px-3 py-2 text-right font-medium text-emerald-600">421 Net à payer</th>
                    <th className="px-3 py-2 text-right font-medium text-red-600">431 CSG</th>
                    <th className="px-3 py-2 text-right font-medium text-red-600">444 PAYE</th>
                    <th className="px-3 py-2 text-right font-medium text-purple-600">432 Levy</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periodes.map(p => {
                    const mois = new Date(p.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                    return (
                      <tr key={p.periode} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium capitalize">{mois}</td>
                        <td className="px-3 py-3 text-center"><Badge variant="outline">{p.nb}</Badge></td>
                        <td className="px-3 py-3 text-right font-mono text-blue-600">{fmt(p.total_brut || 0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-orange-600">{fmt(p.total_charges || 0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-emerald-600 font-bold">{fmt(p.total_net || 0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(p.total_csg || 0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(p.total_paye || 0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-purple-600">{fmt(p.total_levy || 0)}</td>
                      </tr>
                    )
                  })}
                  {periodes.length > 0 && (
                    <tr className="bg-gray-100 font-bold">
                      <td className="px-4 py-3">TOTAL</td>
                      <td className="px-3 py-3 text-center">{periodes.reduce((s, p) => s + (p.nb || 0), 0)}</td>
                      <td className="px-3 py-3 text-right font-mono text-blue-600">{fmt(totalBrut)}</td>
                      <td className="px-3 py-3 text-right font-mono text-orange-600">{fmt(totalCharges)}</td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-600">{fmt(totalNet)}</td>
                      <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(totalCSG)}</td>
                      <td className="px-3 py-3 text-right font-mono text-red-600">{fmt(periodes.reduce((s, p) => s + (p.total_paye || 0), 0))}</td>
                      <td className="px-3 py-3 text-right font-mono text-purple-600">{fmt(periodes.reduce((s, p) => s + (p.total_levy || 0), 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {periodes.length === 0 && (
                <p className="text-center text-gray-400 py-8">Aucune donnée de salaire. Importez des fichiers de paie depuis le module RH.</p>
              )}
            </CardContent>
          </Card>

          {/* Plan comptable résumé */}
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Plan comptable — Comptes de personnel</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { compte: "641100", label: "Salaires de base", debit: totalBrut, color: "text-blue-600" },
                  { compte: "641200", label: "Heures supplémentaires", debit: 0, color: "text-blue-500" },
                  { compte: "641300", label: "Primes et indemnités", debit: 0, color: "text-blue-500" },
                  { compte: "645100", label: "CSG patronale (6%)", debit: 0, color: "text-orange-600" },
                  { compte: "645200", label: "NSF patronal (2.5%)", debit: 0, color: "text-orange-500" },
                  { compte: "645300", label: "Training Levy (1%)", debit: 0, color: "text-orange-500" },
                  { compte: "645400", label: "PRGF", debit: 0, color: "text-orange-500" },
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
                    { compte: "431000", label: "CSG à payer", credit: totalCSG, color: "text-red-600" },
                    { compte: "444000", label: "PAYE à payer", credit: 0, color: "text-red-500" },
                    { compte: "432000", label: "Training Levy à payer", credit: 0, color: "text-purple-600" },
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
