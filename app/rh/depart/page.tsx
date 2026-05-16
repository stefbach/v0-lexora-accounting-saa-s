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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserMinus, Calculator, CheckCircle, AlertTriangle, Clock, Banknote, Plus, Trash2, Edit2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
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
      setError("Veuillez remplir tous les champs obligatoires")
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
      if (!res.ok) throw new Error(data.error || "Erreur")
      onCalculated(data.breakdown, { employe_id: employeId, date_depart: dateDepart, type_depart: typeDepart, raison_depart: raison })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur")
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
              <SelectTrigger><SelectValue placeholder={t('rha.b.depart.loading_emps', locale).replace('Chargement', 'Choisir').replace('Loading', 'Choose')} /></SelectTrigger>
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
              if (!employeId || !dateDepart) { setError("Employé et date requis"); return }
              setLoading(true); setError(null)
              try {
                const res = await fetch("/api/rh/depart", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "sortie_manuelle", employe_id: employeId, date_depart: dateDepart, type_depart: typeDepart || "demission", raison_depart: raison }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Erreur")
                alert(data.message || "Sortie enregistrée")
                setEmployeId(""); setDateDepart("")
              } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
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
function recomputeTotal(b: any): number {
  const lines = [
    b?.salaire_prorata?.montant,
    b?.conges_al?.montant,
    b?.conges_sl?.montant,         // toujours 0 (WRA)
    b?.treizieme_mois?.montant,
    b?.allocations_prorata?.montant,
    b?.preavis?.applicable ? b?.preavis?.montant : 0,
    b?.indemnite_licenciement?.applicable ? b?.indemnite_licenciement?.montant : 0,
  ]
  const extras: Array<{ montant: number }> = Array.isArray(b?.lignes_extra) ? b.lignes_extra : []
  return lines.reduce((s: number, v: any) => s + (Number(v) || 0), 0)
       + extras.reduce((s, e) => s + (Number(e?.montant) || 0), 0)
}

