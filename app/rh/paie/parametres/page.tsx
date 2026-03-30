"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Info, Bot, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react"

interface JourFerie {
  date: string
  label: string
}

const JOURS_FERIES_DEFAUT: JourFerie[] = [
  { date: "2026-01-01", label: "Jour de l'An" },
  { date: "2026-01-02", label: "Jour de l'An (suite)" },
  { date: "2026-01-28", label: "Thaipoosam Cavadee" },
  { date: "2026-02-01", label: "Abolition de l'esclavage" },
  { date: "2026-03-12", label: "Jour de la Nation" },
  { date: "2026-03-17", label: "Maha Shivaratree" },
  { date: "2026-03-31", label: "Ougadi" },
  { date: "2026-05-01", label: "Fête du Travail" },
  { date: "2026-09-17", label: "Ganesh Chaturthi" },
  { date: "2026-11-01", label: "Toussaint" },
  { date: "2026-11-05", label: "Divali" },
  { date: "2026-12-25", label: "Noël" },
]

export default function ParametresPaiePage() {
  const [params, setParams] = useState({
    csg_seuil_taux_reduit: "50000",
    csg_salarie_taux_reduit: "0.015",
    csg_salarie_taux_plein: "0.030",
    csg_patronal: "0.060",
    nsf_salarie: "0.015",
    nsf_patronal: "0.025",
    training_levy: "0.010",
    prgf_taux: "0.045",
    paye_seuil_exoneration: "390000",
    paye_taux_1: "0.10",
    paye_seuil_taux_2: "650000",
    paye_taux_2: "0.15",
  })
  const [joursFeries, setJoursFeries] = useState<JourFerie[]>(JOURS_FERIES_DEFAUT)
  const [tauxEur, setTauxEur] = useState("46.50")
  const [salaryCompensation, setSalaryCompensation] = useState("635")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // AI update state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ source?: string; notes?: string; updated_at?: string } | null>(null)
  const [aiError, setAiError] = useState("")

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
            prgf_taux: String(d.params.prgf_taux || d.params.prgf_patronal_par_jour || 0.045),
            paye_seuil_exoneration: String(d.params.paye_seuil_exoneration || 390000),
            paye_taux_1: String(d.params.paye_taux_1 || 0.10),
            paye_seuil_taux_2: String(d.params.paye_seuil_taux_2 || 650000),
            paye_taux_2: String(d.params.paye_taux_2 || 0.15),
          })
          if (d.params.salary_compensation) setSalaryCompensation(String(d.params.salary_compensation))
          if (d.params.jours_feries) setJoursFeries(d.params.jours_feries)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      await fetch("/api/rh/paie/parametres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Number(v)])),
          salary_compensation: Number(salaryCompensation),
          jours_feries: joursFeries,
        })
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleAiUpdate = async () => {
    setAiLoading(true); setAiError(""); setAiResult(null)
    try {
      const res = await fetch("/api/rh/paie/ai-rates", { method: "POST" })
      const data = await res.json()
      if (data.error) { setAiError(data.error); return }

      const r = data.rates
      if (r) {
        setParams({
          csg_seuil_taux_reduit: String(r.csg_seuil_taux_reduit || params.csg_seuil_taux_reduit),
          csg_salarie_taux_reduit: String(r.csg_salarie_taux_reduit || params.csg_salarie_taux_reduit),
          csg_salarie_taux_plein: String(r.csg_salarie_taux_plein || params.csg_salarie_taux_plein),
          csg_patronal: String(r.csg_patronal || params.csg_patronal),
          nsf_salarie: String(r.nsf_salarie || params.nsf_salarie),
          nsf_patronal: String(r.nsf_patronal || params.nsf_patronal),
          training_levy: String(r.training_levy || params.training_levy),
          prgf_taux: String(r.prgf_taux || params.prgf_taux),
          paye_seuil_exoneration: String(r.paye_seuil_exoneration || params.paye_seuil_exoneration),
          paye_taux_1: String(r.paye_taux_1 || params.paye_taux_1),
          paye_seuil_taux_2: String(r.paye_seuil_taux_2 || params.paye_seuil_taux_2),
          paye_taux_2: String(r.paye_taux_2 || params.paye_taux_2),
        })
        if (r.salary_compensation) setSalaryCompensation(String(r.salary_compensation))
        if (r.jours_feries && Array.isArray(r.jours_feries)) setJoursFeries(r.jours_feries)
        setAiResult({ source: r.source, notes: r.notes, updated_at: data.updated_at })
      }
    } catch (e) { setAiError("Erreur réseau") }
    finally { setAiLoading(false) }
  }

  const pField = (key: keyof typeof params, label: string, desc: string, pct = false) => (
    <div key={key}>
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-gray-400 mb-1">{desc}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number" step="any"
          value={params[key]}
          onChange={e => setParams(p => ({ ...p, [key]: e.target.value }))}
          className="w-36"
        />
        {pct && <span className="text-sm text-gray-500">{(Number(params[key]) * 100).toFixed(1)}%</span>}
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Paramètres Paie & RH</h1>
          <p className="text-sm text-gray-500">Taux MRA Finance Act {new Date().getFullYear()}/{new Date().getFullYear() + 1} — Jours fériés Maurice</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleAiUpdate} disabled={aiLoading} variant="outline" className="border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 gap-2">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            {aiLoading ? "Recherche IA en cours..." : "Mise à jour IA"}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#1E2A4A] text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "Sauvegardé !" : "Sauvegarder"}
          </Button>
        </div>
      </div>

      {/* AI result banner */}
      {aiResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">Taux mis à jour par IA</p>
            {aiResult.source && <p className="text-xs text-green-700 mt-1">Source: {aiResult.source}</p>}
            {aiResult.notes && <p className="text-xs text-green-600 mt-1">{aiResult.notes}</p>}
            <p className="text-xs text-green-500 mt-1">Vérifiez les valeurs puis cliquez "Sauvegarder" pour confirmer.</p>
          </div>
        </div>
      )}
      {aiError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Erreur mise à jour IA</p>
            <p className="text-xs text-red-600 mt-1">{aiError}</p>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CSG */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">CSG — Contribution Sociale Généralisée</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pField("csg_seuil_taux_reduit", "Seuil taux réduit (MUR)", "Salaire brut ≤ ce seuil = taux réduit")}
              {pField("csg_salarie_taux_reduit", "Taux réduit salarié", "Si brut ≤ seuil", true)}
              {pField("csg_salarie_taux_plein", "Taux plein salarié", "Si brut > seuil", true)}
              {pField("csg_patronal", "Taux patronal", "% sur salaire brut", true)}
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Finance Act : 1.5% si brut ≤ 50 000 MUR, 3% au-delà. Patronal fixe à 6%.</p>
              </div>
            </CardContent>
          </Card>

          {/* NSF + Training + PRGF */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">NSF, Training Levy & PRGF</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pField("nsf_salarie", "NSF salarié", "National Savings Fund — salarié", true)}
              {pField("nsf_patronal", "NSF patronal", "National Savings Fund — employeur", true)}
              {pField("training_levy", "Training Levy (HRDC)", "% masse salariale", true)}
              {pField("prgf_taux", "PRGF patronal", "Portable Retirement Gratuity Fund — % du salaire brut", true)}
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>PRGF = 4.5% du salaire brut (Workers' Rights Act 2019). Contribution patronale obligatoire.</p>
              </div>
            </CardContent>
          </Card>

          {/* PAYE */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">PAYE — Pay As You Earn</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pField("paye_seuil_exoneration", "Seuil exonération annuel (MUR)", "En-dessous : PAYE = 0")}
              {pField("paye_taux_1", "Taux tranche 1", "Jusqu'au seuil tranche 2", true)}
              {pField("paye_seuil_taux_2", "Seuil tranche 2 annuel (MUR)", "Au-dessus : taux 2 s'applique")}
              {pField("paye_taux_2", "Taux tranche 2", "Revenu annuel > seuil tranche 2", true)}
              <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Barème : 0% jusqu'à 390K MUR/an, 10% jusqu'à 650K, 15% au-delà.</p>
              </div>
            </CardContent>
          </Card>

          {/* Salary Compensation + Forex */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Autres paramètres</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Salary Compensation (MUR/mois)</Label>
                <p className="text-xs text-gray-400 mb-1">Compensation salariale annuelle — montant fixe mensuel</p>
                <div className="flex items-center gap-2">
                  <Input type="number" step="1" value={salaryCompensation} onChange={e => setSalaryCompensation(e.target.value)} className="w-36" />
                  <span className="text-sm text-gray-500">MUR</span>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Taux EUR / MUR (par défaut)</Label>
                <p className="text-xs text-gray-400 mb-1">Utilisé si devise_salaire = EUR et pas de taux personnalisé</p>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" value={tauxEur} onChange={e => setTauxEur(e.target.value)} className="w-36" />
                  <span className="text-sm text-gray-500">1 EUR = {tauxEur} MUR</span>
                </div>
              </div>
              <div className="bg-orange-50 p-3 rounded text-xs text-orange-800 flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Les bulletins EUR affichent le montant converti en MUR pour les déclarations MRA.</p>
              </div>
            </CardContent>
          </Card>

          {/* OT */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Règles Heures Supplémentaires (WRA)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <p className="font-medium text-sm">Heures normales</p>
                  <p className="text-2xl font-bold text-[#1E2A4A]">9h / jour</p>
                  <p className="text-xs text-gray-400 mt-1">45h / semaine — pause 1h déduite</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="font-medium text-sm text-orange-800">OT Tranche 1</p>
                  <p className="text-2xl font-bold text-orange-600">1.5x</p>
                  <p className="text-xs text-orange-600 mt-1">De 9h à 11h (2h supplémentaires)</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="font-medium text-sm text-red-800">OT Tranche 2 / Jour férié</p>
                  <p className="text-2xl font-bold text-red-600">2x</p>
                  <p className="text-xs text-red-600 mt-1">Au-delà de 11h ou jour férié</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">Taux horaire = Salaire mensuel / (45h x 52 semaines / 12 mois)</p>
            </CardContent>
          </Card>

          {/* Jours fériés */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-[#1E2A4A] text-base">Jours fériés Maurice {new Date().getFullYear()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {joursFeries.map(j => (
                  <div key={j.date} className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-100">
                    <div>
                      <p className="text-xs font-medium text-purple-900">{j.label}</p>
                      <p className="text-xs text-purple-500">{new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR")}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Les jours fériés sont pris en compte automatiquement dans le calcul des OT (toutes heures x 2). Mis à jour via IA.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
