"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Download, Banknote, FileText, CheckCircle,
  AlertTriangle, Clock, Building2, Users, Wallet, FileCheck
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

interface Bulletin {
  id: string
  employe_id: string
  salaire_net: number
  salaire_brut: number
  statut: string
  employe?: { nom: string; prenom: string; poste?: string; devise_salaire?: string } | null
}

interface Employe {
  id: string
  nom: string
  prenom: string
  poste?: string
  bank_name?: string
  bank_account?: string
  bank_code?: string
  mode_paiement?: string
  inclus_mra?: boolean
}

interface ExportStatus {
  loading: boolean
  done: boolean
  error: string | null
  summary?: Record<string, any> | null
}

const initialStatus: ExportStatus = { loading: false, done: false, error: null, summary: null }

export default function ExportPaiePage() {
  // -- Shared state --
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  // -- Data --
  const [employes, setEmployes] = useState<Employe[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // -- Export statuses --
  const [virementStatus, setVirementStatus] = useState<ExportStatus>(initialStatus)
  const [csvExportStatus, setCsvExportStatus] = useState<ExportStatus>(initialStatus)
  const [csgStatus, setCsgStatus] = useState<ExportStatus>(initialStatus)
  const [payeStatus, setPayeStatus] = useState<ExportStatus>(initialStatus)

  // -- Alert/toast messages --
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Auto-dismiss alert
  useEffect(() => {
    if (!alertMsg) return
    const t = setTimeout(() => setAlertMsg(null), 6000)
    return () => clearTimeout(t)
  }, [alertMsg])

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

  // -- Load employes + bulletins --
  const loadData = useCallback(async () => {
    if (!societe) return
    setLoadingData(true)
    // Reset statuses when period/societe changes
    setVirementStatus(initialStatus)
    setCsvExportStatus(initialStatus)
    setCsgStatus(initialStatus)
    setPayeStatus(initialStatus)
    try {
      const [empRes, bulRes] = await Promise.all([
        fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/paie?societe_id=${societe}&periode=${periode}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
      ])

      const emps: Employe[] = (empRes.employes || []).map((e: any) => ({
        id: e.id,
        nom: e.nom || "",
        prenom: e.prenom || "",
        poste: e.poste,
        bank_name: e.bank_name || "",
        bank_account: e.bank_account || e.iban || "",
        bank_code: e.bank_code || "",
        mode_paiement: e.mode_paiement || "bulk",
        inclus_mra: e.inclus_mra !== false,
      }))
      setEmployes(emps.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))

      const buls: Bulletin[] = (bulRes.bulletins || []).map((b: any) => ({
        id: b.id,
        employe_id: b.employe_id,
        salaire_net: Number(b.salaire_net) || 0,
        salaire_brut: Number(b.salaire_brut) || 0,
        statut: b.statut || "brouillon",
        employe: b.employe || null,
      }))
      setBulletins(buls)
    } catch {
      setAlertMsg({ type: "error", text: "Erreur lors du chargement des donnees." })
    }
    setLoadingData(false)
  }, [societe, periode])

  useEffect(() => { loadData() }, [loadData])

  // -- Computed values --
  const getBulletin = (empId: string) => bulletins.find(b => b.employe_id === empId)
  const totalNet = bulletins.reduce((s, b) => s + b.salaire_net, 0)
  const bulletinsValides = bulletins.filter(b => b.statut === "valide" || b.statut === "paye")

  // -- Deadline calculations --
  const periodeDate = periode ? new Date(periode + "-01") : new Date()
  const nextMonth = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 1)
  const deadlineCsg = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 15)
  const deadlinePaye = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20)
  const deadlineNsf = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0) // last day of next month
  const now = new Date()
  const isLate = (d: Date) => now > d
  const formatDeadline = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`

  // ========== Update employee mode ==========
  const updateEmployeMode = async (empId: string, field: string, value: any) => {
    try {
      await fetch(`/api/rh/employes/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      setEmployes(prev => prev.map(e => e.id === empId ? { ...e, [field]: value } : e))
    } catch {}
  }

  // Stats par mode
  const empBulk = employes.filter(e => e.mode_paiement === "bulk" || !e.mode_paiement)
  const empCash = employes.filter(e => e.mode_paiement === "especes")
  const empIndiv = employes.filter(e => e.mode_paiement === "individuel")
  const empMRA = employes.filter(e => e.inclus_mra !== false)

  // ========== Tab 1: Virements bancaires ==========

  const exportVirementMCB = async () => {
    if (!societe) return setAlertMsg({ type: "error", text: "Veuillez selectionner une societe." })
    setVirementStatus({ loading: true, done: false, error: null, summary: null })
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          // Exclude employees not in bulk mode
          exclude_employe_ids: employes.filter(e => e.mode_paiement === "especes" || e.mode_paiement === "individuel").map(e => e.id),
        }),
      })
      let data: any
      const text = await res.text()
      try { data = JSON.parse(text) } catch { throw new Error(`Reponse non-JSON (${res.status}): ${text.slice(0, 300)}`) }
      if (!res.ok || data.error) {
        // Sécurité — on log la stack côté console (DevTools) mais on ne
        // l'affiche JAMAIS à l'utilisateur final. Message UX neutre,
        // détails techniques accessibles aux dev seulement.
        if (data.debug_stack) console.error('[exports/virement] server stack:', data.debug_stack)
        throw new Error(`Une erreur est survenue lors de la génération du virement. Contactez l'administrateur.`)
      }
      // Response can have fichiers array or single content
      if (data.fichiers && Array.isArray(data.fichiers)) {
        let downloaded = 0
        for (let i = 0; i < data.fichiers.length; i++) {
          const f = data.fichiers[i]
          if (f.content && f.banque !== "SANS_BANQUE") {
            setTimeout(() => downloadFile(f.content, f.filename), i * 400)
            downloaded++
          }
        }
        // Also download SANS_BANQUE list if exists (useful for user awareness)
        const sansBanque = data.fichiers.find((f: any) => f.banque === "SANS_BANQUE")
        if (sansBanque?.content) {
          setTimeout(() => downloadFile(sansBanque.content, sansBanque.filename), data.fichiers.length * 400)
        }
        setVirementStatus({
          loading: false,
          done: true,
          error: null,
          summary: data.recap || null,
        })
        setAlertMsg({ type: "success", text: `${downloaded} fichier(s) de virement telecharge(s).` })
      } else if (data.content) {
        downloadFile(data.content, data.filename || `virement_${periode}.txt`)
        setVirementStatus({ loading: false, done: true, error: null, summary: null })
        setAlertMsg({ type: "success", text: "Fichier de virement telecharge." })
      } else {
        setVirementStatus({ loading: false, done: true, error: null, summary: data.recap || null })
        setAlertMsg({ type: "success", text: "Export genere avec succes." })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur lors de l'export virement"
      setVirementStatus({ loading: false, done: false, error: msg, summary: null })
      setAlertMsg({ type: "error", text: msg })
    }
  }

  const exportCSV = () => {
    if (!societe || bulletins.length === 0) {
      return setAlertMsg({ type: "error", text: "Aucun bulletin a exporter." })
    }
    setCsvExportStatus({ loading: true, done: false, error: null, summary: null })
    try {
      const empMap = new Map(employes.map(e => [e.id, e]))
      const lines = ["Nom;Prenom;Banque;Compte;Net a payer;Statut"]
      for (const b of bulletins) {
        const emp = empMap.get(b.employe_id)
        lines.push([
          emp?.nom || "",
          emp?.prenom || "",
          emp?.bank_name || "",
          emp?.bank_account || "",
          b.salaire_net.toFixed(2),
          b.statut,
        ].join(";"))
      }
      const csv = lines.join("\n")
      const socName = societes.find(s => s.id === societe)?.nom?.replace(/\s+/g, "_") || "export"
      downloadFile(csv, `virements_salaires_${socName}_${periode}.csv`)
      setCsvExportStatus({ loading: false, done: true, error: null, summary: null })
      setAlertMsg({ type: "success", text: "CSV telecharge." })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur CSV"
      setCsvExportStatus({ loading: false, done: false, error: msg, summary: null })
      setAlertMsg({ type: "error", text: msg })
    }
  }

  // ========== Tab 2: Exports MRA ==========

  const exportCSGNSF = async () => {
    if (!societe) return setAlertMsg({ type: "error", text: "Veuillez selectionner une societe." })
    setCsgStatus({ loading: true, done: false, error: null, summary: null })
    try {
      const res = await fetch("/api/rh/exports/csg-mra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode }),
      })
      let data: any
      const textCSG = await res.text()
      try { data = JSON.parse(textCSG) } catch { throw new Error(`Reponse non-JSON CSG (${res.status}): ${textCSG.slice(0, 300)}`) }
      if (!res.ok || data.error) {
        if (data.debug_stack) console.error('[exports/csg-mra] server stack:', data.debug_stack)
        throw new Error(`Une erreur est survenue lors de la génération CSG/NSF. Contactez l'administrateur.`)
      }

      // Download recap + detail CSVs
      if (data.recap_csv) downloadFile(data.recap_csv, data.filename_recap || `CSG_NSF_Recap_${periode}.csv`)
      if (data.detail_csv) setTimeout(() => downloadFile(data.detail_csv, data.filename_detail || `CSG_NSF_Detail_${periode}.csv`), 500)

      setCsgStatus({ loading: false, done: true, error: null, summary: data.totaux || null })
      setAlertMsg({ type: "success", text: `Declaration CSG/NSF generee (${data.nb_employes} employes).` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur CSG/NSF"
      setCsgStatus({ loading: false, done: false, error: msg, summary: null })
      setAlertMsg({ type: "error", text: msg })
    }
  }

  const exportPAYE = async () => {
    if (!societe) return setAlertMsg({ type: "error", text: "Veuillez selectionner une societe." })
    setPayeStatus({ loading: true, done: false, error: null, summary: null })
    try {
      const res = await fetch("/api/rh/exports/paye-mra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode }),
      })
      let data: any
      const textPAYE = await res.text()
      try { data = JSON.parse(textPAYE) } catch { throw new Error(`Reponse non-JSON PAYE (${res.status}): ${textPAYE.slice(0, 200)}`) }
      if (!res.ok || data.error) throw new Error(`[PAYE ${res.status}] ${data.error || JSON.stringify(data).slice(0, 200)}`)

      if (data.recap_csv) downloadFile(data.recap_csv, data.filename_recap || `PAYE_Recap_${periode}.csv`)
      if (data.detail_csv) setTimeout(() => downloadFile(data.detail_csv, data.filename_detail || `PAYE_Detail_${periode}.csv`), 500)

      setPayeStatus({ loading: false, done: true, error: null, summary: data.totaux || null })
      setAlertMsg({ type: "success", text: `PAYE Return genere (${data.totaux?.nb_employes || "?"} employes).` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur PAYE"
      setPayeStatus({ loading: false, done: false, error: msg, summary: null })
      setAlertMsg({ type: "error", text: msg })
    }
  }

  // -- StatusBadge component --
  const StatusBadge = ({ status }: { status: ExportStatus }) => {
    if (status.loading) return <span className="flex items-center gap-1 text-xs text-blue-600"><Loader2 className="w-3 h-3 animate-spin" />En cours...</span>
    if (status.error) return <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" />{status.error}</span>
    if (status.done) return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Telecharge</span>
    return null
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Alert banner */}
      {alertMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium shadow-sm ${
            alertMsg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {alertMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {alertMsg.text}
          <button onClick={() => setAlertMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">Fermer</button>
        </div>
      )}
      {/* Debug: show all export errors */}
      {(virementStatus.error || csgStatus.error || payeStatus.error) && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-xs font-mono text-orange-800 space-y-1">
          <p className="font-bold text-sm">Debug erreurs exports :</p>
          {virementStatus.error && <p>VIREMENT: {virementStatus.error}</p>}
          {csgStatus.error && <p>CSG/NSF: {csgStatus.error}</p>}
          {payeStatus.error && <p>PAYE: {payeStatus.error}</p>}
          <p className="text-orange-500">Societe: {societe || 'non selectionnee'} | Periode: {periode}</p>
        </div>
      )}

      {/* Header + Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Exports Paie</h1>
          <p className="text-gray-500 text-sm">Virements bancaires et declarations MRA</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selectionner une societe" />
            </SelectTrigger>
            <SelectContent>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="month"
            value={periode}
            onChange={e => setPeriode(e.target.value)}
            className="h-10 px-3 border rounded-md text-sm bg-white"
          />
          {loadingData && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: BLUE + "18" }}>
              <Users className="w-6 h-6" style={{ color: BLUE }} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total employes</p>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{employes.length}</p>
              <p className="text-xs text-gray-400">{bulletins.length} bulletin(s) genere(s)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: GOLD + "18" }}>
              <Wallet className="w-6 h-6" style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Masse salariale nette</p>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(totalNet)} <span className="text-sm font-normal text-gray-400">MUR</span></p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50">
              <FileCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Bulletins valides</p>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{bulletinsValides.length}</p>
              <p className="text-xs text-gray-400">sur {bulletins.length} bulletin(s)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Bulk MCB</p>
            <p className="text-xl font-bold text-green-600">{empBulk.length}</p>
            <p className="text-xs text-gray-400">virement bancaire</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Espèces / Indiv.</p>
            <p className="text-xl font-bold text-red-600">{empCash.length + empIndiv.length}</p>
            <p className="text-xs text-gray-400">{empCash.length} cash · {empIndiv.length} indiv.</p>
          </CardContent>
        </Card>
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
          {/* Export buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={exportVirementMCB}
              disabled={virementStatus.loading || !societe || bulletins.length === 0}
              className="text-white rounded-xl"
              style={{ backgroundColor: NAVY }}
            >
              {virementStatus.loading
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Banknote className="h-4 w-4 mr-2" />
              }
              Exporter fichier virement MCB BP-V1
            </Button>

            <Button
              onClick={exportCSV}
              disabled={csvExportStatus.loading || bulletins.length === 0}
              variant="outline"
              className="rounded-xl"
            >
              {csvExportStatus.loading
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Download className="h-4 w-4 mr-2" />
              }
              Exporter CSV
            </Button>

            <div className="flex items-center gap-2 ml-2">
              <StatusBadge status={virementStatus} />
              <StatusBadge status={csvExportStatus} />
            </div>
          </div>

          {/* Virement recap summary if available */}
          {virementStatus.summary && (
            <Card className="rounded-2xl shadow-sm border-l-4" style={{ borderLeftColor: GOLD }}>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2" style={{ color: NAVY }}>Recap virement</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Bulletins:</span>{" "}
                    <strong>{virementStatus.summary.nb_bulletins_total}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Total MUR:</span>{" "}
                    <strong>{fmt(virementStatus.summary.montant_total_mur || 0)}</strong>
                  </div>
                  {virementStatus.summary.montant_total_eur > 0 && (
                    <div>
                      <span className="text-gray-500">Total EUR:</span>{" "}
                      <strong>{fmt(virementStatus.summary.montant_total_eur)}</strong>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Banques:</span>{" "}
                    <strong>{virementStatus.summary.nb_banques}</strong>
                  </div>
                  {virementStatus.summary.nb_employes_sans_banque > 0 && (
                    <div className="text-orange-600">
                      <AlertTriangle className="inline w-3 h-3 mr-1" />
                      {virementStatus.summary.nb_employes_sans_banque} employe(s) sans coordonnees bancaires
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employee table */}
          {loadingData ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : employes.length === 0 ? (
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-8 text-center text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>Aucun employe trouve pour cette societe.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                  <FileText className="w-4 h-4" />
                  Employes et virements ({employes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: NAVY }}>Nom</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: NAVY }}>Banque</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ color: NAVY }}>Compte</th>
                        <th className="px-4 py-3 text-center font-medium" style={{ color: NAVY }}>Mode paiement</th>
                        <th className="px-4 py-3 text-center font-medium" style={{ color: NAVY }}>MRA</th>
                        <th className="px-4 py-3 text-right font-medium" style={{ color: NAVY }}>Net a payer</th>
                        <th className="px-4 py-3 text-center font-medium" style={{ color: NAVY }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {employes.map(emp => {
                        const b = getBulletin(emp.id)
                        const net = b ? b.salaire_net : 0
                        const statut = b?.statut
                        return (
                          <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium">{emp.prenom} {emp.nom}</div>
                              {emp.poste && <div className="text-xs text-gray-400">{emp.poste}</div>}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{emp.bank_name || <span className="text-orange-500">Non renseigne</span>}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">{emp.bank_account || <span className="text-orange-500">--</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <select
                                value={emp.mode_paiement || "bulk"}
                                onChange={e => updateEmployeMode(emp.id, "mode_paiement", e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-white"
                                style={{ color: emp.mode_paiement === "especes" ? "#dc2626" : emp.mode_paiement === "individuel" ? "#ea580c" : "#059669" }}
                              >
                                <option value="bulk">Bulk MCB</option>
                                <option value="individuel">Individuel</option>
                                <option value="especes">Espèces</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={emp.inclus_mra !== false}
                                onChange={e => updateEmployeMode(emp.id, "inclus_mra", e.target.checked)}
                                className="w-4 h-4 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-medium">{net > 0 ? `${fmt(net)} MUR` : "--"}</td>
                            <td className="px-4 py-3 text-center">
                              {!b ? (
                                <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-[11px]">
                                  <AlertTriangle className="w-3 h-3 mr-1" />Pas de bulletin
                                </Badge>
                              ) : statut === "valide" || statut === "paye" ? (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 text-[11px]">
                                  <CheckCircle className="w-3 h-3 mr-1" />{statut === "paye" ? "Paye" : "Valide"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50 text-[11px]">
                                  {statut || "Brouillon"}
                                </Badge>
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
          {/* CSG / NSF Card */}
          <Card className="rounded-2xl shadow-sm border-l-4" style={{ borderLeftColor: BLUE }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                <Building2 className="w-4 h-4" />
                CSG / NSF
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Genere la declaration CSG/NSF mensuelle avec recap et detail par employe (2 fichiers CSV).
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={exportCSGNSF}
                  disabled={csgStatus.loading || !societe || bulletins.length === 0}
                  className="text-white rounded-xl"
                  style={{ backgroundColor: NAVY }}
                >
                  {csgStatus.loading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <Download className="h-4 w-4 mr-2" />
                  }
                  Generer declaration CSG/NSF
                </Button>
                <StatusBadge status={csgStatus} />
              </div>

              {/* Summary after export */}
              {csgStatus.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs">Masse salariale</span>
                    <strong>{fmt(csgStatus.summary.total_masse_salariale || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">CSG salarie</span>
                    <strong>{fmt(csgStatus.summary.total_csg_sal || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">CSG patronal</span>
                    <strong>{fmt(csgStatus.summary.total_csg_pat || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">NSF (sal + pat)</span>
                    <strong>{fmt((csgStatus.summary.total_nsf_sal || 0) + (csgStatus.summary.total_nsf_pat || 0))} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Training Levy</span>
                    <strong>{fmt(csgStatus.summary.total_training || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">PRGF</span>
                    <strong>{fmt(csgStatus.summary.total_prgf || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Total MRA</span>
                    <strong className="text-lg" style={{ color: BLUE }}>{fmt(csgStatus.summary.total_mra || 0)} MUR</strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PAYE Return Card */}
          <Card className="rounded-2xl shadow-sm border-l-4" style={{ borderLeftColor: GOLD }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                <FileText className="w-4 h-4" />
                PAYE Return
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Genere le PAYE Return mensuel avec recap et detail par employe (2 fichiers CSV).
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={exportPAYE}
                  disabled={payeStatus.loading || !societe || bulletins.length === 0}
                  className="text-white rounded-xl"
                  style={{ backgroundColor: NAVY }}
                >
                  {payeStatus.loading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <Download className="h-4 w-4 mr-2" />
                  }
                  Generer PAYE Return
                </Button>
                <StatusBadge status={payeStatus} />
              </div>

              {/* Summary after export */}
              {payeStatus.summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs">Total salaires bruts</span>
                    <strong>{fmt(payeStatus.summary.total_salaires_bruts || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Total PAYE retenu</span>
                    <strong>{fmt(payeStatus.summary.total_paye_retenu || 0)} MUR</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Employes</span>
                    <strong>{payeStatus.summary.nb_employes || 0}</strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Echeances MRA Card */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                <Clock className="w-4 h-4" />
                Echeances MRA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CSG deadline */}
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${isLate(deadlineCsg) ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isLate(deadlineCsg) ? "bg-red-100" : "bg-blue-100"}`}>
                    <Clock className={`w-4 h-4 ${isLate(deadlineCsg) ? "text-red-600" : "text-blue-600"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">CSG</p>
                    <p className="text-xs text-gray-500">15 du mois suivant</p>
                    <p className={`text-xs font-medium mt-1 ${isLate(deadlineCsg) ? "text-red-600" : "text-gray-600"}`}>
                      {formatDeadline(deadlineCsg)}
                      {isLate(deadlineCsg) && " -- EN RETARD"}
                    </p>
                  </div>
                </div>

                {/* PAYE deadline */}
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${isLate(deadlinePaye) ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isLate(deadlinePaye) ? "bg-red-100" : "bg-blue-100"}`}>
                    <Clock className={`w-4 h-4 ${isLate(deadlinePaye) ? "text-red-600" : "text-blue-600"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">PAYE</p>
                    <p className="text-xs text-gray-500">20 du mois suivant</p>
                    <p className={`text-xs font-medium mt-1 ${isLate(deadlinePaye) ? "text-red-600" : "text-gray-600"}`}>
                      {formatDeadline(deadlinePaye)}
                      {isLate(deadlinePaye) && " -- EN RETARD"}
                    </p>
                  </div>
                </div>

                {/* NSF deadline */}
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${isLate(deadlineNsf) ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isLate(deadlineNsf) ? "bg-red-100" : "bg-blue-100"}`}>
                    <Clock className={`w-4 h-4 ${isLate(deadlineNsf) ? "text-red-600" : "text-blue-600"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">NSF</p>
                    <p className="text-xs text-gray-500">Fin du mois</p>
                    <p className={`text-xs font-medium mt-1 ${isLate(deadlineNsf) ? "text-red-600" : "text-gray-600"}`}>
                      {formatDeadline(deadlineNsf)}
                      {isLate(deadlineNsf) && " -- EN RETARD"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </ClientPageShell>
  )
}
