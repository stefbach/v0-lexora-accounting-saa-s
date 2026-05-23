"use client"

/**
 * Page /comptable/banque — miroir de /client/banque avec sélecteur de société.
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
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ReleveVersionHistory } from "@/components/banque/ReleveVersionHistory"

interface Societe {
  id: string
  nom: string
}
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
  version?: number | null
  superseded_by_id?: string | null
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
function formatDate(d: string | null, locale: 'fr' | 'en' = 'fr'): string {
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

export default function ComptableBanquePage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [comptes, setComptes] = useState<CompteBancaire[]>([])
  const [releves, setReleves] = useState<ReleveBancaire[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [historyReleveId, setHistoryReleveId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then((r) => r.json())
      .then((d) => {
        const list: Societe[] = d.societes || []
        setSocietes(list)
        if (list.length === 1) setSelectedSociete(list[0].id)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (selectedSociete === "all") {
      setComptes([])
      setReleves([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/banque?societe_id=${selectedSociete}`)
      const d = await res.json()
      const accounts: CompteBancaire[] = (d.comptes || d.bankAccounts || []).map((a: any) => ({
        id: a.id,
        banque: a.banque || "—",
        nom_compte: a.nom_compte || a.numero_compte,
        numero_compte: a.numero_compte || "—",
        iban: a.iban || null,
        devise: a.devise || "MUR",
        compte_comptable: a.compte_comptable || "—",
        solde_actuel: Number(a.solde_actuel) || Number(a.solde_mur) || 0,
        solde_dernier_releve: Number(a.solde_dernier_releve) || 0,
        date_dernier_releve: a.date_dernier_releve || null,
        compte_principal: !!a.compte_principal,
        actif: a.actif !== false,
      }))
      setComptes(accounts)
      setReleves(d.releves || d.relevesBancaires || [])
    } catch {
      showToast(t('cab.banque.err_load', locale), "error")
    } finally {
      setLoading(false)
    }
  }, [selectedSociete, showToast, locale])
  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (file: File) => {
    if (selectedSociete === "all" || !file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("societe_id", selectedSociete)
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || t('cab.banque.err_upload', locale), "error")
        return
      }
      showToast(`${t('cab.banque.statement_imported_pre', locale)} ${d?.nb_transactions || 0} ${t('cab.banque.statement_imported_post', locale)}`)
      load()
    } catch (e: any) {
      showToast(e?.message || t('cab.banque.err_upload', locale), "error")
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
      return (
        sum +
        arr.filter(
          (t: any) =>
            t.statut === "propose" ||
            t.statut === "a_verifier" ||
            (!t.statut &&
              !t.facture_id &&
              !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0))
        ).length
      )
    }, 0)
  }, [releves])

  const canAct = selectedSociete !== "all"

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
                <h1 className="text-2xl font-bold text-blue-900">{t('cab.banque.title', locale)}</h1>
                <p className="text-sm text-blue-700/80 mt-0.5">
                  {t('cab.banque.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={load}
                disabled={loading || !canAct}
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('cab.banque.refresh', locale)}
              </Button>
              <label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploading || !canAct}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.currentTarget.value = ""
                  }}
                />
                <span
                  className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all h-9 rounded-md px-4 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-md ${
                    uploading || !canAct ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t('cab.banque.import_statement', locale)}
                </span>
              </label>
              <Link href="/comptable/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {t('cab.banque.go_lex_bank', locale)}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Sélecteur société */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-72">
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger>
                <SelectValue placeholder={t('cab.banque.choose_company', locale)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('cab.banque.choose_company_opt', locale)}</SelectItem>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!canAct ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('cab.banque.select_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={t('cab.banque.kpi_active_accounts', locale)} value={comptes.filter((c) => c.actif).length} />
              <KpiCard
                label={t('cab.banque.kpi_cumul_balance', locale)}
                value={fmt(totalSoldes, comptes[0]?.devise || "MUR")}
                tone="green"
              />
              <KpiCard
                label={t('cab.banque.kpi_last_import', locale)}
                value={lastImport ? formatDate(lastImport, locale) : "—"}
                tone="blue"
              />
              <KpiCard
                label={t('cab.banque.kpi_pending_tx', locale)}
                value={txEnAttente}
                tone={txEnAttente > 0 ? "amber" : "green"}
                accent={txEnAttente > 0}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  {t('cab.banque.bank_accounts', locale)} ({comptes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {comptes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('cab.banque.no_account', locale)}
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
                                {t('cab.banque.principal', locale)}
                              </Badge>
                            )}
                            {!c.actif && (
                              <Badge variant="outline" className="text-[10px] opacity-60">
                                {t('cab.banque.inactive', locale)}
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
                              {t('cab.banque.current_balance', locale)} :{" "}
                              <span className="font-mono font-medium text-foreground">
                                {fmt(c.solde_actuel, c.devise)}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {t('cab.banque.last_statement', locale)} : {formatDate(c.date_dernier_releve, locale)}
                            </span>
                            {stale && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {t('cab.banque.stale_pre', locale)} {days}{t('cab.banque.stale_post', locale)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Link href="/comptable/rapprochement">
                          <Button size="sm" variant="outline">
                            <Bot className="h-4 w-4 mr-1.5" />
                            {t('cab.banque.reconcile', locale)}
                          </Button>
                        </Link>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  {t('cab.banque.statements_imported', locale)} ({releves.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {releves.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('cab.banque.no_statement', locale)}
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
                                    : t('cab.banque.unknown_account', locale)}
                                </h4>
                                <Badge variant="outline" className="text-[10px]">
                                  {r.periode || formatDate(r.date_debut, locale)}
                                </Badge>
                                {(r.version ?? 1) > 1 && (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            e.preventDefault()
                                            setHistoryReleveId(r.id)
                                          }}
                                          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200 transition-colors"
                                        >
                                          v{r.version}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Ré-uploadé {(r.version ?? 1) - 1} fois — voir historique
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(r.date_debut, locale)} → {formatDate(r.date_fin, locale)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                                <span className="text-muted-foreground">
                                  {t('cab.banque.balance_label', locale)} {fmt(r.solde_ouverture, compte?.devise)} →{" "}
                                  {fmt(r.solde_cloture, compte?.devise)}
                                </span>
                                <span className="text-muted-foreground">
                                  {nbTx} {t('cab.banque.transaction', locale)}{nbTx > 1 ? "s" : ""}
                                </span>
                                {rapprochees > 0 && (
                                  <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {rapprochees} {t('cab.banque.reconciled', locale)}{rapprochees > 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {enAttente > 0 && (
                                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {enAttente} {t('cab.banque.to_validate', locale)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Link href="/comptable/rapprochement">
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
          </>
        )}

        <ReleveVersionHistory
          releveId={historyReleveId}
          open={!!historyReleveId}
          onOpenChange={(o) => { if (!o) setHistoryReleveId(null) }}
        />
      </div>
    </ClientPageShell>
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
