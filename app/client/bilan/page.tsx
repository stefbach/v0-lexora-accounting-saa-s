"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import { Loader2, Building2, Download, Calendar, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MonthPicker } from "@/components/ui/MonthPicker"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function amountCell(n: number) {
  const style: React.CSSProperties = {}
  if (n > 0) style.color = "#16A34A"
  if (n < 0) style.color = "#DC2626"
  const display = n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n)
  return { display, style }
}

// Revenue account labels
const REVENUE_LABELS: Record<string, string> = {
  "706": "Prestations de services (706)",
  "707": "Ventes de marchandises (707)",
  "701": "Ventes de produits finis (701)",
  "702": "Ventes de produits intermediaires (702)",
  "703": "Ventes de produits residuels (703)",
  "704": "Travaux (704)",
  "705": "Etudes (705)",
  "708": "Produits des activites annexes (708)",
  "709": "RRR accordes (709)",
  "711": "Variation des stocks (711)",
  "713": "Variation en-cours de production (713)",
  "721": "Production immobilisee (721)",
  "741": "Subventions d'exploitation (741)",
  "751": "Produits de gestion courante (751)",
  "753": "Commissions (753)",
  "758": "Produits divers de gestion courante (758)",
  "761": "Produits financiers (761)",
  "771": "Produits exceptionnels (771)",
}

const EXPENSE_GROUPS: { label: string; range: string; match: (p: string) => boolean }[] = [
  { label: "Achats", range: "601-609", match: (p) => { const n = parseInt(p); return n >= 601 && n <= 609 } },
  { label: "Services exterieurs", range: "611-619", match: (p) => { const n = parseInt(p); return n >= 611 && n <= 619 } },
  { label: "Autres services exterieurs", range: "621-629", match: (p) => { const n = parseInt(p); return n >= 621 && n <= 629 } },
  { label: "Impots et taxes", range: "631-639", match: (p) => { const n = parseInt(p); return n >= 631 && n <= 639 } },
  // Salaires (641, 644) séparés des charges patronales (645-649) pour
  // que la ligne "masse salariale brute" soit lisible dans la P&L.
  { label: "Salaires et traitements", range: "641, 644", match: (p) => p === "641" || p === "644" },
  { label: "Charges sociales et patronales", range: "645-649", match: (p) => { const n = parseInt(p); return n >= 645 && n <= 649 } },
  { label: "Autres charges de gestion", range: "651-659", match: (p) => { const n = parseInt(p); return n >= 651 && n <= 659 } },
  { label: "Charges financieres", range: "661-669", match: (p) => { const n = parseInt(p); return n >= 661 && n <= 669 } },
]

function groupExpenses(expensesByAccount: Record<string, number>) {
  const groups: { label: string; range: string; amount: number }[] = []
  const assigned = new Set<string>()

  for (const group of EXPENSE_GROUPS) {
    let total = 0
    for (const [prefix, amount] of Object.entries(expensesByAccount)) {
      if (group.match(prefix)) {
        total += amount
        assigned.add(prefix)
      }
    }
    if (total !== 0) {
      groups.push({ label: group.label, range: group.range, amount: total })
    }
  }

  let otherTotal = 0
  for (const [prefix, amount] of Object.entries(expensesByAccount)) {
    if (!assigned.has(prefix)) {
      otherTotal += amount
    }
  }
  if (otherTotal !== 0) {
    groups.push({ label: "Autres charges", range: "classe 6", amount: otherTotal })
  }

  return groups
}

/* ── Shared sub-components for the clean table design ── */

function SectionHeader({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={3} className="text-sm font-bold pt-5 pb-2 border-b">{label}</TableCell>
    </TableRow>
  )
}

function VarianceBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return null
  if (prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const isUp = pct > 0
  const color = isUp ? "#16A34A" : "#DC2626"
  return (
    <span className="ml-2 text-xs font-mono" style={{ color }}>
      {isUp ? "+" : ""}{pct.toFixed(1)}%
    </span>
  )
}

function SubItem({ label, current, prev }: { label: string; current: number; prev?: number }) {
  const a = amountCell(current)
  const prevDisplay = prev !== undefined ? amountCell(prev) : null
  return (
    <TableRow>
      <TableCell className="pl-8 text-sm py-2">{label}</TableCell>
      <TableCell className="text-right text-sm font-mono tabular-nums py-2" style={a.style}>{a.display}</TableCell>
      <TableCell className="text-right text-sm font-mono tabular-nums py-2 text-muted-foreground">
        {prevDisplay ? <span style={prevDisplay.style}>{prevDisplay.display}</span> : "\u2014"}
        {prev !== undefined && <VarianceBadge current={current} prev={prev} />}
      </TableCell>
    </TableRow>
  )
}

