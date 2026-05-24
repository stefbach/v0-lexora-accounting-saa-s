"use client"

/**
 * Page /client/grand-livre — refonte structurée par classe (collapsibles).
 *
 * Mise en page comme un état comptable réel :
 * - Header avec actions clés (Lancer Lex Livre, Plan Comptable)
 * - Audit panel (si audit lancé)
 * - Balance générale (Actif / Passif / Résultat)
 * - 7 sections collapsibles, une par classe (1-7)
 *   Chaque section : titre + total + liste comptes avec lien vers écritures
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2,
  RefreshCw,
  BookCopy,
  Search,
  Sparkles,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  Package,
  Users,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface CompteSolde {
  numero_compte: string
  libelle?: string | null
  total_debit: number
  total_credit: number
  solde: number
  nb_ecritures: number
}

interface Ecriture {
  id: string
  date_ecriture: string | null
  journal: string | null
  numero_compte: string
  libelle: string | null
  debit_mur: number
  credit_mur: number
  lettre: string | null
  ref_folio: string | null
}

interface PCMEntry {
  compte: string
  libelle: string | null
  classe: number
  type_compte: string | null
  sens_normal: "D" | "C" | null
}

interface AuditResult {
  score?: number
  severity?: "ok" | "warning" | "critical"
  issues?: Array<{ severity: string; message: string }>
  summary?: {
    total_ecritures?: number
    total_debit?: number
    total_credit?: number
    ecart_balance?: number
  }
  comptes_hors_pcm?: Array<{ numero: string; nb: number; debit: number; credit: number }>
  // Champs V2 (optionnels)
  explanation?: string | null
  ecritures_futures?: Array<{ id: string; date: string; compte: string; libelle: string }>
  ecritures_hors_exercice_count?: number
  tiers_inverses?: Array<{ numero: string; solde: number; sens: string }>
  tva_summary?: {
    ttc_collectee: number
    ttc_deductible: number
    a_payer: number
    a_recuperer: number
    ecart_calcul: number
  }
  comptes_aux_nus?: Array<{ numero: string; nb: number; solde: number }>
  net_a_payer_vieux?: Array<{ id: string; date: string; libelle: string; montant: number }>
  cot_patronales?: { charges_d: number; cot_c: number; ecart: number }
  ecritures_weekend_ferie?: number
  montants_ronds_count?: number
  sens_inverses?: Array<{ numero: string; solde: number; classe: number }>
  doublons_rapprochement?: number
  bulletins_orphelins?: number
  paye_summary?: { retenu: number; paye: number; solde: number }
  drill_down_balance?: Array<{ numero: string; ecart: number }>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  )
}

function getClasses(locale: Locale): Array<{
  num: number
  label: string
  desc: string
  color: string
  Icon: any
}> {
  return [
    { num: 1, label: t('acc.gl.cls1', locale), desc: t('acc.gl.cls1_desc', locale), color: "blue", Icon: Wallet },
    { num: 2, label: t('acc.gl.cls2', locale), desc: t('acc.gl.cls2_desc', locale), color: "cyan", Icon: Building2 },
    { num: 3, label: t('acc.gl.cls3', locale), desc: t('acc.gl.cls3_desc', locale), color: "teal", Icon: Package },
    { num: 4, label: t('acc.gl.cls4', locale), desc: t('acc.gl.cls4_desc', locale), color: "amber", Icon: Users },
    { num: 5, label: t('acc.gl.cls5', locale), desc: t('acc.gl.cls5_desc', locale), color: "purple", Icon: Landmark },
    { num: 6, label: t('acc.gl.cls6', locale), desc: t('acc.gl.cls6_desc', locale), color: "rose", Icon: ArrowDownCircle },
    { num: 7, label: t('acc.gl.cls7', locale), desc: t('acc.gl.cls7_desc', locale), color: "green", Icon: ArrowUpCircle },
  ]
}

const colorMap: Record<string, { bg: string; border: string; text: string; bgLight: string }> = {
  blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900", bgLight: "bg-blue-100" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-900", bgLight: "bg-cyan-100" },
  teal: { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-900", bgLight: "bg-teal-100" },
  amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", bgLight: "bg-amber-100" },
  purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-900", bgLight: "bg-purple-100" },
  rose: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-900", bgLight: "bg-rose-100" },
  green: { bg: "bg-green-50", border: "border-green-300", text: "text-green-900", bgLight: "bg-green-100" },
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientGrandLivrePage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteSolde[]>([])
  const [ecritures, setEcritures] = useState<Ecriture[]>([])
  const [pcm, setPcm] = useState<PCMEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [openCompte, setOpenCompte] = useState<string | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [lettering, setLettering] = useState(false)
  const [audit, setAudit] = useState<any>(null)
  const [openClasses, setOpenClasses] = useState<Set<number>>(new Set([4, 5, 6, 7]))
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [finRes, pcmRes] = await Promise.all([
        fetch(`/api/client/financial?societe_id=${societeId}`).then((r) => r.json()),
        fetch(`/api/client/plan-comptable?societe_id=${societeId}`).then((r) => r.json()),
      ])
      const fin = finRes?.financial || {}
      const ecr: any[] = fin.ecritures || []
      const pcmList: PCMEntry[] = pcmRes?.comptes || []
      const pcmMap = new Map<string, PCMEntry>()
      for (const p of pcmList) pcmMap.set(p.compte, p)
      const map = new Map<string, CompteSolde>()
      const allEcritures: Ecriture[] = []
      for (const e of ecr) {
        const num = e.numero_compte || e.compte || "?"
        const debit = Number(e.debit_mur) || Number(e.debit) || 0
        const credit = Number(e.credit_mur) || Number(e.credit) || 0
        const cur = map.get(num) || {
          numero_compte: num,
          libelle: pcmMap.get(num)?.libelle || e.libelle || null,
          total_debit: 0,
          total_credit: 0,
          solde: 0,
          nb_ecritures: 0,
        }
        cur.total_debit += debit
        cur.total_credit += credit
        cur.solde = cur.total_debit - cur.total_credit
        cur.nb_ecritures++
        map.set(num, cur)
        allEcritures.push({
          id: e.id,
          date_ecriture: e.date_ecriture || null,
          journal: e.journal || null,
          numero_compte: num,
          libelle: e.libelle || null,
          debit_mur: debit,
          credit_mur: credit,
          lettre: e.lettre || null,
          ref_folio: e.ref_folio || null,
        })
      }
      setComptes(Array.from(map.values()))
      setEcritures(allEcritures)
      setPcm(pcmList)
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const handleAudit = async (opts: { explain?: boolean } = {}) => {
    if (!societeId) return
    setAuditing(true)
    try {
      const res = await fetch("/api/agent/grand-livre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          action: "audit",
          explain: !!opts.explain,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || t('acc.gl.error_lex', locale), "error")
        return
      }
      setAudit(d)
      showToast(t('acc.gl.lex_score', locale).replace('{s}', String(d.score)))
    } catch (e: any) {
      showToast(e?.message || t('acc.gl.error', locale), "error")
    } finally {
      setAuditing(false)
    }
  }

  const handleLettrage = async () => {
    if (!societeId) return
    setLettering(true)
    try {
      const res = await fetch("/api/agent/grand-livre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, action: "lettrer" }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || t('acc.gl.error_letter', locale), "error")
        return
      }
      showToast(
        t('acc.gl.letter_msg', locale).replace('{p}', String(d.pairs_created)).replace('{e}', String(d.ecritures_lettrees))
      )
      load()
      // Re-audit pour refléter
      handleAudit()
    } catch (e: any) {
      showToast(e?.message || t('acc.gl.error_letter', locale), "error")
    } finally {
      setLettering(false)
    }
  }

  // Group comptes by class
  const comptesByClass = useMemo(() => {
    const map = new Map<number, CompteSolde[]>()
    for (const c of comptes) {
      const cl = parseInt(c.numero_compte[0]) || 0
      if (cl < 1 || cl > 7) continue
      const arr = map.get(cl) || []
      arr.push(c)
      map.set(cl, arr)
    }
    for (const [k, v] of map) v.sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
    return map
  }, [comptes])

  const filteredByClass = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = new Map<number, CompteSolde[]>()
    for (const [cl, arr] of comptesByClass) {
      const filtered = q
        ? arr.filter(
            (c) =>
              c.numero_compte.toLowerCase().includes(q) ||
              (c.libelle || "").toLowerCase().includes(q)
          )
        : arr
      if (filtered.length > 0 || !q) result.set(cl, filtered)
    }
    return result
  }, [comptesByClass, search])

  // Auto-open classes with matches when searching
  useEffect(() => {
    if (search.trim()) {
      const next = new Set<number>()
      for (const [cl, arr] of filteredByClass) {
        if (arr.length > 0) next.add(cl)
      }
      setOpenClasses(next)
    }
  }, [search, filteredByClass])

  const toggleClass = (cl: number) => {
    setOpenClasses((prev) => {
      const next = new Set(prev)
      if (next.has(cl)) next.delete(cl)
      else next.add(cl)
      return next
    })
  }

  const totalDebit = comptes.reduce((s, c) => s + c.total_debit, 0)
  const totalCredit = comptes.reduce((s, c) => s + c.total_credit, 0)
  const ecart = totalDebit - totalCredit

  // Synthèse comptable : Actif - Passif - Résultat
  const totalCharges = (comptesByClass.get(6) || []).reduce((s, c) => s + c.solde, 0)
  const totalProduits = (comptesByClass.get(7) || []).reduce((s, c) => s + Math.abs(c.solde), 0)
  const resultat = totalProduits - totalCharges

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
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookCopy className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('acc.gl.title', locale)}</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  {t('acc.gl.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('common.refresh', locale)}
              </Button>
              <Link href="/client/plan-comptable">
                <Button variant="outline" size="sm" className="border-slate-400">
                  <BookOpen className="h-4 w-4 mr-1.5" />
                  {t('acc.gl.chart_accounts', locale)}
                </Button>
              </Link>
              <Button
                onClick={handleLettrage}
                disabled={lettering || !societeId}
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                title={t('acc.gl.auto_match_title', locale)}
              >
                {lettering ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                {t('acc.gl.auto_match', locale)}
              </Button>
              <Button
                onClick={() => {
                  if (!societeId) return
                  window.location.href = `/api/comptable/grand-livre/export-xlsx?societe_id=${societeId}`
                }}
                disabled={!societeId}
                variant="outline"
                size="sm"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title={t('acc.gl.export_excel_title', locale)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                {t('acc.gl.export_excel', locale)}
              </Button>
              <Button
                onClick={() => handleAudit()}
                disabled={auditing || !societeId}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
              >
                {auditing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {t('acc.gl.run_lex_livre', locale)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAudit({ explain: true })}
                disabled={!societeId || auditing}
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                title="Lance l'audit + génère une explication IA détaillée"
              >
                {auditing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                {auditing ? 'Analyse IA...' : 'Audit + Explication IA'}
              </Button>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('acc.gl.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
          </div>
        ) : (
          <>
            {audit && <AuditPanel audit={audit} locale={locale} />}

            {/* Synthèse comptable */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={t('acc.gl.total_debit', locale)} value={fmt(totalDebit)} tone="green" />
              <KpiCard label={t('acc.gl.total_credit', locale)} value={fmt(totalCredit)} tone="rose" />
              <KpiCard
                label={t('acc.gl.balance', locale)}
                value={fmt(ecart)}
                tone={Math.abs(ecart) < 0.01 ? "green" : "rose"}
                accent={Math.abs(ecart) >= 0.01}
              />
              <KpiCard
                label={t('acc.gl.result', locale)}
                value={fmt(resultat)}
                tone={resultat >= 0 ? "green" : "rose"}
              />
            </div>

            {/* Recherche */}
            <Card>
              <CardContent className="p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('acc.gl.search_placeholder', locale)}
                    className="pl-8 h-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sections par classe */}
            <div className="space-y-3">
              {getClasses(locale).map((cl) => {
                const arr = filteredByClass.get(cl.num) || []
                const open = openClasses.has(cl.num)
                const cls = colorMap[cl.color]
                const debit = arr.reduce((s, c) => s + c.total_debit, 0)
                const credit = arr.reduce((s, c) => s + c.total_credit, 0)
                const solde = debit - credit
                return (
                  <Card key={cl.num} className={`${cls.border} border-2`}>
                    <button
                      onClick={() => toggleClass(cl.num)}
                      className={`w-full ${cls.bg} hover:${cls.bgLight} transition-colors p-4 flex items-center justify-between gap-3 text-left`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`rounded-lg ${cls.bgLight} p-2.5 ${cls.text}`}>
                          <cl.Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`font-bold ${cls.text}`}>
                            {t('acc.gl.class_label', locale)} {cl.num} — {cl.label}
                          </h3>
                          <p className="text-xs text-muted-foreground">{cl.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-mono flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">{t('acc.gl.accounts_word', locale)}</div>
                          <div className={`font-bold ${cls.text}`}>{arr.length}</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-muted-foreground uppercase">{t('acc.pcm.debit', locale)}</div>
                          <div className="text-green-700">{fmt(debit)}</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-muted-foreground uppercase">{t('acc.pcm.credit', locale)}</div>
                          <div className="text-rose-700">{fmt(credit)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">{t('acc.bnq.balance_short', locale)}</div>
                          <div
                            className={`font-bold ${
                              solde >= 0 ? "text-green-700" : "text-rose-700"
                            }`}
                          >
                            {fmt(solde)}
                          </div>
                        </div>
                        {open ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {open && (
                      <div className="border-t bg-white">
                        {arr.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground italic">
                            {search.trim()
                              ? t('acc.gl.no_match_in_class', locale)
                              : t('acc.gl.no_account_class', locale)}
                          </p>
                        ) : (
                          <div className="divide-y">
                            {arr.map((c) => {
                              const isOpenCompte = openCompte === c.numero_compte
                              const compteEcritures = ecritures
                                .filter((e) => e.numero_compte === c.numero_compte)
                                .sort((a, b) =>
                                  (b.date_ecriture || "").localeCompare(a.date_ecriture || "")
                                )
                              return (
                                <div key={c.numero_compte}>
                                  <button
                                    onClick={() =>
                                      setOpenCompte(isOpenCompte ? null : c.numero_compte)
                                    }
                                    className="w-full flex items-start justify-between gap-3 p-3 hover:bg-muted/30 text-left"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {isOpenCompte ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        <Badge
                                          variant="outline"
                                          className={`text-[11px] font-mono ${cls.bgLight} ${cls.text}`}
                                        >
                                          {c.numero_compte}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {c.nb_ecritures} {c.nb_ecritures > 1 ? t('acc.gl.entry_plural', locale) : t('acc.gl.entry_singular', locale)}
                                        </span>
                                      </div>
                                      {c.libelle && (
                                        <p className="text-sm mt-1 break-words pl-5">
                                          {c.libelle}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right flex-shrink-0 font-mono text-sm space-y-0.5">
                                      <p className="text-[11px] text-muted-foreground">
                                        D {fmt(c.total_debit)} · C {fmt(c.total_credit)}
                                      </p>
                                      <p
                                        className={`text-base font-medium ${
                                          c.solde >= 0 ? "text-green-700" : "text-rose-700"
                                        }`}
                                      >
                                        {c.solde >= 0 ? (
                                          <TrendingUp className="inline h-3 w-3 mr-0.5" />
                                        ) : (
                                          <TrendingDown className="inline h-3 w-3 mr-0.5" />
                                        )}
                                        {fmt(c.solde)} MUR
                                      </p>
                                    </div>
                                  </button>
                                  {isOpenCompte && (
                                    <EcrituresDetail
                                      ecritures={compteEcritures}
                                      compte={c.numero_compte}
                                      locale={locale}
                                    />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function AuditPanel({ audit, locale }: { audit: AuditResult; locale: Locale }) {
  const issues = audit.issues || []
  const score = audit.score || 0
  const severity = audit.severity || "ok"
  const summary = audit.summary || {}

  const headerColor =
    severity === "critical"
      ? "border-red-300 bg-gradient-to-br from-red-50 to-rose-50"
      : severity === "warning"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"
        : "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50"
  const scoreColor =
    score >= 80 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700"

  return (
    <div className="space-y-3">
      {audit.explanation && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-purple-900">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Analyse IA — Lex Livre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-sm leading-relaxed">
              {audit.explanation.split('\n').map((line: string, i: number) => {
                if (line.startsWith('## ')) {
                  return <h3 key={i} className="font-semibold text-purple-900 mt-3 mb-1">{line.slice(3)}</h3>
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return <p key={i} className="ml-4 text-gray-700">• {renderInline(line.slice(2))}</p>
                }
                if (line.trim() === '') return <div key={i} className="h-2" />
                return <p key={i} className="text-gray-800 mb-1">{renderInline(line)}</p>
              })}
            </div>
          </CardContent>
        </Card>
      )}
    <div className={`rounded-xl border-2 p-4 ${headerColor}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-600 p-2.5 text-white shadow-md">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold flex items-center gap-2">
              {t('acc.gl.lex_audit_title', locale)}
              <Badge className="bg-purple-600 text-white text-[10px]">{t('acc.rap.ai_agent', locale)}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.total_ecritures} {t('acc.gl.entries_word', locale)} · D {fmt(summary.total_debit || 0)} · C{" "}
              {fmt(summary.total_credit || 0)} · {t('acc.gl.gap_word', locale)}{" "}
              <span
                className={
                  Math.abs(summary.ecart_balance || 0) > 0.01
                    ? "text-red-700 font-medium"
                    : "text-green-700"
                }
              >
                {fmt(summary.ecart_balance || 0)}
              </span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
          <div className="text-xs text-muted-foreground">{t('acc.gl.health', locale)}</div>
        </div>
      </div>
      {issues.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          {t('acc.gl.no_anomaly', locale)}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {issues.map((issue: any, i: number) => {
            const Icon =
              issue.severity === "critical"
                ? XCircle
                : issue.severity === "warning"
                  ? AlertTriangle
                  : Info
            const cls =
              issue.severity === "critical"
                ? "text-red-700"
                : issue.severity === "warning"
                  ? "text-amber-700"
                  : "text-blue-700"
            return (
              <div key={i} className={`flex items-start gap-2 text-xs ${cls}`}>
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{issue.message}</span>
              </div>
            )
          })}
        </div>
      )}
      {audit.comptes_hors_pcm && audit.comptes_hors_pcm.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-amber-700">
            {t('acc.gl.accounts_off_pcm', locale)} ({audit.comptes_hors_pcm.length})
          </summary>
          <div className="mt-2 space-y-0.5">
            {audit.comptes_hors_pcm.slice(0, 10).map((c: any) => (
              <div key={c.numero} className="flex justify-between gap-2 font-mono">
                <span>{c.numero}</span>
                <span className="text-muted-foreground">
                  {c.nb} {t('acc.gl.entries_short', locale)} · {t('acc.gl.balance_short', locale)} {fmt((c.debit - c.credit) || 0)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>

    {/* Bloc 1 — Drill-down balance déséquilibrée */}
    {audit.drill_down_balance && audit.drill_down_balance.length > 0 && (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Comptes contribuant à l'écart de balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y text-sm">
            {audit.drill_down_balance.map((c, i: number) => (
              <div key={i} className="flex justify-between py-1.5">
                <span className="font-mono">{c.numero}</span>
                <span className={`font-mono ${c.ecart > 0 ? 'text-green-700' : 'text-rose-700'}`}>
                  {c.ecart > 0 ? '+' : ''}{c.ecart.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Bloc 2 — Résumé TVA */}
    {audit.tva_summary && (audit.tva_summary.ttc_collectee !== 0 || audit.tva_summary.ttc_deductible !== 0) && (
      <Card>
        <CardHeader><CardTitle className="text-sm">Résumé TVA</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>TVA collectée (4457)</div>
            <div className="font-mono text-right">{audit.tva_summary.ttc_collectee.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR</div>
            <div>TVA déductible (4456)</div>
            <div className="font-mono text-right">{audit.tva_summary.ttc_deductible.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR</div>
            <div>TVA à payer (4455)</div>
            <div className="font-mono text-right font-semibold">{audit.tva_summary.a_payer.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR</div>
            {Math.abs(audit.tva_summary.ecart_calcul) > 1 && (
              <>
                <div className="text-rose-700">Écart calcul</div>
                <div className="font-mono text-right text-rose-700">{audit.tva_summary.ecart_calcul.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR</div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Bloc 3 — Tiers inversés */}
    {audit.tiers_inverses && audit.tiers_inverses.length > 0 && (
      <Card className="border-amber-200">
        <CardHeader>
          <CardTitle className="text-sm">Tiers avec solde inversé ({audit.tiers_inverses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-2">Clients en créditeur (acomptes reçus) ou fournisseurs en débiteur (acomptes versés). À reclasser en 4191/4091.</p>
          <div className="divide-y text-sm">
            {audit.tiers_inverses.slice(0, 5).map((tiers, i: number) => (
              <div key={i} className="flex justify-between py-1.5">
                <span><span className="font-mono">{tiers.numero}</span> — {tiers.sens === 'client_crediteur' ? 'Client créditeur' : 'Fournisseur débiteur'}</span>
                <span className="font-mono">{tiers.solde.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MUR</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {/* Bloc 4 — Écritures futures + dates non ouvrées */}
    {((audit.ecritures_futures && audit.ecritures_futures.length > 0) || (audit.ecritures_weekend_ferie && audit.ecritures_weekend_ferie > 0)) && (
      <Card className="border-amber-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            Dates suspectes
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {audit.ecritures_futures && audit.ecritures_futures.length > 0 && (
            <div>
              <div className="font-medium text-amber-800 mb-1">Écritures dans le futur ({audit.ecritures_futures.length})</div>
              <div className="divide-y text-xs">
                {audit.ecritures_futures.slice(0, 5).map((e, i: number) => (
                  <div key={i} className="flex justify-between py-1 gap-2">
                    <span className="font-mono whitespace-nowrap">{e.date}</span>
                    <span className="font-mono">{e.compte}</span>
                    <span className="text-gray-600 truncate" title={e.libelle}>{e.libelle}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {audit.ecritures_weekend_ferie && audit.ecritures_weekend_ferie > 0 ? (
            <div className="text-xs text-amber-800">
              <span className="font-semibold">{audit.ecritures_weekend_ferie}</span> écriture(s) datée(s) sur un weekend ou jour férié.
            </div>
          ) : null}
        </CardContent>
      </Card>
    )}

    {/* Bloc 5 — Bulletins de paie orphelins */}
    {audit.bulletins_orphelins !== undefined && audit.bulletins_orphelins > 0 && (
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="text-sm text-orange-700">{audit.bulletins_orphelins} bulletin(s) de paie sans écritures</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">Ces bulletins sont marqués comptabilisés mais n'ont pas d'écritures correspondantes en DB. Régénère-les via la page Paie ou le bouton ci-dessous.</p>
        </CardContent>
      </Card>
    )}
    </div>
  )
}

function EcrituresDetail({
  ecritures,
  compte,
  locale,
}: {
  ecritures: Ecriture[]
  compte: string
  locale: Locale
}) {
  if (ecritures.length === 0) {
    return (
      <div className="px-4 pb-3 pt-1 bg-muted/20 text-xs text-muted-foreground italic border-t">
        {t('acc.gl.no_entries_account', locale)}
      </div>
    )
  }
  const totalD = ecritures.reduce((s, e) => s + e.debit_mur, 0)
  const totalC = ecritures.reduce((s, e) => s + e.credit_mur, 0)
  return (
    <div className="bg-slate-50 border-t">
      <div className="px-4 py-2 text-[11px] flex items-center justify-between gap-3 border-b">
        <span className="text-muted-foreground font-medium">
          {t('acc.gl.detail_entries_for', locale)} <span className="font-mono">{compte}</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono">
            D <span className="text-green-700">{fmt(totalD)}</span> · C{" "}
            <span className="text-rose-700">{fmt(totalC)}</span>
          </span>
          {/* Lien vers la page d'édition pré-filtrée sur ce compte —
              demande utilisateur : "il manque le lien pour pouvoir
              modifier les écritures depuis le grand livre". */}
          <Link
            href={`/client/ecritures?compte=${encodeURIComponent(compte)}`}
            className="text-[11px] underline text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
            title="Ouvrir ces écritures sur la page d'édition (Modifier / Supprimer)"
          >
            ✏️ Modifier
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('common.date', locale)}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('acc.gl.col_journal', locale)}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('acc.gl.col_label', locale)}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('acc.pcm.debit', locale)}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('acc.pcm.credit', locale)}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('acc.gl.col_letter', locale)}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('acc.gl.col_ref', locale)}</th>
            </tr>
          </thead>
          <tbody>
            {ecritures.map((e) => (
              <tr key={e.id} className="border-b border-slate-200 hover:bg-white">
                <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                  {e.date_ecriture
                    ? new Date(e.date_ecriture).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')
                    : "—"}
                </td>
                <td className="px-2 py-1.5">
                  {e.journal && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {e.journal}
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-1.5 max-w-md truncate" title={e.libelle || ""}>
                  {e.libelle || "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-green-700">
                  {e.debit_mur > 0 ? fmt(e.debit_mur) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-rose-700">
                  {e.credit_mur > 0 ? fmt(e.credit_mur) : "—"}
                </td>
                <td className="px-2 py-1.5">
                  {e.lettre && (
                    <Badge className="text-[10px] font-mono bg-green-100 text-green-700 border-green-300">
                      {e.lettre}
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-muted-foreground font-mono">
                  {e.ref_folio || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <Card className={`${cls} ${accent ? "ring-2 ring-red-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
