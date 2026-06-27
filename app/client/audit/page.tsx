"use client"

import { useState } from "react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Loader2, ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle, FileSearch,
  FileDown, Sheet, Sparkles,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Exercices fiscaux mauriciens (juillet→juin), 3 derniers, calculés client-side. */
function fiscalYearOptions(): string[] {
  const now = new Date()
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1 // FY commence en juillet
  return [0, 1, 2].map((d) => `${y - d}-${y - d + 1}`)
}

const SEV_META: Record<string, { color: string; icon: typeof AlertTriangle; key: string }> = {
  critical: { color: "#DC2626", icon: AlertCircle, key: "aud.sev_critical" },
  warning: { color: "#D97706", icon: AlertTriangle, key: "aud.sev_warning" },
  info: { color: "#2563EB", icon: Info, key: "aud.sev_info" },
}

export default function AuditReadinessPage() {
  const locale = getLocale()
  const { societeId, societe, loading: loadingSociete } = useSocieteActive()
  const years = fiscalYearOptions()
  const [exercice, setExercice] = useState<string>(years[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [memo, setMemo] = useState<string | null>(null)
  const [memoLoading, setMemoLoading] = useState(false)

  const regime = (societe as any)?.regime as string | undefined
  const isDomestic = regime === "domestic" || regime == null

  async function generate() {
    if (!societeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/comptable/gbc/audit?societe_id=${societeId}&exercice=${exercice}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "error")
      setData(json)
      setMemo(null)
    } catch (e: any) {
      setError(e?.message || t("aud.error", locale))
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    if (!data) return
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const rows: string[] = []
    rows.push(["Rubrique", "Solde N", "Solde N-1", "Variation", "Variation %", "A investiguer"].map(esc).join(","))
    for (const ls of data.leadSchedules || []) {
      rows.push([ls.caption, ls.total_n, ls.total_n1, ls.variation, ls.variation_pct ?? "", ls.flagged ? "oui" : ""].map(esc).join(","))
    }
    rows.push("")
    rows.push(["Test", "Sévérité", "Constat", "Explication"].map(esc).join(","))
    for (const f of data.findings || []) {
      rows.push([f.test, f.severity, f.titre, f.explication].map(esc).join(","))
    }
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-readiness_${data.societe?.nom || "societe"}_${data.exercice}.csv`.replace(/\s+/g, "_")
    a.click()
    URL.revokeObjectURL(url)
  }

  async function generateMemo() {
    if (!societeId) return
    setMemoLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/audit/memo?societe_id=${societeId}&exercice=${exercice}&locale=${locale}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "error")
      setMemo(json.memo)
    } catch (e: any) {
      setMemo(`⚠️ ${e?.message || t("aud.error", locale)}`)
    } finally {
      setMemoLoading(false)
    }
  }

  if (loadingSociete) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  if (!societeId) {
    return <ClientPageShell><div className="p-6">{t("aud.no_societe", locale)}</div></ClientPageShell>
  }

  return (
    <ClientPageShell>
      <div className="space-y-6 p-4 md:p-6">
        {/* En-tête */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold" style={{ color: NAVY, fontFamily: "'Poppins', sans-serif" }}>
              <ShieldCheck className="h-7 w-7" style={{ color: GOLD }} />
              {t("aud.title", locale)}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{t("aud.subtitle", locale)}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={exercice}
              onChange={(e) => setExercice(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              aria-label={t("aud.exercice", locale)}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button onClick={generate} disabled={loading} style={{ backgroundColor: NAVY, color: "#fff" }}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
              {t("aud.generate", locale)}
            </Button>
          </div>
        </div>

        {/* Disclaimer légal — toujours visible */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("aud.disclaimer_short", locale)}</span>
        </div>

        {/* Bandeau GBC-only (informatif, non bloquant) */}
        {isDomestic && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="font-semibold" style={{ color: NAVY }}>{t("aud.gbc_only_title", locale)}</div>
            <div className="mt-1 text-sm text-slate-600">{t("aud.gbc_only_body", locale)}</div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />{t("aud.loading", locale)}</div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {data && !loading && (
          <>
            {/* Synthèse */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card><CardContent className="p-4">
                <div className="text-xs text-slate-500">{t("aud.summary", locale)}</div>
                <div className="mt-1 flex items-center gap-2 font-semibold" style={{ color: data.equilibre ? "#16A34A" : "#DC2626" }}>
                  {data.equilibre ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {data.equilibre ? t("aud.balanced", locale) : t("aud.unbalanced", locale)}
                </div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-xs text-slate-500">{t("aud.materiality", locale)}</div>
                <div className="mt-1 font-semibold" style={{ color: NAVY }}>{fmt(data.materialite?.seuil)} {data.devise}</div>
                <div className="text-[11px] text-slate-400">{data.materialite?.methode}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-xs text-slate-500">{t("aud.criticals", locale)} / {t("aud.warnings", locale)}</div>
                <div className="mt-1 font-semibold">
                  <span style={{ color: "#DC2626" }}>{data.resume?.nb_findings_critical}</span>
                  {" / "}
                  <span style={{ color: "#D97706" }}>{data.resume?.nb_findings_warning}</span>
                </div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-xs text-slate-500">{t("aud.pbc_progress", locale)}</div>
                <div className="mt-1 font-semibold" style={{ color: NAVY }}>{data.resume?.pbc_fournis} / {data.resume?.pbc_total}</div>
              </CardContent></Card>
            </div>

            {/* Barre d'export + mémo IA */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/comptable/gbc/audit/export-pdf?societe_id=${societeId}&exercice=${exercice}`} target="_blank" rel="noopener noreferrer">
                  <FileDown className="mr-2 h-4 w-4" />{t("aud.export_pdf", locale)}
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Sheet className="mr-2 h-4 w-4" />{t("aud.export_csv", locale)}
              </Button>
              <Button size="sm" onClick={generateMemo} disabled={memoLoading} style={{ backgroundColor: GOLD, color: NAVY }}>
                {memoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {t("aud.memo_generate", locale)}
              </Button>
            </div>

            {/* Synthèse exécutive IA */}
            {(memoLoading || memo) && (
              <Card><CardContent className="p-4">
                <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold" style={{ color: NAVY }}>
                  <Sparkles className="h-4 w-4" style={{ color: GOLD }} />{t("aud.memo_title", locale)}
                </h2>
                <p className="mb-3 text-xs text-slate-400">{t("aud.memo_hint", locale)}</p>
                {memoLoading
                  ? <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />{t("aud.memo_loading", locale)}</div>
                  : <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{memo}</div>}
              </CardContent></Card>
            )}

            {/* Tests de cohérence */}
            <Card><CardContent className="p-4">
              <h2 className="mb-3 text-lg font-semibold" style={{ color: NAVY }}>{t("aud.tests", locale)}</h2>
              {(!data.findings || data.findings.length === 0) ? (
                <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />{t("aud.no_findings", locale)}</div>
              ) : (
                <div className="space-y-2">
                  {data.findings.map((f: any, i: number) => {
                    const meta = SEV_META[f.severity] || SEV_META.info
                    const Icon = meta.icon
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.color }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: NAVY }}>{f.titre}</span>
                            <Badge variant="outline" style={{ borderColor: meta.color, color: meta.color }}>{t(meta.key, locale)}</Badge>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-600">{f.explication}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent></Card>

            {/* Feuilles maîtresses */}
            <Card><CardContent className="p-4">
              <h2 className="mb-3 text-lg font-semibold" style={{ color: NAVY }}>{t("aud.lead_schedules", locale)}</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("aud.label", locale)}</TableHead>
                      <TableHead className="text-right">{t("aud.balance_n", locale)}</TableHead>
                      <TableHead className="text-right">{t("aud.balance_n1", locale)}</TableHead>
                      <TableHead className="text-right">{t("aud.variation", locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leadSchedules?.map((ls: any) => (
                      <TableRow key={ls.code} className={ls.flagged ? "bg-amber-50" : ""}>
                        <TableCell className="font-medium">
                          {ls.caption}
                          {ls.flagged && <Badge className="ml-2" variant="outline" style={{ borderColor: "#D97706", color: "#D97706" }}>{t("aud.flagged", locale)}</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(ls.total_n)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(ls.total_n1)}</TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: ls.variation >= 0 ? "#16A34A" : "#DC2626" }}>
                          {fmt(ls.variation)}{ls.variation_pct != null ? ` (${Math.round(ls.variation_pct)}%)` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>

            {/* PBC list */}
            <Card><CardContent className="p-4">
              <h2 className="mb-3 text-lg font-semibold" style={{ color: NAVY }}>{t("aud.pbc", locale)}</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("aud.pbc_category", locale)}</TableHead>
                      <TableHead>{t("aud.pbc_item", locale)}</TableHead>
                      <TableHead className="text-center">{t("aud.pbc_required", locale)}</TableHead>
                      <TableHead className="text-center">{t("aud.pbc_provided", locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pbc?.map((p: any) => (
                      <TableRow key={p.code}>
                        <TableCell className="text-slate-500">{p.categorie}</TableCell>
                        <TableCell>{p.intitule}</TableCell>
                        <TableCell className="text-center">{p.obligatoire ? t("aud.yes", locale) : t("aud.no", locale)}</TableCell>
                        <TableCell className="text-center">
                          {p.fourni
                            ? <CheckCircle2 className="mx-auto h-4 w-4" style={{ color: "#16A34A" }} />
                            : <XCircle className="mx-auto h-4 w-4" style={{ color: "#CBD5E1" }} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
