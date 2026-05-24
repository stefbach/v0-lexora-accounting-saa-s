"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Scale, Download, TrendingUp, TrendingDown } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

interface BalanceLigne {
  compte: string; classe: string
  total_debit: number; total_credit: number
  solde: number; solde_debiteur: number; solde_crediteur: number
}

interface Societe { id: string; nom: string }

const getNomsClasses = (locale: 'fr' | 'en'): Record<string, string> => ({
  "1": t('cab.charges.class_1', locale),
  "2": t('cab.charges.class_2', locale),
  "3": t('cab.charges.class_3', locale),
  "4": t('cab.charges.class_4', locale),
  "5": t('cab.charges.class_5', locale),
  "6": t('cab.charges.class_6', locale),
  "7": t('cab.charges.class_7', locale),
})

function fmt(n: number) {
  return n === 0 ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n)
}

export default function BalancePage() {
  const locale = getLocale()
  const NOMS_CLASSES = getNomsClasses(locale)
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [balance, setBalance] = useState<BalanceLigne[]>([])
  const [parClasse, setParClasse] = useState<Record<string, BalanceLigne[]>>({})
  const [totaux, setTotaux] = useState({ total_debit: 0, total_credit: 0, total_solde_debiteur: 0, total_solde_crediteur: 0 })
  const [loading, setLoading] = useState(false)
  const [dateFin, setDateFin] = useState("")
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set(["1","2","4","5","6","7"]))

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const fetchData = useCallback(async () => {
    if (selectedSociete === "all") return
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: selectedSociete })
      if (dateFin) params.set("date_fin", dateFin)
      const res = await fetch(`/api/comptable/balance?${params}`)
      const data = await res.json()
      setBalance(data.balance || [])
      setParClasse(data.par_classe || {})
      setTotaux(data.totaux || {})
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete, dateFin])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleClasse = (c: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      return next
    })
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('cab.charges.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('cab.charges.subtitle', locale)}</p>
        </div>
        <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> {t('cab.charges.export', locale)}</Button>
      </div>

      {/* Filtres */}
      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-56"><SelectValue placeholder={t('cab.charges.choose_company', locale)} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('cab.charges.choose_company_opt', locale)}</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{t('cab.charges.at_date', locale)}</span>
          <Input type="date" className="w-40" value={dateFin} onChange={e => setDateFin(e.target.value)} />
        </div>
        {selectedSociete !== "all" && (
          <Button onClick={fetchData} className="bg-[#0B0F2E] text-white">{t('cab.charges.refresh', locale)}</Button>
        )}
      </CardContent></Card>

      {/* KPIs totaux */}
      {balance.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('cab.charges.kpi_total_debit', locale), value: fmt(totaux.total_debit), icon: TrendingUp, color: "text-blue-600" },
            { label: t('cab.charges.kpi_total_credit', locale), value: fmt(totaux.total_credit), icon: TrendingDown, color: "text-red-600" },
            { label: t('cab.charges.kpi_debit_balances', locale), value: fmt(totaux.total_solde_debiteur), icon: Scale, color: "text-blue-700" },
            { label: t('cab.charges.kpi_credit_balances', locale), value: fmt(totaux.total_solde_crediteur), icon: Scale, color: "text-red-700" },
          ].map(k => (
            <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-7 h-7 ${k.color}`} />
              <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-lg font-bold text-[#0B0F2E]">{k.value}</p></div>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Balance par classe */}
      <Card>
        <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2">
          <Scale className="w-5 h-5" /> {t('cab.charges.balance_by_class', locale)}
        </CardTitle></CardHeader>
        <CardContent className="p-0">
          {selectedSociete === "all" ? (
            <div className="text-center py-12 text-gray-500">{t('cab.charges.select_company', locale)}</div>
          ) : loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
          ) : balance.length === 0 ? (
            <div className="text-center py-12 text-gray-500">{t('cab.charges.empty', locale)}</div>
          ) : (
            <div className="divide-y">
              {Object.entries(parClasse).sort(([a], [b]) => a.localeCompare(b)).map(([classe, lignes]) => {
                const totalD = lignes.reduce((s, l) => s + l.total_debit, 0)
                const totalC = lignes.reduce((s, l) => s + l.total_credit, 0)
                const totalSD = lignes.reduce((s, l) => s + l.solde_debiteur, 0)
                const totalSC = lignes.reduce((s, l) => s + l.solde_crediteur, 0)
                return (
                  <div key={classe}>
                    {/* En-tête classe */}
                    <div
                      className="flex items-center justify-between p-3 bg-[#0B0F2E]/5 cursor-pointer hover:bg-[#0B0F2E]/10"
                      onClick={() => toggleClasse(classe)}
                    >
                      <span className="font-semibold text-[#0B0F2E] text-sm">
                        {t('cab.charges.class_label', locale)} {classe} — {NOMS_CLASSES[classe] || ""}
                        <span className="ml-2 text-xs font-normal text-gray-500">({lignes.length} {t('cab.charges.account_unit', locale)}{lignes.length > 1 ? "s" : ""})</span>
                      </span>
                      <div className="flex gap-6 text-xs text-gray-600">
                        <span>{t('cab.charges.debit', locale)}: <b>{fmt(totalD)}</b></span>
                        <span>{t('cab.charges.credit', locale)}: <b>{fmt(totalC)}</b></span>
                        <span className="text-blue-700">{t('cab.charges.sd', locale)}: <b>{fmt(totalSD)}</b></span>
                        <span className="text-red-700">{t('cab.charges.sc', locale)}: <b>{fmt(totalSC)}</b></span>
                        <span>{expandedClasses.has(classe) ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {/* Lignes de la classe */}
                    {expandedClasses.has(classe) && (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 text-xs">
                            <TableHead className="w-28">{t('cab.charges.col_account', locale)}</TableHead>
                            <TableHead className="text-right">{t('cab.charges.col_debit_mvt', locale)}</TableHead>
                            <TableHead className="text-right">{t('cab.charges.col_credit_mvt', locale)}</TableHead>
                            <TableHead className="text-right">{t('cab.charges.col_debit_balance', locale)}</TableHead>
                            <TableHead className="text-right">{t('cab.charges.col_credit_balance', locale)}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lignes.map(l => (
                            <TableRow key={l.compte} className="text-sm">
                              <TableCell className="font-mono text-xs font-semibold">{l.compte}</TableCell>
                              <TableCell className="text-right">{fmt(l.total_debit)}</TableCell>
                              <TableCell className="text-right">{fmt(l.total_credit)}</TableCell>
                              <TableCell className="text-right text-blue-700 font-medium">{fmt(l.solde_debiteur)}</TableCell>
                              <TableCell className="text-right text-red-700 font-medium">{fmt(l.solde_crediteur)}</TableCell>
                            </TableRow>
                          ))}
                          {/* Sous-total classe */}
                          <TableRow className="bg-gray-50 font-semibold text-xs border-t">
                            <TableCell>{t('cab.charges.total_class', locale)}{classe}</TableCell>
                            <TableCell className="text-right">{fmt(totalD)}</TableCell>
                            <TableCell className="text-right">{fmt(totalC)}</TableCell>
                            <TableCell className="text-right text-blue-700">{fmt(totalSD)}</TableCell>
                            <TableCell className="text-right text-red-700">{fmt(totalSC)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )
              })}
              {/* Ligne TOTAL GÉNÉRAL */}
              <div className="flex items-center justify-between p-4 bg-[#0B0F2E] text-white font-bold text-sm">
                <span>{t('cab.charges.grand_total', locale)}</span>
                <div className="flex gap-6">
                  <span>{t('cab.charges.debit', locale)}: {fmt(totaux.total_debit)}</span>
                  <span>{t('cab.charges.credit', locale)}: {fmt(totaux.total_credit)}</span>
                  <span>{t('cab.charges.sd', locale)}: {fmt(totaux.total_solde_debiteur)}</span>
                  <span>{t('cab.charges.sc', locale)}: {fmt(totaux.total_solde_crediteur)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
