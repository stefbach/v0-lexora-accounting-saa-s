"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Shield, GraduationCap, PiggyBank, Receipt, Download } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"
function fmt(n: number) { return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " MUR" }

export default function ChargesSocialesPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [bulletins, setBulletins] = useState<any[]>([])

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
      const res = await fetch(`/api/rh/paie?societe_id=${societe}&periode=${periode}`)
      const data = await res.json()
      setBulletins(data.bulletins || [])
    } catch {}
    setLoading(false)
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  // Calculs
  const totalCSGSalarie = bulletins.reduce((s, b) => s + (Number(b.csg_salarie) || 0), 0)
  const totalCSGPatronal = bulletins.reduce((s, b) => s + (Number(b.csg_patronal) || 0), 0)
  const totalNSFSalarie = bulletins.reduce((s, b) => s + (Number(b.nsf_salarie) || 0), 0)
  const totalNSFPatronal = bulletins.reduce((s, b) => s + (Number(b.nsf_patronal) || 0), 0)
  const totalTrainingLevy = bulletins.reduce((s, b) => s + (Number(b.training_levy) || 0), 0)
  const totalPAYE = bulletins.reduce((s, b) => s + (Number(b.paye) || 0), 0)
  const totalPRGF = bulletins.reduce((s, b) => s + (Number(b.prgf) || 0), 0)
  const grandTotal = totalCSGSalarie + totalCSGPatronal + totalNSFSalarie + totalNSFPatronal + totalTrainingLevy + totalPAYE + totalPRGF

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Charges Sociales — CSG / NSF / PAYE</h1>
          <p className="text-sm text-gray-500">Cotisations calculées depuis les bulletins de paie</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
          <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><Shield className="h-4 w-4" /> CSG Total</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(totalCSGSalarie + totalCSGPatronal)}</p><p className="text-xs text-gray-400">Salarié: {fmt(totalCSGSalarie)} | Patronal: {fmt(totalCSGPatronal)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><PiggyBank className="h-4 w-4" /> NSF Total</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(totalNSFSalarie + totalNSFPatronal)}</p><p className="text-xs text-gray-400">Salarié: {fmt(totalNSFSalarie)} | Patronal: {fmt(totalNSFPatronal)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><Receipt className="h-4 w-4" /> PAYE</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalPAYE)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Training + PRGF</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-purple-600">{fmt(totalTrainingLevy + totalPRGF)}</p><p className="text-xs text-gray-400">Levy: {fmt(totalTrainingLevy)} | PRGF: {fmt(totalPRGF)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Détail par type de charge — {new Date(periode + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</CardTitle></CardHeader>
            <CardContent>
              {bulletins.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucun bulletin pour cette période</p>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "CSG salarié (1.5% si brut ≤ 50K / 3% si > 50K)", montant: totalCSGSalarie, compte: "431", color: "text-red-600" },
                    { label: "CSG patronal (3% si brut ≤ 50K / 6% si > 50K)", montant: totalCSGPatronal, compte: "431", color: "text-red-600" },
                    { label: "NSF salarié (1.5%)", montant: totalNSFSalarie, compte: "431", color: "text-blue-600" },
                    { label: "NSF patronal (2.5%)", montant: totalNSFPatronal, compte: "431", color: "text-blue-600" },
                    { label: "Training Levy HRDC (1%)", montant: totalTrainingLevy, compte: "432", color: "text-purple-600" },
                    { label: "PRGF (max 4.5% émoluments ou 4.50 MUR/jour)", montant: totalPRGF, compte: "432", color: "text-purple-600" },
                    { label: "PAYE — Pay As You Earn (0% / 10% / 15%)", montant: totalPAYE, compte: "444", color: "text-orange-600" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs font-mono">{c.compte}</Badge>
                        <span className="text-sm">{c.label}</span>
                      </div>
                      <span className={`font-mono font-bold ${c.color}`}>{fmt(c.montant)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 rounded-lg font-bold" style={{ backgroundColor: `${GOLD}15` }}>
                    <span>TOTAL CHARGES</span>
                    <span className="font-mono text-lg" style={{ color: NAVY }}>{fmt(grandTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Bulletins ({bulletins.length} employés)</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Employé</th>
                    <th className="px-3 py-2 text-right">Brut</th>
                    <th className="px-3 py-2 text-right">CSG sal.</th>
                    <th className="px-3 py-2 text-right">CSG pat.</th>
                    <th className="px-3 py-2 text-right">NSF sal.</th>
                    <th className="px-3 py-2 text-right">NSF pat.</th>
                    <th className="px-3 py-2 text-right">PAYE</th>
                    <th className="px-3 py-2 text-right">Levy</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bulletins.map((b: any) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-medium">{b.employe?.prenom || ""} {b.employe?.nom || b.employe_id?.substring(0, 8)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.salaire_base || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.csg_salarie || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.csg_patronal || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.nsf_salarie || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.nsf_patronal || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.paye || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(b.training_levy || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
