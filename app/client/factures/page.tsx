"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search, Plus, Loader2, FileText, TrendingUp, Clock, AlertCircle,
  Eye, Trash2, RefreshCw, CalendarDays, Settings, Pencil, CheckCircle2,
  Shield, ShieldCheck, X, Building2, Download, Receipt,
  Send, ThumbsUp, ThumbsDown, History,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientKpi, ClientPanel } from "@/components/client/ClientKit"

interface Facture {
  id: string; numero_facture: string | null; tiers: string | null; description: string | null
  date_facture: string; date_echeance: string | null; devise: string
  montant_ht: number; montant_tva: number; montant_ttc: number; montant_mur: number
  statut: string; societe_id: string; type_facture: string; notes: string | null
  mode_paiement: string | null; paye_par: string | null
  lignes: unknown[] | null; client_offshore: boolean
  recurrent: boolean; recurrent_frequence: string | null
  irn?: string | null; mra_status?: string | null; type_document?: string | null
  document_id?: string | null; pdf_url?: string | null; pdf_path?: string | null
  // Migration 148 (workflow approbation)
  statut_workflow?: string | null
  validee_par?: string | null
  validee_at?: string | null
  refus_raison?: string | null
  approbation_niveau?: number | null
}
interface HistoriqueRow {
  id: string
  ancien_statut: string | null
  nouveau_statut: string
  action: string | null
  user_id: string | null
  commentaire: string | null
  created_at: string
}
interface Societe { id: string; nom: string }
interface RecurringTemplate {
  id: string; client_nom: string; client_id: string; services: { description: string; prix: number }[]
  frequence: string; montant: number; devise: string; prochaine_date: string; active: boolean
}
interface InvoiceClient {
  id: string; nom: string; entreprise: string; offshore: boolean; devise: string; conditions_paiement: number
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  en_attente: "bg-yellow-100 text-yellow-800",
  paye: "bg-green-100 text-green-800",
  retard: "bg-red-100 text-red-800",
  partiel: "bg-blue-100 text-blue-800",
  annule: "bg-gray-100 text-gray-600",
}

// Migration 148 : statut_workflow — palette + libellé
const WORKFLOW_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  a_valider: "bg-amber-100 text-amber-800",
  validee: "bg-emerald-100 text-emerald-800",
  refusee: "bg-rose-100 text-rose-800",
  envoyee: "bg-blue-100 text-blue-800",
  acompte_recu: "bg-indigo-100 text-indigo-800",
  paye_partiel: "bg-sky-100 text-sky-800",
  paye: "bg-green-100 text-green-800",
  retard_7j: "bg-orange-100 text-orange-800",
  retard_30j: "bg-red-100 text-red-800",
  en_contentieux: "bg-red-200 text-red-900",
  annulee: "bg-gray-100 text-gray-600",
  comptabilisee: "bg-violet-100 text-violet-800",
}
const WORKFLOW_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  a_valider: "À valider",
  validee: "Validée",
  refusee: "Refusée",
  envoyee: "Envoyée",
  acompte_recu: "Acompte reçu",
  paye_partiel: "Payée partiel",
  paye: "Payée",
  retard_7j: "Retard 7j",
  retard_30j: "Retard 30j",
  en_contentieux: "Contentieux",
  annulee: "Annulée",
  comptabilisee: "Comptabilisée",
}

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function today() { return new Date().toISOString().split("T")[0] }
function addDays(d: string, days: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().split("T")[0]
}

