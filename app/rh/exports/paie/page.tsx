"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Download, Users, Banknote, FileText, Settings, CheckCircle, AlertTriangle, Save } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)
}

interface Employe {
  id: string
  nom: string
  prenom: string
  poste?: string
  salaire_base: number
  bank_name?: string
  bank_account?: string
  mode_paiement: "bulk" | "individuel" | "especes"
  inclus_mra: boolean
}

export default function ExportPaiePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [employes, setEmployes] = useState<Employe[]>([])
  const [bulletins, setBulletins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
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
      const [empRes, bulRes] = await Promise.all([
        fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/paie?action=list&societe_id=${societe}&periode=${periode}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
      ])

      const emps = (empRes.employes || []).map((e: any) => ({
        id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        poste: e.poste,
        salaire_base: Number(e.salaire_base) || 0,
        bank_name: e.bank_name || e.banque || "",
        bank_account: e.bank_account || e.rib || e.iban || "",
        mode_paiement: e.mode_paiement || "bulk",
        inclus_mra: e.inclus_mra !== false,
      }))
      setEmployes(emps.sort((a: Employe, b: Employe) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))
      setBulletins(bulRes.bulletins || [])
    } catch {}
    setLoading(false)
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  const updateEmployeMode = (empId: string, field: string, value: any) => {
    setEmployes(prev => prev.map(e => e.id === empId ? { ...e, [field]: value } : e))
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      for (const emp of employes) {
        await fetch("/api/rh/employes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: emp.id,
            mode_paiement: emp.mode_paiement,
            inclus_mra: emp.inclus_mra,
          }),
        })
      }
    } catch {}
    setSaving(false)
  }

  const bulkEmployes = employes.filter(e => e.mode_paiement === "bulk")
  const individuelEmployes = employes.filter(e => e.mode_paiement === "individuel")
  const especesEmployes = employes.filter(e => e.mode_paiement === "especes")

  const getBulletinForEmploye = (empId: string) => bulletins.find((b: any) => b.employe_id === empId)

  const totalBulk = bulkEmployes.reduce((s, e) => {
    const b = getBulletinForEmploye(e.id)
    return s + (b ? Number(b.salaire_net || b.net_a_payer || 0) : 0)
  }, 0)

  const totalIndividuel = individuelEmployes.reduce((s, e) => {
    const b = getBulletinForEmploye(e.id)
    return s + (b ? Number(b.salaire_net || b.net_a_payer || 0) : 0)
  }, 0)

  const exportBulkCSV = () => {
    setExporting("bulk")
    const lines = ["Beneficiary Name,Account Number,Bank,Amount,Reference"]
    for (const emp of bulkEmployes) {
      const b = getBulletinForEmploye(emp.id)
      if (!b) continue
      const net = Number(b.salaire_net || b.net_a_payer || 0)
      lines.push(`"${emp.prenom} ${emp.nom}","${emp.bank_account}","${emp.bank_name}",${net.toFixed(2)},"SALARY ${periode}"`)
    }
    const csv = lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `bulk-salary-${periode}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExporting("")
  }

  const exportMCBFormat = () => {
    setExporting("mcb")
    // MCB Bulk Payment format
    const lines: string[] = []
    const batchRef = `SAL${periode.replace("-", "")}`
    let totalAmount = 0

    for (const emp of bulkEmployes) {
      const b = getBulletinForEmploye(emp.id)
      if (!b) continue
      const net = Number(b.salaire_net || b.net_a_payer || 0)
      totalAmount += net
      // MCB format: account,amount,reference,beneficiary
      lines.push(`${emp.bank_account},${net.toFixed(2)},${batchRef},${emp.prenom} ${emp.nom}`)
    }

    const header = `BULK PAYMENT,${batchRef},${bulkEmployes.length},${totalAmount.toFixed(2)},MUR`
    const content = [header, ...lines].join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `mcb-bulk-${periode}.txt`; a.click()
    URL.revokeObjectURL(url)
    setExporting("")
  }

  const exportIndividuelCSV = () => {
    setExporting("individuel")
    const lines = ["Nom,Prenom,Poste,Net a payer,Mode,Banque,Compte,Inclus MRA"]
    for (const emp of individuelEmployes) {
      const b = getBulletinForEmploye(emp.id)
      const net = b ? Number(b.salaire_net || b.net_a_payer || 0) : 0
      lines.push(`"${emp.nom}","${emp.prenom}","${emp.poste || ""}",${net.toFixed(2)},"Individuel","${emp.bank_name}","${emp.bank_account}","${emp.inclus_mra ? "Oui" : "Non"}"`)
    }
    for (const emp of especesEmployes) {
      const b = getBulletinForEmploye(emp.id)
      const net = b ? Number(b.salaire_net || b.net_a_payer || 0) : 0
      lines.push(`"${emp.nom}","${emp.prenom}","${emp.poste || ""}",${net.toFixed(2)},"Especes","","","${emp.inclus_mra ? "Oui" : "Non"}"`)
    }
    const csv = lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `virements-individuels-${periode}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExporting("")
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Export Paie & Virements</h1>
          <p className="text-gray-500 text-sm">Paramétrez bulk / individuel / espèces par employé</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-[160px]" />
          <Button variant="outline" size="sm" onClick={saveConfig} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Sauver config
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Bulk Payment</p>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{bulkEmployes.length}</p>
            <p className="text-sm text-gray-500">{fmt(totalBulk)} MUR</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Virements individuels</p>
            <p className="text-2xl font-bold text-orange-600">{individuelEmployes.length}</p>
            <p className="text-sm text-gray-500">{fmt(totalIndividuel)} MUR</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Paiement espèces</p>
            <p className="text-2xl font-bold text-purple-600">{especesEmployes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase">Bulletins générés</p>
            <p className="text-2xl font-bold text-emerald-600">{bulletins.length}</p>
            <p className="text-sm text-gray-500">sur {employes.length} employés</p>
          </CardContent>
        </Card>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportMCBFormat} disabled={bulkEmployes.length === 0 || !!exporting}
          style={{ backgroundColor: NAVY }} className="text-white">
          {exporting === "mcb" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
          Export MCB Bulk ({bulkEmployes.length} employés)
        </Button>
        <Button onClick={exportBulkCSV} disabled={bulkEmployes.length === 0 || !!exporting} variant="outline">
          {exporting === "bulk" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export CSV Bulk
        </Button>
        <Button onClick={exportIndividuelCSV} disabled={(individuelEmployes.length + especesEmployes.length) === 0 || !!exporting} variant="outline">
          {exporting === "individuel" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
          Export individuels + espèces
        </Button>
      </div>

      {/* Employee configuration table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              <Settings className="inline h-5 w-5 mr-2" />
              Paramétrage par employé
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>Employé</th>
                    <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>Poste</th>
                    <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Mode paiement</th>
                    <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Charges MRA</th>
                    <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Banque</th>
                    <th className="px-4 py-2 text-right font-medium" style={{ color: NAVY }}>Net à payer</th>
                    <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Bulletin</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employes.map(emp => {
                    const b = getBulletinForEmploye(emp.id)
                    const net = b ? Number(b.salaire_net || b.net_a_payer || 0) : 0
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{emp.prenom} {emp.nom}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{emp.poste || "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <Select value={emp.mode_paiement} onValueChange={v => updateEmployeMode(emp.id, "mode_paiement", v)}>
                            <SelectTrigger className="w-[140px] h-8 text-xs mx-auto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bulk">
                                <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> Bulk (MCB)</span>
                              </SelectItem>
                              <SelectItem value="individuel">
                                <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Individuel</span>
                              </SelectItem>
                              <SelectItem value="especes">
                                <span className="flex items-center gap-1">💵 Espèces</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch checked={emp.inclus_mra} onCheckedChange={v => updateEmployeMode(emp.id, "inclus_mra", v)} />
                            <span className="text-[10px] text-gray-400">{emp.inclus_mra ? "Oui" : "Non"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-gray-500">
                          {emp.bank_name || "—"}
                          {emp.bank_account && <div className="text-[10px] text-gray-400">{emp.bank_account}</div>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium">
                          {net > 0 ? fmt(net) : "—"}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {b ? (
                            <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle className="h-3 w-3 mr-0.5" /> Généré</Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-0.5" /> En attente</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
