"use client"

/**
 * Page /client/relances — relances automatiques de factures impayées.
 *
 * Permet de prévisualiser les factures à relancer, choisir les canaux,
 * lancer une simulation (dry_run) ou un envoi réel, et consulter
 * l'historique. Sert aussi d'interface manuelle pour les sociétés qui
 * n'activent pas le cron quotidien.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  Mail,
  MessageCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  RefreshCw,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { EmptyState } from "@/components/ui/empty-state"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from "@/lib/i18n"

type Canal = "email" | "whatsapp"

interface FactureARelancer {
  facture_id: string
  societe_id: string
  numero_facture: string
  tiers: string
  date_facture: string
  date_echeance: string
  jours_retard: number
  solde_du_mur: number
  devise: string
  montant_ttc: number
  niveau: 1 | 2 | 3
  contact_email: string | null
  contact_phone: string | null
}

interface SocieteConfig {
  societe_nom: string
  relances_actif: boolean
  canaux: Canal[]
  delais_jours: Record<"1" | "2" | "3", number>
}

interface HistoriqueRow {
  id: string
  facture_id: string
  niveau: number
  canal: Canal
  statut: string
  destinataire: string | null
  sujet: string | null
  error: string | null
  dry_run: boolean
  source: string
  date_envoi: string
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}

function formatDateTime(d: string): string {
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const NIVEAU_COLORS: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 border-amber-300",
  2: "bg-orange-100 text-orange-700 border-orange-300",
  3: "bg-red-100 text-red-700 border-red-300",
}

function niveauLabel(niveau: number, locale: Locale): string {
  if (niveau === 1) return t('inv.rel.level1', locale)
  if (niveau === 2) return t('inv.rel.level2', locale)
  if (niveau === 3) return t('inv.rel.level3', locale)
  return ''
}

export default function ClientRelancesPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [config, setConfig] = useState<SocieteConfig | null>(null)
  const [factures, setFactures] = useState<FactureARelancer[]>([])
  const [historique, setHistorique] = useState<HistoriqueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [canauxOverride, setCanauxOverride] = useState<Canal[] | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [previewRes, histRes] = await Promise.all([
        fetch(`/api/client/relances?societe_id=${societeId}`),
        fetch(`/api/client/relances/historique?societe_id=${societeId}&limit=100`),
      ])
      const preview = await previewRes.json()
      const hist = await histRes.json()
      setConfig(preview?.config || null)
      setFactures(preview?.factures || [])
      setHistorique(hist?.historique || [])
      setSelectedIds(new Set((preview?.factures || []).map((f: FactureARelancer) => f.facture_id)))
    } catch {
      showToast(t('inv.rel.toast_error_load', locale), "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, locale])

  useEffect(() => {
    load()
  }, [load])

  const canauxEffectifs: Canal[] = useMemo(() => {
    if (canauxOverride && canauxOverride.length > 0) return canauxOverride
    return config?.canaux ?? ["email"]
  }, [config, canauxOverride])

  const stats = useMemo(() => {
    const parNiveau = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>
    let totalDu = 0
    let sansEmail = 0
    let sansPhone = 0
    for (const f of factures) {
      parNiveau[f.niveau] += 1
      totalDu += f.solde_du_mur
      if (!f.contact_email) sansEmail += 1
      if (!f.contact_phone) sansPhone += 1
    }
    return { parNiveau, totalDu, sansEmail, sansPhone }
  }, [factures])

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === factures.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(factures.map((f) => f.facture_id)))
  }

  function toggleCanal(c: Canal) {
    setCanauxOverride((prev) => {
      const base = prev ?? config?.canaux ?? ["email"]
      const set = new Set(base)
      if (set.has(c)) set.delete(c)
      else set.add(c)
      return Array.from(set) as Canal[]
    })
  }

  async function runRelances(dry_run: boolean) {
    if (!societeId) return
    if (selectedIds.size === 0) {
      showToast(t('inv.rel.toast_select_invoice', locale), "error")
      return
    }
    if (canauxEffectifs.length === 0) {
      showToast(t('inv.rel.toast_select_channel', locale), "error")
      return
    }
    if (!dry_run) {
      const ok = window.confirm(
        t('inv.rel.confirm_send', locale)
          .replace('{n}', String(selectedIds.size))
          .replace('{channels}', canauxEffectifs.join(" + ")),
      )
      if (!ok) return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/relances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          facture_ids: Array.from(selectedIds),
          canaux: canauxEffectifs,
          dry_run,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error || t('inv.rel.toast_error', locale), "error")
        return
      }
      const s = data?.summary
      showToast(
        `${dry_run ? t('inv.rel.summary_sim', locale) : t('inv.rel.summary_send', locale)} : ${s?.envois_ok ?? 0} ${t('inv.rel.summary_ok', locale)} ${s?.envois_echec ?? 0} ${t('inv.rel.summary_fail', locale)}`,
        s?.envois_echec > 0 ? "error" : "success",
      )
      await load()
    } catch (e: any) {
      showToast(e?.message || t('inv.rel.toast_error_network', locale), "error")
    } finally {
      setSubmitting(false)
    }
  }

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
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 p-3 text-white shadow-md">
                <Send className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-amber-900">{t('inv.rel.title', locale)}</h1>
                <p className="text-sm text-amber-800/80 mt-0.5">
                  {t('inv.rel.subtitle', locale)}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {t('inv.rel.refresh', locale)}
            </Button>
          </div>
        </div>

        {/* Config société */}
        {config && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('inv.rel.config', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('inv.rel.auto_cron', locale)}</span>
                {config.relances_actif ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {t('inv.rel.enabled', locale)}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t('inv.rel.disabled', locale)}</Badge>
                )}
              </div>
              <div className="text-muted-foreground">
                {t('inv.rel.delays_prefix', locale)}{config.delais_jours["1"]}{t('inv.rel.delays_firm', locale)}{config.delais_jours["2"]}{t('inv.rel.delays_med', locale)}{config.delais_jours["3"]}{t('inv.rel.delays_suffix', locale)}
              </div>
            </CardContent>
          </Card>
        )}

        {!societeId ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={AlertTriangle}
                title={t('inv.rel.no_societe', locale)}
              />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{t('inv.rel.kpi_l1', locale)}</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[1]}</div>
                </CardContent>
              </Card>
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{t('inv.rel.kpi_l2', locale)}</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[2]}</div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{t('inv.rel.kpi_l3', locale)}</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[3]}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{t('inv.rel.kpi_total', locale)}</div>
                  <div className="text-xl font-semibold mt-1 font-mono">{fmt(stats.totalDu, "MUR")}</div>
                </CardContent>
              </Card>
            </div>

            {/* Canaux & actions */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">{t('inv.rel.channels', locale)}</span>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={canauxEffectifs.includes("email")}
                      onCheckedChange={() => toggleCanal("email")}
                    />
                    <Mail className="h-4 w-4" /> {t('inv.rel.email', locale)}
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={canauxEffectifs.includes("whatsapp")}
                      onCheckedChange={() => toggleCanal("whatsapp")}
                    />
                    <MessageCircle className="h-4 w-4" /> {t('inv.rel.whatsapp', locale)}
                  </Label>
                  {stats.sansEmail > 0 && canauxEffectifs.includes("email") && (
                    <span className="text-xs text-amber-700">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      {stats.sansEmail} {t('inv.rel.no_email_n', locale)}
                    </span>
                  )}
                  {stats.sansPhone > 0 && canauxEffectifs.includes("whatsapp") && (
                    <span className="text-xs text-amber-700">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      {stats.sansPhone} {t('inv.rel.no_phone_n', locale)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runRelances(true)}
                    disabled={submitting || selectedIds.size === 0}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t('inv.rel.simulate', locale)} ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => runRelances(false)}
                    disabled={submitting || selectedIds.size === 0}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Send className="h-4 w-4 mr-1.5" />
                    {t('inv.rel.send', locale)} ({selectedIds.size})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Liste */}
            <Tabs defaultValue="apreleance">
              <TabsList>
                <TabsTrigger value="apreleance">{t('inv.rel.tab_pending', locale)} ({factures.length})</TabsTrigger>
                <TabsTrigger value="historique">{t('inv.rel.tab_history', locale)} ({historique.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="apreleance" className="space-y-2">
                {factures.length === 0 ? (
                  <Card>
                    <CardContent className="p-0">
                      <EmptyState
                        icon={CheckCircle2}
                        title={t('inv.rel.empty_pending', locale)}
                        size="md"
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="border-b px-3 py-2 flex items-center gap-2 bg-muted/30">
                        <Checkbox
                          checked={selectedIds.size === factures.length && factures.length > 0}
                          onCheckedChange={toggleAll}
                        />
                        <span className="text-xs text-muted-foreground">
                          {t('inv.rel.toggle_all', locale)}
                        </span>
                      </div>
                      <div className="divide-y">
                        {factures.map((f) => {
                          const niColor = NIVEAU_COLORS[f.niveau]
                          const niLabel = niveauLabel(f.niveau, locale)
                          const selected = selectedIds.has(f.facture_id)
                          return (
                            <div
                              key={f.facture_id}
                              className="flex items-start gap-3 p-3 hover:bg-muted/20"
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={() => toggleId(f.facture_id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-medium text-sm">
                                    {f.numero_facture || f.facture_id.slice(0, 8)}
                                  </span>
                                  <Badge className={`text-[10px] border ${niColor}`}>
                                    {niLabel}
                                  </Badge>
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {f.jours_retard}{t('inv.rel.days_late_suffix', locale)}
                                  </Badge>
                                </div>
                                <div className="text-sm mt-1">{f.tiers || t('inv.rel.dash', locale)}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                                  {f.contact_email ? (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" /> {f.contact_email}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">{t('inv.rel.no_email', locale)}</span>
                                  )}
                                  {f.contact_phone ? (
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3" /> {f.contact_phone}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">{t('inv.rel.no_phone', locale)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-mono text-sm font-medium">
                                  {fmt(f.solde_du_mur, "MUR")}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {t('inv.rel.due', locale)} : {f.date_echeance}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="historique">
                {historique.length === 0 ? (
                  <Card>
                    <CardContent className="p-0">
                      <EmptyState
                        icon={Clock}
                        title={t('inv.rel.empty_history', locale)}
                        size="md"
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {historique.map((h) => (
                          <div key={h.id} className="flex items-start gap-3 p-3 text-sm">
                            <Badge
                              className={`text-[10px] border ${
                                NIVEAU_COLORS[h.niveau] || ""
                              }`}
                            >
                              {t('inv.rel.level_short', locale)}{h.niveau}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {h.canal === "email" ? (
                                  <Mail className="h-3 w-3" />
                                ) : (
                                  <MessageCircle className="h-3 w-3" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {h.destinataire || t('inv.rel.dash', locale)}
                                </span>
                                {h.dry_run && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {t('inv.rel.simulation_badge', locale)}
                                  </Badge>
                                )}
                                {h.statut === "envoye" ? (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
                                    {t('inv.rel.sent', locale)}
                                  </Badge>
                                ) : (
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                    {t('inv.rel.failed', locale)}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[12px] mt-0.5">{h.sujet || ""}</div>
                              {h.error && (
                                <div className="text-[11px] text-red-600 mt-0.5">{h.error}</div>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex-shrink-0">
                              {formatDateTime(h.date_envoi)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
