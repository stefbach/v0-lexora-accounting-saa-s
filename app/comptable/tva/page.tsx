"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Loader2, Calculator, TrendingDown, TrendingUp, Download, RefreshCw,
  CheckCircle, AlertTriangle, Clock, XCircle
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface Societe { id: string; nom: string }
interface TVARecord {
  id: string
  periode: string
  societe_id: string
  societe: string
  box1_output_standard: number
  box2_exports_taxable: number
  box3_exempt_supplies: number
  box4_reverse_charge_output: number
  box5_reverse_charge_input: number
  box6_exports_zero_rated: number
  box7_capital_goods: number
  box8_bad_debt_relief: number
  box9_input_other?: number
  tva_collectee: number
  tva_deductible: number
  credit_reporte: number
  tva_nette: number
  statut: string
  statut_declaration: string
  date_limite: string
  date_soumission?: string
  reference_declaration_mra?: string
  penalites_retard: number
  interets_retard: number
}

function statutBadge(statut_declaration: string, date_limite: string) {
  const now  = new Date()
  const lim  = new Date(date_limite)
  const late = now > lim && statut_declaration === 'a_faire'

  if (late) return <Badge className="bg-red-100 text-red-800 gap-1"><AlertTriangle className="w-3 h-3" />En retard</Badge>
  if (statut_declaration === 'declare') return <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="w-3 h-3" />Déclaré</Badge>
  if (statut_declaration === 'paye')    return <Badge className="bg-blue-100 text-blue-800 gap-1"><CheckCircle className="w-3 h-3" />Payé</Badge>
  return <Badge className="bg-orange-100 text-orange-800 gap-1"><Clock className="w-3 h-3" />À faire</Badge>
}