function TotalRow({ label, current, prev, grand = false }: { label: string; current: number; prev?: number; grand?: boolean }) {
  const a = amountCell(current)
  const prevDisplay = prev !== undefined ? amountCell(prev) : null
  return (
    <TableRow className={grand ? "border-t-2 border-b-2" : "border-t"}>
      <TableCell className={`text-sm py-2 ${grand ? "font-bold text-base" : "font-bold"}`}>{label}</TableCell>
      <TableCell className={`text-right font-mono tabular-nums py-2 ${grand ? "font-bold text-base" : "text-sm font-bold"}`} style={a.style}>{a.display}</TableCell>
      <TableCell className={`text-right font-mono tabular-nums py-2 text-muted-foreground ${grand ? "text-base" : "text-sm"}`}>
        {prevDisplay ? <span style={prevDisplay.style}>{prevDisplay.display}</span> : "\u2014"}
        {prev !== undefined && <VarianceBadge current={current} prev={prev} />}
      </TableCell>
    </TableRow>
  )
}

/* ── Balance Sheet Table ── */
function BalanceSheetTable({ data, prevData, exercice, prevExercice }: { data: any; prevData: any; exercice: string; prevExercice: string }) {
  const immobilisations = data?.immobilisations ?? 0
  const creancesClients = data?.creances ?? 0
  const tresorerie = data?.totalBankMUR ?? 0
  const totalNonCurrentAssets = immobilisations
  const totalCurrentAssets = tresorerie + creancesClients
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  const capitauxPropres = data?.capitauxPropres ?? 0
  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const retainedEarnings = totalRevenue - totalExpenses
  const totalEquity = capitauxPropres + retainedEarnings

  const dettesFournisseurs = data?.dettesFournisseurs ?? 0
  const dettesFiscales = data?.dettesFiscales ?? 0
  const dettesSociales = data?.dettesSociales ?? 0
  const totalCurrentLiabilities = dettesFournisseurs + dettesFiscales + dettesSociales

  const totalEquityAndLiabilities = totalEquity + totalCurrentLiabilities

  // Previous year values
  const pImmo = prevData?.immobilisations ?? undefined
  const pCreances = prevData?.creances ?? undefined
  const pTreso = prevData?.totalBankMUR ?? undefined
  const pNonCurrent = pImmo !== undefined ? pImmo : undefined
  const pCurrentAssets = (pTreso !== undefined && pCreances !== undefined) ? pTreso + pCreances : undefined
  const pTotalAssets = (pCurrentAssets !== undefined && pNonCurrent !== undefined) ? pCurrentAssets + pNonCurrent : undefined
  const pCapitaux = prevData?.capitauxPropres ?? undefined
  const pRevenue = prevData?.totalRevenue ?? undefined
  const pExpenses = prevData?.totalExpenses ?? undefined
  const pRetained = (pRevenue !== undefined && pExpenses !== undefined) ? pRevenue - pExpenses : undefined
  const pEquity = (pCapitaux !== undefined && pRetained !== undefined) ? pCapitaux + pRetained : undefined
  const pDettesFourn = prevData?.dettesFournisseurs ?? undefined
  const pDettesFisc = prevData?.dettesFiscales ?? undefined
  const pDettesSoc = prevData?.dettesSociales ?? undefined
  const pCurrentLiab = (pDettesFourn !== undefined && pDettesFisc !== undefined && pDettesSoc !== undefined) ? pDettesFourn + pDettesFisc + pDettesSoc : undefined
  const pTotal = (pEquity !== undefined && pCurrentLiab !== undefined) ? pEquity + pCurrentLiab : undefined

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/2">Poste</TableHead>
          <TableHead className="text-right">{exercice} (MUR)</TableHead>
          <TableHead className="text-right">{prevExercice} (MUR)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <SectionHeader label="NON-CURRENT ASSETS" />
        <SubItem label="Property, Plant & Equipment" current={immobilisations} prev={pImmo} />
        <SubItem label="Intangible Assets" current={0} prev={prevData ? 0 : undefined} />
        <TotalRow label="Total Non-Current Assets" current={totalNonCurrentAssets} prev={pNonCurrent} />

        <SectionHeader label="CURRENT ASSETS" />
        <SubItem label="Trade Receivables" current={creancesClients} prev={pCreances} />
        <SubItem label="Cash & Bank" current={tresorerie} prev={pTreso} />
        <TotalRow label="Total Current Assets" current={totalCurrentAssets} prev={pCurrentAssets} />

        <TotalRow label="TOTAL ASSETS" current={totalAssets} prev={pTotalAssets} grand />

        <SectionHeader label="EQUITY" />
        <SubItem label="Share Capital" current={capitauxPropres} prev={pCapitaux} />
        <SubItem label="Retained Earnings" current={retainedEarnings} prev={pRetained} />
        <TotalRow label="Total Equity" current={totalEquity} prev={pEquity} />

        <SectionHeader label="CURRENT LIABILITIES" />
        <SubItem label="Trade Payables" current={dettesFournisseurs} prev={pDettesFourn} />
        <SubItem label="VAT Payable" current={dettesFiscales} prev={pDettesFisc} />
        <SubItem label="CSG/NSF/PAYE Payable" current={dettesSociales} prev={pDettesSoc} />
        <TotalRow label="Total Current Liabilities" current={totalCurrentLiabilities} prev={pCurrentLiab} />

        <TotalRow label="TOTAL EQUITY & LIABILITIES" current={totalEquityAndLiabilities} prev={pTotal} grand />
      </TableBody>
    </Table>
  )
}

