"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserMinus, Calculator, CheckCircle, AlertTriangle, Clock, Banknote, Plus, Trash2, Edit2, FileText, Mail, Download, Unlock } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import { notifySuccess, notifyError } from "@/lib/utils/toast"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}

// Arrondi à 2 décimales (centimes).
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// POST le body au backend, récupère le Blob PDF, l'ouvre dans un nouvel
// onglet. Permet d'envoyer le breakdown édité (impossible en GET).
async function openPdfPost(url: string, body: any, filename: string, locale: Locale) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(t('sarh.depart.err_prefix', locale).replace('{msg}', String(j.error || res.statusText)))
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const win = window.open(blobUrl, '_blank')
    if (!win) {
      // popup bloqué : on télécharge à la place
      const a = document.createElement('a')
      a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
  } catch (e: any) {
    alert(t('sarh.depart.err_network_prefix', locale).replace('{msg}', String(e?.message || e)))
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function getTypeLabels(locale: Locale): Record<string, string> {
  return {
    demission: t('rha.b.depart.type_demission', locale),
    licenciement: t('rha.b.depart.type_licenciement', locale),
    licenciement_faute: t('rha.b.depart.type_licenciement_faute', locale),
    fin_contrat: t('rha.b.depart.type_fin_contrat', locale),
    retraite: t('rha.b.depart.type_retraite', locale),
    deces: t('rha.b.depart.type_deces', locale),
  }
}

// ── Sub-component: Departure Form (isolated state) ──
function DepartureForm({ societes, onCalculated, locale }: {
  societes: any[]
  onCalculated: (breakdown: any, formData: any) => void
  locale: Locale
}) {
  const [societeId, setSocieteId] = useState("")
  const [employes, setEmployes] = useState<any[]>([])
  const [employeId, setEmployeId] = useState("")
  const [dateDepart, setDateDepart] = useState("")
  const [typeDepart, setTypeDepart] = useState("")
  const [raison, setRaison] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingEmps, setLoadingEmps] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load employees when société changes
  useEffect(() => {
    if (!societeId) { setEmployes([]); setEmployeId(""); return }
    setLoadingEmps(true)
    fetch(`/api/rh/employes?societe_id=${societeId}&statut=presents`)
      .then(r => r.json())
      .then(d => { setEmployes(d.employes || []); setEmployeId("") })
      .catch(() => setEmployes([]))
      .finally(() => setLoadingEmps(false))
  }, [societeId])

  const handleCalculer = async () => {
    if (!employeId || !dateDepart || !typeDepart) {
      setError(t('sarh.depart.err_fill_required', locale))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_solde", employe_id: employeId, date_depart: dateDepart, type_depart: typeDepart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('sarh.depart.err_generic', locale))
      onCalculated(data.breakdown, { employe_id: employeId, date_depart: dateDepart, type_depart: typeDepart, raison_depart: raison })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('sarh.depart.err_generic', locale))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
          <UserMinus className="w-5 h-5" />
          {t('rha.b.depart.new', locale)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>{t('rha.b.depart.lbl_societe_req', locale)}</Label>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger><SelectValue placeholder={t('rha.b.depart.choose_societe', locale)} /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('rha.b.depart.lbl_employee_req', locale)}</Label>
            <Select value={employeId} onValueChange={setEmployeId} disabled={!societeId || loadingEmps}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEmps ? t('rha.b.depart.loading_emps', locale) : t('rha.b.depart.choose_employee', locale)} />
              </SelectTrigger>
              <SelectContent>
                {employes.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.prenom} {e.nom} {e.poste ? `— ${e.poste}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('rha.b.depart.lbl_date_req', locale)}</Label>
            <Input type="date" value={dateDepart} onChange={e => setDateDepart(e.target.value)} />
          </div>
          <div>
            <Label>{t('rha.b.depart.lbl_type_req', locale)}</Label>
            <Select value={typeDepart} onValueChange={setTypeDepart}>
              <SelectTrigger><SelectValue placeholder={t('sarh.depart.choose_dots', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="demission">{t('rha.b.depart.type_demission', locale)}</SelectItem>
                <SelectItem value="licenciement">{t('rha.b.depart.type_licenciement', locale)}</SelectItem>
                <SelectItem value="licenciement_faute">{t('rha.b.depart.type_licenciement_faute', locale)}</SelectItem>
                <SelectItem value="fin_contrat">{t('rha.b.depart.type_fin_contrat', locale)}</SelectItem>
                <SelectItem value="retraite">{t('rha.b.depart.type_retraite', locale)}</SelectItem>
                <SelectItem value="deces">{t('rha.b.depart.type_deces', locale)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>{t('rha.b.depart.lbl_reason', locale)}</Label>
            <Textarea
              value={raison}
              onChange={e => setRaison(e.target.value)}
              placeholder={t('rha.b.depart.reason_ph', locale)}
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              if (!employeId || !dateDepart) { setError(t('sarh.depart.err_emp_date_required', locale)); return }
              setLoading(true); setError(null)
              try {
                const res = await fetch("/api/rh/depart", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "sortie_manuelle", employe_id: employeId, date_depart: dateDepart, type_depart: typeDepart || "demission", raison_depart: raison }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || t('sarh.depart.err_generic', locale))
                alert(data.message || t('sarh.depart.exit_recorded', locale))
                setEmployeId(""); setDateDepart("")
              } catch (e: unknown) { setError(e instanceof Error ? e.message : t('sarh.depart.err_generic', locale)) }
              finally { setLoading(false) }
            }}
            disabled={loading || !employeId || !dateDepart}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <UserMinus className="w-4 h-4 mr-2" />
            {t('rha.b.depart.btn_manual_exit', locale)}
          </Button>
          <Button
            onClick={handleCalculer}
            disabled={loading || !employeId || !dateDepart || !typeDepart}
            className="bg-[#0B0F2E] text-white"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Calculator className="w-4 h-4 mr-2" />
            {t('rha.b.depart.btn_calculate_settlement', locale)}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Recompute the global total from the (possibly edited) breakdown.
// Arrondi à 2 décimales pour cohérence avec l'affichage MUR.
function recomputeTotal(b: any): number {
  const lines = [
    b?.salaire_prorata?.montant,
    b?.conges_al?.montant,
    b?.conges_sl?.montant,         // toujours 0 (WRA)
    b?.conges_vl?.montant,         // WRA s.47 — payable à la sortie
    b?.treizieme_mois?.montant,
    b?.allocations_prorata?.montant,
    b?.preavis?.applicable ? b?.preavis?.montant : 0,
    b?.indemnite_licenciement?.applicable ? b?.indemnite_licenciement?.montant : 0,
  ]
  const extras: Array<{ montant: number }> = Array.isArray(b?.lignes_extra) ? b.lignes_extra : []
  const sum = lines.reduce((s: number, v: any) => s + (Number(v) || 0), 0)
            + extras.reduce((s, e) => s + (Number(e?.montant) || 0), 0)
  return r2(sum)
}

// Petit input numérique pour les cellules éditables — accepte les centimes
// (step 0.01), arrondit à 2 décimales en sortie.
function MontantInput({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <Input
      type="number"
      step="0.01"
      value={Number.isFinite(value) ? value : 0}
      onChange={e => onChange(r2(Number(e.target.value) || 0))}
      className={`h-8 text-right text-sm w-32 ml-auto ${className}`}
    />
  )
}

// ── Sub-component: Settlement Breakdown Display ──
function BreakdownDisplay({ breakdown, setBreakdown, formData, onConfirm, confirming, locale }: {
  breakdown: any
  setBreakdown: (b: any) => void
  formData: any
  onConfirm: () => void
  confirming: boolean
  locale: Locale
}) {
  const TYPE_LABELS = getTypeLabels(locale)
  const emp = breakdown.employe
  const anc = breakdown.anciennete
  const [editMode, setEditMode] = useState(false)
  const [newLibelle, setNewLibelle] = useState('')
  const [newMontant, setNewMontant] = useState('')

  // Helper : update a single field within breakdown and recompute total
  // FIX-STC-TRIGGER236 — chaque mutation logge le path et la nouvelle valeur,
  // pour vérifier dans la console navigateur que React reçoit bien le changement.
  const updateField = (path: string[], value: number) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    let ref: any = next
    for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]]
    ref[path[path.length - 1]] = value
    next.total = recomputeTotal(next)
    console.warn('[depart.updateField]', { path, value, newTotal: next.total })
    setBreakdown(next)
  }

  const addExtraLine = () => {
    if (!newLibelle.trim()) return
    const montant = r2(Number(newMontant) || 0)
    const next = JSON.parse(JSON.stringify(breakdown))
    if (!Array.isArray(next.lignes_extra)) next.lignes_extra = []
    next.lignes_extra.push({ libelle: newLibelle.trim(), montant })
    next.total = recomputeTotal(next)
    console.warn('[depart.addExtraLine]', {
      libelle: newLibelle.trim(),
      montant,
      lignes_extra_count: next.lignes_extra.length,
      newTotal: next.total,
    })
    setBreakdown(next)
    setNewLibelle('')
    setNewMontant('')
  }

  const removeExtraLine = (index: number) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    next.lignes_extra = (next.lignes_extra || []).filter((_: any, i: number) => i !== index)
    next.total = recomputeTotal(next)
    console.warn('[depart.removeExtraLine]', { index, remaining: next.lignes_extra.length, newTotal: next.total })
    setBreakdown(next)
  }

  const updateExtraLine = (index: number, patch: { libelle?: string; montant?: number }) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    next.lignes_extra[index] = { ...next.lignes_extra[index], ...patch }
    next.total = recomputeTotal(next)
    console.warn('[depart.updateExtraLine]', { index, patch, newTotal: next.total })
    setBreakdown(next)
  }

  const lignesExtra: Array<{ libelle: string; montant: number; note?: string }> = breakdown?.lignes_extra || []

  return (
    <Card className="border-2 border-[#D4AF37]">
      <CardHeader className="bg-[#0B0F2E] text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[#D4AF37]" />
          {t('rha.b.depart.settlement_for', locale)} {emp.prenom} {emp.nom}
        </CardTitle>
        <p className="text-white/70 text-sm">
          {emp.poste || "—"} | {t('sarh.depart.base_salary_label', locale)} {fmt(emp.salaire_base)} | {t('sarh.depart.arrival_label', locale)} {fmtDate(emp.date_arrivee)}
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Ancienneté + toggle édition */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
          <Clock className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-semibold text-[#0B0F2E]">{t('rha.b.depart.seniority', locale)}</p>
            <p className="text-sm text-gray-600">{anc.label}</p>
          </div>
          <Badge variant="outline" className="ml-2 border-blue-300 text-blue-700">
            {TYPE_LABELS[formData.type_depart] || formData.type_depart}
          </Badge>
          <Button
            size="sm"
            variant={editMode ? 'default' : 'outline'}
            onClick={() => setEditMode(!editMode)}
            className={`ml-auto ${editMode ? 'bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#C9A630]' : 'border-[#0B0F2E] text-[#0B0F2E]'}`}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            {editMode ? t('sarh.depart.lock', locale) : t('sarh.depart.edit_amounts', locale)}
          </Button>
        </div>

        {/* Breakdown table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">{t('rha.b.depart.col_element', locale)}</TableHead>
              <TableHead className="text-center">{t('rha.b.depart.col_details', locale)}</TableHead>
              <TableHead className="text-right font-semibold">{t('rha.b.depart.col_amount', locale)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Prorata salary */}
            <TableRow>
              <TableCell className="font-medium">{t('rha.b.depart.row_prorata', locale)}</TableCell>
              <TableCell className="text-center text-sm text-gray-500">
                {breakdown.salaire_prorata.jours_travailles} / {breakdown.salaire_prorata.jours_mois} jours
              </TableCell>
              <TableCell className="text-right font-medium">
                {editMode
                  ? <MontantInput value={breakdown.salaire_prorata.montant} onChange={v => updateField(['salaire_prorata', 'montant'], v)} />
                  : fmt(breakdown.salaire_prorata.montant)}
              </TableCell>
            </TableRow>

            {/* AL payout — WRA s.46 : solde négatif = déduction sur STC */}
            <TableRow className={breakdown.conges_al.restant < 0 ? "bg-red-50" : ""}>
              <TableCell className="font-medium">
                {t('rha.b.depart.row_al_remain', locale)}
                {breakdown.conges_al.restant < 0 && (
                  <Badge variant="destructive" className="ml-2">{t('sarh.depart.negative_balance', locale)}</Badge>
                )}
              </TableCell>
              <TableCell className="text-center text-sm text-gray-500">
                {breakdown.conges_al.restant.toFixed(2)} jours ({breakdown.conges_al.droit_prorata} acquis − {breakdown.conges_al.pris} pris) × {fmt(breakdown.conges_al.taux_journalier)}/j
                {breakdown.conges_al.restant < 0 && (
                  <span className="block text-[10px] text-red-600 mt-0.5">
                    {t('sarh.depart.wra_s46_deduction', locale)}
                  </span>
                )}
              </TableCell>
              <TableCell className={`text-right font-medium ${breakdown.conges_al.montant < 0 ? 'text-red-600' : ''}`}>
                {editMode
                  ? <MontantInput value={breakdown.conges_al.montant} onChange={v => updateField(['conges_al', 'montant'], v)} />
                  : fmt(breakdown.conges_al.montant)}
              </TableCell>
            </TableRow>

            {/* SL — WRA Art. 48(2) : NON payable à la sortie */}
            <TableRow className="bg-gray-50/50">
              <TableCell className="font-medium text-gray-500">
                {t('rha.b.depart.row_sl_unused', locale)}
                <span className="block text-[10px] text-amber-700 mt-0.5">
                  {t('rha.b.depart.row_sl_unpaid', locale)}
                </span>
              </TableCell>
              <TableCell className="text-center text-sm text-gray-400">
                {breakdown.conges_sl.restant} jours restants (info)
              </TableCell>
              <TableCell className="text-right text-gray-400 line-through">
                {fmt(breakdown.conges_sl.restant * breakdown.conges_sl.taux_journalier)}
              </TableCell>
            </TableRow>

            {/* VL — WRA s.47 (30 jours / 5 ans, payable à la sortie)
                TOUJOURS visible : montre le statut d'éligibilité même
                quand droit = 0 (sinon l'utilisateur ne voit pas pourquoi
                la ligne manque — cas Mélanie Ravina, mai 2026). */}
            {breakdown.conges_vl ? (
              <TableRow
                className={
                  breakdown.conges_vl.restant < 0
                    ? "bg-red-50"
                    : breakdown.conges_vl.droit > 0
                      ? "bg-purple-50"
                      : "bg-gray-50"
                }
              >
                <TableCell className="font-medium">
                  {t('sarh.depart.vl_title', locale)}
                  {breakdown.conges_vl.restant < 0 && (
                    <Badge variant="destructive" className="ml-2">{t('sarh.depart.negative_balance', locale)}</Badge>
                  )}
                  {breakdown.conges_vl.droit === 0 && breakdown.conges_vl.restant >= 0 && (
                    <span className="block text-xs text-amber-600 mt-1">
                      {t('sarh.depart.vl_not_eligible', locale).replace('{status}', String(breakdown.conges_vl.eligibility_status || t('sarh.depart.unknown', locale)))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm text-gray-600">
                  {breakdown.conges_vl.droit > 0 || breakdown.conges_vl.restant < 0 ? (
                    <>
                      {Number(breakdown.conges_vl.restant).toFixed(2)}j ({breakdown.conges_vl.droit} − {breakdown.conges_vl.pris}) × {fmt(breakdown.conges_vl.taux_journalier)}/j
                      {breakdown.conges_vl.restant < 0 && (
                        <span className="block text-[10px] text-red-600 mt-0.5">
                          WRA s.46 — déduction sur solde de tout compte
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {t('sarh.depart.cycle_label', locale)} {breakdown.conges_vl.cycle_debut || 'n/a'} → {breakdown.conges_vl.cycle_fin || 'n/a'}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${breakdown.conges_vl.montant < 0 ? 'text-red-600' : ''}`}
                >
                  {breakdown.conges_vl.droit > 0 || breakdown.conges_vl.restant < 0 ? (
                    editMode ? (
                      <MontantInput
                        value={breakdown.conges_vl.montant}
                        onChange={v => updateField(['conges_vl', 'montant'], v)}
                      />
                    ) : fmt(breakdown.conges_vl.montant)
                  ) : (
                    <span className="text-xs text-gray-400">{t('sarh.depart.info_dash', locale)}</span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow className="bg-gray-50">
                <TableCell className="font-medium">
                  {t('sarh.depart.vl_title', locale)}
                  <span className="block text-xs text-amber-600 mt-1">
                    {t('sarh.depart.vl_unavailable', locale)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs text-gray-500">
                  {t('sarh.depart.vl_missing', locale)}
                </TableCell>
                <TableCell className="text-right text-xs text-gray-400">{t('sarh.depart.info_dash', locale)}</TableCell>
              </TableRow>
            )}

            {/* 13th month */}
            <TableRow>
              <TableCell className="font-medium">{t('rha.b.depart.row_13th', locale)}</TableCell>
              <TableCell className="text-center text-sm text-gray-500">
                ({fmt(breakdown.employe.salaire_base)} / 12) x {breakdown.treizieme_mois.mois_travailles} mois
              </TableCell>
              <TableCell className="text-right font-medium">
                {editMode
                  ? <MontantInput value={breakdown.treizieme_mois.montant} onChange={v => updateField(['treizieme_mois', 'montant'], v)} />
                  : fmt(breakdown.treizieme_mois.montant)}
              </TableCell>
            </TableRow>

            {/* Allocations prorata */}
            {(breakdown.allocations_prorata.montant > 0 || editMode) && (
              <TableRow>
                <TableCell className="font-medium">{t('rha.b.depart.row_allowances', locale)}</TableCell>
                <TableCell className="text-center text-sm text-gray-500">
                  Transport: {fmt(breakdown.allocations_prorata.transport)} + Essence: {fmt(breakdown.allocations_prorata.petrol)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {editMode
                    ? <MontantInput value={breakdown.allocations_prorata.montant} onChange={v => updateField(['allocations_prorata', 'montant'], v)} />
                    : fmt(breakdown.allocations_prorata.montant)}
                </TableCell>
              </TableRow>
            )}

            {/* Notice period */}
            {breakdown.preavis.applicable && (
              <TableRow className={breakdown.preavis.montant > 0 ? "bg-orange-50" : ""}>
                <TableCell className="font-medium">
                  {t('rha.b.depart.row_notice', locale)}
                  {formData.type_depart === 'licenciement_faute' && (
                    <span className="block text-[10px] text-orange-700 mt-0.5">{t('sarh.depart.notice_1month_fault', locale)}</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm text-gray-500">
                  {breakdown.preavis.description} ({breakdown.preavis.duree_mois} mois x {fmt(breakdown.employe.salaire_base)})
                </TableCell>
                <TableCell className="text-right font-medium">
                  {editMode
                    ? <MontantInput value={breakdown.preavis.montant} onChange={v => updateField(['preavis', 'montant'], v)} />
                    : fmt(breakdown.preavis.montant)}
                </TableCell>
              </TableRow>
            )}

            {/* Severance */}
            {breakdown.indemnite_licenciement.applicable && (
              <TableRow className="bg-red-50">
                <TableCell className="font-medium text-red-800">
                  {t('rha.b.depart.row_severance', locale)}
                  {/* G12 — lien calculateur dédié WRA S.70 */}
                  {typeof breakdown.employe_id === 'string' && (
                    <a
                      href={`/rh/severance?employe_id=${breakdown.employe_id}&date=${encodeURIComponent(breakdown?.date_depart || '')}`}
                      className="ml-2 text-[11px] underline text-indigo-700"
                      title={t('sarh.depart.open_s70_calc_title', locale)}
                    >
                      {t('sarh.depart.s70_calc_link', locale)}
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm text-red-600">
                  {breakdown.indemnite_licenciement.formule} ({breakdown.indemnite_licenciement.annees_service} ans)
                </TableCell>
                <TableCell className="text-right font-bold text-red-800">
                  {editMode
                    ? <MontantInput value={breakdown.indemnite_licenciement.montant} onChange={v => updateField(['indemnite_licenciement', 'montant'], v)} />
                    : fmt(breakdown.indemnite_licenciement.montant)}
                </TableCell>
              </TableRow>
            )}

            {/* Lignes additionnelles éditables */}
            {lignesExtra.map((l, i) => (
              <TableRow key={`extra-${i}`} className="bg-amber-50/40 align-top">
                <TableCell className="font-medium">
                  {editMode
                    ? <Textarea
                        value={l.libelle}
                        onChange={e => updateExtraLine(i, { libelle: e.target.value })}
                        rows={Math.max(2, (l.libelle || '').split('\n').length)}
                        className="text-sm min-h-[60px] resize-y"
                        placeholder={t('sarh.depart.label_ph_single', locale)}
                      />
                    : <span className="whitespace-pre-wrap">{l.libelle}</span>}
                  {l.note && <p className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap">{l.note}</p>}
                </TableCell>
                <TableCell className="text-center text-xs text-amber-700">{t('sarh.depart.manual_adjustment', locale)}</TableCell>
                <TableCell className="text-right font-medium">
                  <div className="flex items-start justify-end gap-2">
                    {editMode
                      ? <MontantInput value={l.montant} onChange={v => updateExtraLine(i, { montant: v })} />
                      : <span className={l.montant < 0 ? 'text-red-700' : ''}>{fmt(l.montant)}</span>}
                    {editMode && (
                      <Button size="sm" variant="ghost" onClick={() => removeExtraLine(i)} className="h-7 px-2 text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* Ajout d'une ligne — visible uniquement en mode édition */}
            {editMode && (
              <TableRow className="bg-amber-50 align-top">
                <TableCell>
                  <Textarea
                    value={newLibelle}
                    onChange={e => setNewLibelle(e.target.value)}
                    rows={Math.max(2, (newLibelle || '').split('\n').length)}
                    placeholder={t('sarh.depart.label_ph_multi', locale)}
                    className="text-sm min-h-[60px] resize-y"
                  />
                </TableCell>
                <TableCell className="text-center text-[11px] text-gray-500">
                  {t('sarh.depart.negative_for_deduction', locale)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-start justify-end gap-2">
                    <Input type="number" step="0.01" value={newMontant} onChange={e => setNewMontant(e.target.value)}
                           placeholder="0.00" className="h-8 text-right text-sm w-32" />
                    <Button size="sm" onClick={addExtraLine} disabled={!newLibelle.trim()}
                            className="h-8 bg-[#D4AF37] hover:bg-[#C9A630] text-[#0B0F2E]">
                      <Plus className="w-3.5 h-3.5 mr-1" /> {t('cui.add', locale)}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* TOTAL */}
            <TableRow className="bg-[#0B0F2E]">
              <TableCell className="font-bold text-white text-base" colSpan={2}>
                {t('rha.b.depart.row_total', locale)}
              </TableCell>
              <TableCell className="text-right font-bold text-[#D4AF37] text-lg">
                {fmt(breakdown.total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Confirm button */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
            <p className="text-sm font-medium">{t('rha.b.depart.irreversible', locale)}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            {/* Sprint 2 — Export PDF via window.print(). Le user sélectionne
                « Enregistrer comme PDF » dans la boîte d'impression — fonctionne
                dans tous les navigateurs sans dépendance jsPDF/pdfkit. */}
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="border-[#0B0F2E] text-[#0B0F2E]"
              type="button"
            >
              {t('rha.b.depart.btn_print_settlement', locale)}
            </Button>
            {/* Documents officiels — POST avec breakdown (preview avant
                confirmation : watermark BROUILLON sur le PDF). */}
            <Button
              variant="outline"
              onClick={() => openPdfPost('/api/rh/depart/certificat', {
                employe_id: breakdown?.employe?.id, date_depart: formData.date_depart, type_depart: formData.type_depart,
              }, `Certificat_${breakdown?.employe?.prenom}_${breakdown?.employe?.nom}.pdf`, locale)}
              className="border-purple-300 text-purple-700"
              type="button"
            >
              {t('rha.b.depart.btn_work_certificate', locale)}
            </Button>
            <Button
              variant="outline"
              onClick={() => openPdfPost('/api/rh/depart/solde-tout-compte', {
                employe_id: breakdown?.employe?.id, date_depart: formData.date_depart, type_depart: formData.type_depart,
                breakdown, raison_depart: formData.raison_depart,
              }, `Solde_${breakdown?.employe?.prenom}_${breakdown?.employe?.nom}.pdf`, locale)}
              className="border-emerald-300 text-emerald-700"
              type="button"
            >
              {t('rha.b.depart.btn_settlement_doc', locale)}
            </Button>
            <Button
              variant="outline"
              onClick={() => openPdfPost('/api/rh/depart/attestation', {
                employe_id: breakdown?.employe?.id, date_depart: formData.date_depart, type_depart: formData.type_depart,
              }, `Attestation_${breakdown?.employe?.prenom}_${breakdown?.employe?.nom}.pdf`, locale)}
              className="border-blue-300 text-blue-700"
              type="button"
            >
              {t('rha.b.depart.btn_attestation', locale)}
            </Button>
            {/* Workfare TUB — uniquement licenciement économique (pas faute) */}
            {formData.type_depart === 'licenciement' && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/rh/depart/workfare?employe_id=${breakdown?.employe?.id}&date_depart=${encodeURIComponent(formData.date_depart || '')}`, '_blank')}
                className="border-red-300 text-red-700"
                type="button"
              >
                {t('rha.b.depart.btn_workfare', locale)}
              </Button>
            )}
            <Button
              onClick={onConfirm}
              disabled={confirming}
              className="bg-red-600 hover:bg-red-700 text-white px-6"
            >
              {confirming && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('rha.b.depart.btn_confirm', locale)}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Dialog : récupérer / envoyer les documents d'un départ confirmé ──
const DOCS_CATALOG: Array<{ key: string; labelKey: string; path: string; restrictTo?: string }> = [
  { key: 'certificat',  labelKey: 'sarh.depart.doc_work_certificate',  path: '/api/rh/depart/certificat' },
  { key: 'attestation', labelKey: 'sarh.depart.doc_end_attestation',   path: '/api/rh/depart/attestation' },
  { key: 'solde',       labelKey: 'sarh.depart.doc_settlement',        path: '/api/rh/depart/solde-tout-compte' },
  { key: 'workfare',    labelKey: 'sarh.depart.doc_workfare',          path: '/api/rh/depart/workfare', restrictTo: 'licenciement' },
]

function DocumentsDialog({ depart, onClose }: { depart: any; onClose: () => void }) {
  const locale: Locale = getLocale()
  const availableDocs = DOCS_CATALOG.filter(d => !d.restrictTo || d.restrictTo === depart.type_depart)
  const [selected, setSelected] = useState<Set<string>>(new Set(availableDocs.map(d => d.key)))
  const [recipientEmail, setRecipientEmail] = useState(depart.email || depart.email_personnel || '')
  const [message, setMessage] = useState(
    t('sarh.depart.email_body', locale).replace('{name}', String(depart.prenom || ''))
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toggle = (k: string) => {
    const next = new Set(selected)
    if (next.has(k)) next.delete(k); else next.add(k)
    setSelected(next)
  }

  const downloadDoc = (path: string, filename: string) => {
    const url = `${path}?employe_id=${depart.id}`
    window.open(url, '_blank')
    // déclencher un download — l'endpoint renvoie Content-Disposition: inline,
    // donc l'onglet l'affiche ; on offre aussi un lien direct via <a download>
  }

  const sendEmail = async () => {
    if (!recipientEmail) { setResult({ type: 'error', text: t('sarh.depart.enter_email', locale) }); return }
    if (selected.size === 0) { setResult({ type: 'error', text: t('sarh.depart.select_one_doc', locale) }); return }
    setSending(true); setResult(null)
    try {
      const res = await fetch('/api/rh/depart/envoyer-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employe_id: depart.id,
          docs: Array.from(selected),
          recipient_email: recipientEmail,
          message,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('sarh.depart.err_generic', locale))
      setResult({ type: 'success', text: t('sarh.depart.email_sent', locale).replace('{recipient}', String(j.recipient)).replace('{count}', String(j.sent_docs?.length || 0)) })
    } catch (e: any) {
      setResult({ type: 'error', text: e?.message || t('sarh.depart.err_generic', locale) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl" aria-describedby="depart-docs-dialog-desc">
        <DialogHeader>
          <DialogTitle className="text-[#0B0F2E]">
            {t('sarh.depart.docs_dialog_title', locale)} {depart.prenom} {depart.nom}
          </DialogTitle>
          <DialogDescription id="depart-docs-dialog-desc">
            {t('sarh.depart.docs_dialog_desc', locale)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2 text-[#0B0F2E]">{t('sarh.depart.docs_selection', locale)}</p>
            <div className="space-y-1">
              {availableDocs.map(d => (
                <div key={d.key} className="flex items-center justify-between p-2 border rounded-lg hover:bg-gray-50">
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} />
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">{t(d.labelKey, locale)}</span>
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => downloadDoc(d.path, t(d.labelKey, locale))}
                          className="text-xs text-blue-700 hover:bg-blue-50">
                    <Download className="w-3.5 h-3.5 mr-1" /> {t('sarh.depart.download', locale)}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm">{t('sarh.depart.recipient_email', locale)}</Label>
            <Input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                   placeholder="employe@example.com" />
            {!depart.email && !depart.email_personnel && (
              <p className="text-xs text-amber-700 mt-1">
                {t('sarh.depart.no_email_warning', locale)}
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm">{t('sarh.depart.message_optional', locale)}</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
          </div>

          {result && (
            <div className={`p-3 rounded-lg text-sm ${result.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result.text}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{t('cui.close', locale)}</Button>
          <Button onClick={sendEmail} disabled={sending || selected.size === 0 || !recipientEmail}
                  className="bg-[#D4AF37] hover:bg-[#C9A630] text-[#0B0F2E]">
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            {t('sarh.depart.send_by_email', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-component: Recent Departures List ──
function RecentDepartures({ refreshKey, onReintegrated, locale }: { refreshKey: number; onReintegrated?: () => void; locale: Locale }) {
  const TYPE_LABELS = getTypeLabels(locale)
  const [departs, setDeparts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reintegratingId, setReintegratingId] = useState<string | null>(null)
  const [docsFor, setDocsFor] = useState<any | null>(null)

  const load = () => {
    setLoading(true)
    fetch("/api/rh/depart?action=recent")
      .then(r => r.json())
      .then(d => setDeparts(d.departs || []))
      .catch(() => setDeparts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [refreshKey])

  const reintegrer = async (empId: string, nom: string) => {
    if (!confirm(t('sarh.depart.confirm_reintegrate', locale).replace('{name}', String(nom)))) return
    setReintegratingId(empId)
    try {
      const res = await fetch("/api/rh/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reintegrer", employe_id: empId }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('sarh.depart.err_reintegrate', locale)); return }
      alert(data.message || t('sarh.depart.emp_reintegrated', locale))
      load()
      onReintegrated?.()
    } catch { alert(t('sarh.depart.err_network', locale)) }
    finally { setReintegratingId(null) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {t('rha.b.depart.recent', locale)}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
        ) : departs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('rha.b.depart.no_departures', locale)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('rha.b.depart.col_employee', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_position', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_date', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_type', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_seniority', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_reason', locale)}</TableHead>
                <TableHead>{t('rha.b.depart.col_actions', locale)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departs.map(d => {
                const arrivee = d.date_arrivee?.split("T")[0]
                const depart = d.date_depart?.split("T")[0]
                let ancLabel = "—"
                if (arrivee && depart) {
                  const start = new Date(arrivee)
                  const end = new Date(depart)
                  const diffMs = end.getTime() - start.getTime()
                  const diffYears = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                  const diffMonths = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                  ancLabel = `${diffYears}a ${diffMonths}m`
                }
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.prenom} {d.nom}</TableCell>
                    <TableCell className="text-sm text-gray-600">{d.poste || "—"}</TableCell>
                    <TableCell>{fmtDate(depart)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        d.type_depart === "licenciement_faute" ? "border-red-500 text-red-800 bg-red-100" :
                        d.type_depart === "licenciement" ? "border-red-300 text-red-700 bg-red-50" :
                        d.type_depart === "demission" ? "border-orange-300 text-orange-700 bg-orange-50" :
                        d.type_depart === "retraite" ? "border-blue-300 text-blue-700 bg-blue-50" :
                        d.type_depart === "deces" ? "border-gray-400 text-gray-700 bg-gray-100" :
                        "border-gray-300 text-gray-600"
                      }>
                        {TYPE_LABELS[d.type_depart] || d.type_depart || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{ancLabel}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">{d.raison_depart || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => setDocsFor(d)}
                          title={t('sarh.depart.docs_btn_title', locale)}
                        >
                          <FileText className="w-3 h-3 mr-1" /> {t('sarh.depart.documents', locale)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => reintegrer(d.id, `${d.prenom} ${d.nom}`)}
                          disabled={reintegratingId === d.id}
                        >
                          {reintegratingId === d.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          {t('rha.b.depart.btn_reintegrate', locale)}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {docsFor && <DocumentsDialog depart={docsFor} onClose={() => setDocsFor(null)} />}
    </Card>
  )
}

// ── Main page ──
type BulletinComptabiliseModalState =
  | { open: false }
  | { open: true; bulletin_id: string; message: string }

export default function DepartPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [breakdown, setBreakdown] = useState<any>(null)
  // FIX-STC-EDITION — on conserve une copie IMMUABLE du breakdown auto initial
  // (snapshot renvoyé par calculer_solde) pour le diff côté serveur. Le state
  // `breakdown` lui évolue librement avec les éditions utilisateur.
  const [breakdownAuto, setBreakdownAuto] = useState<any>(null)
  const [formData, setFormData] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // FIX-UX-409 — état pour gérer le HTTP 409 BULLETIN_COMPTABILISE
  const [bulletinComptabiliseModal, setBulletinComptabiliseModal] =
    useState<BulletinComptabiliseModalState>({ open: false })
  const [raisonDecomptabilisation, setRaisonDecomptabilisation] = useState("")
  const [decomptabilisationLoading, setDecomptabilisationLoading] = useState(false)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => {})
  }, [])

  const handleCalculated = (b: any, fd: any) => {
    setBreakdown(b)
    // Snapshot immuable (clone deep) du breakdown auto pour audit serveur.
    setBreakdownAuto(JSON.parse(JSON.stringify(b)))
    setFormData(fd)
    setConfirmResult(null)
  }

  // Effectue l'appel `confirmer_depart`. Retourne true si succès, false sinon
  // (notamment le 409 BULLETIN_COMPTABILISE qui ouvre la modal).
  const confirmerDepart = useCallback(async (): Promise<boolean> => {
    if (!breakdown || !formData) return false
    setConfirming(true)
    try {
      // FIX-STC-EDITION — édition primante : on envoie EXPLICITEMENT
      //   • `breakdown`           — version éditée par l'utilisateur (legacy field, garde la compat)
      //   • `breakdown_edite`     — alias clair : version éditée (priorité absolue côté serveur)
      //   • `breakdown_auto`      — snapshot du calcul auto initial (pour diff/audit)
      //   • `edited_by_user`      — flag « a-t-il modifié quelque chose ? »
      // Le backend doit utiliser breakdown_edite pour créer le bulletin (jamais
      // recalculer depuis zéro) et logger breakdown_auto + diff dans
      // stc_edition_log (mig 434).
      const editedByUser = breakdownAuto
        ? JSON.stringify(breakdownAuto) !== JSON.stringify(breakdown)
        : false
      const payload = {
        action: "confirmer_depart",
        ...formData,
        breakdown,
        breakdown_edite: breakdown,
        breakdown_auto: breakdownAuto,
        edited_by_user: editedByUser,
      }
      // FIX-STC-TRIGGER236 — log avant POST pour vérifier que les valeurs
      // éditées (state React) atteignent bien le backend.
      try {
        console.warn('[depart.confirmerDepart] payload:', JSON.stringify({
          action: payload.action,
          employe_id: payload.employe_id,
          edited_by_user: editedByUser,
          breakdown_total: breakdown?.total,
          breakdown_auto_total: breakdownAuto?.total,
          lignes_extra_count: Array.isArray(breakdown?.lignes_extra) ? breakdown.lignes_extra.length : 0,
          montants_clefs: {
            salaire_prorata: breakdown?.salaire_prorata?.montant,
            conges_al: breakdown?.conges_al?.montant,
            treizieme_mois: breakdown?.treizieme_mois?.montant,
            preavis: breakdown?.preavis?.montant,
            indemnite_licenciement: breakdown?.indemnite_licenciement?.montant,
            allocations_prorata: breakdown?.allocations_prorata?.montant,
          },
        }, null, 2))
      } catch { /* noop */ }
      const res = await fetch("/api/rh/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      // FIX-UX-409 — Gestion explicite du conflit bulletin comptabilisé.
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        if (data?.code === "BULLETIN_COMPTABILISE" && data?.bulletin_id) {
          setBulletinComptabiliseModal({
            open: true,
            bulletin_id: data.bulletin_id,
            message: data.error || t('sarh.depart.bulletin_already_posted_dot', locale),
          })
          return false
        }
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('sarh.depart.err_generic', locale))
      setConfirmResult(data)
      setBreakdown(null)
      setBreakdownAuto(null)
      setFormData(null)
      setRefreshKey(k => k + 1)
      return true
    } catch (e: unknown) {
      notifyError(t('sarh.depart.notify_confirm_departure', locale), e)
      return false
    } finally {
      setConfirming(false)
    }
  }, [breakdown, breakdownAuto, formData])

  const handleConfirm = () => {
    void confirmerDepart()
  }

  // Décomptabilise le bulletin existant puis relance `confirmer_depart`.
  const decomptabiliserEtRetry = async () => {
    if (!bulletinComptabiliseModal.open) return
    const raison = raisonDecomptabilisation.trim()
    if (raison.length < 5) {
      notifyError(t('sarh.depart.notify_unpost', locale), t('sarh.depart.reason_required_min5', locale))
      return
    }
    const bulletin_id = bulletinComptabiliseModal.bulletin_id
    setDecomptabilisationLoading(true)
    try {
      const dec = await fetch(`/api/rh/paie/${bulletin_id}/decomptabiliser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raison, type_correction: "depart_reprise_solde" }),
      })
      if (!dec.ok) {
        const e = await dec.json().catch(() => ({}))
        notifyError(t('sarh.depart.notify_unpost', locale), e?.error || `HTTP ${dec.status}`)
        return
      }
      notifySuccess(t('sarh.depart.bulletin_unposted', locale))

      // Fermer la modal + reset
      setBulletinComptabiliseModal({ open: false })
      setRaisonDecomptabilisation("")

      // Re-essai automatique de confirmer_depart.
      const ok = await confirmerDepart()
      if (ok) notifySuccess(t('sarh.depart.departure_confirmed', locale))
    } catch (e: unknown) {
      notifyError(t('sarh.depart.notify_unpost', locale), e)
    } finally {
      setDecomptabilisationLoading(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('rha.b.depart.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('rha.b.depart.subtitle', locale)}</p>
      </div>

      {/* Success message */}
      {confirmResult && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800">{confirmResult.message}</p>
            {confirmResult.bulletin_id && (
              <p className="text-sm text-green-600">{t('sarh.depart.bulletin_created', locale).replace('{id}', String(confirmResult.bulletin_id.slice(0, 8)))}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setConfirmResult(null)}>
            {t('rha.b.expaie.close', locale)}
          </Button>
        </div>
      )}

      {/* Form */}
      <DepartureForm societes={societes} onCalculated={handleCalculated} locale={locale} />

      {/* Breakdown */}
      {breakdown && formData && (
        <BreakdownDisplay
          breakdown={breakdown}
          setBreakdown={setBreakdown}
          formData={formData}
          onConfirm={handleConfirm}
          confirming={confirming}
          locale={locale}
        />
      )}

      {/* Recent departures */}
      <RecentDepartures refreshKey={refreshKey} locale={locale} />

      {/* FIX-UX-409 — Modal de gestion du conflit BULLETIN_COMPTABILISE.
          Permet à l'utilisateur de décomptabiliser le bulletin existant
          (avec raison tracée) puis de relancer automatiquement le départ. */}
      <Dialog
        open={bulletinComptabiliseModal.open}
        onOpenChange={o => {
          if (!o && !decomptabilisationLoading) {
            setBulletinComptabiliseModal({ open: false })
            setRaisonDecomptabilisation("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" aria-describedby="depart-409-dialog-desc">
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('sarh.depart.bulletin_already_posted', locale)}
            </DialogTitle>
            <DialogDescription id="depart-409-dialog-desc">
              {t('sarh.depart.bulletin_409_desc', locale)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              {bulletinComptabiliseModal.open && bulletinComptabiliseModal.message}
            </div>

            <div>
              <Label htmlFor="raison-decompta" className="text-sm">
                {t('sarh.depart.unpost_reason', locale)}
                <span className="text-red-600 ml-1">*</span>
              </Label>
              <Textarea
                id="raison-decompta"
                value={raisonDecomptabilisation}
                onChange={e => setRaisonDecomptabilisation(e.target.value)}
                placeholder={t('sarh.depart.unpost_reason_ph', locale)}
                rows={3}
                disabled={decomptabilisationLoading}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                {t('sarh.depart.unpost_reason_hint', locale)}{' '}
                (<code>bulletin_decomptabilisation_log</code>).
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBulletinComptabiliseModal({ open: false })
                setRaisonDecomptabilisation("")
              }}
              disabled={decomptabilisationLoading}
            >
              {t('sarh.depart.cancel', locale)}
            </Button>
            <Button
              onClick={decomptabiliserEtRetry}
              disabled={decomptabilisationLoading || raisonDecomptabilisation.trim().length < 5}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {decomptabilisationLoading
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Unlock className="w-4 h-4 mr-2" />}
              {t('sarh.depart.unpost_and_resume', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
