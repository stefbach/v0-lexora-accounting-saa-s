"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Users, TrendingUp, Download } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface Societe { id: string; nom: string }

const MOIS = ["Juil","Août","Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr","Mai","Jun"]

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

export default function SalairesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [loading, setLoading] = useState(false)
  const [ecritures, setEcritures] = useState<any[]>([])
  const [exercice, setExercice] = useState("2025-2026")

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const fetchData = useCallback(async () => {
    if (selectedSociete === "all") return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/balance?societe_id=${selectedSociete}&exercice=${exercice}`)
      const data = await res.json()
      const salaireComptes = (data.comptes || []).filter((c: any) =>
        c.numero_compte?.startsWith("64")
      )
      setEcritures(salaireComptes)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete, exercice])

  useEffect(() => { fetchData() }, [fetchData])

  // Calcul charges sociales estimées (taux légaux Maurice)
  const totalSalaires = ecritures
    .filter(e => e.numero_compte?.startsWith("641"))
    .reduce((s: number, e: any) => s + (e.total_debit || 0), 0)

  const chargesSociales = {
    csg_patronal: totalSalaires > 0 ? totalSalaires * 0.045 : 0, // ~4.5% moyen (3% ou 6% selon seuil)
    nsf_patronal: totalSalaires * 0.025,
    hrdc: totalSalaires * 0.01,
  }
  const totalChargesPatronales = Object.values(chargesSociales).reduce((s, v) => s + v, 0)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Salaires & Charges Sociales</h1>
          <p className="text-sm text-gray-500 mt-1">Masse salariale et charges patronales</p>
        </div>
        <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> Exporter</Button>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Choisir une société..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">-- Choisir une société --</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={exercice} onValueChange={setExercice}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025-2026">2025–2026</SelectItem>
            <SelectItem value="2024-2025">2024–2025</SelectItem>
            <SelectItem value="2023-2024">2023–2024</SelectItem>
          </SelectContent>
        </Select>
      </CardContent></Card>

      {selectedSociete === "all" ? (
        <Card><CardContent className="text-center py-12 text-gray-500">Sélectionnez une société</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Salaires bruts", value: fmt(totalSalaires), icon: Users, color: "text-blue-600" },
              { label: "CSG patronale (moy.)", value: fmt(chargesSociales.csg_patronal), icon: TrendingUp, color: "text-orange-500" },
              { label: "NSF patronal (2.5%)", value: fmt(chargesSociales.nsf_patronal), icon: TrendingUp, color: "text-orange-500" },
              { label: "Coût total employeur", value: fmt(totalSalaires + totalChargesPatronales), icon: TrendingUp, color: "text-red-600" },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
                <k.icon className={`w-8 h-8 ${k.color}`} />
                <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#0B0F2E]">{k.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Tableau charges sociales */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E]">Décomposition des charges — Taux légaux Maurice</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Charge</TableHead>
                    <TableHead>Taux légal</TableHead>
                    <TableHead>Qui paie</TableHead>
                    <TableHead className="text-right">Montant estimé</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: "CSG salariale", taux: "1.5% ou 3%", qui: "Salarié", montant: totalSalaires * 0.03, note: "1.5% si brut ≤50K MUR, 3% si >50K" },
                    { label: "CSG patronale", taux: "3% ou 6%", qui: "Employeur", montant: chargesSociales.csg_patronal, note: "3% si brut ≤50K MUR, 6% si >50K" },
                    { label: "NSF salariale", taux: "1%", qui: "Salarié", montant: totalSalaires * 0.01, note: "National Savings Fund" },
                    { label: "NSF patronale", taux: "2.5%", qui: "Employeur", montant: chargesSociales.nsf_patronal, note: "National Savings Fund" },
                    { label: "HRDC (Training Levy)", taux: "1%", qui: "Employeur", montant: chargesSociales.hrdc, note: "Sur masse salariale >1.5M MUR" },
                    { label: "PAYE", taux: "0% / 10% / 15%", qui: "Salarié", montant: 0, note: "Retenu à la source — barème progressif MRA" },
                  ].map(r => (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell><span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{r.taux}</span></TableCell>
                      <TableCell className="text-sm text-gray-600">{r.qui}</TableCell>
                      <TableCell className="text-right font-semibold">{r.montant > 0 ? fmt(r.montant) : "—"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{r.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-gray-400 mt-3">* Montants estimés basés sur les écritures comptables. Pour le calcul exact par employé, importez le fichier de paie.</p>
            </CardContent>
          </Card>

          {/* Comptes comptables */}
          {ecritures.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E]">Comptes de personnel (Classe 6)</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Compte</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead className="text-right">Total Débit</TableHead>
                      <TableHead className="text-right">Total Crédit</TableHead>
                      <TableHead className="text-right">Solde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ecritures.map(e => (
                      <TableRow key={e.numero_compte}>
                        <TableCell className="font-mono text-sm font-bold">{e.numero_compte}</TableCell>
                        <TableCell className="text-sm">{e.libelle}</TableCell>
                        <TableCell className="text-right">{fmt(e.total_debit || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(e.total_credit || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(e.solde || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
    </ClientPageShell>
  )
}