/* ── Profit & Loss Table ── */
function ProfitLossTable({ data, prevData, exercice, prevExercice }: { data: any; prevData: any; exercice: string; prevExercice: string }) {
  const revenueByAccount: Record<string, number> = data?.revenueByAccount ?? {}
  const expensesByAccount: Record<string, number> = data?.expensesByAccount ?? {}
  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0

  const prevRevenueByAccount: Record<string, number> = prevData?.revenueByAccount ?? {}
  const prevExpensesByAccount: Record<string, number> = prevData?.expensesByAccount ?? {}
  const prevTotalRevenue = prevData?.totalRevenue ?? undefined
  const prevTotalExpenses = prevData?.totalExpenses ?? undefined

  const revenueDetails = Object.entries(revenueByAccount)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const allExpenseGroups = groupExpenses(expensesByAccount)
  const prevExpenseGroups = prevData ? groupExpenses(prevExpensesByAccount) : []
  const profitBeforeTax = totalRevenue - totalExpenses
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * 0.15 : 0
  const netProfit = profitBeforeTax - incomeTax

  const pProfitBefore = (prevTotalRevenue !== undefined && prevTotalExpenses !== undefined) ? prevTotalRevenue - prevTotalExpenses : undefined
  const pIncomeTax = pProfitBefore !== undefined ? (pProfitBefore > 0 ? pProfitBefore * 0.15 : 0) : undefined
  const pNetProfit = (pProfitBefore !== undefined && pIncomeTax !== undefined) ? pProfitBefore - pIncomeTax : undefined

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/2">Poste</TableHead>
          <TableHead className="text-right">{exercice} (MUR)</TableHead>
          <TableHead className="text-right">{prevExercice} (MUR)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <SectionHeader label="REVENUE" />
        {revenueDetails.map(([prefix, amount]) => (
          <SubItem key={prefix} label={REVENUE_LABELS[prefix] || `Compte ${prefix}x`} current={amount} prev={prevData ? (prevRevenueByAccount[prefix] ?? 0) : undefined} />
        ))}
        {revenueDetails.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">Aucun produit enregistre</TableCell>
          </TableRow>
        )}
        <TotalRow label="TOTAL REVENUE" current={totalRevenue} prev={prevTotalRevenue} />

        <SectionHeader label="OPERATING EXPENSES" />
        {allExpenseGroups.map((group) => {
          const prevGroup = prevExpenseGroups.find(g => g.label === group.label)
          return (
            <SubItem key={group.label} label={`${group.label} (${group.range})`} current={-group.amount} prev={prevGroup ? -prevGroup.amount : (prevData ? 0 : undefined)} />
          )
        })}
        {allExpenseGroups.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">Aucune charge enregistree</TableCell>
          </TableRow>
        )}
        <TotalRow label="TOTAL EXPENSES" current={-totalExpenses} prev={prevTotalExpenses !== undefined ? -prevTotalExpenses : undefined} />

        <TotalRow label="PROFIT BEFORE TAX" current={profitBeforeTax} prev={pProfitBefore} />
        <SubItem label="Income Tax (15%)" current={-incomeTax} prev={pIncomeTax !== undefined ? -pIncomeTax : undefined} />
        <TotalRow label="NET PROFIT" current={netProfit} prev={pNetProfit} grand />
      </TableBody>
    </Table>
  )
}

