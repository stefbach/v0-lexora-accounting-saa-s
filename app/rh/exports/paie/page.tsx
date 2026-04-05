"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Download, Banknote, FileText, Settings, CheckCircle,
  AlertTriangle, Save, Clock, CreditCard as CreditCardIcon, Building2, ClipboardList
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
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

interface ExportStatus { done: boolean; loading: boolean; error: string | null }

export default function ExportPaiePage() {
  // -- Shared state --
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  // -- Tab 1: Virements bancaires --
  const [employes, setEmployes] = useState<Employe[]>([])
  const [bulletins, setBulletins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState("")

  // -- Tab 2: Exports MRA --
  const [bulletinsCount, setBulletinsCount] = useState<number | null>(null)
  const [checkingBulletins, setCheckingBulletins] = useState(false)
  const [csgStatus, setCsgStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [payeStatus, setPayeStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [virementMCBStatus, setVirementMCBStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [virementSBMStatus, setVirementSBMStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })

  // -- Load societes --
  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1 && !societe) setSociete(unique[0].id)
    })
  }, [])

  // -- Load employes + bulletins (Tab 1) --
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
        bank_name: e.bank_name || "",
        bank_account: e.bank_account || e.iban || "",
        mode_paiement: e.mode_paiement || "bulk",
        inclus_mra: e.inclus_mra !== false,
      }))
      setEmployes(emps.sort((a: Employe, b: Employe) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))
      setBulletins(bulRes.bulletins || [])
    } catch {}
    setLoading(false)
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  // -- Check bulletins count (Tab 2) --
  useEffect(() => {
    if (!societe || !periode) return
    setCheckingBulletins(true)
    setBulletinsCount(null)
    fetch(`/api/rh/paie?societe_id=${societe}&periode=${periode}`)
      .then(r => r.json())
      .then(d => setBulletinsCount(d.nb || 0))
      .finally(() => setCheckingBulletins(false))
  }, [societe, periode])

  // ========== Tab 1 helpers ==========
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
    const lines: string[] = []
    const batchRef = `SAL${periode.replace("-", "")}`
    let totalAmount = 0

    for (const emp of bulkEmployes) {
      const b = getBulletinForEmploye(emp.id)
      if (!b) continue
      const net = Number(b.salaire_net || b.net_a_payer || 0)
      totalAmount += net
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

  // ========== Tab 2 helpers ==========
  const exportCSGNSF = async () => {
    if (!societe) return alert("Selectionnez une societe")
    setCsgStatus({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/csg-mra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      downloadFile(data.recap_csv, data.filename_recap)
      setTimeout(() => downloadFile(data.detail_csv, data.filename_detail), 500)
      setCsgStatus({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setCsgStatus({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const exportPAYE = async () => {
    if (!societe) return alert("Selectionnez une societe")
    setPayeStatus({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/paye-mra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      downloadFile(data.recap_csv, data.filename_recap)
      setTimeout(() => downloadFile(data.detail_csv, data.filename_detail), 500)
      setPayeStatus({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setPayeStatus({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const exportVirement = async (banque: "MCB" | "SBM") => {
    if (!societe) return alert("Selectionnez une societe")
    const setter = banque === "MCB" ? setVirementMCBStatus : setVirementSBMStatus
    setter({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/virement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode, banque_emettrice: banque })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      if (data.content) {
        downloadFile(data.content, data.filename)
      }
      if (data.fichiers && Array.isArray(data.fichiers)) {
        for (let i = 0; i < data.fichiers.length; i++) {
          const f = data.fichiers[i]
          if (f.content && f.banque !== 'SANS_BANQUE') {
            setTimeout(() => downloadFile(f.content, f.filename), i * 500)
          }
        }
      }
      setter({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setter({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const StatusBadge = ({ status }: { status: ExportStatus }) => {
    if (status.loading) return <span className="flex items-center gap-1 text-xs text-blue-600"><Loader2 className="w-3 h-3 animate-spin" />En cours...</span>
    if (status.error) return <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" />{status.error}</span>
    if (status.done) return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Telecharge</span>
    return null
  }

  // Deadline calculations for MRA tab
  const now = new Date()
  const periodeDate = periode ? new Date(periode + "-01") : now
  const isPast = periodeDate < new Date(now.getFullYear(), now.getMonth(), 1)
  const deadlineCsg = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 15)
  const deadlinePaye = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 20)
  const isLate = (deadline: Date) => now > deadline

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header + selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Exports Paie</h1>
          <p className="text-gray-500 text-sm">Virements bancaires, declarations MRA, fichiers de paie</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Societe" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-[160px]" />
          {checkingBulletins && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {bulletinsCount !== null && (
            <span className={`text-sm px-3 py-1 rounded-full ${bulletinsCount > 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              {bulletinsCount > 0 ? `${bulletinsCount} bulletin(s)` : "Aucun bulletin"}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="virements" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="virements" className="flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Virements bancaires
          </TabsTrigger>
          <TabsTrigger value="mra" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Exports MRA
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: Virements bancaires ==================== */}
        <TabsContent value="virements" className="space-y-6">
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
                <p className="text-xs text-gray-500 uppercase">Paiement especes</p>
                <p className="text-2xl font-bold text-purple-600">{especesEmployes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-gray-500 uppercase">Bulletins generes</p>
                <p className="text-2xl font-bold text-emerald-600">{bulletins.length}</p>
                <p className="text-sm text-gray-500">sur {employes.length} employes</p>
              </CardContent>
            </Card>
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportMCBFormat} disabled={bulkEmployes.length === 0 || !!exporting}
              style={{ backgroundColor: NAVY }} className="text-white">
              {exporting === "mcb" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
              Export MCB Bulk ({bulkEmployes.length} employes)
            </Button>
            <Button onClick={exportBulkCSV} disabled={bulkEmployes.length === 0 || !!exporting} variant="outline">
              {exporting === "bulk" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Export CSV Bulk
            </Button>
            <Button onClick={exportIndividuelCSV} disabled={(individuelEmployes.length + especesEmployes.length) === 0 || !!exporting} variant="outline">
              {exporting === "individuel" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Export individuels + especes
            </Button>
            <Button variant="outline" size="sm" onClick={saveConfig} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Sauver config
            </Button>
          </div>

          {/* Virement MCB BP-V1 & SBM via API */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: NAVY }}>
                <CreditCardIcon className="inline h-4 w-4 mr-2" />
                Virements Salaires (format officiel)
                <span className="text-xs font-normal text-gray-500 ml-2">Via API serveur</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">MCB BP-V1</p>
                    <p className="text-xs text-gray-500">Format officiel Bulk Payment MCB</p>
                    <StatusBadge status={virementMCBStatus} />
                  </div>
                  <Button onClick={() => exportVirement("MCB")} disabled={virementMCBStatus.loading || !societe || !bulletinsCount} variant="outline" size="sm">
                    {virementMCBStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                    Export MCB BP-V1
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">SBM Internet Banking</p>
                    <p className="text-xs text-gray-500">State Bank of Mauritius</p>
                    <StatusBadge status={virementSBMStatus} />
                  </div>
                  <Button onClick={() => exportVirement("SBM")} disabled={virementSBMStatus.loading || !societe || !bulletinsCount} variant="outline" size="sm">
                    {virementSBMStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                    Export SBM
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee configuration table */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: NAVY }}>
                  <Settings className="inline h-5 w-5 mr-2" />
                  Parametrage par employe
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>Employe</th>
                        <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>Poste</th>
                        <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Mode paiement</th>
                        <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Charges MRA</th>
                        <th className="px-4 py-2 text-center font-medium" style={{ color: NAVY }}>Banque</th>
                        <th className="px-4 py-2 text-right font-medium" style={{ color: NAVY }}>Net a payer</th>
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
                                    <span className="flex items-center gap-1">Especes</span>
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
                                <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle className="h-3 w-3 mr-0.5" /> Genere</Badge>
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
        </TabsContent>

        {/* ==================== TAB 2: Exports MRA ==================== */}
        <TabsContent value="mra" className="space-y-6">
          {/* Deadline alerts */}
          {isPast && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "CSG/NSF", deadline: deadlineCsg, text: `Deadline: le 15/${String(periodeDate.getMonth() + 2).padStart(2, "0")}` },
                { label: "PAYE", deadline: deadlinePaye, text: `Deadline: le 20/${String(periodeDate.getMonth() + 2).padStart(2, "0")}` },
              ].map(d => (
                <div key={d.label} className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${isLate(d.deadline) ? "bg-red-50 border-red-200 text-red-700" : "bg-yellow-50 border-yellow-200 text-yellow-700"}`}>
                  {isLate(d.deadline) ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  <span><strong>{d.label}</strong> -- {d.text} {isLate(d.deadline) ? "EN RETARD" : "A faire"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Declarations MRA */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[#0B0F2E] flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Declarations MRA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* CSG/NSF */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">CSG/NSF Mensuel</p>
                      <p className="text-xs text-gray-500">2 fichiers : Recap + Detail</p>
                      <p className={`text-xs mt-1 ${isLate(deadlineCsg) ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        Deadline : 15/{String(periodeDate.getMonth() + 2).padStart(2, "0")}/{periodeDate.getFullYear()}
                        {isLate(deadlineCsg) ? " [EN RETARD]" : ""}
                      </p>
                      <StatusBadge status={csgStatus} />
                    </div>
                    <Button onClick={exportCSGNSF} disabled={csgStatus.loading || !societe || !bulletinsCount} size="sm" className="bg-[#0B0F2E] text-white">
                      {csgStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                      Telecharger
                    </Button>
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>- CSG salarie (1.5% / 3%)</p>
                    <p>- CSG patronal (6%)</p>
                    <p>- NSF salarie (1.5%) + patronal (2.5%)</p>
                  </div>
                </div>

                {/* PAYE */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">PAYE Return</p>
                      <p className="text-xs text-gray-500">2 fichiers : Recap + Detail</p>
                      <p className={`text-xs mt-1 ${isLate(deadlinePaye) ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        Deadline : 20/{String(periodeDate.getMonth() + 2).padStart(2, "0")}/{periodeDate.getFullYear()}
                        {isLate(deadlinePaye) ? " [EN RETARD]" : ""}
                      </p>
                      <StatusBadge status={payeStatus} />
                    </div>
                    <Button onClick={exportPAYE} disabled={payeStatus.loading || !societe || !bulletinsCount} size="sm" className="bg-[#0B0F2E] text-white">
                      {payeStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                      Telecharger
                    </Button>
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>- Retenu PAYE mensuel par employe</p>
                    <p>- Salaire annualise + TAN</p>
                    <p>- Format MRA conforme</p>
                  </div>
                </div>

                {/* PRGF */}
                <div className="p-4 bg-gray-50 rounded-lg border opacity-70">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">PRGF</p>
                      <p className="text-xs text-gray-500">4.50 MUR x jours travailles</p>
                      <p className="text-xs text-gray-400">Deadline : fin du mois</p>
                    </div>
                    <Button disabled size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-1" />Inclus dans CSG
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">Inclus dans l'export CSG/NSF</p>
                </div>

                {/* Training Levy */}
                <div className="p-4 bg-gray-50 rounded-lg border opacity-70">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">Training Levy (HRDC)</p>
                      <p className="text-xs text-gray-500">1% de la masse salariale</p>
                      <p className="text-xs text-gray-400">Deadline : fin du mois</p>
                    </div>
                    <Button disabled size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-1" />Inclus dans CSG
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">Inclus dans l'export CSG/NSF</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulletins PDF */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[#0B0F2E] flex items-center gap-2"><FileText className="w-4 h-4" /> Bulletins de Paie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 p-4 bg-gray-50 rounded-lg border">
                  <p className="font-medium text-sm mb-1">Bulletin individuel</p>
                  <p className="text-xs text-gray-500 mb-3">Selectionnez un employe pour generer son bulletin PDF</p>
                  <a href="/rh/paie">
                    <Button variant="outline" size="sm">
                      Aller aux bulletins
                    </Button>
                  </a>
                </div>
                <div className="flex-1 p-4 bg-gray-50 rounded-lg border opacity-60">
                  <p className="font-medium text-sm mb-1">Tous les bulletins (ZIP)</p>
                  <p className="text-xs text-gray-500 mb-3">Un PDF par employe -- a venir</p>
                  <Button disabled variant="outline" size="sm">Bientot disponible</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal reminder */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h3 className="font-medium text-blue-900 text-sm mb-2 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Calendrier des declarations MRA</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-blue-800">
                <p>- <strong>CSG/NSF :</strong> avant le 15 du mois suivant</p>
                <p>- <strong>PAYE :</strong> avant le 20 du mois suivant</p>
                <p>- <strong>PRGF :</strong> fin du mois en cours</p>
                <p>- <strong>Training Levy :</strong> fin du mois en cours</p>
                <p>- <strong>13eme mois (75%) :</strong> avant le 25 decembre</p>
                <p>- <strong>EDF annuel :</strong> avant le 30 septembre</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
