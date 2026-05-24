"use client"

/**
 * Page /client/banque — agent-friendly.
 *
 * Vue d'ensemble des comptes bancaires de la société active du client +
 * historique des relevés bancaires importés. Branche Lex Banque (lien direct
 * vers /client/rapprochement pour la suite du flow).
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  Loader2,
  Landmark,
  RefreshCw,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Bot,
  ArrowRight,
  Search,
  ListFilter,
  KeyRound,
  Mail,
  Info,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface CompteBancaire {
  id: string
  banque: string
  nom_compte: string
  numero_compte: string
  iban?: string | null
  devise: string
  compte_comptable: string
  solde_actuel: number
  solde_dernier_releve: number
  date_dernier_releve: string | null
  compte_principal: boolean
  actif: boolean
}

interface ReleveBancaire {
  id: string
  compte_bancaire_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  statut_rapprochement: string
  transactions_json: any[] | null
  created_at: string
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    dev
  )
}
function formatDate(d: string | null, locale: Locale = 'fr'): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
function daysSince(d: string | null): number {
  if (!d) return Infinity
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export default function ClientBanquePage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteBancaire[]>([])
  const [releves, setReleves] = useState<ReleveBancaire[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [search, setSearch] = useState("")
  const [filtreCompte, setFiltreCompte] = useState<string>("all")
  // Taux de change MUR — fetché au mount pour cumuler les soldes multi-devises
  const [taux, setTaux] = useState<Record<string, number>>({ MUR: 1 })
  useEffect(() => {
    fetch('/api/taux-change', { cache: 'force-cache' })
      .then(r => r.json())
      .then(d => { if (d?.rates) setTaux({ ...d.rates, MUR: 1 }) })
      .catch(() => {})
  }, [])
  const [filtreStatut, setFiltreStatut] = useState<string>("all")
  const [maxRows, setMaxRows] = useState(100)

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // Nouveau endpoint dédié qui retourne comptes + relevés bruts
      const res = await fetch(
        `/api/client/releves-bancaires?societe_id=${societeId}`
      )
      const d = await res.json()
      const accounts: CompteBancaire[] = (d.comptes || []).map((a: any) => ({
        id: a.id,
        banque: a.banque || "—",
        nom_compte: a.nom_compte || a.numero_compte,
        numero_compte: a.numero_compte || "—",
        iban: a.iban || null,
        devise: a.devise || "MUR",
        compte_comptable: a.compte_comptable || "—",
        solde_actuel: Number(a.solde_actuel) || 0,
        solde_dernier_releve: Number(a.solde_dernier_releve) || 0,
        date_dernier_releve: a.date_dernier_releve || null,
        compte_principal: !!a.compte_principal,
        actif: a.actif !== false,
      }))
      setComptes(accounts)
      setReleves(d.releves || [])
    } catch {
      showToast(t('acc.bnq.load_error', locale), "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, showToast, locale])
  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (file: File) => {
    if (!societeId || !file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("societe_id", societeId)
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || t('acc.bnq.upload_error', locale), "error")
        return
      }
      showToast(t('acc.bnq.statement_imported', locale).replace('{n}', String(d?.nb_transactions || 0)))
      load()
    } catch (e: any) {
      showToast(e?.message || t('acc.bnq.upload_error', locale), "error")
    } finally {
      setUploading(false)
    }
  }

  const totalSoldes = useMemo(
    () => comptes.reduce((s, c) => {
      const taux_devise = taux[c.devise || 'MUR'] || 1
      return s + (c.solde_actuel || 0) * taux_devise
    }, 0),
    [comptes, taux]
  )
  const lastImport = useMemo(() => {
    if (releves.length === 0) return null
    return releves.reduce((max, r) =>
      (r.created_at || "") > (max?.created_at || "") ? r : max
    , releves[0]).created_at
  }, [releves])
  const txEnAttente = useMemo(() => {
    return releves.reduce((sum, r) => {
      const arr = Array.isArray(r.transactions_json) ? r.transactions_json : []
      const enAttente = arr.filter(
        (tx: any) =>
          tx.statut === "propose" ||
          tx.statut === "a_verifier" ||
          (!tx.statut &&
            !tx.facture_id &&
            !(Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0))
      ).length
      return sum + enAttente
    }, 0)
  }, [releves])

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
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 p-3 text-white shadow-md">
                <Landmark className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-blue-900">{t('acc.bnq.title', locale)}</h1>
                <p className="text-sm text-blue-700/80 mt-0.5">
                  {t('acc.bnq.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={load}
                disabled={loading || !societeId}
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('common.refresh', locale)}
              </Button>
              <label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.currentTarget.value = ""
                  }}
                />
                <span
                  className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all h-9 rounded-md px-4 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-md ${
                    uploading ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t('acc.bnq.import_statement', locale)}
                </span>
              </label>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {t('acc.bnq.go_lex_banque', locale)}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Panneau "3 chemins pour alimenter tes transactions" ──
            Visible par défaut, dismissable via localStorage. Posé entre le
            header et la zone de données pour que l'utilisateur sache tout
            de suite quelles options s'offrent à lui — surtout que le
            scraping auto nécessite des credentials qu'il pourrait ignorer. */}
        <FeedTransactionsPanel locale={locale} />

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('acc.bnq.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={t('acc.bnq.active_accounts', locale)} value={comptes.filter((c) => c.actif).length} />
              <KpiCard
                label={t('acc.bnq.cumulative_balance', locale)}
                value={fmt(totalSoldes, "MUR")}
                tone="green"
              />
              <KpiCard
                label={t('acc.bnq.last_import', locale)}
                value={lastImport ? formatDate(lastImport) : "—"}
                tone="blue"
              />
              <KpiCard
                label={t('acc.bnq.tx_pending', locale)}
                value={txEnAttente}
                tone={txEnAttente > 0 ? "amber" : "green"}
                accent={txEnAttente > 0}
              />
            </div>

            {/* Liste des comptes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  {t('acc.bnq.your_accounts', locale)} ({comptes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {comptes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('acc.bnq.no_accounts', locale)}
                  </p>
                ) : (
                  comptes.map((c) => {
                    const days = daysSince(c.date_dernier_releve)
                    const stale = days > 35
                    return (
                      <div
                        key={c.id}
                        className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-muted/20"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">
                              {c.banque} · {c.numero_compte}
                            </h3>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {c.devise}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              PCM {c.compte_comptable}
                            </Badge>
                            {c.compte_principal && (
                              <Badge className="text-[10px] bg-blue-100 text-blue-700 border border-blue-300">
                                {t('acc.bnq.principal', locale)}
                              </Badge>
                            )}
                            {!c.actif && (
                              <Badge variant="outline" className="text-[10px] opacity-60">
                                {t('acc.bnq.inactive', locale)}
                              </Badge>
                            )}
                          </div>
                          {c.iban && (
                            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                              IBAN {c.iban}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
                            <span className="text-muted-foreground">
                              {t('acc.bnq.current_balance', locale)} :{" "}
                              <span className="font-mono font-medium text-foreground">
                                {fmt(c.solde_actuel, c.devise)}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {t('acc.bnq.last_statement', locale)} : {formatDate(c.date_dernier_releve, locale)}
                            </span>
                            {stale && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {Number.isFinite(days)
                                  ? t('acc.bnq.no_stmt_for_d', locale).replace('{d}', String(days))
                                  : 'Aucun relevé'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Link href="/client/rapprochement">
                          <Button size="sm" variant="outline">
                            <Bot className="h-4 w-4 mr-1.5" />
                            {t('acc.bnq.reconcile', locale)}
                          </Button>
                        </Link>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Relevés importés */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  {t('acc.bnq.imported_statements', locale)} ({releves.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {releves.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('acc.bnq.no_statements_imported', locale)}
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {releves
                      .slice()
                      .sort((a, b) => (b.date_fin || "").localeCompare(a.date_fin || ""))
                      .map((r) => {
                        const compte = comptes.find((c) => c.id === r.compte_bancaire_id)
                        const nbTx = Array.isArray(r.transactions_json)
                          ? r.transactions_json.length
                          : 0
                        const enAttente = Array.isArray(r.transactions_json)
                          ? r.transactions_json.filter(
                              (tx: any) => tx.statut === "propose" || tx.statut === "a_verifier"
                            ).length
                          : 0
                        const rapprochees = Array.isArray(r.transactions_json)
                          ? r.transactions_json.filter((tx: any) => tx.statut === "rapproche")
                              .length
                          : 0
                        return (
                          <div
                            key={r.id}
                            className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">
                                  {compte
                                    ? `${compte.banque} ${compte.numero_compte}`
                                    : t('acc.bnq.unknown_account', locale)}
                                </h4>
                                <Badge variant="outline" className="text-[10px]">
                                  {r.periode || formatDate(r.date_debut, locale)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(r.date_debut, locale)} → {formatDate(r.date_fin, locale)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                                <span className="text-muted-foreground">
                                  {t('acc.bnq.balance_short', locale)} {fmt(r.solde_ouverture, compte?.devise)} →{" "}
                                  {fmt(r.solde_cloture, compte?.devise)}
                                </span>
                                <span className="text-muted-foreground">
                                  {nbTx} {t('acc.bnq.transactions_lc', locale)}
                                </span>
                                {rapprochees > 0 && (
                                  <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {rapprochees} {t('acc.bnq.reconciled_count', locale)}{rapprochees > 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {enAttente > 0 && (
                                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {enAttente} {t('acc.bnq.to_validate_count', locale)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Link href="/client/rapprochement">
                              <Button size="sm" variant="ghost">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Toutes les écritures bancaires (recherche + filtres) */}
            <TransactionsList
              comptes={comptes}
              releves={releves}
              search={search}
              setSearch={setSearch}
              filtreCompte={filtreCompte}
              setFiltreCompte={setFiltreCompte}
              filtreStatut={filtreStatut}
              setFiltreStatut={setFiltreStatut}
              maxRows={maxRows}
              setMaxRows={setMaxRows}
              locale={locale}
            />

            {/* CTA Lex Banque */}
            {(comptes.length > 0 || releves.length > 0) && (
              <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-purple-600 p-3 text-white shadow-md">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-purple-900">{t('acc.bnq.ready_lex_banque', locale)}</h3>
                      <p className="text-sm text-purple-700/80 mt-0.5">
                        {t('acc.bnq.ready_help', locale).replace('{n}', String(txEnAttente))}
                      </p>
                    </div>
                  </div>
                  <Link href="/client/rapprochement">
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md">
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      {t('acc.bnq.run_lex_banque', locale)}
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function TransactionsList({
  comptes,
  releves,
  search,
  setSearch,
  filtreCompte,
  setFiltreCompte,
  filtreStatut,
  setFiltreStatut,
  maxRows,
  setMaxRows,
  locale,
}: {
  comptes: CompteBancaire[]
  releves: ReleveBancaire[]
  search: string
  setSearch: (v: string) => void
  filtreCompte: string
  setFiltreCompte: (v: string) => void
  filtreStatut: string
  setFiltreStatut: (v: string) => void
  maxRows: number
  setMaxRows: (n: number) => void
  locale: Locale
}) {
  // Aplatit toutes les transactions de tous les relevés
  const allTx = useMemo(() => {
    const out: Array<{
      releve_id: string
      compte_bancaire_id: string
      idx: number
      date: string
      libelle: string
      debit: number
      credit: number
      devise: string
      statut: string
      tiers_detecte: string | null
      compte_comptable: string | null
      facture_ids: string[]
      matched_strategy: string | null
      matched_confidence: number | null
      lettre: string | null
    }> = []
    for (const r of releves) {
      const compte = comptes.find((c) => c.id === r.compte_bancaire_id)
      const arr: any[] = Array.isArray(r.transactions_json) ? r.transactions_json : []
      for (let i = 0; i < arr.length; i++) {
        const tx = arr[i] || {}
        out.push({
          releve_id: r.id,
          compte_bancaire_id: r.compte_bancaire_id,
          idx: i,
          date: tx.date || "",
          libelle: tx.libelle || "",
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          devise: tx.devise || compte?.devise || "MUR",
          statut: tx.statut || "non_identifie",
          tiers_detecte: tx.tiers_detecte || null,
          compte_comptable: tx.compte_comptable || null,
          facture_ids: Array.isArray(tx.facture_ids)
            ? tx.facture_ids
            : tx.facture_id
              ? [tx.facture_id]
              : [],
          matched_strategy: tx.matched_strategy || null,
          matched_confidence: tx.matched_confidence || null,
          lettre: tx.lettre || null,
        })
      }
    }
    return out
  }, [releves, comptes])

  const compteById = useMemo(() => {
    const m = new Map<string, CompteBancaire>()
    for (const c of comptes) m.set(c.id, c)
    return m
  }, [comptes])

  const filtered = useMemo(() => {
    let list = allTx
    if (filtreCompte !== "all") {
      list = list.filter((tx) => tx.compte_bancaire_id === filtreCompte)
    }
    if (filtreStatut !== "all") {
      list = list.filter((tx) => tx.statut === filtreStatut)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (tx) =>
          tx.libelle.toLowerCase().includes(q) ||
          tx.tiers_detecte?.toLowerCase().includes(q) ||
          tx.compte_comptable?.includes(q) ||
          tx.lettre?.toLowerCase().includes(q) ||
          String(tx.debit).includes(q) ||
          String(tx.credit).includes(q)
      )
    }
    return list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [allTx, filtreCompte, filtreStatut, search])

  const visible = filtered.slice(0, maxRows)
  const totalDebit = filtered.reduce((s, tx) => s + tx.debit, 0)
  const totalCredit = filtered.reduce((s, tx) => s + tx.credit, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ListFilter className="h-5 w-5 text-blue-600" />
            {t('acc.bnq.all_bank_entries', locale)} ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('acc.bnq.search_placeholder', locale)}
                className="pl-8 h-9 w-64"
              />
            </div>
            <Select value={filtreCompte} onValueChange={setFiltreCompte}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('acc.bnq.all_accounts_filter', locale)}</SelectItem>
                {comptes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.banque} {c.numero_compte} ({c.devise})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtreStatut} onValueChange={setFiltreStatut}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('acc.bnq.all_status', locale)}</SelectItem>
                <SelectItem value="non_identifie">{t('acc.bnq.status_unidentified', locale)}</SelectItem>
                <SelectItem value="propose">{t('acc.bnq.status_proposed', locale)}</SelectItem>
                <SelectItem value="a_verifier">{t('acc.bnq.status_to_verify', locale)}</SelectItem>
                <SelectItem value="rapproche">{t('acc.bnq.status_reconciled', locale)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {filtered.length > 0 && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground font-mono">
            <span>
              D{" "}
              <span className="text-green-700">
                {totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              C{" "}
              <span className="text-rose-700">
                {totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              {t('acc.bnq.net_balance', locale)}{" "}
              <span className={totalDebit - totalCredit >= 0 ? "text-green-700" : "text-rose-700"}>
                {(totalDebit - totalCredit).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('acc.bnq.no_entries_filter', locale)}
          </p>
        ) : (
          <>
            <div className="rounded border bg-card divide-y">
              {visible.map((tx) => {
                const compte = compteById.get(tx.compte_bancaire_id)
                const isMatched = tx.statut === "rapproche"
                const isPropose = tx.statut === "propose" || tx.statut === "a_verifier"
                const montant = tx.debit > 0 ? -tx.debit : tx.credit
                return (
                  <div
                    key={`${tx.releve_id}:${tx.idx}`}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDate(tx.date, locale)}
                        </span>
                        {compte && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {compte.banque} {compte.numero_compte} ({compte.devise})
                          </Badge>
                        )}
                        {isMatched && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            {t('acc.bnq.tx_reconciled', locale)}
                          </Badge>
                        )}
                        {isPropose && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                            <Bot className="h-3 w-3 mr-0.5" />
                            {tx.statut === "propose" ? t('acc.bnq.tx_proposed', locale) : t('acc.bnq.tx_to_verify', locale)}
                          </Badge>
                        )}
                        {tx.compte_comptable && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            PCM {tx.compte_comptable}
                          </Badge>
                        )}
                        {tx.lettre && (
                          <Badge variant="outline" className="text-[10px] font-mono bg-green-50">
                            {tx.lettre}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1 break-words">{tx.libelle || "—"}</p>
                      {tx.tiers_detecte && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t('acc.bnq.tiers_short', locale)} : {tx.tiers_detecte}
                        </p>
                      )}
                    </div>
                    <p
                      className={`font-mono text-sm flex-shrink-0 ${
                        montant >= 0 ? "text-green-700" : "text-rose-700"
                      }`}
                    >
                      {montant >= 0 ? "+" : ""}
                      {montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      {tx.devise}
                    </p>
                  </div>
                )
              })}
            </div>
            {filtered.length > maxRows && (
              <div className="text-center mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMaxRows(maxRows + 100)}
                >
                  {t('acc.bnq.load_more_n', locale).replace('{n}', String(Math.min(100, filtered.length - maxRows)))}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('acc.bnq.x_of_y', locale).replace('{x}', String(visible.length)).replace('{y}', String(filtered.length))}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
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

/**
 * Panneau pédagogique : explique les 3 façons d'alimenter le compte bancaire
 * dans Lexora. Affiché en haut de /client/banque pour que l'utilisateur
 * voie immédiatement ses options — surtout que le scraping auto demande
 * des credentials qu'il pourrait ne pas vouloir donner.
 *
 * Persistance : un toggle "Comprendre les options" (collapsé/déplié) est
 * mémorisé en localStorage par utilisateur — pas par société, c'est une
 * préférence d'affichage personnelle.
 */
function FeedTransactionsPanel({ locale }: { locale: Locale }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('lexora_banque_panel_collapsed')
      if (stored === '1') setCollapsed(true)
    } catch { /* ignore */ }
  }, [])

  const toggle = () => {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('lexora_banque_panel_collapsed', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const isFr = locale === 'fr'

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-700" />
            <span className="font-semibold text-blue-900 text-sm">
              {isFr
                ? 'Comment alimenter tes transactions bancaires dans Lexora ?'
                : 'How to feed bank transactions into Lexora?'}
            </span>
          </div>
          <span className="text-xs text-blue-700 underline">
            {collapsed
              ? (isFr ? 'Voir les options' : 'Show options')
              : (isFr ? 'Masquer' : 'Hide')}
          </span>
        </button>

        {!collapsed && (
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {/* Option A : Upload web (CSV/MT940 + OCR PDF/image) — toujours dispo */}
            <div className="rounded-md border border-green-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-700" />
                <span className="font-semibold text-sm text-green-900">
                  {isFr ? 'A — Upload web (CSV / MT940 / OCR)' : 'A — Web upload (CSV / MT940 / OCR)'}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {isFr
                  ? 'Tu déposes ici (bouton Importer ↑) : un export CSV/MT940 depuis ton Internet Banking, ou un PDF/image de ton relevé (l\'OCR Claude extrait les transactions). MCB, SBM, MauBank reconnus. Aucun mot de passe à donner.'
                  : 'Drop here (Import button ↑): a CSV/MT940 export from your Internet Banking, or a PDF/image of your statement (Claude OCR extracts the transactions). MCB, SBM, MauBank recognized. No password required.'}
              </p>
              <p className="text-[11px] text-green-700 mt-1.5 font-medium">
                {isFr ? '✅ Fonctionne tout de suite' : '✅ Works right now'}
              </p>
            </div>

            {/* Option B : Telegram — photo du relevé envoyée au bot, OCR auto */}
            <div className="rounded-md border border-cyan-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="h-4 w-4 text-cyan-700" />
                <span className="font-semibold text-sm text-cyan-900">
                  {isFr ? 'B — Telegram (OCR photo)' : 'B — Telegram (photo OCR)'}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {isFr
                  ? 'Tu envoies une photo ou un PDF de ton relevé au bot Telegram Lexora. L\'OCR Claude extrait les transactions et les injecte directement dans la banque de la société active. Idéal en mobilité.'
                  : 'Send a photo or PDF of your statement to the Lexora Telegram bot. Claude OCR extracts the transactions and injects them into the active company\'s bank. Ideal on the go.'}
              </p>
              <p className="text-[11px] text-cyan-700 mt-1.5 font-medium">
                {isFr ? '📱 Fonctionne en mobilité' : '📱 Works on mobile'}
              </p>
            </div>

            {/* Option C : Scraping auto — nécessite credentials */}
            <div className="rounded-md border border-amber-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <KeyRound className="h-4 w-4 text-amber-700" />
                <span className="font-semibold text-sm text-amber-900">
                  {isFr ? 'C — Scraping nocturne auto' : 'C — Nightly auto scraping'}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {isFr
                  ? 'Lexora se connecte chaque nuit à 02:00 UTC et récupère solde + transactions. Tu donnes ton login + password Internet Banking (chiffrés AES-256-GCM). MCB activé, autres banques en attente.'
                  : 'Lexora connects every night at 02:00 UTC to fetch balance + transactions. You provide your Internet Banking login + password (encrypted AES-256-GCM). MCB live, other banks pending.'}
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] text-amber-700 font-medium">
                  {isFr ? '⚠ Nécessite credentials' : '⚠ Requires credentials'}
                </span>
                <Link
                  href="/client/direction/bank-credentials"
                  className="text-[11px] text-blue-700 underline hover:text-blue-900"
                >
                  {isFr ? 'Configurer →' : 'Configure →'}
                </Link>
              </div>
            </div>

            {/* Option D : Email forwarding — pas encore en place */}
            <div className="rounded-md border border-gray-200 bg-white p-3 opacity-75">
              <div className="flex items-center gap-2 mb-1.5">
                <Mail className="h-4 w-4 text-gray-600" />
                <span className="font-semibold text-sm text-gray-700">
                  {isFr ? 'D — Forward email (à venir)' : 'D — Email forwarding (coming)'}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {isFr
                  ? 'Tu configures un forward automatique des relevés que ta banque t\'envoie par email. Lexora reçoit, parse, injecte. Aucun mot de passe à donner.'
                  : 'Configure an auto-forward of the statement emails your bank sends. Lexora receives, parses, injects. No password required.'}
              </p>
              <p className="text-[11px] text-gray-500 mt-1.5 italic">
                {isFr ? 'Roadmap — disponible bientôt' : 'Roadmap — coming soon'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