export default function BilanPage() {
  const locale = getLocale()
  const { profile, loading } = useProfile()
  const { societeId, societe } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [prevData, setPrevData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [exercice, setExercice] = useState<string>("")
  const [prevExercice, setPrevExercice] = useState<string>("")
  const [availableExercices, setAvailableExercices] = useState<string[]>([])
  const [purging, setPurging] = useState(false)
  const [viewMode, setViewMode] = useState<"exercice" | "mensuel">("exercice")
  const [activeTab, setActiveTab] = useState("balance-sheet")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
  })

  // PDF OCR Import state
  const [importingPdf, setImportingPdf] = useState(false)
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  // Load prior year OCR data from localStorage
  useEffect(() => {
    if (!exercice) return
    const stored = localStorage.getItem(`lexora_bilan_prev_${exercice}`)
    if (stored) {
      try {
        const ocrData = JSON.parse(stored)
        setPrevData((current: any) => current ?? ocrData)
      } catch { /* ignore */ }
    }
  }, [exercice])

  const handleImportPdf = async (file: File) => {
    setImportingPdf(true)
    setImportMessage(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (societeId) formData.append("societe_id", societeId)
      formData.append("hint", "Bilan comptable - Balance Sheet - Profit & Loss - Financial Statements Mauritius")
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
      if (!res.ok) {
        setImportMessage({ type: "error", text: "Erreur lors de l'import du PDF." })
        return
      }
      const result = await res.json()
      const parsed = result?.n8n_result || result?.data || result
      if (parsed) {
        const ocrPrevData: any = {
          totalRevenue: Number(parsed.total_revenue ?? parsed.totalRevenue ?? parsed.chiffre_affaires ?? 0),
          totalExpenses: Number(parsed.total_expenses ?? parsed.totalExpenses ?? parsed.total_charges ?? 0),
          creances: Number(parsed.creances ?? parsed.trade_receivables ?? 0),
          immobilisations: Number(parsed.immobilisations ?? parsed.fixed_assets ?? parsed.property_plant_equipment ?? 0),
          capitauxPropres: Number(parsed.capitaux_propres ?? parsed.capitauxPropres ?? parsed.share_capital ?? parsed.equity ?? 0),
          dettesFournisseurs: Number(parsed.dettes_fournisseurs ?? parsed.dettesFournisseurs ?? parsed.trade_payables ?? 0),
          dettesFiscales: Number(parsed.dettes_fiscales ?? parsed.dettesFiscales ?? parsed.vat_payable ?? 0),
          dettesSociales: Number(parsed.dettes_sociales ?? parsed.dettesSociales ?? 0),
          totalBankMUR: Number(parsed.tresorerie ?? parsed.totalBankMUR ?? parsed.cash_bank ?? parsed.cash ?? 0),
        }
        // Store in localStorage for persistence
        if (exercice) {
          localStorage.setItem(`lexora_bilan_prev_${exercice}`, JSON.stringify(ocrPrevData))
        }
        setPrevData(ocrPrevData)
        setImportMessage({
          type: "success",
          text: `Donnees N-1 extraites : CA ${fmt(ocrPrevData.totalRevenue)}, Charges ${fmt(ocrPrevData.totalExpenses)}, Tresorerie ${fmt(ocrPrevData.totalBankMUR)}`
        })
      } else {
        setImportMessage({ type: "error", text: "Aucune donnee financiere trouvee dans le PDF." })
      }
    } catch {
      setImportMessage({ type: "error", text: "Erreur lors de l'import du PDF." })
    } finally {
      setImportingPdf(false)
    }
  }

  useEffect(() => {
    if (!societeId) { setFetching(false); return }
    setFetching(true)
    const params = new URLSearchParams()
    params.set("societe_id", societeId)
    if (viewMode === "mensuel" && selectedMonth) {
      const [y, m] = selectedMonth.split("-").map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      params.set("date_debut", `${y}-${String(m).padStart(2, "0")}-01`)
      params.set("date_fin", `${y}-${String(m).padStart(2, "0")}-${lastDay}`)
    } else if (exercice) {
      params.set("exercice", exercice)
    }
    const url = `/api/client/financial${params.toString() ? "?" + params.toString() : ""}`

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json.financial)
        const currentEx = json.financial?.exercice_actuel || ""
        const prevEx = json.financial?.exercice_precedent || ""
        if (!exercice && currentEx) setExercice(currentEx)
        setPrevExercice(prevEx)
        if (json.financial?.available_exercices) setAvailableExercices(json.financial.available_exercices)

        // Fetch previous year data — only if N-1 exercice exists
        if (prevEx) {
          const prevParams = new URLSearchParams()
          prevParams.set("societe_id", societeId)
          prevParams.set("exercice", prevEx)
          fetch(`/api/client/financial?${prevParams.toString()}`)
            .then(r => r.json())
            .then(pJson => {
              const pf = pJson.financial
              // Ne pas afficher N-1 si pas de CA réel (les soldes bancaires
              // et artefacts ne suffisent pas à justifier un comparatif)
              const hasRealData = pf && (pf.totalRevenue || 0) > 0
              setPrevData(hasRealData ? pf : null)
            })
            .catch(() => setPrevData(null))
            .finally(() => setFetching(false))
        } else {
          setPrevData(null)
          setFetching(false)
        }
      })
      .catch(() => { setData(null); setPrevData(null); setFetching(false) })
  }, [societeId, exercice, viewMode, selectedMonth])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const totalAssets = (data?.totalBankMUR ?? 0) + (data?.creances ?? 0) + (data?.immobilisations ?? 0)
  const totalLiabilitiesAndEquity = (data?.capitauxPropres ?? 0) + (totalRevenue - totalExpenses) + (data?.dettesFournisseurs ?? 0) + (data?.dettesFiscales ?? 0) + (data?.dettesSociales ?? 0)
  const hasData = totalRevenue !== 0 || totalExpenses !== 0 || totalAssets !== 0 || totalLiabilitiesAndEquity !== 0

  const selectedSoc = societe as (typeof societe & { adresse?: string; numero_tva_mra?: string; date_incorporation?: string; capital_social?: number }) | null
  const selectedSocieteName = selectedSoc?.nom || "—"
  const missingFields: string[] = []
  if (selectedSoc) {
    if (!selectedSoc.date_incorporation) missingFields.push("Date d'incorporation")
    if (!selectedSoc.capital_social) missingFields.push("Capital social")
    if (!selectedSoc.contact_name && !selectedSoc.directeur) missingFields.push("Nom du directeur")
  }

  // Period labels for PDF
  const periodEnd = viewMode === "mensuel" && selectedMonth
    ? (() => { const [y, m] = selectedMonth.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return `${last} ${new Date(y, m - 1).toLocaleDateString("fr-FR", { month: "long" })} ${y}` })()
    : exercice ? `30 Juin ${exercice.split("-")[1]}` : ""
  const periodLabel = viewMode === "mensuel" ? `Pour le mois de ${periodEnd}` : `For the year ended ${periodEnd}`

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-[900px] mx-auto">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 15mm; size: A4; }
        }
      `}</style>

      {/* Context subtitle */}
      <p className="text-xs text-gray-400 no-print">
        Consolidation de tous les comptes de la société sélectionnée — conforme au Companies Act 2001
      </p>

      {/* Missing info warning */}
      {missingFields.length > 0 && (
        <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800 no-print">
          <p className="font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" />Informations manquantes pour le bilan légal :</p>
          <ul className="list-disc ml-8 mt-1 text-xs">{missingFields.map(f => <li key={f}>{f}</li>)}</ul>
          <p className="text-xs mt-1">Complétez ces informations dans <Link href={`/client/societe?id=${societeId}`} className="underline">Fiche Société</Link>.</p>
        </div>
      )}

      {/* Top bar: filter + download */}
      <div className="flex items-center justify-between flex-wrap gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <button onClick={() => setViewMode("exercice")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "exercice" ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Exercice</button>
              <button onClick={() => setViewMode("mensuel")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "mensuel" ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Mensuel</button>
            </div>
            {viewMode === "exercice" && availableExercices.length > 0 && (
              <>
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={exercice} onValueChange={setExercice}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Exercice" /></SelectTrigger>
                  <SelectContent>{availableExercices.map(ex => <SelectItem key={ex} value={ex}>{ex}</SelectItem>)}</SelectContent>
                </Select>
              </>
            )}
            {/* Bouton Purger exercice précédent */}
            {prevExercice && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                disabled={purging}
                onClick={async () => {
                  if (!societeId) return
                  const msg = `Supprimer TOUTES les écritures de l'exercice ${prevExercice} ?\n\nCela supprimera les données parasites (soldes d'ouverture, artefacts) de la colonne N-1.\n\nCette action est irréversible.`
                  if (!confirm(msg)) return
                  setPurging(true)
                  try {
                    const res = await fetch('/api/comptable/ecritures?action=purge_exercice', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ societe_id: societeId, exercice: prevExercice }),
                    })
                    const d = await res.json()
                    if (res.ok) {
                      alert(`${d.deleted || 0} écriture(s) supprimée(s) pour ${prevExercice}`)
                      setPrevData(null)
                      window.location.reload()
                    } else {
                      alert(d.error || 'Erreur')
                    }
                  } catch (e: any) { alert(e.message) }
                  finally { setPurging(false) }
                }}
              >
                {purging ? '...' : `🗑 Purger ${prevExercice}`}
              </Button>
            )}
            {viewMode === "mensuel" && (
              <MonthPicker value={selectedMonth} onChange={v => { if (v) setSelectedMonth(v) }} showTout={false} />
            )}
          </div>
        </div>
        <Button
          onClick={async () => {
            const elementId = activeTab === 'profit-loss' ? 'pnl-pdf-content' : 'bilan-pdf-content'
            const el = document.getElementById(elementId)
            if (!el) return
            el.style.display = 'block'
            const html2pdf = (await import('html2pdf.js')).default
            const socName = selectedSoc?.nom || 'Societe'
            const period = viewMode === 'mensuel' ? selectedMonth : exercice
            const prefix = activeTab === 'profit-loss' ? 'pnl' : 'bilan'
            await html2pdf().set({
              margin: [15, 15, 20, 15],
              filename: `${prefix}_${socName.replace(/\s+/g, '_')}_${period}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2 },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            }).from(el).save()
            el.style.display = 'none'
          }}
          variant="outline"
          className="no-print flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Télécharger PDF
        </Button>
      </div>

      {/* PDF Import for prior year data */}
      <Card className="border-2 border-dashed no-print" style={{ borderColor: GOLD }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>Données de l&apos;année précédente (optionnel)</p>
                <p className="text-xs text-gray-500">
                  Si vous avez un bilan de l&apos;année précédente, uploadez-le pour afficher la comparaison N-1 dans le tableau.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                id="pdf-import-bilan"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleImportPdf(file)
                  e.target.value = ""
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importingPdf}
                style={{ borderColor: GOLD, color: NAVY }}
                className="flex items-center gap-2"
              >
                {importingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {importingPdf ? "Import en cours..." : "Importer le bilan précédent"}
              </Button>
            </div>
          </div>
          {importMessage && (
            <div className={`flex items-center gap-2 text-sm mt-3 ${importMessage.type === "error" ? "text-red-600" : "text-green-700"}`}>
              {importMessage.type === "error" ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{importMessage.text}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasData ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <p className="text-sm text-muted-foreground">
            {t('acc.bil.no_data', locale)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('acc.bil.no_data_help', locale)}
          </p>
        </div>
      ) : (
        <>
          {/* Company name centered */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold">{selectedSocieteName.toUpperCase()}</h1>
            <p className="text-sm text-muted-foreground">
              Prepared in accordance with IFRS for SMEs &mdash; Companies Act 2001 Mauritius
            </p>
          </div>

          {/* Bilan content (for PDF export) */}
          <div id="bilan-content">
            <div className="hidden print:block mb-4">
              <h2 className="text-lg font-bold" style={{ color: "#0B0F2E" }}>{societe?.nom || ""}</h2>
              <p className="text-sm text-gray-500">Bilan — {viewMode === "mensuel" ? selectedMonth : `Exercice ${exercice}`}</p>
              <p className="text-xs text-gray-400">Préparé conformément aux IFRS pour PME (Companies Act 2001 — Maurice)</p>
            </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="profit-loss">Profit &amp; Loss</TabsTrigger>
            </TabsList>

            <TabsContent value="balance-sheet">
              <div className="border rounded-lg overflow-hidden">
                <BalanceSheetTable data={data} prevData={prevData} exercice={exercice} prevExercice={prevExercice} />
              </div>
            </TabsContent>

            <TabsContent value="profit-loss">
              <div className="border rounded-lg overflow-hidden">
                <ProfitLossTable data={data} prevData={prevData} exercice={exercice} prevExercice={prevExercice} />
              </div>
            </TabsContent>
          </Tabs>
          </div>

          {/* Footer */}
          <div className="text-center py-4 print:py-2">
            <p className="text-xs text-muted-foreground italic">
              All amounts are in Mauritian Rupees (MUR)
            </p>
          </div>
        </>
      )}

      {/* === LEGAL PDF TEMPLATE (hidden, shown only during PDF export) === */}
      <div id="bilan-pdf-content" style={{ display: 'none', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', fontSize: '11px', lineHeight: '1.5' }}>
        {/* PDF Header */}
        <div style={{ borderBottom: '2px solid #0B0F2E', paddingBottom: '12px', marginBottom: '20px' }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0B0F2E', marginBottom: '4px' }}>
            {selectedSoc?.nom || "SOCIÉTÉ"}
          </p>
          {selectedSoc?.brn && <p style={{ fontSize: '10px', color: '#666' }}>Business Registration Number: {selectedSoc.brn}</p>}
          {selectedSoc?.adresse && <p style={{ fontSize: '10px', color: '#666' }}>Registered Office: {selectedSoc.adresse}</p>}
          {selectedSoc?.numero_tva_mra && <p style={{ fontSize: '10px', color: '#666' }}>VAT Registration Number: {selectedSoc.numero_tva_mra}</p>}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#0B0F2E' }}>STATEMENT OF FINANCIAL POSITION</p>
            <p style={{ fontSize: '11px', color: '#444' }}>(Balance Sheet)</p>
            <p style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>{periodLabel}</p>
            <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Prepared in accordance with IFRS for SMEs as adopted in Mauritius</p>
            <p style={{ fontSize: '9px', color: '#888' }}>All amounts in Mauritian Rupees (MUR)</p>
          </div>
        </div>

        {/* Balance Sheet Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0B0F2E' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: '10px', fontWeight: 'bold' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '10px', fontWeight: 'bold' }}>{exercice || "Current"} (MUR)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '8px 4px 4px', borderTop: '1px solid #ddd', fontSize: '11px' }}>ASSETS</td></tr>
            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '4px 4px 2px', fontSize: '10px', color: '#444' }}>Non-Current Assets</td></tr>
            <tr><td style={{ paddingLeft: '16px', padding: '2px 4px 2px 16px', fontSize: '10px' }}>Property, Plant & Equipment</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.immobilisations ?? 0)}</td></tr>
            <tr style={{ borderBottom: '1px solid #eee' }}><td style={{ paddingLeft: '16px', fontWeight: 'bold', padding: '2px 4px 4px 4px', fontSize: '10px' }}>Total Non-Current Assets</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.immobilisations ?? 0)}</td></tr>

            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '6px 4px 2px', fontSize: '10px', color: '#444' }}>Current Assets</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>Trade Receivables</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.creances ?? 0)}</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>Cash and Bank Equivalents</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.totalBankMUR ?? 0)}</td></tr>
            <tr style={{ borderBottom: '1px solid #eee' }}><td style={{ fontWeight: 'bold', padding: '2px 4px 4px 4px', fontSize: '10px' }}>Total Current Assets</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 4px', fontSize: '10px' }}>{fmt((data?.creances ?? 0) + (data?.totalBankMUR ?? 0))}</td></tr>

            <tr style={{ borderTop: '2px solid #0B0F2E', borderBottom: '2px solid #0B0F2E' }}><td style={{ fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>TOTAL ASSETS</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>{fmt(totalAssets)}</td></tr>

            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '12px 4px 4px', fontSize: '11px' }}>EQUITY AND LIABILITIES</td></tr>
            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '4px 4px 2px', fontSize: '10px', color: '#444' }}>Equity</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>Share Capital</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(selectedSoc?.capital_social ?? 0)}</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>Retained Earnings</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(totalRevenue - totalExpenses)}</td></tr>
            <tr style={{ borderBottom: '1px solid #eee' }}><td style={{ fontWeight: 'bold', padding: '2px 4px 4px 4px', fontSize: '10px' }}>Total Equity</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 4px', fontSize: '10px' }}>{fmt((selectedSoc?.capital_social ?? 0) + (totalRevenue - totalExpenses))}</td></tr>

            <tr><td colSpan={2} style={{ fontWeight: 'bold', padding: '6px 4px 2px', fontSize: '10px', color: '#444' }}>Current Liabilities</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>Trade Payables</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.dettesFournisseurs ?? 0)}</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>VAT Payable</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.dettesFiscales ?? 0)}</td></tr>
            <tr><td style={{ padding: '2px 4px 2px 16px', fontSize: '10px' }}>CSG/NSF/PAYE Payable</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px' }}>{fmt(data?.dettesSociales ?? 0)}</td></tr>
            <tr style={{ borderBottom: '1px solid #eee' }}><td style={{ fontWeight: 'bold', padding: '2px 4px 4px 4px', fontSize: '10px' }}>Total Current Liabilities</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 4px', fontSize: '10px' }}>{fmt((data?.dettesFournisseurs ?? 0) + (data?.dettesFiscales ?? 0) + (data?.dettesSociales ?? 0))}</td></tr>

            <tr style={{ borderTop: '2px solid #0B0F2E', borderBottom: '2px solid #0B0F2E' }}><td style={{ fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>TOTAL EQUITY AND LIABILITIES</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>{fmt(totalLiabilitiesAndEquity)}</td></tr>
          </tbody>
        </table>

        {/* P&L Section */}
        <div style={{ borderBottom: '2px solid #0B0F2E', paddingBottom: '8px', marginBottom: '12px', marginTop: '30px' }}>
          <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#0B0F2E', textAlign: 'center' }}>STATEMENT OF PROFIT OR LOSS</p>
          <p style={{ fontSize: '11px', color: '#444', textAlign: 'center' }}>{periodLabel}</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0B0F2E' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: '10px' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '10px' }}>{exercice || "Current"} (MUR)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: '4px 4px 2px', fontSize: '10px' }}>Revenue</td><td style={{ textAlign: 'right', padding: '4px 4px', fontSize: '10px' }}>{fmt(totalRevenue)}</td></tr>
            <tr><td style={{ padding: '2px 4px 2px', fontSize: '10px' }}>Operating Expenses</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px', color: '#DC2626' }}>({fmt(totalExpenses)})</td></tr>
            <tr style={{ borderTop: '1px solid #ddd' }}><td style={{ fontWeight: 'bold', padding: '4px 4px', fontSize: '10px' }}>PROFIT BEFORE TAX</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '4px 4px', fontSize: '10px' }}>{totalRevenue - totalExpenses >= 0 ? fmt(totalRevenue - totalExpenses) : `(${fmt(Math.abs(totalRevenue - totalExpenses))})`}</td></tr>
            <tr><td style={{ padding: '2px 4px', fontSize: '10px' }}>Income Tax (15%)</td><td style={{ textAlign: 'right', padding: '2px 4px', fontSize: '10px', color: '#DC2626' }}>{totalRevenue - totalExpenses > 0 ? `(${fmt((totalRevenue - totalExpenses) * 0.15)})` : "0.00"}</td></tr>
            <tr style={{ borderTop: '2px solid #0B0F2E', borderBottom: '2px solid #0B0F2E' }}><td style={{ fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>PROFIT FOR THE YEAR</td><td style={{ textAlign: 'right', fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>{(() => { const pbt = totalRevenue - totalExpenses; const tax = pbt > 0 ? pbt * 0.15 : 0; const net = pbt - tax; return net >= 0 ? fmt(net) : `(${fmt(Math.abs(net))})` })()}</td></tr>
          </tbody>
        </table>

        {/* PDF Footer */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px', marginTop: '30px', fontSize: '9px', color: '#666' }}>
          <p style={{ marginBottom: '20px' }}>Approved by the Board of Directors on: ________________________________</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p>Director: ________________________________</p>
            <p>Date: ________________________________</p>
          </div>
          <p style={{ fontStyle: 'italic', marginBottom: '8px' }}>&quot;These financial statements were authorised for issue by the Board of Directors.&quot;</p>
          <p style={{ fontStyle: 'italic', marginBottom: '16px' }}>&quot;The notes to the financial statements form an integral part of these financial statements.&quot;</p>
          <p style={{ textAlign: 'center', color: '#999', fontSize: '8px' }}>Prepared by LEXORA Accounting Software — lexora.finance</p>
        </div>
      </div>

      {/* === P&L PDF TEMPLATE (separate from Balance Sheet) === */}
      <div id="pnl-pdf-content" style={{ display: 'none', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', fontSize: '11px', lineHeight: '1.5' }}>
        <div style={{ borderBottom: '2px solid #0B0F2E', paddingBottom: '12px', marginBottom: '20px' }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0B0F2E', marginBottom: '4px' }}>{selectedSoc?.nom || "SOCIÉTÉ"}</p>
          {selectedSoc?.brn && <p style={{ fontSize: '10px', color: '#666' }}>Business Registration Number: {selectedSoc.brn}</p>}
          {selectedSoc?.adresse && <p style={{ fontSize: '10px', color: '#666' }}>Registered Office: {selectedSoc.adresse}</p>}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#0B0F2E' }}>STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME</p>
            <p style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>{periodLabel}</p>
            <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>All amounts in Mauritian Rupees (MUR)</p>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0B0F2E' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: '10px', fontWeight: 'bold' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '10px', fontWeight: 'bold' }}>{exercice || "Current"} (MUR)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: '4px 4px', fontSize: '10px' }}>Revenue</td><td style={{ textAlign: 'right', fontSize: '10px' }}>{fmt(totalRevenue)}</td></tr>
            <tr><td style={{ padding: '2px 4px', fontSize: '10px' }}>Operating Expenses</td><td style={{ textAlign: 'right', fontSize: '10px', color: '#DC2626' }}>({fmt(totalExpenses)})</td></tr>
            <tr style={{ borderTop: '1px solid #ddd' }}><td style={{ fontWeight: 'bold', padding: '6px 4px', fontSize: '10px' }}>PROFIT BEFORE TAX</td><td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '10px' }}>{totalRevenue - totalExpenses >= 0 ? fmt(totalRevenue - totalExpenses) : `(${fmt(Math.abs(totalRevenue - totalExpenses))})`}</td></tr>
            <tr><td style={{ padding: '2px 4px', fontSize: '10px' }}>Income Tax (15%)</td><td style={{ textAlign: 'right', fontSize: '10px', color: '#DC2626' }}>{totalRevenue - totalExpenses > 0 ? `(${fmt((totalRevenue - totalExpenses) * 0.15)})` : "0.00"}</td></tr>
            <tr style={{ borderTop: '2px solid #0B0F2E', borderBottom: '2px solid #0B0F2E' }}><td style={{ fontWeight: 'bold', padding: '6px 4px', fontSize: '11px' }}>PROFIT FOR THE YEAR</td><td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '11px' }}>{(() => { const pbt = totalRevenue - totalExpenses; const tax = pbt > 0 ? pbt * 0.15 : 0; const net = pbt - tax; return net >= 0 ? fmt(net) : `(${fmt(Math.abs(net))})` })()}</td></tr>
          </tbody>
        </table>
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px', marginTop: '30px', fontSize: '9px', color: '#666' }}>
          <p style={{ marginBottom: '20px' }}>Approved by the Board of Directors on: ________________________________</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p>Director: ________________________________</p>
            <p>Date: ________________________________</p>
          </div>
          <p style={{ textAlign: 'center', color: '#999', fontSize: '8px' }}>Prepared by LEXORA Accounting Software — lexora.finance</p>
        </div>
      </div>
    </div>
    </ClientPageShell>
  )
}
