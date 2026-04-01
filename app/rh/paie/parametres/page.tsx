"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Info } from "lucide-react"

const NAVY = "#1E2A4A"

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Paramètres Paie & RH
          </h1>
          <p className="text-sm text-gray-500">
            Taux MRA Finance Act 2024/25 — Jours fériés Maurice
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="text-white" style={{ backgroundColor: NAVY }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? "✅ Sauvegardé !" : "Sauvegarder"}
        </Button>
      </div>

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