export default function TVAPage() {
  const [societes, setSocietes]               = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [selectedPeriode, setSelectedPeriode] = useState("")
  const [loading, setLoading]                 = useState(true)
  const [calculating, setCalculating]         = useState(false)
  const [tvaRecords, setTvaRecords]           = useState<TVARecord[]>([])
  const [selectedRecord, setSelectedRecord]   = useState<TVARecord | null>(null)
  const [calcResult, setCalcResult]           = useState<any>(null)
  const [calcError, setCalcError]             = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [socRes] = await Promise.all([
        fetch("/api/comptable/societes"),
      ])
      const socData = await socRes.json()
      setSocietes(socData.societes || [])

      // Fetch TVA records
      if (socData.societes?.length > 0) {
        const sid = selectedSociete !== "all" ? selectedSociete : socData.societes[0]?.id
        if (sid) {
          const tvRes = await fetch(`/api/comptable/tva?societe_id=${sid}`)
          if (tvRes.ok) {
            const tvData = await tvRes.json()
            setTvaRecords(tvData.records || [])
          }
        }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete])

  useEffect(() => { fetchData() }, [fetchData])

  // Calculer TVA depuis les écritures
  const handleCalculer = async () => {
    if (!selectedSociete || selectedSociete === "all") {
      setCalcError("Sélectionnez une société")
      return
    }
    if (!selectedPeriode) {
      setCalcError("Saisissez une période (YYYY-MM)")
      return
    }
    setCalculating(true)
    setCalcError("")
    setCalcResult(null)
    try {
      const res = await fetch("/api/comptable/tva/calculer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: selectedSociete, periode: selectedPeriode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur calcul TVA")
      setCalcResult(data)
      // Refresh records
      const tvRes = await fetch(`/api/comptable/tva?societe_id=${selectedSociete}`)
      if (tvRes.ok) { const d = await tvRes.json(); setTvaRecords(d.records || []) }
    } catch (e: any) {
      setCalcError(e.message)
    } finally {
      setCalculating(false)
    }
  }

  // Marquer comme déclaré
  const handleDeclarer = async (record: TVARecord) => {
    try {
      const res = await fetch(`/api/comptable/tva/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statut_declaration: "declare",
          date_soumission: new Date().toISOString().slice(0, 10),
        }),
      })
      if (res.ok) fetchData()
    } catch (e) { console.error(e) }
  }

  // Totaux
  const totaux = {
    collectee:  tvaRecords.reduce((s, r) => s + (r.tva_collectee  || 0), 0),
    deductible: tvaRecords.reduce((s, r) => s + (r.tva_deductible || 0), 0),
    nette:      tvaRecords.reduce((s, r) => s + (r.tva_nette      || 0), 0),
    penalites:  tvaRecords.reduce((s, r) => s + (r.penalites_retard || 0), 0),
  }

  // Générer périodes pour le sélecteur
  const periodes: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periodes.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>TVA MRA — Déclarations</h1>
          <p className="text-sm text-gray-500 mt-1">9 boxes MRA — Calcul automatique depuis les écritures comptables</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Exporter
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-red-500 shrink-0" />
          <div><p className="text-xs text-gray-500">TVA Collectée</p><p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(totaux.collectee)} MUR</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingDown className="w-8 h-8 text-green-500 shrink-0" />
          <div><p className="text-xs text-gray-500">TVA Déductible</p><p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(totaux.deductible)} MUR</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Calculator className={`w-8 h-8 shrink-0 ${totaux.nette >= 0 ? "text-red-500" : "text-green-500"}`} />
          <div>
            <p className="text-xs text-gray-500">Solde Net</p>
            <p className={`text-lg font-bold ${totaux.nette >= 0 ? "text-red-600" : "text-green-600"}`}>{fmt(totaux.nette)} MUR</p>
            <p className="text-xs text-gray-400">{totaux.nette >= 0 ? "À payer MRA" : "Crédit TVA"}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-orange-500 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Pénalités cumulées</p>
            <p className="text-lg font-bold text-orange-600">{fmt(totaux.penalites)} MUR</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Calculateur */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <Calculator className="inline w-4 h-4 mr-2" style={{ color: GOLD }} />
            Calculer TVA depuis les écritures
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Société</Label>
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">— Choisir —</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Période (YYYY-MM)</Label>
              <Select value={selectedPeriode} onValueChange={setSelectedPeriode}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Mois..." /></SelectTrigger>
                <SelectContent>
                  {periodes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCalculer}
              disabled={calculating || !selectedSociete || selectedSociete === "all" || !selectedPeriode}
              className="gap-2 h-8"
              style={{ backgroundColor: NAVY }}
            >
              {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {calculating ? "Calcul en cours..." : "Calculer"}
            </Button>
          </div>

          {calcError && (
            <Alert variant="destructive">
              <AlertDescription>{calcError}</AlertDescription>
            </Alert>
          )}

          {calcResult && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-green-700">✓ TVA calculée pour {calcResult.periode}</p>
              <div className="grid grid-cols-3 gap-4">
                {/* 9 Boxes MRA */}
                <div className="col-span-3">
                  <p className="text-xs font-semibold uppercase text-gray-500 mb-2">9 Boxes MRA</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Box 1 — TVA Collectée Standard", val: calcResult.boxes?.box1_tva_collectee_standard },
                      { label: "Box 2 — Exports Taxables",        val: calcResult.boxes?.box2_exports_taxables },
                      { label: "Box 3 — Ventes Exonérées",        val: calcResult.boxes?.box3_ventes_exonerees },
                      { label: "Box 4 — Reverse Charge Output",   val: calcResult.boxes?.box4_reverse_charge_output },
                      { label: "Box 5 — Reverse Charge Input",    val: calcResult.boxes?.box5_reverse_charge_input },
                      { label: "Box 6 — Exports Zero-Rated",      val: calcResult.boxes?.box6_exports_zero_rated },
                      { label: "Box 7 — Capital Goods",           val: calcResult.boxes?.box7_capital_goods },
                      { label: "Box 8 — Bad Debt Relief",         val: calcResult.boxes?.box8_bad_debt_relief },
                      { label: "Box 9 — TVA Déductible Autre",    val: calcResult.boxes?.box9_tva_deductible_autre },
                    ].map((b, i) => (
                      <div key={i} className="bg-white border rounded p-2">
                        <p className="text-[10px] text-gray-500">{b.label}</p>
                        <p className={`text-sm font-bold ${(b.val || 0) > 0 ? "text-blue-700" : "text-gray-400"}`}>
                          {fmt(b.val || 0)} MUR
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Synthèse */}
                <div className="col-span-3 border-t pt-3 grid grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">TVA Output</p>
                    <p className="text-sm font-bold text-red-600">{fmt(calcResult.synthese?.tva_output || 0)} MUR</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">TVA Input</p>
                    <p className="text-sm font-bold text-green-600">{fmt(calcResult.synthese?.tva_input || 0)} MUR</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">TVA Nette</p>
                    <p className={`text-sm font-bold ${(calcResult.synthese?.tva_nette || 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(calcResult.synthese?.tva_nette || 0)} MUR
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total à payer</p>
                    <p className="text-sm font-bold text-orange-600">{fmt(calcResult.synthese?.total_a_payer || 0)} MUR</p>
                  </div>
                </div>
                {calcResult.synthese?.penalites > 0 && (
                  <div className="col-span-3">
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Déclaration en retard de {calcResult.synthese?.jours_retard || "?"} jours — Pénalités : {fmt(calcResult.synthese?.penalites)} MUR + Intérêts : {fmt(calcResult.synthese?.interets)} MUR
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tableau des déclarations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle style={{ color: NAVY }}>
            Timeline des déclarations
          </CardTitle>
          <div className="flex gap-2">
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-48 h-7 text-xs"><SelectValue placeholder="Toutes sociétés" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sociétés</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} /></div>
          ) : tvaRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Aucune déclaration TVA</p>
              <p className="text-sm mt-1">Utilisez le calculateur ci-dessus pour générer vos déclarations</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead>Période</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead>Box 1 — Collectée</TableHead>
                  <TableHead>Box 9 — Déductible</TableHead>
                  <TableHead>TVA Nette</TableHead>
                  <TableHead>Date limite</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Pénalités</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tvaRecords.map(r => {
                  const now    = new Date()
                  const lim    = new Date(r.date_limite)
                  const isLate = now > lim && r.statut_declaration === 'a_faire'
                  return (
                    <TableRow key={r.id} className={isLate ? "bg-red-50" : ""}>
                      <TableCell className="font-mono text-sm font-medium">{r.periode}</TableCell>
                      <TableCell className="text-sm">{r.societe}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-red-600">
                        {fmt(r.box1_output_standard || r.tva_collectee || 0)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono text-green-600">
                        {fmt(r.box9_input_other || r.tva_deductible || 0)}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-mono font-bold ${r.tva_nette >= 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmt(Math.abs(r.tva_nette))}
                        <span className="text-xs ml-1 text-gray-400">{r.tva_nette >= 0 ? "dû" : "crédit"}</span>
                      </TableCell>
                      <TableCell className={`text-sm ${isLate ? "text-red-600 font-semibold" : ""}`}>
                        {r.date_limite ? new Date(r.date_limite).toLocaleDateString("fr-FR") : "—"}
                      </TableCell>
                      <TableCell>{statutBadge(r.statut_declaration, r.date_limite)}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-orange-600">
                        {r.penalites_retard > 0 ? fmt(r.penalites_retard) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.statut_declaration === 'a_faire' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => handleDeclarer(r)}
                          >
                            Marquer déclaré
                          </Button>
                        )}
                        {r.statut_declaration === 'declare' && (
                          <span className="text-xs text-gray-400">
                            {r.date_soumission ? `Déclaré le ${new Date(r.date_soumission).toLocaleDateString("fr-FR")}` : "Déclaré"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {/* Total */}
                <TableRow className="bg-gray-100 font-bold border-t-2">
                  <TableCell colSpan={2}>TOTAL</TableCell>
                  <TableCell className="text-right font-mono text-red-600">{fmt(totaux.collectee)}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{fmt(totaux.deductible)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${totaux.nette >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {fmt(Math.abs(totaux.nette))}
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                  <TableCell className="text-right font-mono text-orange-600">
                    {totaux.penalites > 0 ? fmt(totaux.penalites) : "—"}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
