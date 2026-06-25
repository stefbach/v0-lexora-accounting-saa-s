"use client"

import { useState, useEffect } from "react"
import { getCurrentExercice } from "@/lib/fiscal-years"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, CheckCircle2, AlertTriangle, Calendar, TrendingUp, RefreshCw, Camera, Lock } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"
import { ExerciceLockBadge } from "@/components/comptable/ExerciceLockBadge"
import { useProfile } from "@/hooks/use-profile"
import { toast } from "sonner"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

interface Societe { id: string; nom: string }

interface ExerciceFiscal {
  id?: string
  annee: string
  date_debut?: string
  date_fin?: string
  statut: "ouvert" | "cloture"
  date_cloture?: string | null
  snapshot_date?: string | null
}

export default function CloturePage() {
  const locale = getLocale()
  const { profile } = useProfile()
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin"
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [periode, setPeriode] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [exercice, setExercice] = useState<string>(getCurrentExercice())
  const [dateCloture, setDateCloture] = useState<string>(`${getCurrentExercice().split('-')[1]}-06-30`)
  const [tauxEUR, setTauxEUR] = useState<string>("54.50")
  const [tauxUSD, setTauxUSD] = useState<string>("45.20")
  const [tauxGBP, setTauxGBP] = useState<string>("65.10")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Exercices fiscaux + snapshot regen
  const [exercices, setExercices] = useState<ExerciceFiscal[]>([])
  const [exercicesLoading, setExercicesLoading] = useState(false)
  const [regenLoading, setRegenLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  // Charger les exercices fiscaux de la société sélectionnée
  useEffect(() => {
    if (!societeId) { setExercices([]); return }
    setExercicesLoading(true)
    fetch(`/api/comptable/exercices?societe_id=${societeId}`)
      .then(r => r.ok ? r.json() : { exercices: [] })
      .then(d => setExercices(Array.isArray(d.exercices) ? d.exercices : []))
      .catch(() => setExercices([]))
      .finally(() => setExercicesLoading(false))
  }, [societeId])

  const regenerateSnapshot = async (annee: string) => {
    if (!societeId) return
    setRegenLoading(annee)
    try {
      const res = await fetch(
        `/api/comptable/exercices/snapshot/${encodeURIComponent(annee)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societeId }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Échec snapshot", { description: data?.error || "Erreur inconnue" })
        return
      }
      toast.success("Snapshot régénéré", {
        description: data?.generated_at
          ? `Bilan figé le ${new Date(data.generated_at).toLocaleString("fr-FR")}`
          : `Exercice ${annee}`,
      })
      // Refresh la liste
      const r2 = await fetch(`/api/comptable/exercices?societe_id=${societeId}`)
      if (r2.ok) {
        const d2 = await r2.json()
        setExercices(Array.isArray(d2.exercices) ? d2.exercices : [])
      }
    } catch (e: any) {
      toast.error("Échec snapshot", { description: e?.message || "Erreur réseau" })
    } finally {
      setRegenLoading(null)
    }
  }

  const callApi = async (action: string, extra: Record<string, unknown>) => {
    if (!societeId) { setError(t('cab.cloture.err_select_company', locale)); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/comptable/cloture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, societe_id: societeId, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('cab.cloture.err_api', locale))
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e?.message || t('cab.cloture.err_network', locale))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('cab.cloture.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('cab.cloture.subtitle', locale)}
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div>
              <Label>{t('cab.cloture.company', locale)}</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger className="w-72"><SelectValue placeholder={t('cab.cloture.choose_company', locale)} /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Liste des exercices fiscaux + état de clôture + snapshot */}
        {societeId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="w-4 h-4" /> Exercices fiscaux
              </CardTitle>
            </CardHeader>
            <CardContent>
              {exercicesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Chargement des exercices…
                </div>
              ) : exercices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  Aucun exercice fiscal trouvé pour cette société.
                </p>
              ) : (
                <ul className="divide-y" role="list" aria-label="Exercices fiscaux">
                  {exercices.map((ex) => (
                    <li
                      key={ex.id || ex.annee}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold" style={{ color: NAVY }}>
                          {ex.annee}
                        </span>
                        <ExerciceLockBadge
                          statut={ex.statut}
                          dateCloture={ex.date_cloture ?? undefined}
                          snapshotDate={ex.snapshot_date ?? undefined}
                        />
                      </div>
                      {isAdmin && ex.statut === "cloture" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => regenerateSnapshot(ex.annee)}
                          disabled={regenLoading === ex.annee}
                          aria-label={`Régénérer le snapshot du bilan pour ${ex.annee}`}
                          className="gap-1"
                        >
                          {regenLoading === ex.annee ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5" />
                          )}
                          Régénérer snapshot
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="mensuelle">
          <TabsList className="grid grid-cols-4 w-full max-w-3xl">
            <TabsTrigger value="mensuelle"><Calendar className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_monthly', locale)}</TabsTrigger>
            <TabsTrigger value="annuelle"><TrendingUp className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_annual', locale)}</TabsTrigger>
            <TabsTrigger value="change"><RefreshCw className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_fx', locale)}</TabsTrigger>
            <TabsTrigger value="immo">{t('cab.cloture.tab_immo', locale)}</TabsTrigger>
          </TabsList>

          {/* Clôture mensuelle */}
          <TabsContent value="mensuelle" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cab.cloture.monthly_title', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: t('cab.cloture.monthly_desc_html', locale) }} />
                <div className="flex gap-3 items-end">
                  <div>
                    <Label>{t('cab.cloture.fld_period', locale)}</Label>
                    <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-44" />
                  </div>
                  <Button
                    onClick={() => callApi('cloture_mensuelle', { periode })}
                    disabled={loading || !societeId}
                    style={{ backgroundColor: NAVY, color: "white" }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    {t('cab.cloture.run_monthly_btn', locale)}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clôture annuelle */}
          <TabsContent value="annuelle" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cab.cloture.annual_title', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  {t('cab.cloture.annual_desc', locale)}
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div dangerouslySetInnerHTML={{ __html: t('cab.cloture.annual_warning_html', locale) }} />
                </div>
                <div className="flex gap-3 items-end">
                  <div>
                    <Label>{t('cab.cloture.fld_fiscal_year', locale)}</Label>
                    <Select value={exercice} onValueChange={setExercice}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025-2026">2025-2026</SelectItem>
                        <SelectItem value="2024-2025">2024-2025</SelectItem>
                        <SelectItem value="2023-2024">2023-2024</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => callApi('cloture_exercice', { exercice })}
                    disabled={loading || !societeId}
                    style={{ backgroundColor: GOLD, color: "white" }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    {t('cab.cloture.close_year_btn', locale)} {exercice}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Réévaluation change */}
          <TabsContent value="change" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cab.cloture.fx_title', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  {t('cab.cloture.fx_desc', locale)}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>{t('cab.cloture.fld_close_date', locale)}</Label>
                    <Input type="date" value={dateCloture} onChange={e => setDateCloture(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>{t('cab.cloture.fld_rate_eur', locale)}</Label>
                    <Input type="number" step="0.0001" value={tauxEUR} onChange={e => setTauxEUR(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('cab.cloture.fld_rate_usd', locale)}</Label>
                    <Input type="number" step="0.0001" value={tauxUSD} onChange={e => setTauxUSD(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t('cab.cloture.fld_rate_gbp', locale)}</Label>
                    <Input type="number" step="0.0001" value={tauxGBP} onChange={e => setTauxGBP(e.target.value)} />
                  </div>
                </div>
                <Button
                  onClick={() => callApi('reevaluation_change', {
                    date_cloture: dateCloture,
                    taux_par_devise: {
                      EUR: parseFloat(tauxEUR) || 0,
                      USD: parseFloat(tauxUSD) || 0,
                      GBP: parseFloat(tauxGBP) || 0,
                    },
                  })}
                  disabled={loading || !societeId}
                  style={{ backgroundColor: NAVY, color: "white" }}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  {t('cab.cloture.fx_run_btn', locale)} {dateCloture}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test dépréciation immo */}
          <TabsContent value="immo" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cab.cloture.immo_title', locale)}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">
                  {t('cab.cloture.immo_desc', locale)}
                </p>
                <p className="text-xs text-gray-500">
                  {t('cab.cloture.immo_hint', locale)}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Résultats */}
        {error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 flex gap-2 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div><strong>{t('cab.cloture.error_label', locale)}</strong> {error}</div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className="border-green-300 bg-green-50">
            <CardHeader>
              <CardTitle className="text-base text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> {t('cab.cloture.result_label', locale)} — {result.action}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}
