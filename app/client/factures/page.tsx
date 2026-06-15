"use client"

/**
 * Page /client/factures — agent-friendly.
 *
 * Vue d'ensemble des factures (clients + fournisseurs) de la société active,
 * avec filtres et boutons d'action. Lex Banque utilise ces factures pour
 * proposer les rapprochements bancaires.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  RefreshCw,
  FileText,
  Plus,
  Search,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bot,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet,
  Printer,
  Eye,
  Download,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { EmptyState } from "@/components/ui/empty-state"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'
import { PaiementFactureDialog } from "@/components/client/PaiementFactureDialog"
import { ReglerHorsBanqueDialog } from "@/components/factures/ReglerHorsBanqueDialog"
import { AffecterReglementDialog } from "@/components/factures/AffecterReglementDialog"

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  type_facture: "client" | "fournisseur" | null
  date_facture: string | null
  date_echeance: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  statut: string | null
  rapproche_releve_id: string | null
  solde_non_paye: number | null
  // Mig 248 — id du document source (PDF importé via Telegram/OCR ou
  // upload web). Si non-null, l'aperçu/PDF doit ouvrir le PDF original
  // plutôt que le template DDS regénéré (qui ne reflète pas le contenu
  // réel, surtout pour les factures FOURNISSEUR où DDS n'est pas
  // l'émetteur).
  document_id?: string | null
  // MRA e-invoicing (mig 102 + 248)
  mra_status?: string | null
  irn?: string | null
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
function daysUntil(d: string | null): number | null {
  if (!d) return null
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000)
}

function getStatutLabels(locale: Locale): Record<string, { label: string; color: string }> {
  return {
    paye: { label: t('inv.fac.status_paid', locale), color: "bg-green-100 text-green-700 border-green-300" },
    partiel: { label: t('inv.fac.status_partial', locale), color: "bg-blue-100 text-blue-700 border-blue-300" },
    retard: { label: t('inv.fac.status_overdue', locale), color: "bg-red-100 text-red-700 border-red-300" },
    en_attente: { label: t('inv.fac.status_pending', locale), color: "bg-amber-100 text-amber-700 border-amber-300" },
    annule: { label: t('inv.fac.status_cancelled', locale), color: "bg-gray-100 text-gray-600 border-gray-300" },
    // Statuts ajoutés mig 411 — sans ces entrées, une facture brouillon
    // s'affichait avec le label "En attente" (fallback) → utilisateur ne
    // distinguait plus brouillon vs finalisée dans la liste.
    brouillon: { label: t('inv.fac.status_draft', locale), color: "bg-slate-100 text-slate-600 border-slate-300" },
    devis: { label: t('inv.fac.status_quote', locale), color: "bg-purple-100 text-purple-700 border-purple-300" },
    converti: { label: t('inv.fac.status_converted', locale), color: "bg-violet-100 text-violet-700 border-violet-300" },
    modele: { label: t('inv.fac.status_template', locale), color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  }
}

export default function ClientFacturesPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const tp = searchParams.get("type") || searchParams.get("tab")
    if (tp === "client" || tp === "fournisseur" || tp === "toutes" || tp === "brouillons") return tp
    return "toutes" as const
  })()
  const [activeTab, setActiveTab] = useState<"toutes" | "client" | "fournisseur" | "brouillons">(initialTab)
  const [statutFilter, setStatutFilter] = useState<string>("all")
  const [tiersFilter, setTiersFilter] = useState<string>("all")
  const [rapprochementFilter, setRapprochementFilter] = useState<string>("all")
  const [dateDebut, setDateDebut] = useState<string>("")
  const [dateFin, setDateFin] = useState<string>("")
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [paiementFacture, setPaiementFacture] = useState<Facture | null>(null)
  const [horsBanqueFacture, setHorsBanqueFacture] = useState<Facture | null>(null)
  const [reglementFacture, setReglementFacture] = useState<Facture | null>(null)
  // Sélection multi-facture pour export PDF batch — Set d'IDs sélectionnés.
  // Réinitialisé à chaque rechargement (load) pour éviter d'exporter des
  // factures qui auraient disparu côté serveur.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchExporting, setBatchExporting] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleBatchExport = useCallback(async () => {
    if (!societeId || selectedIds.size === 0) return
    setBatchExporting(true)
    try {
      const res = await fetch('/api/client/factures/export-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          facture_ids: Array.from(selectedIds),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Erreur export')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `factures_batch_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      showToast(e?.message || 'Erreur export PDF', 'error')
    } finally {
      setBatchExporting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId, selectedIds])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // /api/client/factures retourne uniquement les factures clients.
      // Pour avoir aussi les fournisseurs on utilise /api/client/financial
      // qui retourne `financial.factures` (tous types).
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      setFactures(fin.factures || [])
      setSelectedIds(new Set())
    } catch {
      showToast(t('inv.fac.load_error', locale), "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  // Liste unique des tiers (pour le dropdown filtre tiers)
  const tiersList = useMemo(() => {
    const set = new Set<string>()
    const inScope = activeTab === "toutes" ? factures : factures.filter((f) => f.type_facture === activeTab)
    for (const f of inScope) if (f.tiers) set.add(f.tiers)
    return Array.from(set).sort()
  }, [factures, activeTab])

  const filtered = useMemo(() => {
    let list = factures
    // Onglet "Brouillons" = uniquement les factures non finalisées.
    // Onglets "Toutes / Client / Fournisseur" excluent les brouillons par
    // défaut pour éviter qu'une facture en cours de saisie pollue le suivi
    // comptable (bug observé : utilisateur sauvegardait brouillon et la
    // voyait avec ses vraies factures, créant la confusion "Sauvegarder
    // brouillon a enregistré la facture").
    if (activeTab === "brouillons") {
      list = list.filter((f) => f.statut === "brouillon")
    } else {
      list = list.filter((f) => f.statut !== "brouillon")
      if (activeTab !== "toutes") list = list.filter((f) => f.type_facture === activeTab)
    }
    if (statutFilter !== "all") list = list.filter((f) => f.statut === statutFilter)
    if (tiersFilter !== "all") list = list.filter((f) => f.tiers === tiersFilter)
    if (rapprochementFilter === "rapproche") list = list.filter((f) => !!f.rapproche_releve_id)
    if (rapprochementFilter === "non_rapproche") list = list.filter((f) => !f.rapproche_releve_id)
    if (dateDebut) list = list.filter((f) => (f.date_facture || "") >= dateDebut)
    if (dateFin) list = list.filter((f) => (f.date_facture || "") <= dateFin)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (f) =>
          f.numero_facture?.toLowerCase().includes(q) ||
          f.tiers?.toLowerCase().includes(q)
      )
    }
    return list.slice().sort((a, b) =>
      (b.date_facture || "").localeCompare(a.date_facture || "")
    )
  }, [factures, activeTab, statutFilter, tiersFilter, rapprochementFilter, dateDebut, dateFin, search])

  // Stats sur le périmètre filtré (pas seulement par tab) — donne le bon
  // total quand l'utilisateur isole un client ou une période
  const stats = useMemo(() => {
    const paye = filtered.filter((f) => f.statut === "paye")
    const enAttente = filtered.filter(
      (f) => f.statut === "en_attente" || f.statut === "partiel"
    )
    const retard = filtered.filter((f) => f.statut === "retard")
    const rapproche = filtered.filter((f) => !!f.rapproche_releve_id)
    const totalAll = filtered.reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    const totalImpaye = enAttente.concat(retard).reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    const totalPaye = paye.reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    return {
      total: filtered.length,
      paye: paye.length,
      enAttente: enAttente.length,
      retard: retard.length,
      rapproche: rapproche.length,
      totalAll,
      totalImpaye,
      totalPaye,
    }
  }, [filtered])

  const hasActiveFilter =
    activeTab !== "toutes" ||
    statutFilter !== "all" ||
    tiersFilter !== "all" ||
    rapprochementFilter !== "all" ||
    !!dateDebut ||
    !!dateFin ||
    !!search.trim()
  const resetFilters = () => {
    setActiveTab("toutes")
    setStatutFilter("all")
    setTiersFilter("all")
    setRapprochementFilter("all")
    setDateDebut("")
    setDateFin("")
    setSearch("")
  }

  const counts = useMemo(
    () => ({
      // 'toutes' / 'client' / 'fournisseur' n'incluent PAS les brouillons —
      // ils représentent la vie comptable réelle. Les brouillons ont leur
      // propre compteur (et leur propre onglet).
      toutes: factures.filter((f) => f.statut !== "brouillon").length,
      client: factures.filter((f) => f.type_facture === "client" && f.statut !== "brouillon").length,
      fournisseur: factures.filter((f) => f.type_facture === "fournisseur" && f.statut !== "brouillon").length,
      brouillons: factures.filter((f) => f.statut === "brouillon").length,
    }),
    [factures]
  )

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 p-3 text-white shadow-md">
                <FileText className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-emerald-900">{t('inv.fac.title', locale)}</h1>
                <p className="text-sm text-emerald-700/80 mt-0.5">
                  {t('inv.fac.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('common.refresh', locale)}
              </Button>
              <Button
                variant="outline"
                onClick={handleBatchExport}
                disabled={batchExporting || selectedIds.size === 0 || !societeId}
                size="sm"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title="Exporter les factures cochées dans un seul PDF (1 page récap + 1 page par facture)"
              >
                {batchExporting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                Exporter PDF sélectionnés ({selectedIds.size})
              </Button>
              <Link href="/client/nouvelle-facture">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('inv.new_invoice', locale)}
                </Button>
              </Link>
              <Link href="/client/lex-factures">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Lex Factures
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Lex Banque
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('inv.fac.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {/* Encadré explicatif */}
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-4 text-sm text-emerald-900/90 space-y-1.5">
                <p>
                  <span className="font-medium">{t('inv.fac.how_to_read_label', locale)}</span> {t('inv.fac.how_to_read_text', locale)} <span className="inline-block px-1.5 py-0 text-[10px] rounded border border-green-300 bg-green-50 text-green-700 font-medium">{t('inv.fac.client_badge', locale)}</span>{t('inv.fac.or_received_supplier', locale)} <span className="inline-block px-1.5 py-0 text-[10px] rounded border border-rose-300 bg-rose-50 text-rose-700 font-medium">{t('inv.fac.supplier_badge', locale)}</span>{t('inv.fac.filters_paren_close', locale)}
                </p>
                <p>
                  <span className="font-medium">{t('inv.fac.statuses_label', locale)}</span>{" "}
                  <span className="font-medium text-amber-700">{t('inv.fac.status_pending_help', locale)}</span> {t('inv.fac.status_pending_help_desc', locale)} ·{" "}
                  <span className="font-medium text-blue-700">{t('inv.fac.status_partial_help', locale)}</span> {t('inv.fac.status_partial_help_desc', locale)} ·{" "}
                  <span className="font-medium text-red-700">{t('inv.fac.status_overdue_help', locale)}</span> {t('inv.fac.status_overdue_help_desc', locale)} ·{" "}
                  <span className="font-medium text-green-700">{t('inv.fac.status_paid_help', locale)}</span> {t('inv.fac.status_paid_help_desc', locale)}
                </p>
                <p>
                  <span className="font-medium">{t('inv.fac.bank_recon_label', locale)}</span> {t('inv.fac.bank_recon_text_1', locale)} <span className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] rounded border border-purple-300 bg-purple-50 text-purple-700"><Bot className="h-3 w-3" />{t('inv.fac.bank_recon_badge', locale)}</span> {t('inv.fac.bank_recon_text_2', locale)} <span className="font-medium">{t('inv.fac.bank_recon_lex', locale)}</span>{t('inv.fac.bank_recon_text_3', locale)}
                </p>
                <p>
                  <span className="font-medium">{t('inv.fac.filters_label', locale)}</span> {t('inv.fac.filters_text', locale)} <em>{t('inv.fac.filters_example', locale)}</em>{t('inv.fac.filters_paren_close', locale)}
                </p>
              </CardContent>
            </Card>

            {/* KPIs (sur le périmètre filtré) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard
                label={hasActiveFilter ? t('inv.fac.filtered', locale) : t('inv.fac.total_invoices', locale)}
                value={stats.total}
                accent={hasActiveFilter}
              />
              <KpiCard label={t('inv.fac.total_filtered', locale)} value={fmt(stats.totalAll)} tone="blue" />
              <KpiCard label={t('inv.fac.unpaid', locale)} value={`${stats.enAttente + stats.retard} · ${fmt(stats.totalImpaye)}`} tone={stats.retard > 0 ? "rose" : "amber"} accent={stats.enAttente + stats.retard > 0} />
              <KpiCard label={t('inv.fac.paid_plural', locale)} value={`${stats.paye} · ${fmt(stats.totalPaye)}`} tone="green" />
              <KpiCard
                label={t('inv.fac.reconciled_bank', locale)}
                value={`${stats.rapproche} / ${stats.total}`}
                tone={stats.rapproche === stats.total && stats.total > 0 ? "green" : "amber"}
              />
            </div>

            {/* Filtres */}
            <Card>
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <div className="p-3 border-b space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <TabsList className="bg-transparent gap-1">
                      <TabsTrigger value="toutes" className="px-3 py-1.5">
                        {t('inv.fac.tab_all', locale)} ({counts.toutes})
                      </TabsTrigger>
                      <TabsTrigger value="client" className="px-3 py-1.5">
                        <TrendingUp className="h-3.5 w-3.5 mr-1 text-green-600" />
                        {t('inv.fac.tab_clients', locale)} ({counts.client})
                      </TabsTrigger>
                      <TabsTrigger value="fournisseur" className="px-3 py-1.5">
                        <TrendingDown className="h-3.5 w-3.5 mr-1 text-rose-600" />
                        {t('inv.fac.tab_suppliers', locale)} ({counts.fournisseur})
                      </TabsTrigger>
                      <TabsTrigger value="brouillons" className="px-3 py-1.5">
                        <FileText className="h-3.5 w-3.5 mr-1 text-slate-500" />
                        {t('inv.fac.status_draft', locale)}s ({counts.brouillons})
                      </TabsTrigger>
                    </TabsList>
                    {hasActiveFilter && (
                      <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                        {t('inv.fac.reset_filters', locale)}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('inv.fac.search_placeholder', locale)}
                        className="pl-8 h-9 w-56"
                      />
                    </div>
                    <Select value={tiersFilter} onValueChange={setTiersFilter}>
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder={t('inv.fac.tiers', locale)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('inv.fac.all_tiers', locale)}</SelectItem>
                        {tiersList.map((tx) => (
                          <SelectItem key={tx} value={tx}>
                            {tx.length > 50 ? tx.slice(0, 47) + "…" : tx}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statutFilter} onValueChange={setStatutFilter}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('inv.fac.all_status', locale)}</SelectItem>
                        <SelectItem value="brouillon">{t('inv.fac.status_draft', locale)}</SelectItem>
                        <SelectItem value="en_attente">{t('inv.fac.status_pending', locale)}</SelectItem>
                        <SelectItem value="partiel">{t('inv.fac.status_partial', locale)}</SelectItem>
                        <SelectItem value="retard">{t('inv.fac.status_overdue', locale)}</SelectItem>
                        <SelectItem value="paye">{t('inv.fac.status_paid', locale)}</SelectItem>
                        <SelectItem value="annule">{t('inv.fac.status_cancelled', locale)}</SelectItem>
                        <SelectItem value="devis">{t('inv.fac.status_quote', locale)}</SelectItem>
                        <SelectItem value="modele">{t('inv.fac.status_template', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={rapprochementFilter} onValueChange={setRapprochementFilter}>
                      <SelectTrigger className="h-9 w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('inv.fac.all_reconciliations', locale)}</SelectItem>
                        <SelectItem value="rapproche">{t('inv.fac.reconciled', locale)}</SelectItem>
                        <SelectItem value="non_rapproche">{t('inv.fac.not_reconciled', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input
                        type="date"
                        value={dateDebut}
                        onChange={(e) => setDateDebut(e.target.value)}
                        className="h-9 w-36"
                        title={t('inv.fac.date_start_title', locale)}
                      />
                      <span>→</span>
                      <Input
                        type="date"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="h-9 w-36"
                        title={t('inv.fac.date_end_title', locale)}
                      />
                    </div>
                  </div>
                </div>

                <TabsContent value="toutes" className="mt-0 p-0">
                  <FactureList factures={filtered} onEnregistrerPaiement={setPaiementFacture} onReglerHorsBanque={setHorsBanqueFacture} onRapprocher={setReglementFacture} onReload={load} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                </TabsContent>
                <TabsContent value="client" className="mt-0 p-0">
                  <FactureList factures={filtered} onEnregistrerPaiement={setPaiementFacture} onReglerHorsBanque={setHorsBanqueFacture} onRapprocher={setReglementFacture} onReload={load} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                </TabsContent>
                <TabsContent value="fournisseur" className="mt-0 p-0">
                  <FactureList factures={filtered} onEnregistrerPaiement={setPaiementFacture} onReglerHorsBanque={setHorsBanqueFacture} onRapprocher={setReglementFacture} onReload={load} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                </TabsContent>
                <TabsContent value="brouillons" className="mt-0 p-0">
                  <FactureList factures={filtered} onEnregistrerPaiement={setPaiementFacture} onReglerHorsBanque={setHorsBanqueFacture} onRapprocher={setReglementFacture} onReload={load} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                </TabsContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>

      <PaiementFactureDialog
        facture={paiementFacture}
        open={!!paiementFacture}
        onOpenChange={(open) => {
          if (!open) setPaiementFacture(null)
        }}
        onSuccess={() => {
          showToast(t('inv.fac.payment_recorded', locale), "success")
          setPaiementFacture(null)
          load()
        }}
      />

      <ReglerHorsBanqueDialog
        open={!!horsBanqueFacture}
        onClose={() => setHorsBanqueFacture(null)}
        societeId={societeId || ""}
        factures={horsBanqueFacture ? [{
          id: horsBanqueFacture.id,
          numero_facture: horsBanqueFacture.numero_facture,
          tiers: horsBanqueFacture.tiers,
          montant_ttc: horsBanqueFacture.montant_ttc,
          solde_non_paye: horsBanqueFacture.solde_non_paye,
          devise: horsBanqueFacture.devise,
        }] : []}
        onSuccess={(info) => {
          showToast(`✓ Facture réglée (lettre ${info.lettre}) — ${info.montantTotal.toLocaleString("fr-FR")} MUR`, "success")
          setHorsBanqueFacture(null)
          load()
        }}
      />

      <AffecterReglementDialog
        facture={reglementFacture}
        societeId={societeId || null}
        open={!!reglementFacture}
        onOpenChange={(open) => { if (!open) setReglementFacture(null) }}
        onDone={load}
      />
    </ClientPageShell>
  )
}

function FactureList({
  factures,
  onEnregistrerPaiement,
  onReglerHorsBanque,
  onRapprocher,
  onReload,
  selectedIds,
  onToggleSelect,
}: {
  factures: Facture[]
  onEnregistrerPaiement?: (f: Facture) => void
  onReglerHorsBanque?: (f: Facture) => void
  onRapprocher?: (f: Facture) => void
  onReload?: () => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const locale = getLocale()
  const STATUT_LABELS = getStatutLabels(locale)
  const [validating, setValidating] = useState<string | null>(null)

  const validerBrouillon = async (f: Facture) => {
    if (!confirm(`Valider la facture ${f.numero_facture || ''} ?\nElle passera en "En attente" et déclenchera les écritures comptables.`)) return
    setValidating(f.id)
    try {
      const res = await fetch('/api/client/factures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, statut: 'en_attente' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur validation')
      }
      onReload?.()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erreur validation'}`)
    } finally {
      setValidating(null)
    }
  }

  /** Repasse une facture finalisée en brouillon (et supprime ses écritures
   *  comptables associées côté serveur — symétrique à la validation). */
  const repasserBrouillon = async (f: Facture) => {
    if (!confirm(
      `Repasser la facture ${f.numero_facture || ''} en brouillon ?\n\n` +
      `Cela supprimera ses écritures comptables associées (grand livre).\n` +
      `Tu pourras ensuite la modifier puis la re-valider.`
    )) return
    setValidating(f.id)
    try {
      const res = await fetch('/api/client/factures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, statut: 'brouillon' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur')
      }
      onReload?.()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erreur'}`)
    } finally {
      setValidating(null)
    }
  }

  /** Supprime une facture. Pour les factures finalisées, demande une double
   *  confirmation et passe ?force=1 (cascade des écritures comptables). */
  const supprimerFacture = async (f: Facture) => {
    const isDraft = f.statut === 'brouillon'
    const message = isDraft
      ? `Supprimer le brouillon ${f.numero_facture || ''} ?\nIl sera définitivement effacé.`
      : `⚠️ Supprimer la facture ${f.numero_facture || ''} (${f.statut}) ?\n\n` +
        `Ses écritures comptables seront aussi supprimées (cascade).\n` +
        `Cette action est IRRÉVERSIBLE.`
    if (!confirm(message)) return
    if (!isDraft && !confirm('Confirmer la suppression définitive ?')) return
    setValidating(f.id)
    try {
      const url = isDraft ? `/api/client/factures?id=${f.id}` : `/api/client/factures?id=${f.id}&force=1`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur suppression')
      }
      onReload?.()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erreur suppression'}`)
    } finally {
      setValidating(null)
    }
  }

  if (factures.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('inv.fac.no_invoice_filter', locale)}
        size="md"
      />
    )
  }
  return (
    <div className="divide-y">
      {factures.map((f) => {
        const days = daysUntil(f.date_echeance)
        const overdue = f.statut !== "paye" && f.statut !== "annule" && days !== null && days < 0
        const dueSoon = f.statut !== "paye" && f.statut !== "annule" && days !== null && days >= 0 && days <= 7
        const statutInfo = STATUT_LABELS[f.statut || "en_attente"] || STATUT_LABELS.en_attente
        const isClient = f.type_facture === "client"
        const totalMur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
        const soldeMur = f.solde_non_paye == null ? totalMur : Number(f.solde_non_paye)
        const pctPaye = totalMur > 0 ? Math.round(((totalMur - soldeMur) / totalMur) * 100) : 0
        const isBrouillon = f.statut === "brouillon"
        // canPay : enregistrer paiement n'a de sens que sur factures finalisées.
        // Brouillon/annulée/déjà payée → bouton masqué.
        const canPay = !isBrouillon && f.statut !== "paye" && f.statut !== "annule" && totalMur > 0
        return (
          <div
            key={f.id}
            className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
          >
            {onToggleSelect && (
              <div className="pt-1 flex-shrink-0">
                <Checkbox
                  checked={selectedIds?.has(f.id) ?? false}
                  onCheckedChange={() => onToggleSelect(f.id)}
                  aria-label="Sélectionner cette facture pour l'export PDF"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm font-mono">
                  {f.numero_facture || f.id.slice(0, 8)}
                </h4>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    isClient
                      ? "bg-green-50 text-green-700 border-green-300"
                      : "bg-rose-50 text-rose-700 border-rose-300"
                  }`}
                >
                  {isClient ? t('inv.client', locale) : t('inv.supplier', locale)}
                </Badge>
                <Badge className={`text-[10px] border ${statutInfo.color}`}>
                  {statutInfo.label}
                </Badge>
                {overdue && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {t('inv.fac.overdue_since', locale)} {Math.abs(days!)}{t('inv.fac.day_abbr', locale)}
                  </Badge>
                )}
                {dueSoon && !overdue && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />
                    {t('inv.fac.in', locale)} {days}{t('inv.fac.day_abbr', locale)}
                  </Badge>
                )}
                {f.rapproche_releve_id && (
                  <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-300">
                    <Bot className="h-3 w-3 mr-1" />
                    {t('inv.fac.reconciled', locale)}
                  </Badge>
                )}
                {/* Badge MRA e-invoicing (mig 102 + 248) */}
                {f.mra_status === 'fiscalise' && f.irn && (
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300" title={`IRN : ${f.irn}`}>
                    {t('inv.fac.mra_fiscalised_badge', locale)}
                  </Badge>
                )}
                {f.mra_status === 'erreur' && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                    {t('inv.fac.mra_error_badge', locale)}
                  </Badge>
                )}
              </div>
              <p className="text-sm mt-1 break-words">{f.tiers || "—"}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                <span>{t('inv.fac.issued', locale)} : {formatDate(f.date_facture)}</span>
                <span>{t('inv.due_date', locale)} : {formatDate(f.date_echeance)}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              <p
                className={`font-mono font-medium ${
                  isClient ? "text-green-700" : "text-rose-700"
                }`}
              >
                {isClient ? "+" : "-"}
                {fmt(f.montant_ttc, f.devise || "MUR")}
              </p>
              {f.devise && f.devise !== "MUR" && f.montant_mur && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  ≈ {fmt(f.montant_mur, "MUR")}
                </p>
              )}
              {totalMur > 0 && f.statut !== "annule" && (
                <div className="w-32 text-right">
                  <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <span>{pctPaye}{t('inv.fac.percent_paid', locale)}</span>
                    {soldeMur > 1 && (
                      <span className="font-mono">· {t('inv.fac.remaining', locale)} {fmt(soldeMur, "MUR")}</span>
                    )}
                  </div>
                  <div className="mt-0.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${pctPaye}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Aperçu / impression — disponible pour TOUTES les factures
                  (y compris brouillons et annulées), pour pouvoir revoir
                  ou réimprimer à tout moment. L'aperçu charge la facture
                  depuis la DB via ?facture_id=, l'impression PDF passe
                  par /api/client/factures/[id]/pdf (avec refresh=1 pour
                  forcer la régénération si gabarit/contenu modifié). */}
              <div className="flex gap-1 mt-1 flex-wrap justify-end">
                {/* Brouillon : actions spécifiques Modifier + Valider en premier
                    (avant Aperçu/PDF) pour les mettre en avant — c'est ce que
                    l'utilisateur va vouloir faire prioritairement sur un draft. */}
                {isBrouillon && (
                  <>
                    <Link href={`/client/nouvelle-facture?id=${f.id}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] border-slate-300"
                        title="Modifier ce brouillon"
                      >
                        ✏️ Modifier
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      title="Valider et passer en En attente"
                      disabled={validating === f.id}
                      onClick={() => validerBrouillon(f)}
                    >
                      {validating === f.id ? '…' : '✓ Valider'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] border-red-300 text-red-700 hover:bg-red-50"
                      title="Supprimer ce brouillon"
                      disabled={validating === f.id}
                      onClick={() => supprimerFacture(f)}
                    >
                      🗑️ Supprimer
                    </Button>
                  </>
                )}
                {/* Pour les factures finalisées (en_attente, partiel, retard,
                    annulée), on permet de repasser en brouillon (avec cleanup
                    des écritures comptables) et de supprimer (avec cascade). */}
                {!isBrouillon && f.statut !== 'paye' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50"
                      title="Repasser en brouillon (supprime les écritures comptables associées)"
                      disabled={validating === f.id}
                      onClick={() => repasserBrouillon(f)}
                    >
                      {validating === f.id ? '…' : '↩ Brouillon'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] border-red-300 text-red-700 hover:bg-red-50"
                      title="Supprimer cette facture (cascade des écritures)"
                      disabled={validating === f.id}
                      onClick={() => supprimerFacture(f)}
                    >
                      🗑️ Supprimer
                    </Button>
                  </>
                )}
                {/* Si la facture a un PDF original (importée via OCR/Telegram),
                    on ouvre directement ce PDF — c'est la source de vérité.
                    Sinon (facture créée manuellement via /client/nouvelle-facture),
                    on ouvre le template Lexora regénéré.
                    Pour les FOURNISSEURS, le template Lexora est faux par
                    construction (DDS n'est pas l'émetteur), donc on N'affiche
                    le bouton template que si pas de PDF original. */}
                {f.document_id ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      title="Voir le PDF original"
                      onClick={() => window.open(`/api/documents/${f.document_id}/download`, '_blank')}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      PDF original
                    </Button>
                    {f.type_facture === 'client' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        title="Aperçu au format Lexora (regénéré depuis les montants OCR)"
                        onClick={() => window.open(`/client/facture-preview?facture_id=${f.id}`, '_blank')}
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Format Lexora
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      title="Aperçu de la facture"
                      onClick={() => window.open(`/client/facture-preview?facture_id=${f.id}`, '_blank')}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Aperçu
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      title="Imprimer / Sauvegarder en PDF"
                      onClick={() => window.open(`/client/facture-preview?facture_id=${f.id}&print=true`, '_blank')}
                    >
                      <Printer className="h-3 w-3 mr-1" />
                      PDF
                    </Button>
                  </>
                )}
              </div>
              {canPay && onEnregistrerPaiement && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] mt-1"
                  onClick={() => onEnregistrerPaiement(f)}
                >
                  {t('inv.fac.record_payment', locale)}
                </Button>
              )}
              {canPay && onReglerHorsBanque && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] mt-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={() => onReglerHorsBanque(f)}
                  title="Régler via compte tiers (associé, société liée…)"
                >
                  <Wallet className="h-3 w-3 mr-1" />
                  Hors banque
                </Button>
              )}
              {canPay && onRapprocher && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] mt-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => onRapprocher(f)}
                  title="Affecter un virement bancaire à cette facture"
                >
                  💳 Rapprocher
                </Button>
              )}
              {/* Bouton MRA Fiscaliser — uniquement factures clients non
                  encore fiscalisées (ou en erreur, pour retry). */}
              {isClient && f.statut !== 'annule' && (f.mra_status !== 'fiscalise' || !f.irn) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] mt-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={async () => {
                    if (!confirm(t('inv.fac.fiscalize_confirm', locale).replace('{num}', f.numero_facture || ''))) return
                    try {
                      const res = await fetch(`/api/client/factures/${f.id}/fiscalise`, { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data?.error || t('inv.fac.fiscalize_error_default', locale))
                      alert(t('inv.fac.fiscalize_success', locale).replace('{irn}', data.irn).replace('{env}', data.environment))
                      window.location.reload()
                    } catch (e: any) {
                      alert(`❌ ${e?.message || t('inv.fac.fiscalize_mra_error', locale)}`)
                    }
                  }}
                >
                  {f.mra_status === 'erreur' ? t('inv.fac.retry_mra', locale) : t('inv.fac.fiscalize_mra', locale)}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-green-200 bg-green-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-muted bg-card"
  return (
    <Card className={`${cls} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
