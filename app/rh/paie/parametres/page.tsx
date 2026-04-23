"use client"
import { useState, useEffect, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save, Info, RefreshCw, CheckCircle2, AlertTriangle, CalendarClock } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  calculerPeriodePaieSync,
  formaterPeriodeLibelle,
  DEFAULT_CONFIG,
  type PeriodePaieConfig,
  type PeriodePaieMode,
} from "@/lib/rh/periode-paie"

const NAVY = "#0B0F2E"

// PE1 — les jours fériés Maurice sont chargés dynamiquement depuis la
// table jours_feries (15 fériés officiels 2026 seedés). L'ancienne liste
// hardcodée contenait 2 erreurs (Ascension non fériée à Maurice, et le
// Labour Day positionné au 9/5 au lieu du 1/5).

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
// PE1 — Section "Période de paie" (paramétrable par société)
// ---------------------------------------------------------------------------
function PeriodePaieSection() {
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [cfg, setCfg] = useState<PeriodePaieConfig>({ ...DEFAULT_CONFIG })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Liste des sociétés accessibles.
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => {
        const rows = (d?.societes || []) as Array<{ id: string; nom: string }>
        setSocietes(rows)
        if (rows.length > 0 && !societeId) setSocieteId(rows[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Charge la config de la société sélectionnée.
  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    setFeedback(null)
    fetch(`/api/rh/societe?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        const s = d?.societe || d || {}
        setCfg({
          mode: (s.periode_paie_mode as PeriodePaieMode) || 'calendaire',
          jour_cut_off: Number(s.periode_paie_jour_cut_off) || 24,
          jour_paiement: s.periode_paie_jour_paiement == null
            ? null
            : Number(s.periode_paie_jour_paiement),
          offset_paiement_mois: (Number(s.periode_paie_offset_paiement_mois) === 1 ? 1 : 0) as 0 | 1,
          notes: s.periode_paie_notes || "",
        })
      })
      .catch(() => setCfg({ ...DEFAULT_CONFIG }))
      .finally(() => setLoading(false))
  }, [societeId])

  // Aperçu live calculé côté client (même logique que la RPC).
  const aperçu = useMemo(() => {
    const today = new Date()
    const refYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    return calculerPeriodePaieSync(cfg, refYmd)
  }, [cfg])

  const save = async () => {
    if (!societeId) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: societeId,
          periode_paie_mode: cfg.mode,
          periode_paie_jour_cut_off: cfg.jour_cut_off,
          periode_paie_jour_paiement: cfg.jour_paiement,
          periode_paie_offset_paiement_mois: cfg.offset_paiement_mois,
          periode_paie_notes: cfg.notes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${res.status}`)
      }
      setFeedback("✅ Configuration enregistrée. Les bulletins existants conservent leur période d'origine.")
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || "Erreur réseau"}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-2 border-indigo-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
          <CalendarClock className="h-5 w-5 text-indigo-600" />
          Période de paie
          <span className="ml-auto text-xs font-normal text-gray-500">PE1</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-sm">Société</Label>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger><SelectValue placeholder="Choisir une société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Mode de calcul de la période</Label>
              <div className="space-y-1.5 mt-1.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-mode"
                    checked={cfg.mode === 'calendaire'}
                    onChange={() => setCfg(c => ({ ...c, mode: 'calendaire' }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Mois calendaire</span>
                    <span className="text-gray-500"> — du 1er au dernier jour du mois (défaut).</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-mode"
                    checked={cfg.mode === 'cut_off_jour'}
                    onChange={() => setCfg(c => ({ ...c, mode: 'cut_off_jour' }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Période glissante avec cut-off</span>
                    <span className="text-gray-500"> — ex. 25/03 → 24/04.</span>
                  </span>
                </label>
              </div>
            </div>

            {cfg.mode === 'cut_off_jour' && (
              <div>
                <Label className="text-sm">Jour de clôture (1-31)</Label>
                <Input
                  type="number" min={1} max={31}
                  value={cfg.jour_cut_off}
                  onChange={e => setCfg(c => ({ ...c, jour_cut_off: Math.max(1, Math.min(31, Number(e.target.value) || 1)) }))}
                  className="w-24"
                />
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Date de paiement</Label>
              <div className="space-y-1.5 mt-1.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-paiement"
                    checked={cfg.jour_paiement == null}
                    onChange={() => setCfg(c => ({ ...c, jour_paiement: null }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">Dernier jour du mois</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-paiement"
                    checked={cfg.jour_paiement != null}
                    onChange={() => setCfg(c => ({ ...c, jour_paiement: c.jour_paiement ?? 28 }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">Jour fixe :</span>
                  <Input
                    type="number" min={1} max={31} disabled={cfg.jour_paiement == null}
                    value={cfg.jour_paiement ?? ''}
                    onChange={e => setCfg(c => ({ ...c, jour_paiement: Math.max(1, Math.min(31, Number(e.target.value) || 1)) }))}
                    className="w-20"
                  />
                </label>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Paiement</Label>
              <div className="space-y-1.5 mt-1.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-offset"
                    checked={cfg.offset_paiement_mois === 0}
                    onChange={() => setCfg(c => ({ ...c, offset_paiement_mois: 0 }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">Dans le même mois que la période</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="periode-offset"
                    checked={cfg.offset_paiement_mois === 1}
                    onChange={() => setCfg(c => ({ ...c, offset_paiement_mois: 1 }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">Le mois suivant</span>
                </label>
              </div>
            </div>

            <div>
              <Label className="text-sm">Notes internes (optionnel)</Label>
              <textarea
                className="w-full text-sm border rounded-md p-2 resize-none"
                rows={2}
                value={cfg.notes || ''}
                onChange={e => setCfg(c => ({ ...c, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 text-sm">
              <p className="font-semibold text-indigo-900 mb-1">
                💡 Aperçu pour {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
              <p className="text-indigo-900">{formaterPeriodeLibelle(aperçu)}</p>
              <p className="text-xs text-indigo-700 mt-1.5 font-mono">
                Période : {aperçu.periode_debut} → {aperçu.periode_fin}
              </p>
              <p className="text-xs text-indigo-700 font-mono">
                Paiement prévu : {aperçu.date_paiement}
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-300 rounded-md p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Rappels légaux Maurice</p>
                <p>
                  WRA 2019 S.27 n'impose pas de date précise — seule la fréquence mensuelle
                  est obligatoire. Pratique majoritaire : cut-off 24, paiement 25-28.
                </p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>PAYE reversé à la MRA dans les 20 jours suivant la fin du mois</li>
                  <li>La date de paiement doit figurer dans le contrat de travail</li>
                </ul>
              </div>
            </div>

            {feedback && (
              <div className={`rounded-md p-2 text-sm border ${feedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
                {feedback}
              </div>
            )}

            <Button
              onClick={save}
              disabled={saving || !societeId}
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Enregistrer la période de paie
            </Button>
            <p className="text-[11px] text-gray-500 italic">
              Seuls les nouveaux bulletins suivront la nouvelle période. Les bulletins
              existants (verrouillés ou payés) conservent leur période d'origine.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// G11 — Section End of Year Bonus (WRA S.54)
// ---------------------------------------------------------------------------
interface EoyBonusConfig {
  seuil_max: number
  inclut_hors_seuil: boolean
  date_paiement_75pct: string | null
  date_paiement_25pct: string | null
}

const EOY_DEFAULT: EoyBonusConfig = {
  seuil_max: 100000,
  inclut_hors_seuil: false,
  date_paiement_75pct: null,
  date_paiement_25pct: null,
}

function EoyBonusSection() {
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [cfg, setCfg] = useState<EoyBonusConfig>({ ...EOY_DEFAULT })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => {
        const rows = (d?.societes || []) as Array<{ id: string; nom: string }>
        setSocietes(rows)
        if (rows.length > 0 && !societeId) setSocieteId(rows[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    setFeedback(null)
    fetch(`/api/rh/societe?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        const s = d?.societe || d || {}
        setCfg({
          seuil_max: Number(s.eoy_bonus_seuil_max) || 100000,
          inclut_hors_seuil: Boolean(s.eoy_bonus_inclut_hors_seuil),
          date_paiement_75pct: s.eoy_bonus_date_paiement_75pct || null,
          date_paiement_25pct: s.eoy_bonus_date_paiement_25pct || null,
        })
      })
      .catch(() => setCfg({ ...EOY_DEFAULT }))
      .finally(() => setLoading(false))
  }, [societeId])

  const save = async () => {
    if (!societeId) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: societeId,
          eoy_bonus_seuil_max: cfg.seuil_max,
          eoy_bonus_inclut_hors_seuil: cfg.inclut_hors_seuil,
          eoy_bonus_date_paiement_75pct: cfg.date_paiement_75pct,
          eoy_bonus_date_paiement_25pct: cfg.date_paiement_25pct,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${res.status}`)
      }
      setFeedback("✅ Configuration EOY sauvegardée.")
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || "Erreur réseau"}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-2 border-amber-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
          <span>🎁</span>
          End of Year Bonus
          <span className="ml-auto text-xs font-normal text-gray-500">WRA S.54 — G11</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-sm">Société</Label>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger><SelectValue placeholder="Choisir une société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Seuil maximum (MUR/mois)</Label>
            <Input
              type="number"
              value={cfg.seuil_max}
              onChange={e => setCfg(c => ({ ...c, seuil_max: Number(e.target.value) || 0 }))}
              className="w-48"
            />
            <p className="text-[11px] text-gray-500 mt-1">Défaut S.54 : 100 000 MUR.</p>
          </div>
          <div className="flex items-start gap-2 pt-6">
            <input
              type="checkbox"
              id="inclut-hors-seuil"
              checked={cfg.inclut_hors_seuil}
              onChange={e => setCfg(c => ({ ...c, inclut_hors_seuil: e.target.checked }))}
              className="mt-0.5"
            />
            <Label htmlFor="inclut-hors-seuil" className="text-sm cursor-pointer">
              Étendre aux salariés &gt; seuil
              <p className="text-[11px] text-gray-500 font-normal">Politique interne plus généreuse.</p>
            </Label>
          </div>
          <div>
            <Label className="text-sm">Date paiement 75%</Label>
            <Input
              type="date"
              value={cfg.date_paiement_75pct || ''}
              onChange={e => setCfg(c => ({ ...c, date_paiement_75pct: e.target.value || null }))}
              className="w-48"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Vide = auto (5 jours ouvrables avant le 25/12).
            </p>
          </div>
          <div>
            <Label className="text-sm">Date paiement 25%</Label>
            <Input
              type="date"
              value={cfg.date_paiement_25pct || ''}
              onChange={e => setCfg(c => ({ ...c, date_paiement_25pct: e.target.value || null }))}
              className="w-48"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Vide = auto (dernier jour ouvrable de décembre).
            </p>
          </div>
        </div>

        {feedback && (
          <div className={`rounded-md p-2 text-sm border ${feedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {feedback}
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <p className="text-[11px] text-gray-500 italic">
            Les calculs et la génération des bonus se font depuis <code className="bg-gray-100 px-1 rounded">/rh/eoy-bonus</code>.
          </p>
          <Button
            onClick={save}
            disabled={saving || !societeId}
            className="text-white"
            style={{ backgroundColor: NAVY }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// G9 — Section Disturbance Allowance (WRA S.17A FMPA 2024)
// ---------------------------------------------------------------------------
interface DisturbanceConfig {
  active: boolean
  multiplier: number
}

const DISTURBANCE_DEFAULT: DisturbanceConfig = { active: false, multiplier: 1.0 }

function DisturbanceSection() {
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [cfg, setCfg] = useState<DisturbanceConfig>({ ...DISTURBANCE_DEFAULT })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => {
        const rows = (d?.societes || []) as Array<{ id: string; nom: string }>
        setSocietes(rows)
        if (rows.length > 0 && !societeId) setSocieteId(rows[0].id)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!societeId) return
    setLoading(true)
    setFeedback(null)
    fetch(`/api/rh/societe?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        const s = d?.societe || d || {}
        setCfg({
          active: Boolean(s.disturbance_allowance_active),
          multiplier: Number(s.disturbance_hourly_multiplier) || 1.0,
        })
      })
      .catch(() => setCfg({ ...DISTURBANCE_DEFAULT }))
      .finally(() => setLoading(false))
  }, [societeId])

  const save = async () => {
    if (!societeId) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: societeId,
          disturbance_allowance_active: cfg.active,
          disturbance_hourly_multiplier: cfg.multiplier,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${res.status}`)
      }
      setFeedback("✅ Paramètres disturbance enregistrés.")
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || "Erreur réseau"}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-2 border-indigo-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
          <span>🌙</span>
          Disturbance Allowance
          <span className="ml-auto text-xs font-normal text-gray-500">WRA S.17A — FMPA 2024 — G9</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-sm">Société</Label>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger><SelectValue placeholder="Choisir une société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="disturbance-active"
            checked={cfg.active}
            onChange={e => setCfg(c => ({ ...c, active: e.target.checked }))}
            className="mt-0.5"
          />
          <Label htmlFor="disturbance-active" className="text-sm cursor-pointer">
            Activer l&apos;allocation automatique
            <p className="text-[11px] text-gray-500 font-normal">
              Si actif, chaque bulletin mensuel ajoute automatiquement la
              disturbance allowance calculée depuis les sessions de pointage.
            </p>
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">Multiplicateur taux horaire</Label>
            <Input
              type="number" step="0.05" min={1.0}
              value={cfg.multiplier}
              onChange={e => setCfg(c => ({ ...c, multiplier: Math.max(1.0, Number(e.target.value) || 1.0) }))}
              className="w-32"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              1.0 = taux horaire standard S.17A. Au-delà = politique plus généreuse.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 text-[12px] text-indigo-900 space-y-1">
            <p className="font-semibold">Unsocial hours (non modifiable — légal)</p>
            <p>• Semaine : 22h00 → 06h00</p>
            <p>• Weekend : samedi 13h00 → lundi 06h00</p>
          </div>
        </div>

        {feedback && (
          <div className={`rounded-md p-2 text-sm border ${feedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {feedback}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            onClick={save}
            disabled={saving || !societeId}
            className="text-white"
            style={{ backgroundColor: NAVY }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
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
    // Sprint 2 — night shift majoration paramétrable (mig 137).
    night_shift_pct: "0.15",
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

  // PE1 — fetch dynamique des jours fériés depuis la DB.
  const [anneeFeries] = useState(new Date().getFullYear())
  const [joursFeries, setJoursFeries] = useState<Array<{ date: string; libelle: string }>>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/rh/jours-feries?annee=${anneeFeries}`)
      .then(r => r.ok ? r.json() : { jours_feries: [] })
      .then(d => {
        if (cancelled) return
        const rows = (d?.jours_feries || d?.data || []) as any[]
        setJoursFeries(
          rows
            .filter(r => r?.date)
            .map(r => ({
              date: String(r.date).slice(0, 10),
              libelle: String(r.libelle || r.label || ''),
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        )
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [anneeFeries])

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
            // PE1 BUG 2 — night_shift_pct était parfois stocké en %
            // (15) au lieu de décimal (0.15), d'où affichage "1500%".
            // Normalisation défensive : valeur > 1 ⇒ diviser par 100.
            night_shift_pct: String(
              Number(d.params.night_shift_pct ?? 0.15) > 1
                ? Number(d.params.night_shift_pct) / 100
                : (d.params.night_shift_pct ?? 0.15),
            ),
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
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
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

      {/* PE1 — Section période de paie (paramétrable par société) */}
      <PeriodePaieSection />

      {/* G11 — Section End of Year Bonus (WRA S.54) */}
      <EoyBonusSection />

      {/* G9 — Section Disturbance Allowance (WRA S.17A FMPA 2024) */}
      <DisturbanceSection />

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
                <p>Finance Act 2025/26 : 1.5% si brut ≤ 50 000 MUR, 3% au-delà. Patronal fixe à 6%.</p>
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
                <p>Barème Finance Act 2025/26 : 0% jusqu'à 390 000 MUR/an, 10% jusqu'à 650 000, 15% au-delà.</p>
              </div>

              {/* Sprint 2 — night shift majoration paramétrable (mig 137) */}
              <div className="border-t pt-3 mt-3">
                <NumField
                  label="Majoration heures de nuit"
                  desc="Pourcentage du salaire base ajouté pour les heures travaillées 21h-6h. Défaut WRA 2019 : 15%."
                  defaultVal={params.night_shift_pct}
                  pct
                  onCommit={setParam("night_shift_pct")}
                />
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

          {/* Jours fériés (PE1 — chargés dynamiquement depuis la DB) */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between" style={{ color: NAVY }}>
                <span>Jours fériés Maurice {anneeFeries}</span>
                <span className="text-xs font-normal text-gray-500">
                  {joursFeries.length > 0 ? `${joursFeries.length} fériés` : 'Chargement…'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {joursFeries.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Aucun jour férié enregistré pour {anneeFeries}.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {joursFeries.map(j => (
                    <div key={j.date} className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-100">
                      <span className="text-purple-600 text-sm">🎌</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-purple-900 truncate" title={j.libelle}>{j.libelle}</p>
                        <p className="text-xs text-purple-500">
                          {new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Les jours fériés sont pris en compte automatiquement dans le calcul des OT (× 2).
                Modification : <code className="text-[11px] bg-gray-100 px-1 rounded">public.jours_feries</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
