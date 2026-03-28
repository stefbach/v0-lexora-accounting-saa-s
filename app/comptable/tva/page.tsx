"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Calculator, TrendingDown, TrendingUp, Download } from "lucide-react"

interface VATLine {
  mois: string
  output: number
  input: number
  solde: number
  statut: "credit" | "debit"
}

interface Societe { id: string; nom: string }

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

export default function TVAPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [loading, setLoading] = useState(true)
  const [factures, setFactures] = useState<any[]>([])
  const [exercice, setExercice] = useState("2024-2025")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [socRes, facRes] = await Promise.all([
        fetch("/api/comptable/societes"),
        fetch(`/api/comptable/factures?limit=500${selectedSociete !== "all" ? `&societe_id=${selectedSociete}` : ""}`),
      ])
      const socData = await socRes.json()
      const facData = await facRes.json()
      setSocietes(socData.societes || [])
      setFactures(facData.factures || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete])

  useEffect(() => { fetchData() }, [fetchData])

  // Calcul TVA par mois depuis les factures
  const vatByMonth: Record<string, { output: number; input: number }> = {}

  for (const f of factures) {
    const d = new Date(f.date_facture)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (!vatByMonth[key]) vatByMonth[key] = { output: 0, input: 0 }
    const tva = f.montant_tva || 0
    if (f.type_facture === "client") vatByMonth[key].output += tva
    else vatByMonth[key].input += tva
  }

  const vatLines: VATLine[] = Object.entries(vatByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mois, v]) => ({
      mois,
      output: v.output,
      input: v.input,
      solde: v.output - v.input,
      statut: v.output >= v.input ? "debit" : "credit",
    }))

  const totaux = {
    output: vatLines.reduce((s, l) => s + l.output, 0),
    input: vatLines.reduce((s, l) => s + l.input, 0),
    solde: vatLines.reduce((s, l) => s + l.solde, 0),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">TVA</h1>
          <p className="text-sm text-gray-500 mt-1">Récapitulatif TVA collectée / déductible par mois</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Exporter
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-red-500" />
          <div><p className="text-xs text-gray-500">TVA Collectée (Output)</p><p className="text-xl font-bold text-[#1E2A4A]">{fmt(totaux.output)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingDown className="w-8 h-8 text-green-500" />
          <div><p className="text-xs text-gray-500">TVA Déductible (Input)</p><p className="text-xl font-bold text-[#1E2A4A]">{fmt(totaux.input)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Calculator className={`w-8 h-8 ${totaux.solde >= 0 ? "text-red-500" : "text-green-500"}`} />
          <div>
            <p className="text-xs text-gray-500">Solde net</p>
            <p className={`text-xl font-bold ${totaux.solde >= 0 ? "text-red-600" : "text-green-600"}`}>{fmt(totaux.solde)}</p>
            <p className="text-xs text-gray-400">{totaux.solde >= 0 ? "À payer MRA" : "Crédit TVA"}</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Filtres */}
      <Card><CardContent className="p-4 flex gap-3">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Toutes les sociétés" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sociétés</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={exercice} onValueChange={setExercice}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2024-2025">2024–2025</SelectItem>
            <SelectItem value="2023-2024">2023–2024</SelectItem>
          </SelectContent>
        </Select>
      </CardContent></Card>

      {/* Tableau mensuel */}
      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A]">Récapitulatif mensuel</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]" /></div>
          ) : vatLines.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Aucune donnée TVA — saisissez des factures avec TVA pour voir ce récapitulatif
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">TVA Collectée</TableHead>
                  <TableHead className="text-right">TVA Déductible</TableHead>
                  <TableHead className="text-right">Solde Net</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vatLines.map(l => (
                  <TableRow key={l.mois}>
                    <TableCell className="font-medium">
                      {new Date(l.mois + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right text-red-600">{fmt(l.output)}</TableCell>
                    <TableCell className="text-right text-green-600">{fmt(l.input)}</TableCell>
                    <TableCell className={`text-right font-semibold ${l.solde >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(Math.abs(l.solde))}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${l.statut === "credit" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {l.statut === "credit" ? "Crédit TVA" : "À payer"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total */}
                <TableRow className="bg-gray-50 font-bold border-t-2">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right text-red-600">{fmt(totaux.output)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(totaux.input)}</TableCell>
                  <TableCell className={`text-right ${totaux.solde >= 0 ? "text-red-600" : "text-green-600"}`}>{fmt(Math.abs(totaux.solde))}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${totaux.solde <= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {totaux.solde <= 0 ? "Crédit global" : "Solde dû"}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
