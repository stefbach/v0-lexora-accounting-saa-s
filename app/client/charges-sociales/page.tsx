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
  const totalCSGBonus = bulletins.reduce((s, b) => s + (Number(b.csg_bonus) || 0), 0)
  const totalCSGPatronal = bulletins.reduce((s, b) => s + (Number(b.csg_patronal) || 0), 0)
  const totalCSGPatronalBonus = bulletins.reduce((s, b) => s + (Number(b.csg_patronal_bonus) || 0), 0)
  const totalNSFSalarie = bulletins.reduce((s, b) => s + (Number(b.nsf_salarie) || 0), 0)
  const totalNSFPatronal = bulletins.reduce((s, b) => s + (Number(b.nsf_patronal) || 0), 0)
  const totalTrainingLevy = bulletins.reduce((s, b) => s + (Number(b.training_levy) || 0), 0)
  const totalPAYE = bulletins.reduce((s, b) => s + (Number(b.paye) || 0), 0)
  const totalPRGF = bulletins.reduce((s, b) => s + (Number(b.prgf) || 0), 0)
  // Charges patronales = ce que l'employeur doit en plus du salaire
  const totalChargesPatronales = totalCSGPatronal + totalCSGPatronalBonus + totalNSFPatronal + totalTrainingLevy + totalPRGF
  // Retenues salariales = ce qui est déduit du salaire brut de l'employé
  const totalRetenues = totalCSGSalarie + totalCSGBonus + totalNSFSalarie + totalPAYE
  // Total à déclarer MRA (CSG + NSF parts salarié et patronal)
  const totalDeclarationMRA = totalCSGSalarie + totalCSGBonus + totalCSGPatronal + totalCSGPatronalBonus + totalNSFSalarie + totalNSFPatronal + totalTrainingLevy + totalPRGF

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
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><Shield className="h-4 w-4" /> Charges patronales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(totalChargesPatronales)}</p><p className="text-xs text-gray-400">CSG: {fmt(totalCSGPatronal + totalCSGPatronalBonus)} | NSF: {fmt(totalNSFPatronal)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><PiggyBank className="h-4 w-4" /> Retenues salariales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(totalRetenues)}</p><p className="text-xs text-gray-400">CSG: {fmt(totalCSGSalarie + totalCSGBonus)} | NSF: {fmt(totalNSFSalarie)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><Receipt className="h-4 w-4" /> PAYE (impôt)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalPAYE)}</p><p className="text-xs text-gray-400">Retenu sur salaire</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Training + PRGF</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-purple-600">{fmt(totalTrainingLevy + totalPRGF)}</p><p className="text-xs text-gray-400">Levy: {fmt(totalTrainingLevy)} | PRGF: {fmt(totalPRGF)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Détail par type de charge — {new Date(periode + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</CardTitle></CardHeader>
            <CardContent>
              {bulletins.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucun bulletin pour cette période</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Charges patronales (coût employeur)</p>
                    <div className="space-y-2">
                      {[
                        { label: "CSG patronal (6%)", montant: totalCSGPatronal + totalCSGPatronalBonus, compte: "645", color: "text-red-600" },
                        { label: "NSF patronal (2.5%)", montant: totalNSFPatronal, compte: "645", color: "text-blue-600" },
                        { label: "Training Levy HRDC (1%)", montant: totalTrainingLevy, compte: "645", color: "text-purple-600" },
                        { label: "PRGF (4.5% émoluments / 4.50 MUR/j)", montant: totalPRGF, compte: "645", color: "text-purple-600" },
                      ].map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs font-mono">{c.compte}</Badge>
                            <span className="text-sm">{c.label}</span>
                          </div>
                          <span className={`font-mono font-bold ${c.color}`}>{fmt(c.montant)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between p-3 rounded-lg font-bold bg-red-50">
                        <span>TOTAL CHARGES PATRONALES</span>
                        <span className="font-mono text-lg text-red-700">{fmt(totalChargesPatronales)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Retenues salariales (prélevées sur salaire brut)</p>
                    <div className="space-y-2">
                      {[
                        { label: "CSG salarié (1.5% / 3%)", montant: totalCSGSalarie + totalCSGBonus, compte: "431", color: "text-red-600" },
                        { label: "NSF salarié (1.5%)", montant: totalNSFSalarie, compte: "431", color: "text-blue-600" },
                        { label: "PAYE (impôt sur le revenu)", montant: totalPAYE, compte: "444", color: "text-orange-600" },
                      ].map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs font-mono">{c.compte}</Badge>
                            <span className="text-sm">{c.label}</span>
                          </div>
                          <span className={`font-mono font-bold ${c.color}`}>{fmt(c.montant)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between p-3 rounded-lg font-bold bg-blue-50">
                        <span>TOTAL RETENUES SALARIALES</span>
                        <span className="font-mono text-lg text-blue-700">{fmt(totalRetenues)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg font-bold" style={{ backgroundColor: `${GOLD}15` }}>
                    <span>TOTAL À DÉCLARER MRA (CSG + NSF + Levy + PRGF)</span>
                    <span className="font-mono text-lg" style={{ color: NAVY }}>{fmt(totalDeclarationMRA)}</span>
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
