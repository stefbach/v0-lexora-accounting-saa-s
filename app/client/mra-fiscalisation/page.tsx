"use client"

/**
 * Page /client/mra-fiscalisation — supervision e-invoicing MRA EBS.
 *
 * Donne au comptable / dirigeant une vue centralisée :
 *   - KPI rapides (fiscalisées / en attente / en erreur)
 *   - Liste des factures en erreur avec dernier message MRA + retry
 *   - Liste des factures non encore fiscalisées + bouton de retry par lot
 *   - Historique des 50 dernières tentatives (audit IFP 7 ans)
 *
 * Le retry par lot enchaîne les POST individuels avec un délai entre
 * chaque appel pour respecter le rate-limit MRA.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock, FileText, ShieldCheck } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface FactureRow {
  id: string
  numero_facture: string | null
  tiers: string | null
  date_facture: string | null
  montant_ttc: number
  devise: string | null
  type_document: string | null
  last_error?: string | null
}

interface LogRow {
  id: string
  facture_id: string | null
  action: string
  success: boolean
  irn: string | null
  http_status: number | null
  duration_ms: number | null
  error_code: string | null
  error_message: string | null
  source: string
  environment: string
  created_at: string
}

interface Stats {
  total_eligible: number
  fiscalised: number
  failed: number
  pending: number
}

function fmt(n: number, d = "MUR") {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + d
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}
function fmtDateTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function MraFiscalisationPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState<FactureRow[]>([])
  const [pending, setPending] = useState<FactureRow[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; ok: number; ko: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/client/mra-fiscalisation?societe_id=${societeId}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Erreur chargement")
      setStats(j.stats)
      setFailed(j.failed || [])
      setPending(j.pending || [])
      setLogs(j.logs || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { load() }, [load])

  async function fiscaliseOne(id: string): Promise<{ ok: boolean; msg?: string }> {
    try {
      const r = await fetch(`/api/client/factures/${id}/fiscalise`, { method: "POST" })
      const j = await r.json()
      if (!r.ok || j.ok === false) return { ok: false, msg: j.error || `HTTP ${r.status}` }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, msg: e?.message || "Erreur réseau" }
    }
  }

  async function retryOne(id: string) {
    setRetrying(prev => ({ ...prev, [id]: true }))
    const res = await fiscaliseOne(id)
    setRetrying(prev => ({ ...prev, [id]: false }))
    if (res.ok) {
      showToast("Facture fiscalisée", "success")
      load()
    } else {
      showToast(res.msg || "Échec fiscalisation", "error")
    }
  }

  async function bulkFiscalise(rows: FactureRow[]) {
    if (rows.length === 0) return
    if (!confirm(`Fiscaliser ${rows.length} facture(s) à la suite ? Un délai d'1s sépare chaque appel pour respecter le rate-limit MRA.`)) return
    setBulkRunning(true)
    let ok = 0, ko = 0
    for (let i = 0; i < rows.length; i++) {
      setBulkProgress({ done: i, total: rows.length, ok, ko })
      const r = await fiscaliseOne(rows[i].id)
      if (r.ok) ok++; else ko++
      if (i < rows.length - 1) await new Promise(res => setTimeout(res, 1000))
    }
    setBulkProgress({ done: rows.length, total: rows.length, ok, ko })
    setBulkRunning(false)
    showToast(`${ok} fiscalisée(s), ${ko} échec(s)`, ko === 0 ? "success" : "error")
    load()
  }

  const successRate = useMemo(() => {
    if (!stats || stats.total_eligible === 0) return 0
    return Math.round((stats.fiscalised / stats.total_eligible) * 100)
  }, [stats])

  return (
    <ClientPageShell>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              MRA e-Invoicing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Supervision de la fiscalisation des factures auprès de la Mauritius Revenue Authority (EBS).
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Rafraîchir
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Éligibles" value={stats?.total_eligible ?? "—"} tone="blue" />
          <KpiCard label="Fiscalisées" value={stats?.fiscalised ?? "—"} tone="green" hint={stats ? `${successRate}%` : undefined} />
          <KpiCard label="En attente" value={stats?.pending ?? "—"} tone="amber" />
          <KpiCard label="En erreur" value={stats?.failed ?? "—"} tone="rose" />
        </div>

        {bulkProgress && (
          <Card>
            <CardContent className="py-3">
              <div className="text-sm font-medium mb-1">
                Fiscalisation en lot : {bulkProgress.done} / {bulkProgress.total}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {bulkProgress.ok} succès · {bulkProgress.ko} échec(s)
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="failed">
          <TabsList>
            <TabsTrigger value="failed">
              En erreur
              {failed.length > 0 && <Badge className="ml-2 bg-red-100 text-red-700 border-red-300">{failed.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pending">
              En attente
              {pending.length > 0 && <Badge className="ml-2 bg-amber-100 text-amber-700 border-amber-300">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="logs">Historique</TabsTrigger>
          </TabsList>

          <TabsContent value="failed">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Factures en erreur de fiscalisation
                  </CardTitle>
                  {failed.length > 0 && (
                    <Button size="sm" variant="outline" disabled={bulkRunning} onClick={() => bulkFiscalise(failed)}>
                      {bulkRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Tout réessayer ({failed.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <FactureTable rows={failed} retrying={retrying} onRetry={retryOne} emptyText="Aucune erreur. ✓" showError />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Factures non fiscalisées
                  </CardTitle>
                  {pending.length > 0 && (
                    <Button size="sm" variant="outline" disabled={bulkRunning} onClick={() => bulkFiscalise(pending)}>
                      {bulkRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                      Fiscaliser tout ({pending.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <FactureTable rows={pending} retrying={retrying} onRetry={retryOne} emptyText="Toutes les factures sont fiscalisées. ✓" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-600" />
                  50 dernières tentatives
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aucune tentative enregistrée.</p>
                ) : (
                  <div className="divide-y text-sm">
                    {logs.map(l => (
                      <div key={l.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] ${l.success ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
                              {l.success ? '✓' : '✗'} {l.action}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">{l.environment}</Badge>
                            <Badge variant="outline" className="text-[10px]">{l.source}</Badge>
                            {l.http_status != null && (
                              <span className="text-[10px] text-muted-foreground font-mono">HTTP {l.http_status}</span>
                            )}
                            {l.duration_ms != null && (
                              <span className="text-[10px] text-muted-foreground font-mono">{l.duration_ms}ms</span>
                            )}
                          </div>
                          {l.irn && (
                            <p className="text-xs font-mono text-emerald-700 mt-0.5">IRN : {l.irn}</p>
                          )}
                          {l.error_message && (
                            <p className="text-xs text-red-700 mt-0.5">{l.error_code ? `[${l.error_code}] ` : ''}{l.error_message}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] text-muted-foreground">{fmtDateTime(l.created_at)}</p>
                          {l.facture_id && (
                            <Link href={`/client/facture-preview?facture_id=${l.facture_id}`} className="text-[11px] text-blue-600 hover:underline">
                              Voir facture
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </ClientPageShell>
  )
}

function KpiCard({ label, value, tone, hint }: { label: string; value: number | string; tone?: "amber" | "green" | "rose" | "blue"; hint?: string }) {
  const cls = tone === "amber" ? "border-amber-200 bg-amber-50"
    : tone === "green" ? "border-green-200 bg-green-50"
    : tone === "rose" ? "border-rose-200 bg-rose-50"
    : tone === "blue" ? "border-blue-200 bg-blue-50"
    : "border-gray-200 bg-white"
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function FactureTable({
  rows,
  retrying,
  onRetry,
  emptyText,
  showError,
}: {
  rows: FactureRow[]
  retrying: Record<string, boolean>
  onRetry: (id: string) => void
  emptyText: string
  showError?: boolean
}) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  return (
    <div className="divide-y">
      {rows.map(f => (
        <div key={f.id} className="p-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">{f.numero_facture || f.id.slice(0, 8)}</span>
              {f.type_document && f.type_document !== "facture" && (
                <Badge variant="outline" className="text-[10px]">
                  {f.type_document === "avoir" ? "Avoir" : f.type_document === "note_debit" ? "Note de débit" : f.type_document}
                </Badge>
              )}
            </div>
            <p className="text-sm mt-0.5 break-words">{f.tiers || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Émise : {fmtDate(f.date_facture)} · {fmt(f.montant_ttc, f.devise || "MUR")}
            </p>
            {showError && f.last_error && (
              <p className="text-xs text-red-700 mt-1 italic">⚠ {f.last_error}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(f.id)}
              disabled={retrying[f.id]}
              className="h-7 px-2 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {retrying[f.id] ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
              {showError ? "Réessayer" : "Fiscaliser"}
            </Button>
            <Link href={`/client/facture-preview?facture_id=${f.id}`} className="text-[11px] text-blue-600 hover:underline">
              Aperçu
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
