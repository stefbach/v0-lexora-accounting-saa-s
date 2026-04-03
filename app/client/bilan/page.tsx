"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Loader2, Building2, Printer, Calendar, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

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
  { label: "Charges de personnel", range: "641-649", match: (p) => { const n = parseInt(p); return n >= 641 && n <= 649 } },
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
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [prevData, setPrevData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])
  const [exercice, setExercice] = useState<string>("")
  const [prevExercice, setPrevExercice] = useState<string>("")
  const [availableExercices, setAvailableExercices] = useState<string[]>([])

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
      if (selectedSociete && selectedSociete !== "all") formData.append("societe_id", selectedSociete)
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
    setFetching(true)
    const params = new URLSearchParams()
    if (selectedSociete && selectedSociete !== "all") params.set("societe_id", selectedSociete)
    if (exercice) params.set("exercice", exercice)
    const url = `/api/client/financial${params.toString() ? "?" + params.toString() : ""}`

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json.financial)
        if (json.financial?.availableSocietes) {
          setSocietes(json.financial.availableSocietes)
          if (json.financial.availableSocietes.length > 0 && !selectedSociete) setSelectedSociete(json.financial.availableSocietes[0].id)
        }
        const currentEx = json.financial?.exercice_actuel || ""
        const prevEx = json.financial?.exercice_precedent || ""
        if (!exercice && currentEx) setExercice(currentEx)
        setPrevExercice(prevEx)
        if (json.financial?.available_exercices) setAvailableExercices(json.financial.available_exercices)

        // Fetch previous year data
        if (prevEx) {
          const prevParams = new URLSearchParams()
          if (selectedSociete && selectedSociete !== "all") prevParams.set("societe_id", selectedSociete)
          prevParams.set("exercice", prevEx)
          fetch(`/api/client/financial?${prevParams.toString()}`)
            .then(r => r.json())
            .then(pJson => setPrevData(pJson.financial))
            .catch(() => setPrevData(null))
            .finally(() => setFetching(false))
        } else {
          setPrevData(null)
          setFetching(false)
        }
      })
      .catch(() => { setData(null); setPrevData(null); setFetching(false) })
  }, [selectedSociete, exercice])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold">Acces non autorise</h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline text-blue-600">
          Retour aux documents
        </Link>
      </div>
    )
  }

  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const totalAssets = (data?.totalBankMUR ?? 0) + (data?.creances ?? 0) + (data?.immobilisations ?? 0)
  const totalLiabilitiesAndEquity = (data?.capitauxPropres ?? 0) + (totalRevenue - totalExpenses) + (data?.dettesFournisseurs ?? 0) + (data?.dettesFiscales ?? 0) + (data?.dettesSociales ?? 0)
  const hasData = totalRevenue !== 0 || totalExpenses !== 0 || totalAssets !== 0 || totalLiabilitiesAndEquity !== 0

  const selectedSocieteName = selectedSociete && selectedSociete !== "all"
    ? societes.find(s => s.id === selectedSociete)?.nom ?? "Societe"
    : societes.length === 1
      ? societes[0].nom
      : "Consolide"

  return (
    <div className="p-6 space-y-6 max-w-[900px] mx-auto">
      {/* Top bar: filter + print */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div className="flex items-center gap-3">
          {societes.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  {societes.length > 1 && <SelectItem value="all">Toutes les societes</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          {availableExercices.length > 0 && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={exercice} onValueChange={setExercice}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Exercice" />
                </SelectTrigger>
                <SelectContent>
                  {availableExercices.map(ex => (
                    <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium border hover:bg-muted transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* PDF Import for prior year data */}
      <Card className="border-2 border-dashed print:hidden" style={{ borderColor: GOLD }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>Importer les comptes de l&apos;exercice precedent</p>
                <p className="text-xs text-gray-500">
                  Uploadez le bilan officiel (PDF) de l&apos;annee precedente pour pre-remplir la colonne N-1
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
                {importingPdf ? "Analyse en cours..." : "Analyser avec OCR"}
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
            Aucune ecriture comptable disponible pour le moment.
          </p>
          <p className="text-xs text-muted-foreground">
            Les donnees apparaitront ici une fois vos factures traitees.
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

          {/* Tabs: Balance Sheet | Profit & Loss */}
          <Tabs defaultValue="balance-sheet" className="space-y-4">
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

          {/* Footer */}
          <div className="text-center py-4 print:py-2">
            <p className="text-xs text-muted-foreground italic">
              All amounts are in Mauritian Rupees (MUR)
            </p>
          </div>
        </>
      )}
    </div>
  )
}
