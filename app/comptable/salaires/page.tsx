"use client"

import { useState, useEffect, useCallback } from "react"
import { getCurrentExercice } from "@/lib/fiscal-years"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Users, TrendingUp, Download } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

interface Societe { id: string; nom: string }

const MOIS = ["Juil","Août","Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr","Mai","Jun"]

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

export default function SalairesPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [loading, setLoading] = useState(false)
  const [ecritures, setEcritures] = useState<any[]>([])
  const [exercice, setExercice] = useState(getCurrentExercice())

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
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('cab.salaires.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('cab.salaires.subtitle', locale)}</p>
        </div>
        <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> {t('cab.salaires.export', locale)}</Button>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-56"><SelectValue placeholder={t('cab.salaires.choose_company', locale)} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('cab.salaires.choose_company_opt', locale)}</SelectItem>
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
        <Card><CardContent className="text-center py-12 text-gray-500">{t('cab.salaires.select_company', locale)}</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('cab.salaires.kpi_gross', locale), value: fmt(totalSalaires), icon: Users, color: "text-blue-600" },
              { label: t('cab.salaires.kpi_csg_employer', locale), value: fmt(chargesSociales.csg_patronal), icon: TrendingUp, color: "text-orange-500" },
              { label: t('cab.salaires.kpi_nsf_employer', locale), value: fmt(chargesSociales.nsf_patronal), icon: TrendingUp, color: "text-orange-500" },
              { label: t('cab.salaires.kpi_total_cost', locale), value: fmt(totalSalaires + totalChargesPatronales), icon: TrendingUp, color: "text-red-600" },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
                <k.icon className={`w-8 h-8 ${k.color}`} />
                <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#0B0F2E]">{k.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Tableau charges sociales */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E]">{t('cab.salaires.breakdown_title', locale)}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('cab.salaires.col_charge', locale)}</TableHead>
                    <TableHead>{t('cab.salaires.col_legal_rate', locale)}</TableHead>
                    <TableHead>{t('cab.salaires.col_who_pays', locale)}</TableHead>
                    <TableHead className="text-right">{t('cab.salaires.col_estimated', locale)}</TableHead>
                    <TableHead>{t('cab.salaires.col_note', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: t('cab.salaires.charge_csg_employee', locale), taux: "1.5% ou 3%", qui: t('cab.salaires.who_employee', locale), montant: totalSalaires * 0.03, note: t('cab.salaires.note_csg_employee', locale) },
                    { label: t('cab.salaires.charge_csg_employer', locale), taux: "3% ou 6%", qui: t('cab.salaires.who_employer', locale), montant: chargesSociales.csg_patronal, note: t('cab.salaires.note_csg_employer', locale) },
                    { label: t('cab.salaires.charge_nsf_employee', locale), taux: "1%", qui: t('cab.salaires.who_employee', locale), montant: totalSalaires * 0.01, note: t('cab.salaires.note_nsf', locale) },
                    { label: t('cab.salaires.charge_nsf_employer', locale), taux: "2.5%", qui: t('cab.salaires.who_employer', locale), montant: chargesSociales.nsf_patronal, note: t('cab.salaires.note_nsf', locale) },
                    { label: t('cab.salaires.charge_hrdc', locale), taux: "1%", qui: t('cab.salaires.who_employer', locale), montant: chargesSociales.hrdc, note: t('cab.salaires.note_hrdc', locale) },
                    { label: "PAYE", taux: "0% / 10% / 15%", qui: t('cab.salaires.who_employee', locale), montant: 0, note: t('cab.salaires.note_paye', locale) },
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
              <p className="text-xs text-gray-400 mt-3">{t('cab.salaires.footnote', locale)}</p>
            </CardContent>
          </Card>

          {/* Comptes comptables */}
          {ecritures.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E]">{t('cab.salaires.accounts_title', locale)}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cab.salaires.col_account', locale)}</TableHead>
                      <TableHead>{t('cab.salaires.col_label', locale)}</TableHead>
                      <TableHead className="text-right">{t('cab.salaires.col_total_debit', locale)}</TableHead>
                      <TableHead className="text-right">{t('cab.salaires.col_total_credit', locale)}</TableHead>
                      <TableHead className="text-right">{t('cab.salaires.col_balance', locale)}</TableHead>
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
