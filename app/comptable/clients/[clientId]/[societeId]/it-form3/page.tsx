"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, ArrowLeft, Calculator, FileText, CheckCircle, Clock, Save } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmt0(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtInput(n: number): string { return n === 0 ? "" : String(n) }

interface ITForm3Data {
  id?: string
  societe_id: string
  exercice: string
  annee_assessment: string
  // Revenus
  revenu_affaires: number
  revenu_emploi: number
  revenu_locatif: number
  revenu_interets: number
  dividendes: number
  autres_revenus: number
  total_revenus: number
  // Déductions
  annual_allowance_total: number
  autres_deductions: number
  total_deductions: number
  // Impôt
  revenu_imposable: number
  taux_is: number
  impot_calcule: number
  // APS
  aps_applicable: boolean
  aps_q1: number
  aps_q2: number
  aps_q3: number
  total_aps_paye: number
  impot_solde: number
  // CSR
  csr_applicable: boolean
  csr_2pct: number
  // Statut
  statut: string
  date_soumission?: string
  reference_mra?: string
  notes?: string
}

export default function ITForm3Page() {
  const params    = useParams()
  const societeId = params.societeId as string
  const clientId  = params.clientId  as string

  const [exercice, setExercice]   = useState("FY2024-2025")
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [refMRA, setRefMRA]       = useState("")

  const [form, setForm] = useState<ITForm3Data>({
    societe_id: societeId,
    exercice: "FY2024-2025",
    annee_assessment: "2025",
    revenu_affaires: 0, revenu_emploi: 0, revenu_locatif: 0,
    revenu_interets: 0, dividendes: 0, autres_revenus: 0,
    total_revenus: 0,
    annual_allowance_total: 0, autres_deductions: 0, total_deductions: 0,
    revenu_imposable: 0, taux_is: 15, impot_calcule: 0,
    aps_applicable: false, aps_q1: 0, aps_q2: 0, aps_q3: 0,
    total_aps_paye: 0, impot_solde: 0,
    csr_applicable: false, csr_2pct: 0,
    statut: "brouillon",
  })

  // Charger depuis API
  const fetchData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // Récupérer la form3 existante
      const [f3Res, pnlRes, aaRes] = await Promise.all([
        fetch(`/api/comptable/it-form3?societe_id=${societeId}&exercice=${exercice}`),
        fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=pnl&exercice=${exercice}`),
        fetch(`/api/comptable/annual-allowance?societe_id=${societeId}&exercice=${exercice}`),
      ])

      const pnlData = pnlRes.ok ? await pnlRes.json() : null
      const aaData  = aaRes.ok  ? await aaRes.json()  : null
      const f3Data  = f3Res.ok  ? await f3Res.json()  : null

      if (f3Data?.form3) {
        setForm({ ...form, ...f3Data.form3, societe_id: societeId })
      } else {
        // Pré-remplir depuis P&L et AA
        const caTotal = pnlData?.produits?.total || 0
        const aaTotal = aaData?.totaux?.total_annual_allowance || 0
        setForm(prev => ({
          ...prev,
          societe_id: societeId,
          exercice,
          revenu_affaires: caTotal,
          annual_allowance_total: aaTotal,
        }))
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societeId, exercice])

  useEffect(() => { fetchData() }, [fetchData])

  // Calcul automatique
  const calculer = () => {
    const total_revenus = form.revenu_affaires + form.revenu_emploi + form.revenu_locatif +
                          form.revenu_interets + form.dividendes + form.autres_revenus
    const total_deductions = form.annual_allowance_total + form.autres_deductions
    const revenu_imposable = Math.max(0, total_revenus - total_deductions)
    const impot_calcule    = Math.round(revenu_imposable * (form.taux_is / 100) * 100) / 100

    // APS si CA > 10M MUR
    const aps_applicable   = form.revenu_affaires > 10_000_000
    const aps_par_versement = aps_applicable ? Math.round((impot_calcule / 3) * 100) / 100 : 0
    const total_aps_paye   = form.aps_q1 + form.aps_q2 + form.aps_q3

    // CSR si profit > 10M MUR
    const csr_applicable = revenu_imposable > 10_000_000
    const csr_2pct       = csr_applicable ? Math.round(revenu_imposable * 0.02 * 100) / 100 : 0

    const impot_solde    = Math.max(0, impot_calcule - total_aps_paye)

    setForm(prev => ({
      ...prev,
      total_revenus, total_deductions, revenu_imposable, impot_calcule,
      aps_applicable, aps_q1: aps_par_versement, aps_q2: aps_par_versement, aps_q3: aps_par_versement,
      total_aps_paye, impot_solde,
      csr_applicable, csr_2pct,
      statut: "calcule",
    }))
  }

  // Sauvegarder
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/it-form3", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, societe_id: societeId, exercice }),
      })
      if (res.ok) {
        const d = await res.json()
        if (d.form3?.id) setForm(prev => ({ ...prev, id: d.form3.id }))
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  // Marquer soumis
  const handleSoumettre = async () => {
    setSaving(true)
    try {
      const updated = {
        ...form,
        statut: "soumis",
        date_soumission: new Date().toISOString().slice(0, 10),
        reference_mra: refMRA || `MRA-IT3-${exercice}`,
      }
      setForm(updated)
      await fetch("/api/comptable/it-form3", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updated, societe_id: societeId, exercice }),
      })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const num = (v: string) => parseFloat(v) || 0
  const up  = (field: keyof ITForm3Data) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: num(e.target.value) }))

  const statBadge = () => {
    if (form.statut === "soumis") return <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="w-3 h-3" />Soumis</Badge>
    if (form.statut === "calcule") return <Badge className="bg-blue-100 text-blue-800 gap-1"><Calculator className="w-3 h-3" />Calculé</Badge>
    return <Badge className="bg-gray-100 text-gray-600 gap-1"><Clock className="w-3 h-3" />Brouillon</Badge>
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} /></div>
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/comptable/clients/${clientId}/${societeId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Retour</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <FileText className="w-6 h-6" style={{ color: GOLD }} />
              IT Form 3 — Déclaration IS
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Income Tax return — Companies Act 2001 (Mauritius)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statBadge()}
          <Select value={exercice} onValueChange={v => { setExercice(v); setForm(p => ({ ...p, exercice: v })) }}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FY2024-2025">FY2024-2025</SelectItem>
              <SelectItem value="FY2025-2026">FY2025-2026</SelectItem>
              <SelectItem value="FY2023-2024">FY2023-2024</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schedule A — Revenus d'affaires */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: NAVY }}>Schedule A — Business Income</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Revenu d'affaires (CA) — 70x</Label>
              <Input type="number" value={fmtInput(form.revenu_affaires)} onChange={up("revenu_affaires")} placeholder="0" className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-gray-400 mt-0.5">Import automatique depuis P&L</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule B-D — Autres revenus */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: NAVY }}>Schedules B / C / D — Autres revenus</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Schedule B — Revenu emploi</Label>
              <Input type="number" value={fmtInput(form.revenu_emploi)} onChange={up("revenu_emploi")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs">Schedule C — Revenu locatif</Label>
              <Input type="number" value={fmtInput(form.revenu_locatif)} onChange={up("revenu_locatif")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs">Schedule D — Intérêts</Label>
              <Input type="number" value={fmtInput(form.revenu_interets)} onChange={up("revenu_interets")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs">Dividendes reçus</Label>
              <Input type="number" value={fmtInput(form.dividendes)} onChange={up("dividendes")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs">Autres revenus</Label>
              <Input type="number" value={fmtInput(form.autres_revenus)} onChange={up("autres_revenus")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Déductions */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: NAVY }}>Déductions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Annual Allowance (depuis FAR)</Label>
              <Input type="number" value={fmtInput(form.annual_allowance_total)} onChange={up("annual_allowance_total")} placeholder="0" className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-gray-400 mt-0.5">Import automatique depuis Fixed Asset Register</p>
            </div>
            <div>
              <Label className="text-xs">Autres déductions admissibles</Label>
              <Input type="number" value={fmtInput(form.autres_deductions)} onChange={up("autres_deductions")} placeholder="0" className="h-8 text-sm font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bouton Calculer */}
      <div className="flex justify-center">
        <Button onClick={calculer} size="lg" className="gap-2 px-8" style={{ backgroundColor: NAVY }}>
          <Calculator className="w-5 h-5" />
          Calculer IS
        </Button>
      </div>

      {/* Récapitulatif calculé */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: NAVY }}>Récapitulatif — Income Tax Computation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <TableRow className="border-t">
                <TableCell className="font-semibold">Total Revenus</TableCell>
                <TableCell className="text-right font-mono text-lg font-bold" style={{ color: NAVY }}>{fmt(form.total_revenus)} MUR</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-gray-600 pl-6 text-sm">dont Revenu d'affaires</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(form.revenu_affaires)}</TableCell>
              </TableRow>
              <TableRow className="border-t">
                <TableCell className="font-semibold text-red-600">Moins : Total Déductions</TableCell>
                <TableCell className="text-right font-mono text-red-600">({fmt(form.total_deductions)}) MUR</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-gray-600 pl-6 text-sm">dont Annual Allowance</TableCell>
                <TableCell className="text-right font-mono text-sm text-red-500">({fmt(form.annual_allowance_total)})</TableCell>
              </TableRow>
              <TableRow className="bg-blue-50 border-t-2 border-t-blue-200">
                <TableCell className="font-bold text-base">Revenu Imposable</TableCell>
                <TableCell className="text-right font-mono font-bold text-xl" style={{ color: NAVY }}>{fmt(form.revenu_imposable)} MUR</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-gray-600">Taux IS ({form.taux_is}%)</TableCell>
                <TableCell className="text-right font-mono text-sm text-gray-500">{form.taux_is}%</TableCell>
              </TableRow>
              <TableRow className="border-t">
                <TableCell className="font-bold text-orange-700">Impôt calculé</TableCell>
                <TableCell className="text-right font-mono font-bold text-orange-700">{fmt(form.impot_calcule)} MUR</TableCell>
              </TableRow>

              {/* APS */}
              {form.aps_applicable && (
                <>
                  <TableRow className="bg-purple-50 border-t">
                    <TableCell className="font-semibold text-purple-700 flex items-center gap-1">
                      APS — Advance Payment System
                      <Badge className="bg-purple-100 text-purple-800 text-[10px]">CA &gt; 10M MUR</Badge>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-sm text-gray-600">Q1 — Août</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(form.aps_q1)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-sm text-gray-600">Q2 — Novembre</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(form.aps_q2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-6 text-sm text-gray-600">Q3 — Février</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(form.aps_q3)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t">
                    <TableCell className="font-semibold text-purple-700">Total APS payés</TableCell>
                    <TableCell className="text-right font-mono text-purple-700">({fmt(form.total_aps_paye)})</TableCell>
                  </TableRow>
                </>
              )}

              {/* CSR */}
              {form.csr_applicable && (
                <TableRow className="bg-green-50 border-t">
                  <TableCell className="font-semibold text-green-700 flex items-center gap-1">
                    CSR — 2% Corporate Social Responsibility
                    <Badge className="bg-green-100 text-green-800 text-[10px]">Profit &gt; 10M MUR</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-green-700">{fmt(form.csr_2pct)} MUR</TableCell>
                </TableRow>
              )}

              {/* Solde dû */}
              <TableRow className="bg-yellow-50 border-t-2 border-t-yellow-300">
                <TableCell className="font-bold text-xl text-red-700">SOLDE DÛ À LA MRA</TableCell>
                <TableCell className="text-right font-mono font-bold text-2xl text-red-700">{fmt(form.impot_solde)} MUR</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm" style={{ color: NAVY }}>Soumission MRA</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Référence MRA</Label>
              <Input
                value={refMRA}
                onChange={e => setRefMRA(e.target.value)}
                placeholder="Ex: MRA-IT3-2025-001"
                className="h-8 text-sm w-56"
              />
            </div>
            <div>
              <Label className="text-xs">Date soumission</Label>
              <Input
                type="date"
                value={form.date_soumission || ""}
                onChange={e => setForm(p => ({ ...p, date_soumission: e.target.value }))}
                className="h-8 text-sm w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} variant="outline" size="sm" className="gap-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Sauvegarder
              </Button>
              <Button
                onClick={handleSoumettre}
                size="sm"
                className="gap-1"
                style={{ backgroundColor: NAVY }}
                disabled={saving || form.statut === "soumis"}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Marquer soumis
              </Button>
            </div>
          </div>
          {form.statut === "soumis" && form.date_soumission && (
            <p className="text-sm text-green-600">
              ✓ Déclaration soumise le {new Date(form.date_soumission).toLocaleDateString("fr-FR")}
              {form.reference_mra && ` — Réf: ${form.reference_mra}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
