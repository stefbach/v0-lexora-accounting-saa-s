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

const CLASSES: Array<{
  num: number
  label: string
  desc: string
  color: string
  Icon: any
}> = [
  { num: 1, label: "Capitaux", desc: "Capital, réserves, emprunts long terme", color: "blue", Icon: Wallet },
  { num: 2, label: "Immobilisations", desc: "Actifs corporels, incorporels, financiers", color: "cyan", Icon: Building2 },
  { num: 3, label: "Stocks", desc: "Marchandises, matières premières, produits finis", color: "teal", Icon: Package },
  { num: 4, label: "Tiers", desc: "Clients, fournisseurs, État, personnel, associés", color: "amber", Icon: Users },
  { num: 5, label: "Trésorerie", desc: "Banque, caisse, virements internes", color: "purple", Icon: Landmark },
  { num: 6, label: "Charges", desc: "Achats, services extérieurs, salaires, impôts", color: "rose", Icon: ArrowDownCircle },
  { num: 7, label: "Produits", desc: "Ventes, prestations, produits financiers", color: "green", Icon: ArrowUpCircle },
]

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

  const handleAudit = async () => {
    if (!societeId) return
    setAuditing(true)
    try {
      const res = await fetch("/api/agent/grand-livre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, action: "audit" }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur Lex Livre", "error")
        return
      }
      setAudit(d)
      showToast(`Lex Livre : score ${d.score}/100`)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
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
        showToast(d?.error || "Erreur lettrage", "error")
        return
      }
      showToast(
        `Lettrage : ${d.pairs_created} paire(s), ${d.ecritures_lettrees} écriture(s) lettrée(s)`
      )
      load()
      // Re-audit pour refléter
      handleAudit()
    } catch (e: any) {
      showToast(e?.message || "Erreur lettrage", "error")
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
                title="Apparie les écritures 411x/401x du même tiers et même montant"
              >
                {lettering ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                {t('acc.gl.auto_match', locale)}
              </Button>
              <Button
                onClick={handleAudit}
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
            {audit && <AuditPanel audit={audit} />}

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
              {CLASSES.map((cl) => {
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
                            Classe {cl.num} — {cl.label}
                          </h3>
                          <p className="text-xs text-muted-foreground">{cl.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-mono flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">Comptes</div>
                          <div className={`font-bold ${cls.text}`}>{arr.length}</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-muted-foreground uppercase">Débit</div>
                          <div className="text-green-700">{fmt(debit)}</div>
                        </div>
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-muted-foreground uppercase">Crédit</div>
                          <div className="text-rose-700">{fmt(credit)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">Solde</div>
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
                              ? "Aucun compte ne correspond à la recherche dans cette classe"
                              : "Aucun compte mouvementé dans cette classe"}
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
                                          {c.nb_ecritures} écriture{c.nb_ecritures > 1 ? "s" : ""}
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

function AuditPanel({ audit }: { audit: any }) {
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
    <div className={`rounded-xl border-2 p-4 ${headerColor}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-600 p-2.5 text-white shadow-md">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold flex items-center gap-2">
              Lex Livre — Audit Grand Livre
              <Badge className="bg-purple-600 text-white text-[10px]">Agent IA</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.total_ecritures} écritures · D {fmt(summary.total_debit || 0)} · C{" "}
              {fmt(summary.total_credit || 0)} · écart{" "}
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
          <div className="text-xs text-muted-foreground">/100 santé</div>
        </div>
      </div>
      {issues.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Aucune anomalie détectée — grand livre propre.
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
      {audit.comptes_hors_pcm?.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-amber-700">
            Comptes hors PCM ({audit.comptes_hors_pcm.length})
          </summary>
          <div className="mt-2 space-y-0.5">
            {audit.comptes_hors_pcm.slice(0, 10).map((c: any) => (
              <div key={c.numero} className="flex justify-between gap-2 font-mono">
                <span>{c.numero}</span>
                <span className="text-muted-foreground">
                  {c.nb} écr. · solde {fmt((c.debit - c.credit) || 0)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function EcrituresDetail({
  ecritures,
  compte,
}: {
  ecritures: Ecriture[]
  compte: string
}) {
  if (ecritures.length === 0) {
    return (
      <div className="px-4 pb-3 pt-1 bg-muted/20 text-xs text-muted-foreground italic border-t">
        Aucune écriture pour ce compte.
      </div>
    )
  }
  const totalD = ecritures.reduce((s, e) => s + e.debit_mur, 0)
  const totalC = ecritures.reduce((s, e) => s + e.credit_mur, 0)
  return (
    <div className="bg-slate-50 border-t">
      <div className="px-4 py-2 text-[11px] flex items-center justify-between gap-3 border-b">
        <span className="text-muted-foreground font-medium">
          Détail des écritures du compte <span className="font-mono">{compte}</span>
        </span>
        <span className="font-mono">
          D <span className="text-green-700">{fmt(totalD)}</span> · C{" "}
          <span className="text-rose-700">{fmt(totalC)}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Date</th>
              <th className="px-2 py-1.5 text-left font-medium">Journal</th>
              <th className="px-2 py-1.5 text-left font-medium">Libellé</th>
              <th className="px-2 py-1.5 text-right font-medium">Débit</th>
              <th className="px-2 py-1.5 text-right font-medium">Crédit</th>
              <th className="px-2 py-1.5 text-left font-medium">Lettre</th>
              <th className="px-2 py-1.5 text-left font-medium">Réf.</th>
            </tr>
          </thead>
          <tbody>
            {ecritures.map((e) => (
              <tr key={e.id} className="border-b border-slate-200 hover:bg-white">
                <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                  {e.date_ecriture
                    ? new Date(e.date_ecriture).toLocaleDateString("fr-FR")
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
