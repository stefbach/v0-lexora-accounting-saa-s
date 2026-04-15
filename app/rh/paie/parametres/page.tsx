"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Info, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react"

const NAVY = "#0B0F2E"

const JOURS_FERIES_MU_DEFAUT = [
  { date: "2025-01-01", label: "Jour de l'An" },
  { date: "2025-01-02", label: "Jour de l'An (suite)" },
  { date: "2025-03-12", label: "Jour de la Nation" },
  { date: "2025-05-01", label: "Fête du Travail" },
  { date: "2025-05-09", label: "Ascension" },
  { date: "2025-08-15", label: "Assomption" },
  { date: "2025-11-02", label: "Toussaint" },
  { date: "2025-12-25", label: "Noël" },
]

// ---------------------------------------------------------------------------
// Isolated number field — has its own local state so typing never causes the
// parent to re-render. The parent's value is only updated onBlur.
// ---------------------------------------------------------------------------
function NumField({
  label,
  desc,
  defaultVal,
  pct,
  onCommit,
}: {
  label: string
  desc: string
  defaultVal: string
  pct?: boolean
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(defaultVal)

  // Keep in sync when parent reloads data from the API
  const prevDefault = useRef(defaultVal)
  useEffect(() => {
    if (prevDefault.current !== defaultVal) {
      prevDefault.current = defaultVal
      setLocal(defaultVal)
    }
  }, [defaultVal])

  return (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-gray-400 mb-1">{desc}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="any"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onCommit(local)}
          className="w-36"
        />
        {pct && (
          <span className="text-sm text-gray-500">
            {(Number(local) * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ParametresPaiePage() {
  const [params, setParams] = useState({
    csg_seuil_taux_reduit: "50000",
    csg_salarie_taux_reduit: "0.015",
    csg_salarie_taux_plein: "0.030",
    csg_patronal: "0.060",
    nsf_salarie: "0.015",
    nsf_patronal: "0.025",
    training_levy: "0.010",
    prgf_patronal_par_jour: "4.50",
    prgf_taux_emoluments: "0.045",
    paye_seuil_exoneration: "390000",
    paye_taux_1: "0.10",
    paye_seuil_taux_2: "650000",
    paye_taux_2: "0.15",
  })

  // tauxEur local edit state — only pushed to parent on blur
  const [tauxEurCommitted, setTauxEurCommitted] = useState("46.50")
  const [tauxEurLocal, setTauxEurLocal] = useState("46.50")

  const [liveRates, setLiveRates] = useState<Record<string, number>>({})
  const [ratesSource, setRatesSource] = useState("")
  const [loadingRates, setLoadingRates] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── MRA rates fetch (Fix 1) ──────────────────────────────────────
  // Status of the live MRA-rates fetch:
  //   'idle'    → never attempted this session
  //   'loading' → request in flight
  //   'ok'      → rates pulled from /api/rh/paie/ai-rates this session
  //   'error'   → request failed / returned error; fields fall back to
  //               whatever DB had, and a warning is shown above the form
  const [mraStatus, setMraStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [mraError, setMraError] = useState<string | null>(null)
  const [mraUpdatedAt, setMraUpdatedAt] = useState<string | null>(null)
  const [mraSource, setMraSource] = useState<string | null>(null)

  const fetchMraRates = async (opts: { fromMount?: boolean } = {}) => {
    setMraStatus('loading')
    setMraError(null)
    try {
      const res = await fetch("/api/rh/paie/ai-rates", { method: "POST" })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.rates) {
        throw new Error(d?.error || `HTTP ${res.status}`)
      }
      const r = d.rates as Record<string, any>
      setParams(p => ({
        ...p,
        csg_seuil_taux_reduit: r.csg_seuil_taux_reduit != null ? String(r.csg_seuil_taux_reduit) : p.csg_seuil_taux_reduit,
        csg_salarie_taux_reduit: r.csg_salarie_taux_reduit != null ? String(r.csg_salarie_taux_reduit) : p.csg_salarie_taux_reduit,
        csg_salarie_taux_plein: r.csg_salarie_taux_plein != null ? String(r.csg_salarie_taux_plein) : p.csg_salarie_taux_plein,
        csg_patronal: r.csg_patronal != null ? String(r.csg_patronal) : p.csg_patronal,
        nsf_salarie: r.nsf_salarie != null ? String(r.nsf_salarie) : p.nsf_salarie,
        nsf_patronal: r.nsf_patronal != null ? String(r.nsf_patronal) : p.nsf_patronal,
        training_levy: r.training_levy != null ? String(r.training_levy) : p.training_levy,
        prgf_taux_emoluments: r.prgf_taux != null ? String(r.prgf_taux) : p.prgf_taux_emoluments,
        paye_seuil_exoneration: r.paye_seuil_exoneration != null ? String(r.paye_seuil_exoneration) : p.paye_seuil_exoneration,
        paye_taux_1: r.paye_taux_1 != null ? String(r.paye_taux_1) : p.paye_taux_1,
        paye_seuil_taux_2: r.paye_seuil_taux_2 != null ? String(r.paye_seuil_taux_2) : p.paye_seuil_taux_2,
        paye_taux_2: r.paye_taux_2 != null ? String(r.paye_taux_2) : p.paye_taux_2,
      }))
      setMraUpdatedAt(d.updated_at || new Date().toISOString())
      setMraSource(r.source || null)
      setMraStatus('ok')
    } catch (e: any) {
      // Sprint 1 — feedback déjà visible via mraStatus + mraError badge.
      // Pas de log console redondant en prod.
      setMraStatus('error')
      setMraError(e?.message || 'Erreur réseau')
    }
  }

  // Auto-fetch MRA rates on mount — runs once the DB-backed params have
  // finished loading so fetched values cleanly override the baseline.
  useEffect(() => {
    if (loading) return
    if (mraStatus !== 'idle') return
    fetchMraRates({ fromMount: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Fetch live exchange rates on mount
  useEffect(() => {
    setLoadingRates(true)
    fetch("/api/taux-change")
      .then(r => r.json())
      .then(d => {
        if (d.rates) {
          setLiveRates(d.rates)
          if (d.rates.EUR) {
            const v = String(d.rates.EUR)
            setTauxEurCommitted(v)
            setTauxEurLocal(v)
          }
          setRatesSource(d.source || "api")
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRates(false))
  }, [])

  // Load saved params from API
  useEffect(() => {
    fetch("/api/rh/paie/parametres")
      .then(r => r.json())
      .then(d => {
        if (d.params) {
          setParams({
            csg_seuil_taux_reduit: String(d.params.csg_seuil_taux_reduit || 50000),
            csg_salarie_taux_reduit: String(d.params.csg_salarie_taux_reduit || 0.015),
            csg_salarie_taux_plein: String(d.params.csg_salarie_taux_plein || 0.030),
            csg_patronal: String(d.params.csg_patronal || 0.060),
            nsf_salarie: String(d.params.nsf_salarie || 0.015),
            nsf_patronal: String(d.params.nsf_patronal || 0.025),
            training_levy: String(d.params.training_levy || 0.010),
            prgf_patronal_par_jour: String(d.params.prgf_patronal_par_jour || 4.50),
            prgf_taux_emoluments: String(d.params.prgf_taux_emoluments || 0.045),
            paye_seuil_exoneration: String(d.params.paye_seuil_exoneration || 390000),
            paye_taux_1: String(d.params.paye_taux_1 || 0.10),
            paye_seuil_taux_2: String(d.params.paye_seuil_taux_2 || 650000),
            paye_taux_2: String(d.params.paye_taux_2 || 0.15),
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const refreshRates = async () => {
    setLoadingRates(true)
    try {
      const res = await fetch("/api/taux-change")
      const d = await res.json()
      if (d.rates) {
        setLiveRates(d.rates)
        if (d.rates.EUR) {
          const v = String(d.rates.EUR)
          setTauxEurCommitted(v)
          setTauxEurLocal(v)
        }
        setRatesSource(d.source || "api")
      }
    } catch {}
    setLoadingRates(false)
  }

  const setParam = (key: keyof typeof params) => (v: string) =>
    setParams(p => ({ ...p, [key]: v }))

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch("/api/rh/paie/parametres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, Number(v)])
          )
        ),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              Paramètres Paie & RH
            </h1>
            {mraStatus === 'ok' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800 border border-green-200">
                <CheckCircle2 className="w-3 h-3" />
                Taux MRA à jour
              </span>
            )}
            {(mraStatus === 'error' || mraStatus === 'idle') && !loading && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-800 border border-orange-200">
                <AlertTriangle className="w-3 h-3" />
                Taux non vérifiés
              </span>
            )}
            {mraStatus === 'loading' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                <Loader2 className="w-3 h-3 animate-spin" />
                Récupération…
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Taux MRA Finance Act {new Date().getFullYear()}/{new Date().getFullYear() + 1} — Jours fériés Maurice
            {mraUpdatedAt && mraStatus === 'ok' && (
              <span className="text-gray-400"> · Mis à jour {new Date(mraUpdatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {mraSource && mraStatus === 'ok' && (
              <span className="text-gray-400"> · Source: {mraSource}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => fetchMraRates()}
            disabled={mraStatus === 'loading'}
            variant="outline"
            className="border-[#0B0F2E] text-[#0B0F2E]"
          >
            {mraStatus === 'loading'
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : <RefreshCw className="w-4 h-4 mr-2" />}
            Actualiser les taux
          </Button>
          <Button onClick={handleSave} disabled={saving} className="text-white" style={{ backgroundColor: NAVY }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saved ? "✅ Sauvegardé !" : "Sauvegarder"}
          </Button>
        </div>
      </div>

      {mraStatus === 'error' && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="text-orange-900">
            <strong>Impossible de récupérer les taux MRA automatiquement.</strong> Vérifiez manuellement avant de calculer la paie.
            {mraError && <span className="block text-[11px] text-orange-700 mt-0.5">Détail: {mraError}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* CSG */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                CSG — Contribution Sociale Généralisée
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumField
                label="Seuil taux réduit (MUR)"
                desc="Salaire brut ≤ ce seuil → taux réduit"
                defaultVal={params.csg_seuil_taux_reduit}
                onCommit={setParam("csg_seuil_taux_reduit")}
              />
              <NumField
                label="Taux réduit salarié"
                desc="Si brut ≤ seuil"
                defaultVal={params.csg_salarie_taux_reduit}
                pct
                onCommit={setParam("csg_salarie_taux_reduit")}
              />
              <NumField
                label="Taux plein salarié"
                desc="Si brut > seuil"
                defaultVal={params.csg_salarie_taux_plein}
                pct
                onCommit={setParam("csg_salarie_taux_plein")}
              />
              <NumField
                label="Taux patronal"
                desc="6% sur salaire brut"
                defaultVal={params.csg_patronal}
                pct
                onCommit={setParam("csg_patronal")}
              />
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Finance Act 2024/25 : 1.5% si brut ≤ 50 000 MUR, 3% au-delà. Patronal fixe à 6%.</p>
              </div>
            </CardContent>
          </Card>

          {/* NSF + Training + PRGF */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                NSF, Training Levy & PRGF
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumField
                label="NSF salarié"
                desc="National Savings Fund — salarié"
                defaultVal={params.nsf_salarie}
                pct
                onCommit={setParam("nsf_salarie")}
              />
              <NumField
                label="NSF patronal"
                desc="National Savings Fund — employeur"
                defaultVal={params.nsf_patronal}
                pct
                onCommit={setParam("nsf_patronal")}
              />
              <NumField
                label="Training Levy (HRDC)"
                desc="1% masse salariale"
                defaultVal={params.training_levy}
                pct
                onCommit={setParam("training_levy")}
              />
              <NumField
                label="PRGF taux (%)"
                desc="4.5% des émoluments — Portable Retirement Gratuity Fund"
                defaultVal={params.prgf_taux_emoluments}
                pct
                onCommit={setParam("prgf_taux_emoluments")}
              />
              <NumField
                label="PRGF minimum par jour (MUR)"
                desc="Plancher : 4.50 MUR/jour travaillé"
                defaultVal={params.prgf_patronal_par_jour}
                onCommit={setParam("prgf_patronal_par_jour")}
              />
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>PRGF (WRA 2019) : l'employeur paie le MAX entre 4.5% des émoluments et 4.50 MUR × jours travaillés.</p>
              </div>
            </CardContent>
          </Card>

          {/* PAYE */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                PAYE — Pay As You Earn
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumField
                label="Seuil exonération annuel (MUR)"
                desc="En-dessous : PAYE = 0"
                defaultVal={params.paye_seuil_exoneration}
                onCommit={setParam("paye_seuil_exoneration")}
              />
              <NumField
                label="Taux tranche 1"
                desc="Jusqu'au seuil tranche 2"
                defaultVal={params.paye_taux_1}
                pct
                onCommit={setParam("paye_taux_1")}
              />
              <NumField
                label="Seuil tranche 2 annuel (MUR)"
                desc="Au-dessus : taux 2 s'applique"
                defaultVal={params.paye_seuil_taux_2}
                onCommit={setParam("paye_seuil_taux_2")}
              />
              <NumField
                label="Taux tranche 2"
                desc="Revenu annuel > seuil tranche 2"
                defaultVal={params.paye_taux_2}
                pct
                onCommit={setParam("paye_taux_2")}
              />
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Barème 2024/25 : 0% jusqu'à 390K MUR/an, 10% jusqu'à 650K, 15% au-delà.</p>
              </div>
            </CardContent>
          </Card>

          {/* Forex EUR — Live rates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                Taux de change
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-green-800">Taux en temps réel</p>
                  <Button variant="outline" size="sm" onClick={refreshRates} disabled={loadingRates}>
                    {loadingRates ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualiser"}
                  </Button>
                </div>
                {loadingRates ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <div className="flex gap-6">
                    <div>
                      <span className="text-xs text-gray-500">EUR/MUR</span>
                      <p className="text-lg font-bold" style={{ color: NAVY }}>
                        {liveRates.EUR ? liveRates.EUR.toFixed(4) : tauxEurCommitted}
                      </p>
                    </div>
                    {liveRates.GBP && (
                      <div>
                        <span className="text-xs text-gray-500">GBP/MUR</span>
                        <p className="text-lg font-bold" style={{ color: NAVY }}>{liveRates.GBP.toFixed(4)}</p>
                      </div>
                    )}
                    {liveRates.USD && (
                      <div>
                        <span className="text-xs text-gray-500">USD/MUR</span>
                        <p className="text-lg font-bold" style={{ color: NAVY }}>{liveRates.USD.toFixed(4)}</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Source:{" "}
                  {ratesSource === "database"
                    ? "Base de données (quotidien)"
                    : ratesSource === "fallback"
                    ? "Taux par défaut"
                    : "API ExchangeRate"}
                </p>
              </div>

              <div>
                <Label>Override manuel (optionnel)</Label>
                <p className="text-xs text-gray-400 mb-1">Forcer un taux spécifique au lieu du taux live</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.0001"
                    value={tauxEurLocal}
                    onChange={e => setTauxEurLocal(e.target.value)}
                    onBlur={() => setTauxEurCommitted(tauxEurLocal)}
                    className="w-36"
                  />
                  <span className="text-sm text-gray-500">1 EUR = {tauxEurCommitted} MUR</span>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Le taux est récupéré automatiquement et mis à jour quotidiennement. Il est figé au moment du calcul de chaque bulletin.</p>
              </div>
            </CardContent>
          </Card>

          {/* OT */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                Règles Heures Supplémentaires (WRA)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <p className="font-medium text-sm">Heures normales</p>
                  <p className="text-2xl font-bold" style={{ color: NAVY }}>9h / jour</p>
                  <p className="text-xs text-gray-400 mt-1">45h / semaine — pause 1h déduite</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="font-medium text-sm text-orange-800">OT Tranche 1</p>
                  <p className="text-2xl font-bold text-orange-600">1.5×</p>
                  <p className="text-xs text-orange-600 mt-1">De 9h à 11h (2h supplémentaires)</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="font-medium text-sm text-red-800">OT Tranche 2 / Jour férié</p>
                  <p className="text-2xl font-bold text-red-600">2×</p>
                  <p className="text-xs text-red-600 mt-1">Au-delà de 11h ou jour férié</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Taux horaire = Salaire mensuel ÷ (45h × 52 semaines ÷ 12 mois)
              </p>
            </CardContent>
          </Card>

          {/* Jours fériés */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base" style={{ color: NAVY }}>
                Jours fériés Maurice 2025
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2">
                {JOURS_FERIES_MU_DEFAUT.map(j => (
                  <div key={j.date} className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-100">
                    <span className="text-purple-600 text-sm">🎌</span>
                    <div>
                      <p className="text-xs font-medium text-purple-900">{j.label}</p>
                      <p className="text-xs text-purple-500">
                        {new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Les jours fériés sont pris en compte automatiquement dans le calcul des OT (toutes heures × 2)
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
