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
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
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
      showToast("Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, showToast])
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
        showToast(d?.error || "Erreur upload", "error")
        return
      }
      showToast(`Relevé importé — ${d?.nb_transactions || 0} transactions extraites`)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur upload", "error")
    } finally {
      setUploading(false)
    }
  }

  const totalSoldes = useMemo(
    () => comptes.reduce((s, c) => s + (c.solde_actuel || 0), 0),
    [comptes]
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
        (t: any) =>
          t.statut === "propose" ||
          t.statut === "a_verifier" ||
          (!t.statut &&
            !t.facture_id &&
            !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0))
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
                value={fmt(totalSoldes, comptes[0]?.devise || "MUR")}
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
                                Principal
                              </Badge>
                            )}
                            {!c.actif && (
                              <Badge variant="outline" className="text-[10px] opacity-60">
                                Inactif
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
                              Solde actuel :{" "}
                              <span className="font-mono font-medium text-foreground">
                                {fmt(c.solde_actuel, c.devise)}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              Dernier relevé : {formatDate(c.date_dernier_releve)}
                            </span>
                            {stale && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Plus de {days}j sans relevé
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Link href="/client/rapprochement">
                          <Button size="sm" variant="outline">
                            <Bot className="h-4 w-4 mr-1.5" />
                            Rapprocher
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
                  Relevés importés ({releves.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {releves.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun relevé importé. Clique sur "Importer un relevé" pour commencer.
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
                              (t: any) => t.statut === "propose" || t.statut === "a_verifier"
                            ).length
                          : 0
                        const rapprochees = Array.isArray(r.transactions_json)
                          ? r.transactions_json.filter((t: any) => t.statut === "rapproche")
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
                                    : "Compte inconnu"}
                                </h4>
                                <Badge variant="outline" className="text-[10px]">
                                  {r.periode || formatDate(r.date_debut)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(r.date_debut)} → {formatDate(r.date_fin)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                                <span className="text-muted-foreground">
                                  Solde {fmt(r.solde_ouverture, compte?.devise)} →{" "}
                                  {fmt(r.solde_cloture, compte?.devise)}
                                </span>
                                <span className="text-muted-foreground">
                                  {nbTx} transaction{nbTx > 1 ? "s" : ""}
                                </span>
                                {rapprochees > 0 && (
                                  <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {rapprochees} rapprochée{rapprochees > 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {enAttente > 0 && (
                                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {enAttente} à valider
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
                      <h3 className="font-bold text-purple-900">Prêt pour Lex Banque ?</h3>
                      <p className="text-sm text-purple-700/80 mt-0.5">
                        L'agent IA va rapprocher tes {txEnAttente} transactions en attente avec
                        tes factures.
                      </p>
                    </div>
                  </div>
                  <Link href="/client/rapprochement">
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md">
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Lancer Lex Banque
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
      list = list.filter((t) => t.compte_bancaire_id === filtreCompte)
    }
    if (filtreStatut !== "all") {
      list = list.filter((t) => t.statut === filtreStatut)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.libelle.toLowerCase().includes(q) ||
          t.tiers_detecte?.toLowerCase().includes(q) ||
          t.compte_comptable?.includes(q) ||
          t.lettre?.toLowerCase().includes(q) ||
          String(t.debit).includes(q) ||
          String(t.credit).includes(q)
      )
    }
    return list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }, [allTx, filtreCompte, filtreStatut, search])

  const visible = filtered.slice(0, maxRows)
  const totalDebit = filtered.reduce((s, t) => s + t.debit, 0)
  const totalCredit = filtered.reduce((s, t) => s + t.credit, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ListFilter className="h-5 w-5 text-blue-600" />
            Toutes les écritures bancaires ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Libellé, tiers, montant…"
                className="pl-8 h-9 w-64"
              />
            </div>
            <Select value={filtreCompte} onValueChange={setFiltreCompte}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les comptes</SelectItem>
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
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="non_identifie">Non identifiée</SelectItem>
                <SelectItem value="propose">Proposée (agent)</SelectItem>
                <SelectItem value="a_verifier">À vérifier</SelectItem>
                <SelectItem value="rapproche">Rapprochée</SelectItem>
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
              Solde net{" "}
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
            Aucune écriture pour ce filtre.
          </p>
        ) : (
          <>
            <div className="rounded border bg-card divide-y">
              {visible.map((t) => {
                const compte = compteById.get(t.compte_bancaire_id)
                const isMatched = t.statut === "rapproche"
                const isPropose = t.statut === "propose" || t.statut === "a_verifier"
                const montant = t.debit > 0 ? -t.debit : t.credit
                return (
                  <div
                    key={`${t.releve_id}:${t.idx}`}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDate(t.date)}
                        </span>
                        {compte && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {compte.banque} {compte.numero_compte} ({compte.devise})
                          </Badge>
                        )}
                        {isMatched && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            Rapprochée
                          </Badge>
                        )}
                        {isPropose && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                            <Bot className="h-3 w-3 mr-0.5" />
                            {t.statut === "propose" ? "Proposée" : "À vérifier"}
                          </Badge>
                        )}
                        {t.compte_comptable && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            PCM {t.compte_comptable}
                          </Badge>
                        )}
                        {t.lettre && (
                          <Badge variant="outline" className="text-[10px] font-mono bg-green-50">
                            {t.lettre}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1 break-words">{t.libelle || "—"}</p>
                      {t.tiers_detecte && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Tiers : {t.tiers_detecte}
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
                      {t.devise}
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
                  Charger {Math.min(100, filtered.length - maxRows)} de plus
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {visible.length} sur {filtered.length}
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