export default function ClientFacturesPage() {
  const router = useRouter()
  const { societeId } = useSocieteActive()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterStatut, setFilterStatut] = useState("all")
  const [activeTab, setActiveTab] = useState("factures")

  // Recurring templates
  const [recurring, setRecurring] = useState<RecurringTemplate[]>([])
  const [recurringDialog, setRecurringDialog] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedPreview, setGeneratedPreview] = useState<RecurringTemplate[]>([])
  const [clients, setClients] = useState<InvoiceClient[]>([])

  // Recurring form
  const [rClientId, setRClientId] = useState("")
  const [rFrequence, setRFrequence] = useState("mensuel")
  const [rServices, setRServices] = useState("")
  const [rMontant, setRMontant] = useState("")
  const [rDevise, setRDevise] = useState("MUR")
  const [rProchaineDate, setRProchaineDate] = useState("")

  // Detail dialog
  const [detailFacture, setDetailFacture] = useState<Facture | null>(null)

  // MRA fiscalisation
  const [fiscalisingId, setFiscalisingId] = useState<string | null>(null)

  // Workflow approbation (migration 148)
  const [workflowLoadingId, setWorkflowLoadingId] = useState<string | null>(null)
  const [refusDialog, setRefusDialog] = useState<Facture | null>(null)
  const [refusRaison, setRefusRaison] = useState("")
  const [historique, setHistorique] = useState<HistoriqueRow[]>([])
  const [historiqueLoading, setHistoriqueLoading] = useState(false)

  const loadHistorique = useCallback(async (factureId: string) => {
    setHistoriqueLoading(true)
    try {
      const res = await fetch(`/api/client/factures/${factureId}/historique`)
      const data = (await res.json()) as { historique?: HistoriqueRow[] }
      setHistorique(data.historique || [])
    } catch {
      setHistorique([])
    } finally {
      setHistoriqueLoading(false)
    }
  }, [])

  const callWorkflow = async (
    facture: Facture,
    action: "soumettre" | "valider" | "refuser",
    refus_raison?: string,
  ) => {
    if (workflowLoadingId) return
    setWorkflowLoadingId(facture.id)
    try {
      const res = await fetch(`/api/client/factures/${facture.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, refus_raison }),
      })
      const data = (await res.json()) as {
        facture?: {
          statut_workflow: string
          validee_par: string | null
          validee_at: string | null
          refus_raison: string | null
          approbation_niveau: number | null
        }
        error?: string
      }
      if (!res.ok || !data.facture) {
        alert(data.error || "Erreur workflow")
        return
      }
      setFactures(prev =>
        prev.map(f =>
          f.id === facture.id
            ? {
                ...f,
                statut_workflow: data.facture!.statut_workflow,
                validee_par: data.facture!.validee_par,
                validee_at: data.facture!.validee_at,
                refus_raison: data.facture!.refus_raison,
                approbation_niveau: data.facture!.approbation_niveau,
              }
            : f,
        ),
      )
    } catch (e: unknown) {
      alert("Erreur réseau : " + (e instanceof Error ? e.message : ""))
    } finally {
      setWorkflowLoadingId(null)
    }
  }

  const submitRefus = async () => {
    if (!refusDialog) return
    if (!refusRaison.trim()) { alert("Motif de refus obligatoire"); return }
    await callWorkflow(refusDialog, "refuser", refusRaison.trim())
    setRefusDialog(null)
    setRefusRaison("")
  }

  const handleFiscalise = async (f: Facture) => {
    if (fiscalisingId) return
    setFiscalisingId(f.id)
    try {
      const res = await fetch("/api/mra/fiscalise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facture_id: f.id, societe_id: f.societe_id }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Update the facture in local state
        setFactures(prev =>
          prev.map(fac =>
            fac.id === f.id
              ? { ...fac, irn: data.irn, mra_status: "fiscalise" }
              : fac
          )
        )
      } else {
        alert(data.error || "Erreur de fiscalisation MRA")
      }
    } catch {
      alert("Erreur de connexion au serveur MRA")
    } finally {
      setFiscalisingId(null)
    }
  }

  const fetchData = useCallback(async () => {
    if (!societeId) { setLoading(false); return }
    setLoading(true)
    try {
      const finRes = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const finData = await finRes.json()
      const allFactures = finData.financial?.factures || []
      setFactures(allFactures.filter((f: Facture) => f.type_facture === 'client'))
    } catch { }
    finally { setLoading(false) }

    // Load recurring templates from localStorage
    try {
      const r = localStorage.getItem("lexora_recurring_invoices")
      if (r) setRecurring(JSON.parse(r))
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
    } catch { }
  }, [societeId])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = factures.filter(f => {
    const matchSearch = !search ||
      (f.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
      (f.numero_facture || "").toLowerCase().includes(search.toLowerCase())
    const matchStatut = filterStatut === "all" || f.statut === filterStatut
    return matchSearch && matchStatut
  })

  const totalMUR = filtered.reduce((s, f) => s + (Number(f.montant_mur) || 0), 0)
  const nbEnAttente = filtered.filter(f => f.statut === 'en_attente').length
  const nbRetard = filtered.filter(f => f.statut === 'retard').length

  const handlePreview = (f: Facture) => {
    if (f.document_id) {
      // Open the original PDF document
      window.open(`/api/documents/${f.document_id}/download`, "_blank")
    } else {
      // Show detail dialog + load approbation history (migration 148)
      setDetailFacture(f)
      setHistorique([])
      loadHistorique(f.id)
    }
  }

  const handleDelete = async (f: Facture) => {
    if (f.statut !== "brouillon") {
      if (!confirm(`Cette facture est en statut "${f.statut}". La supprimer definitivement ?\n\nLes ecritures comptables associees seront aussi supprimees.`)) return
    } else {
      if (!confirm("Supprimer cette facture brouillon ?")) return
    }
    try {
      const res = await fetch(`/api/client/factures?id=${f.id}&force=1`, { method: "DELETE" })
      if (res.ok) fetchData()
      else { const d = await res.json().catch(() => ({})); alert(d.error || "Erreur suppression") }
    } catch (e: any) { alert("Erreur reseau: " + (e.message || "")) }
  }

  // NOTE: La réassignation de facture entre sociétés a été retirée en Phase 0.5
  // (/api/client/factures PATCH interdit désormais le changement de societe_id).
  // En mode mono-société actif, chaque facture reste attachée à sa société d'origine.

  // ── Recurring ──
  const saveRecurring = () => {
    const client = clients.find(c => c.id === rClientId)
    const template: RecurringTemplate = {
      id: crypto.randomUUID(),
      client_nom: client?.nom || "Client",
      client_id: rClientId,
      services: rServices.split("\n").filter(Boolean).map(s => ({ description: s, prix: parseFloat(rMontant) || 0 })),
      frequence: rFrequence,
      montant: parseFloat(rMontant) || 0,
      devise: rDevise,
      prochaine_date: rProchaineDate || today(),
      active: true,
    }
    const updated = [...recurring, template]
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
    setRecurringDialog(false)
    setRClientId(""); setRServices(""); setRMontant(""); setRProchaineDate("")
  }

  const deleteRecurring = (id: string) => {
    const updated = recurring.filter(r => r.id !== id)
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
  }

  const toggleRecurring = (id: string) => {
    const updated = recurring.map(r => r.id === id ? { ...r, active: !r.active } : r)
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
  }

  const generateMonthlyInvoices = async () => {
    const active = recurring.filter(r => r.active && r.prochaine_date <= today())
    if (active.length === 0) { setGeneratedPreview([]); return }
    setGeneratedPreview(active)
  }

  const confirmGeneration = async () => {
    if (generatedPreview.length === 0) return
    setGenerating(true)
    const settings = JSON.parse(localStorage.getItem("lexora_invoice_settings") || "{}")
    if (!societeId) { setGenerating(false); return }

    let nextNum = settings.prochain_numero || 1
    for (const tmpl of generatedPreview) {
      const client = clients.find(c => c.id === tmpl.client_id)
      const offshore = client?.offshore || false
      const tva = offshore ? 0 : tmpl.montant * 0.15
      const lignes = tmpl.services.map(s => ({
        id: crypto.randomUUID(), description: s.description, quantite: 1,
        prix_unitaire: s.prix, taux_tva: offshore ? 0 : 15,
        total: s.prix * (1 + (offshore ? 0 : 0.15)),
      }))

      try {
        await fetch("/api/client/factures", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: societeId,
            numero_facture: `${settings.prefixe_facture || "INV-"}${String(nextNum).padStart(3, "0")}`,
            tiers: tmpl.client_nom,
            date_facture: today(),
            date_echeance: addDays(today(), client?.conditions_paiement || 30),
            devise: tmpl.devise,
            montant_ht: tmpl.montant, montant_tva: tva, montant_ttc: tmpl.montant + tva,
            statut: "en_attente", lignes, client_offshore: offshore,
            recurrent: true, recurrent_frequence: tmpl.frequence,
          }),
        })
        nextNum++
      } catch { }

      // Advance next date
      const dt = new Date(tmpl.prochaine_date)
      if (tmpl.frequence === "mensuel") dt.setMonth(dt.getMonth() + 1)
      else if (tmpl.frequence === "trimestriel") dt.setMonth(dt.getMonth() + 3)
      tmpl.prochaine_date = dt.toISOString().split("T")[0]
    }

    // Update settings and recurring
    settings.prochain_numero = nextNum
    localStorage.setItem("lexora_invoice_settings", JSON.stringify(settings))
    const updatedRecurring = recurring.map(r => {
      const gen = generatedPreview.find(g => g.id === r.id)
      return gen ? { ...r, prochaine_date: gen.prochaine_date } : r
    })
    setRecurring(updatedRecurring)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updatedRecurring))

    setGenerating(false)
    setGeneratedPreview([])
    fetchData()
  }

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Factures Clients" },
      ]}
      kicker={`${filtered.length} ${filtered.length > 1 ? "factures" : "facture"} · Conforme MRA`}
      title="Factures Clients"
      subtitle="Gestion des créances clients avec IRN, QR Code MRA, multi-devises et facturation récurrente."
      actions={
        <>
          <Button variant="outline" onClick={() => router.push("/client/facturation-settings")}><Settings className="w-4 h-4 mr-2" />Paramètres</Button>
          <Button
            onClick={() => router.push("/client/nouvelle-facture")}
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
              color: "#0B0F2E",
              fontWeight: 700,
              borderRadius: "10px",
              border: "none",
              boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Plus className="w-4 h-4 mr-2" />Nouvelle facture
          </Button>
        </>
      }
    >
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: "22px",
        }}
      >
        <ClientKpi label="Total CA" value={`${fmt(totalMUR)} MUR`} icon={Receipt} accent="blue" />
        <ClientKpi label="Factures" value={filtered.length} icon={FileText} accent="green" />
        <ClientKpi label="En attente" value={nbEnAttente} icon={Clock} accent="orange" />
        <ClientKpi label="En retard" value={nbRetard} icon={AlertCircle} accent="red" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="factures" className="flex items-center gap-1.5"><FileText className="w-4 h-4" />Factures</TabsTrigger>
          <TabsTrigger value="recurrent" className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Facturation recurrente</TabsTrigger>
        </TabsList>

        {/* ══════════ TAB: Factures ══════════ */}
        <TabsContent value="factures" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="brouillon">Brouillon</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="paye">Paye</SelectItem>
                <SelectItem value="retard">En retard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucune facture client. Creez votre premiere facture.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N.</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead>
                      <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead>
                      <TableHead className="text-right">TTC</TableHead><TableHead>Devise</TableHead>
                      <TableHead className="text-right">MUR</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Workflow</TableHead>
                      {factures.some(ff => (ff.approbation_niveau ?? 0) > 0) && (
                        <TableHead className="text-center">Niveau appro.</TableHead>
                      )}
                      <TableHead>MRA</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(f => {
                      const workflow = f.statut_workflow || "brouillon"
                      const showNiveauCol = factures.some(ff => (ff.approbation_niveau ?? 0) > 0)
                      const isLoadingWF = workflowLoadingId === f.id
                      return (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">{f.numero_facture || "-"}</TableCell>
                        <TableCell className="font-medium">{f.tiers || "-"}</TableCell>
                        <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(f.montant_ht)}</TableCell>
                        <TableCell className="text-right text-sm">{f.montant_tva > 0 ? <span className="text-orange-600">{fmt(f.montant_tva)}</span> : <span className="text-gray-400">0</span>}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(f.montant_ttc)}</TableCell>
                        <TableCell><Badge variant="outline">{f.devise}</Badge></TableCell>
                        <TableCell className="text-right font-bold text-[#0B0F2E]">{fmt(Number(f.montant_mur) || 0)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[f.statut] || ""}`}>
                            {f.statut === "en_attente" ? "en attente" : f.statut}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${WORKFLOW_COLORS[workflow] || "bg-gray-100 text-gray-600"}`}
                            title={f.refus_raison ? `Refus : ${f.refus_raison}` : undefined}
                          >
                            {WORKFLOW_LABELS[workflow] || workflow}
                          </span>
                        </TableCell>
                        {showNiveauCol && (
                          <TableCell className="text-center text-xs">
                            {(f.approbation_niveau ?? 0) > 0 ? (
                              <Badge variant="outline" className="border-[#D4AF37] text-[#D4AF37]">N{f.approbation_niveau}</Badge>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {f.irn ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800" title={f.irn}>
                              <ShieldCheck className="w-3 h-3" />Fiscalise
                            </span>
                          ) : (f.statut === "en_attente" || f.statut === "paye") ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleFiscalise(f)}
                              disabled={fiscalisingId === f.id}
                              className="text-xs border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 h-7 px-2"
                            >
                              {fiscalisingId === f.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Shield className="w-3 h-3 mr-1" />
                              )}
                              {fiscalisingId === f.id ? "..." : "Fiscaliser MRA"}
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {/* Workflow actions (migration 148) */}
                            {(workflow === "brouillon" || workflow === "refusee") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => callWorkflow(f, "soumettre")}
                                disabled={isLoadingWF}
                                title="Mettre à approuver"
                                className="text-amber-600 hover:text-amber-700"
                              >
                                {isLoadingWF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              </Button>
                            )}
                            {workflow === "a_valider" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => callWorkflow(f, "valider")}
                                  disabled={isLoadingWF}
                                  title="Valider"
                                  className="text-emerald-600 hover:text-emerald-700"
                                >
                                  {isLoadingWF ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setRefusDialog(f); setRefusRaison("") }}
                                  disabled={isLoadingWF}
                                  title="Refuser"
                                  className="text-rose-600 hover:text-rose-700"
                                >
                                  <ThumbsDown className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handlePreview(f)} title="Apercu"><Eye className="w-4 h-4" /></Button>
                            <a href={`/api/client/factures/${f.id}/pdf`} target="_blank" rel="noopener noreferrer" title={f.pdf_url ? "PDF stocké" : "Générer PDF"}>
                              <Button variant="ghost" size="sm" className={f.pdf_url ? "text-green-600 hover:text-green-700" : "text-gray-500"}>
                                <Download className="w-4 h-4" />
                              </Button>
                            </a>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(f)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════ TAB: Recurring ══════════ */}
        <TabsContent value="recurrent" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Gerez vos factures recurrentes mensuelles ou trimestrielles</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateMonthlyInvoices}><CalendarDays className="w-4 h-4 mr-2" />Generer les factures du mois</Button>
              <Button onClick={() => setRecurringDialog(true)} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />Nouveau modele recurrent</Button>
            </div>
          </div>

          {/* Generation preview */}
          {generatedPreview.length > 0 && (
            <Card className="border-[#D4AF37] bg-[#D4AF37]/5">
              <CardHeader>
                <CardTitle className="text-[#0B0F2E] text-base">Factures a generer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  {generatedPreview.map(g => (
                    <div key={g.id} className="flex items-center justify-between bg-white rounded-lg p-3 border">
                      <div>
                        <p className="font-medium text-[#0B0F2E]">{g.client_nom}</p>
                        <p className="text-sm text-gray-500">{g.services.map(s => s.description).join(", ")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{fmt(g.montant)} {g.devise}</p>
                        <p className="text-xs text-gray-400">{g.frequence}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setGeneratedPreview([])}>Annuler</Button>
                  <Button onClick={confirmGeneration} disabled={generating} className="bg-[#0B0F2E]">
                    <CheckCircle2 className="w-4 h-4 mr-2" />{generating ? "Generation..." : `Confirmer (${generatedPreview.length} factures)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recurring templates list */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {recurring.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun modele recurrent. Creez votre premier modele.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead><TableHead>Services</TableHead><TableHead>Frequence</TableHead>
                      <TableHead className="text-right">Montant</TableHead><TableHead>Prochaine date</TableHead>
                      <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recurring.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.client_nom}</TableCell>
                        <TableCell className="text-sm text-gray-600">{r.services.map(s => s.description).join(", ")}</TableCell>
                        <TableCell><Badge variant="outline">{r.frequence === "mensuel" ? "Mensuel" : "Trimestriel"}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.montant)} {r.devise}</TableCell>
                        <TableCell className="text-sm">{new Date(r.prochaine_date).toLocaleDateString("fr-FR")}</TableCell>
                        <TableCell>
                          {r.active
                            ? <Badge className="bg-green-100 text-green-700">Actif</Badge>
                            : <Badge className="bg-gray-100 text-gray-500">Inactif</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleRecurring(r.id)}>
                            {r.active ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteRecurring(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* New recurring dialog */}
          <Dialog open={recurringDialog} onOpenChange={setRecurringDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nouveau modele recurrent</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>Client</Label>
                  <Select value={rClientId} onValueChange={setRClientId}>
                    <SelectTrigger><SelectValue placeholder="Selectionner un client..." /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}{c.entreprise ? ` (${c.entreprise})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Frequence</Label>
                  <Select value={rFrequence} onValueChange={setRFrequence}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensuel">Mensuel</SelectItem>
                      <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Services (un par ligne)</Label>
                  <textarea className="w-full border rounded-md p-2 text-sm min-h-[80px]" value={rServices} onChange={e => setRServices(e.target.value)} placeholder="Prestation comptable mensuelle&#10;TVA trimestrielle" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Montant total</Label><Input type="number" value={rMontant} onChange={e => setRMontant(e.target.value)} placeholder="0.00" /></div>
                  <div>
                    <Label>Devise</Label>
                    <Select value={rDevise} onValueChange={setRDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Prochaine date de facturation</Label><Input type="date" value={rProchaineDate} onChange={e => setRProchaineDate(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRecurringDialog(false)}>Annuler</Button>
                <Button onClick={saveRecurring} disabled={!rClientId || !rMontant} className="bg-[#0B0F2E]">Creer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Facture detail dialog (when no document_id) */}
      <Dialog open={!!detailFacture} onOpenChange={open => { if (!open) { setDetailFacture(null); setHistorique([]) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#0B0F2E]">
              Facture {detailFacture?.numero_facture || "—"}
            </DialogTitle>
          </DialogHeader>
          {detailFacture && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Client :</span> <span className="font-medium">{detailFacture.tiers || "—"}</span></div>
                <div><span className="text-gray-500">Date :</span> <span className="font-medium">{detailFacture.date_facture ? new Date(detailFacture.date_facture).toLocaleDateString("fr-FR") : "—"}</span></div>
                <div><span className="text-gray-500">Échéance :</span> <span className="font-medium">{detailFacture.date_echeance ? new Date(detailFacture.date_echeance).toLocaleDateString("fr-FR") : "—"}</span></div>
                <div><span className="text-gray-500">Statut :</span> <Badge className={`ml-1 ${STATUT_COLORS[detailFacture.statut] || ""}`}>{detailFacture.statut}</Badge></div>
                <div>
                  <span className="text-gray-500">Workflow :</span>
                  <Badge className={`ml-1 ${WORKFLOW_COLORS[detailFacture.statut_workflow || "brouillon"] || ""}`}>
                    {WORKFLOW_LABELS[detailFacture.statut_workflow || "brouillon"] || detailFacture.statut_workflow}
                  </Badge>
                </div>
                {(detailFacture.approbation_niveau ?? 0) > 0 && (
                  <div><span className="text-gray-500">Niveau appro. :</span> <Badge variant="outline">N{detailFacture.approbation_niveau}</Badge></div>
                )}
                <div><span className="text-gray-500">Devise :</span> <span className="font-medium">{detailFacture.devise}</span></div>
                <div><span className="text-gray-500">Mode paiement :</span> <span className="font-medium">{detailFacture.mode_paiement || "—"}</span></div>
              </div>
              {detailFacture.refus_raison && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-sm text-rose-700">
                  <strong>Motif de refus :</strong> {detailFacture.refus_raison}
                </div>
              )}
              <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Montant HT</span><span className="font-mono">{fmt(detailFacture.montant_ht)} {detailFacture.devise}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TVA</span><span className="font-mono">{fmt(detailFacture.montant_tva)} {detailFacture.devise}</span></div>
                <div className="flex justify-between text-sm font-bold border-t pt-1"><span>Total TTC</span><span className="font-mono">{fmt(detailFacture.montant_ttc)} {detailFacture.devise}</span></div>
                {detailFacture.devise !== "MUR" && (
                  <div className="flex justify-between text-sm text-blue-600"><span>Equiv. MUR</span><span className="font-mono">{fmt(Number(detailFacture.montant_mur) || 0)} MUR</span></div>
                )}
              </div>
              {detailFacture.lignes && Array.isArray(detailFacture.lignes) && detailFacture.lignes.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-[#0B0F2E] mb-2">Lignes de facturation</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qté</TableHead>
                        <TableHead className="text-right">PU</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailFacture.lignes.map((l: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{l.description || l.libelle || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{l.quantite ?? 1}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(l.prix_unitaire ?? l.pu ?? 0)}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(l.total ?? l.montant ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {detailFacture.notes && (
                <div className="text-sm"><span className="text-gray-500">Notes :</span> <span>{detailFacture.notes}</span></div>
              )}

              {/* Historique d'approbation (migration 148) */}
              <div>
                <p className="text-sm font-semibold text-[#0B0F2E] mb-2 flex items-center gap-1.5">
                  <History className="w-4 h-4" />Historique d&apos;approbation
                </p>
                {historiqueLoading ? (
                  <div className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Chargement…</div>
                ) : historique.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucun changement de statut enregistré.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {historique.map(h => (
                      <div key={h.id} className="text-xs border-l-2 border-[#D4AF37]/50 pl-2 py-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gray-500">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.action || "changement"}</Badge>
                          <span className="text-gray-700">
                            {h.ancien_statut ? `${WORKFLOW_LABELS[h.ancien_statut] || h.ancien_statut} → ` : ""}
                            <strong>{WORKFLOW_LABELS[h.nouveau_statut] || h.nouveau_statut}</strong>
                          </span>
                        </div>
                        {h.commentaire && <div className="text-gray-600 italic mt-0.5">« {h.commentaire} »</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailFacture(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de refus (migration 148) */}
      <Dialog open={!!refusDialog} onOpenChange={open => { if (!open) { setRefusDialog(null); setRefusRaison("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0B0F2E]">
              Refuser la facture {refusDialog?.numero_facture || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Motif du refus (obligatoire)</Label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[90px]"
              value={refusRaison}
              onChange={e => setRefusRaison(e.target.value)}
              placeholder="Ex : prix unitaire incorrect, client inactif…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRefusDialog(null); setRefusRaison("") }}>Annuler</Button>
            <Button
              onClick={submitRefus}
              disabled={!refusRaison.trim() || workflowLoadingId === refusDialog?.id}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {workflowLoadingId === refusDialog?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ThumbsDown className="w-4 h-4 mr-2" />}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </ClientPageShell>
  )
}
