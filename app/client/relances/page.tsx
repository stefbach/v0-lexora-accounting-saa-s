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
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

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

const NIVEAU_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Rappel", color: "bg-amber-100 text-amber-700 border-amber-300" },
  2: { label: "Relance ferme", color: "bg-orange-100 text-orange-700 border-orange-300" },
  3: { label: "Mise en demeure", color: "bg-red-100 text-red-700 border-red-300" },
}

export default function ClientRelancesPage() {
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
      showToast("Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

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
      showToast("Sélectionnez au moins une facture", "error")
      return
    }
    if (canauxEffectifs.length === 0) {
      showToast("Sélectionnez au moins un canal", "error")
      return
    }
    if (!dry_run) {
      const ok = window.confirm(
        `Envoyer ${selectedIds.size} relance(s) via ${canauxEffectifs.join(" + ")} ?`,
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
        showToast(data?.error || "Erreur", "error")
        return
      }
      const s = data?.summary
      showToast(
        `${dry_run ? "Simulation" : "Envoi"} : ${s?.envois_ok ?? 0} OK · ${s?.envois_echec ?? 0} échec`,
        s?.envois_echec > 0 ? "error" : "success",
      )
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur réseau", "error")
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
                <h1 className="text-2xl font-bold text-amber-900">Relances factures</h1>
                <p className="text-sm text-amber-800/80 mt-0.5">
                  Relancer automatiquement les clients qui n'ont pas payé à échéance
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>

        {/* Config société */}
        {config && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Cron automatique&nbsp;:</span>
                {config.relances_actif ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Activé
                  </Badge>
                ) : (
                  <Badge variant="outline">Désactivé (envoi manuel uniquement)</Badge>
                )}
              </div>
              <div className="text-muted-foreground">
                Délais&nbsp;: rappel à J+{config.delais_jours["1"]}, ferme à J+{config.delais_jours["2"]},
                mise en demeure à J+{config.delais_jours["3"]} après échéance
              </div>
            </CardContent>
          </Card>
        )}

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
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
                  <div className="text-xs text-muted-foreground">Niveau 1 (rappel)</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[1]}</div>
                </CardContent>
              </Card>
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Niveau 2 (ferme)</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[2]}</div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Niveau 3 (MED)</div>
                  <div className="text-xl font-semibold mt-1">{stats.parNiveau[3]}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total à recouvrer</div>
                  <div className="text-xl font-semibold mt-1 font-mono">{fmt(stats.totalDu, "MUR")}</div>
                </CardContent>
              </Card>
            </div>

            {/* Canaux & actions */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-medium">Canaux&nbsp;:</span>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={canauxEffectifs.includes("email")}
                      onCheckedChange={() => toggleCanal("email")}
                    />
                    <Mail className="h-4 w-4" /> Email
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={canauxEffectifs.includes("whatsapp")}
                      onCheckedChange={() => toggleCanal("whatsapp")}
                    />
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Label>
                  {stats.sansEmail > 0 && canauxEffectifs.includes("email") && (
                    <span className="text-xs text-amber-700">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      {stats.sansEmail} facture(s) sans email
                    </span>
                  )}
                  {stats.sansPhone > 0 && canauxEffectifs.includes("whatsapp") && (
                    <span className="text-xs text-amber-700">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      {stats.sansPhone} facture(s) sans téléphone
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
                    Simuler ({selectedIds.size})
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => runRelances(false)}
                    disabled={submitting || selectedIds.size === 0}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Send className="h-4 w-4 mr-1.5" />
                    Envoyer ({selectedIds.size})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Liste */}
            <Tabs defaultValue="apreleance">
              <TabsList>
                <TabsTrigger value="apreleance">À relancer ({factures.length})</TabsTrigger>
                <TabsTrigger value="historique">Historique ({historique.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="apreleance" className="space-y-2">
                {factures.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                      Aucune facture à relancer aujourd'hui.
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
                          Tout sélectionner / désélectionner
                        </span>
                      </div>
                      <div className="divide-y">
                        {factures.map((f) => {
                          const ni = NIVEAU_LABELS[f.niveau]
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
                                  <Badge className={`text-[10px] border ${ni.color}`}>
                                    {ni.label}
                                  </Badge>
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {f.jours_retard}j de retard
                                  </Badge>
                                </div>
                                <div className="text-sm mt-1">{f.tiers || "—"}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                                  {f.contact_email ? (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" /> {f.contact_email}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">Pas d'email</span>
                                  )}
                                  {f.contact_phone ? (
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3" /> {f.contact_phone}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600">Pas de téléphone</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-mono text-sm font-medium">
                                  {fmt(f.solde_du_mur, "MUR")}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Échéance : {f.date_echeance}
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
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      Aucune relance envoyée jusqu'à présent.
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
                                NIVEAU_LABELS[h.niveau]?.color || ""
                              }`}
                            >
                              N{h.niveau}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {h.canal === "email" ? (
                                  <Mail className="h-3 w-3" />
                                ) : (
                                  <MessageCircle className="h-3 w-3" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {h.destinataire || "—"}
                                </span>
                                {h.dry_run && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Simulation
                                  </Badge>
                                )}
                                {h.statut === "envoye" ? (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
                                    Envoyé
                                  </Badge>
                                ) : (
                                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                    Échec
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