// Petit input numérique pour les cellules éditables
function MontantInput({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={e => onChange(Math.round(Number(e.target.value) || 0))}
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
  const updateField = (path: string[], value: number) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    let ref: any = next
    for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]]
    ref[path[path.length - 1]] = value
    next.total = recomputeTotal(next)
    setBreakdown(next)
  }

  const addExtraLine = () => {
    if (!newLibelle.trim()) return
    const montant = Math.round(Number(newMontant) || 0)
    const next = JSON.parse(JSON.stringify(breakdown))
    if (!Array.isArray(next.lignes_extra)) next.lignes_extra = []
    next.lignes_extra.push({ libelle: newLibelle.trim(), montant })
    next.total = recomputeTotal(next)
    setBreakdown(next)
    setNewLibelle('')
    setNewMontant('')
  }

  const removeExtraLine = (index: number) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    next.lignes_extra = (next.lignes_extra || []).filter((_: any, i: number) => i !== index)
    next.total = recomputeTotal(next)
    setBreakdown(next)
  }

  const updateExtraLine = (index: number, patch: { libelle?: string; montant?: number }) => {
    const next = JSON.parse(JSON.stringify(breakdown))
    next.lignes_extra[index] = { ...next.lignes_extra[index], ...patch }
    next.total = recomputeTotal(next)
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
          {emp.poste || "—"} | Salaire base: {fmt(emp.salaire_base)} | Arrivée: {fmtDate(emp.date_arrivee)}
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
            {editMode ? 'Verrouiller' : 'Éditer les montants'}
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

            {/* AL payout */}
            <TableRow>
              <TableCell className="font-medium">{t('rha.b.depart.row_al_remain', locale)}</TableCell>
              <TableCell className="text-center text-sm text-gray-500">
                {breakdown.conges_al.restant} jours ({breakdown.conges_al.droit_prorata} acquis - {breakdown.conges_al.pris} pris) x {fmt(breakdown.conges_al.taux_journalier)}/j
              </TableCell>
              <TableCell className="text-right font-medium">
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
                    <span className="block text-[10px] text-orange-700 mt-0.5">Préavis 1 mois (faute)</span>
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
                  {typeof (breakdown as any).employe_id === 'string' && (
                    <a
                      href={`/rh/severance?employe_id=${(breakdown as any).employe_id}&date=${encodeURIComponent(breakdown?.date_depart || '')}`}
                      className="ml-2 text-[11px] underline text-indigo-700"
                      title="Ouvrir le calculateur WRA S.70 avec pré-remplissage"
                    >
                      → calculateur S.70
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
              <TableRow key={`extra-${i}`} className="bg-amber-50/40">
                <TableCell className="font-medium">
                  {editMode
                    ? <Input value={l.libelle} onChange={e => updateExtraLine(i, { libelle: e.target.value })} className="h-8 text-sm" />
                    : l.libelle}
                  {l.note && <p className="text-[10px] text-gray-500 mt-0.5">{l.note}</p>}
                </TableCell>
                <TableCell className="text-center text-xs text-amber-700">Ajustement manuel</TableCell>
                <TableCell className="text-right font-medium">
                  <div className="flex items-center justify-end gap-2">
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
              <TableRow className="bg-amber-50">
                <TableCell>
                  <Input value={newLibelle} onChange={e => setNewLibelle(e.target.value)}
                         placeholder="Libellé (ex: Prime exceptionnelle, Avance à déduire…)" className="h-8 text-sm" />
                </TableCell>
                <TableCell className="text-center text-[11px] text-gray-500">
                  Saisir un montant négatif pour une déduction
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Input type="number" value={newMontant} onChange={e => setNewMontant(e.target.value)}
                           placeholder="0" className="h-8 text-right text-sm w-32" />
                    <Button size="sm" onClick={addExtraLine} disabled={!newLibelle.trim()}
                            className="h-8 bg-[#D4AF37] hover:bg-[#C9A630] text-[#0B0F2E]">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter
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
            {/* Sprint 14 BONUS — Certificat de travail WRA Art. 22(3) */}
            <Button
              variant="outline"
              onClick={() => window.open(`/api/rh/depart/certificat?employe_id=${breakdown?.employe?.id}`, '_blank')}
              className="border-purple-300 text-purple-700"
              type="button"
            >
              {t('rha.b.depart.btn_work_certificate', locale)}
            </Button>
            {/* Sprint 16 FIX 5 — Documents de fin de contrat */}
            <Button
              variant="outline"
              onClick={() => window.open(`/api/rh/depart/solde-tout-compte?employe_id=${breakdown?.employe?.id}`, '_blank')}
              className="border-emerald-300 text-emerald-700"
              type="button"
            >
              {t('rha.b.depart.btn_settlement_doc', locale)}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/rh/depart/attestation?employe_id=${breakdown?.employe?.id}`, '_blank')}
              className="border-blue-300 text-blue-700"
              type="button"
            >
              {t('rha.b.depart.btn_attestation', locale)}
            </Button>
            {/* Sprint 16 FIX 4 — Déclaration Workfare TUB (licenciement économique uniquement,
                 PAS pour licenciement_faute qui n'ouvre pas droit au Workfare). */}
            {(formData.type_depart === 'licenciement' || breakdown?.type_depart === 'licenciement') && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/rh/depart/workfare?employe_id=${breakdown?.employe?.id}`, '_blank')}
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

// ── Sub-component: Recent Departures List ──
function RecentDepartures({ refreshKey, onReintegrated, locale }: { refreshKey: number; onReintegrated?: () => void; locale: Locale }) {
  const TYPE_LABELS = getTypeLabels(locale)
  const [departs, setDeparts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reintegratingId, setReintegratingId] = useState<string | null>(null)

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
    if (!confirm(`Réintégrer ${nom} ? Cette action annulera le départ et remettra l'employé en statut actif.`)) return
    setReintegratingId(empId)
    try {
      const res = await fetch("/api/rh/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reintegrer", employe_id: empId }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur réintégration"); return }
      alert(data.message || "Employé réintégré")
      load()
      onReintegrated?.()
    } catch { alert("Erreur réseau") }
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ──
export default function DepartPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [breakdown, setBreakdown] = useState<any>(null)
  const [formData, setFormData] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => {})
  }, [])

  const handleCalculated = (b: any, fd: any) => {
    setBreakdown(b)
    setFormData(fd)
    setConfirmResult(null)
  }

  const handleConfirm = async () => {
    if (!breakdown || !formData) return
    setConfirming(true)
    try {
      const res = await fetch("/api/rh/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirmer_depart",
          ...formData,
          breakdown,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setConfirmResult(data)
      setBreakdown(null)
      setFormData(null)
      setRefreshKey(k => k + 1)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erreur")
    } finally {
      setConfirming(false)
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
              <p className="text-sm text-green-600">Bulletin de solde créé (ID: {confirmResult.bulletin_id.slice(0, 8)}...)</p>
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
    </div>
    </ClientPageShell>
  )
}
