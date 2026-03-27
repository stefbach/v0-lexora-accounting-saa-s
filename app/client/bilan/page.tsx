"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Loader2, Building2, Printer } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"
const LIGHT_NAVY = "#F4F6FA"
const BORDER_COLOR = "#D5D9E2"

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Revenue account labels
const REVENUE_LABELS: Record<string, string> = {
  "706": "Prestations de services (706)",
  "707": "Ventes de marchandises (707)",
  "701": "Ventes de produits finis (701)",
  "702": "Ventes de produits intermédiaires (702)",
  "703": "Ventes de produits résiduels (703)",
  "704": "Travaux (704)",
  "705": "Études (705)",
  "708": "Produits des activités annexes (708)",
  "709": "RRR accordés (709)",
  "711": "Variation des stocks (711)",
  "713": "Variation en-cours de production (713)",
  "721": "Production immobilisée (721)",
  "741": "Subventions d\u2019exploitation (741)",
  "751": "Produits de gestion courante (751)",
  "753": "Commissions (753)",
  "758": "Produits divers de gestion courante (758)",
  "761": "Produits financiers (761)",
  "771": "Produits exceptionnels (771)",
}

const EXPENSE_GROUPS: { label: string; range: string; match: (p: string) => boolean }[] = [
  { label: "Achats", range: "601-609", match: (p) => { const n = parseInt(p); return n >= 601 && n <= 609 } },
  { label: "Services extérieurs", range: "611-619", match: (p) => { const n = parseInt(p); return n >= 611 && n <= 619 } },
  { label: "Autres services extérieurs", range: "621-629", match: (p) => { const n = parseInt(p); return n >= 621 && n <= 629 } },
  { label: "Impôts et taxes", range: "631-639", match: (p) => { const n = parseInt(p); return n >= 631 && n <= 639 } },
  { label: "Charges de personnel", range: "641-649", match: (p) => { const n = parseInt(p); return n >= 641 && n <= 649 } },
  { label: "Autres charges de gestion", range: "651-659", match: (p) => { const n = parseInt(p); return n >= 651 && n <= 659 } },
  { label: "Charges financières", range: "661-669", match: (p) => { const n = parseInt(p); return n >= 661 && n <= 669 } },
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

/* ─── Reusable table cell styles ─── */
const cellLeft = "py-2 px-3 text-left text-sm"
const cellRight = "py-2 px-3 text-right text-sm font-mono tabular-nums"
const cellLeftIndent = "py-2 px-3 pl-8 text-left text-sm"
const headerCell = "py-3 px-3 text-left text-xs font-bold uppercase tracking-wider"
const headerCellRight = "py-3 px-3 text-right text-xs font-bold uppercase tracking-wider"

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr style={{ backgroundColor: LIGHT_NAVY }}>
      <td colSpan={2} className="py-2 px-3 text-sm font-bold" style={{ color: NAVY }}>
        {children}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, amount, borderTop }: { label: string; amount: number; borderTop?: boolean }) {
  return (
    <tr style={borderTop ? { borderTop: `2px solid ${NAVY}` } : undefined}>
      <td className={`${cellLeft} font-semibold`} style={{ color: NAVY }}>{label}</td>
      <td className={`${cellRight} font-bold`} style={{ color: NAVY }}>{fmt(amount)} MUR</td>
    </tr>
  )
}

function GrandTotalRow({ label, amount, bgColor }: { label: string; amount: number; bgColor: string }) {
  return (
    <tr style={{ backgroundColor: bgColor }}>
      <td className="py-3 px-3 text-sm font-bold text-white">{label}</td>
      <td className="py-3 px-3 text-right text-sm font-bold text-white font-mono tabular-nums">{fmt(amount)} MUR</td>
    </tr>
  )
}

function LineItem({ label, amount, indent }: { label: string; amount: number; indent?: boolean }) {
  return (
    <tr className="border-b" style={{ borderColor: BORDER_COLOR }}>
      <td className={indent ? cellLeftIndent : cellLeft} style={{ color: "#4A5568" }}>{label}</td>
      <td className={cellRight}>{fmt(amount)} MUR</td>
    </tr>
  )
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={2} className="py-1" />
    </tr>
  )
}

export default function BilanPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [selectedSociete, setSelectedSociete] = useState<string>("all")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])

  useEffect(() => {
    setFetching(true)
    const url = selectedSociete !== "all"
      ? `/api/client/financial?societe_id=${selectedSociete}`
      : "/api/client/financial"
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json.financial)
        if (json.financial?.availableSocietes) setSocietes(json.financial.availableSocietes)
      })
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [selectedSociete])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: GOLD }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  // ──── Data extraction ────
  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const resultatNet = totalRevenue - totalExpenses
  const revenueByAccount: Record<string, number> = data?.revenueByAccount ?? {}
  const expensesByAccount: Record<string, number> = data?.expensesByAccount ?? {}

  // Balance sheet items
  const immobilisations = data?.immobilisations ?? 0
  const stocks = data?.stocks ?? 0
  const creancesClients = data?.creances ?? 0
  const autresCreances = data?.autresCreances ?? 0
  const tvaDeductible = data?.tvaDeductible ?? 0
  const tresorerie = data?.totalBankMUR ?? 0

  const totalCurrentAssets = tresorerie + creancesClients + autresCreances + stocks
  const totalNonCurrentAssets = immobilisations
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  const capitauxPropres = data?.capitauxPropres ?? 0
  const emprunts = data?.emprunts ?? 0
  const dettesFournisseurs = data?.dettesFournisseurs ?? 0
  const dettesFiscales = data?.dettesFiscales ?? 0
  const dettesSociales = data?.dettesSociales ?? 0
  const tvaCollectee = data?.tvaCollectee ?? 0
  const chargesSociales = data?.chargesSociales ?? 0
  const salaires = data?.salaires ?? 0

  const totalCurrentLiabilities = dettesFournisseurs + dettesFiscales + dettesSociales
  const totalLongTermLiabilities = emprunts
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities

  const retainedEarnings = resultatNet
  const totalEquity = capitauxPropres + retainedEarnings
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  // P&L details
  const revenueDetails = Object.entries(revenueByAccount)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const allExpenseGroups = groupExpenses(expensesByAccount)
  const operatingExpenseGroups = allExpenseGroups.filter(g => g.range !== "661-669")
  const financialCharges = allExpenseGroups.find(g => g.range === "661-669")
  const totalOperatingExpenses = operatingExpenseGroups.reduce((s, g) => s + g.amount, 0)
  const operatingIncome = totalRevenue - totalOperatingExpenses
  const financialChargesAmount = financialCharges?.amount ?? 0
  const incomeBeforeTax = operatingIncome - financialChargesAmount

  const hasData = totalRevenue !== 0 || totalExpenses !== 0 || totalAssets !== 0 || totalLiabilitiesAndEquity !== 0

  // Company name from selected société
  const selectedSocieteName = selectedSociete !== "all"
    ? societes.find(s => s.id === selectedSociete)?.nom ?? "Société"
    : societes.length === 1
      ? societes[0].nom
      : "Consolidated"

  const currentDate = new Date()
  const formattedDate = currentDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const currentPeriod = currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  return (
    <div className="p-6 space-y-8 max-w-[1200px] mx-auto">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Financial Statements
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bilan &amp; Compte de R&eacute;sultat &mdash; Exercice en cours
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les soci&eacute;t&eacute;s</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium border hover:opacity-80 transition-opacity print:hidden"
            style={{ borderColor: NAVY, color: NAVY }}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-lg border p-12 text-center" style={{ borderColor: BORDER_COLOR }}>
          <p className="text-sm text-muted-foreground">
            Aucune &eacute;criture comptable disponible pour le moment.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Les donn&eacute;es appara&icirc;tront ici une fois vos factures trait&eacute;es.
          </p>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════ */}
          {/*  PART 1: BALANCE SHEET (BILAN)                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: BORDER_COLOR }}>
            {/* Statement Title Block */}
            <div className="text-center py-5" style={{ backgroundColor: NAVY }}>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {selectedSocieteName.toUpperCase()}
              </h2>
              <h3 className="text-base font-semibold mt-1" style={{ color: GOLD }}>
                BALANCE SHEET
              </h3>
              <p className="text-xs text-gray-300 mt-1">
                As of {formattedDate}
              </p>
            </div>

            {/* Two-column layout: Assets | Liabilities & Equity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-x" style={{ borderColor: BORDER_COLOR }}>
              {/* ─── LEFT: ASSETS ─── */}
              <div>
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: NAVY }}>
                      <th className={headerCell} style={{ color: GOLD }}>ASSETS</th>
                      <th className={headerCellRight} style={{ color: GOLD }}>MUR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <EmptyRow />
                    <SectionHeader>Current Assets</SectionHeader>
                    <LineItem label="Cash and cash equivalents" amount={tresorerie} indent />
                    <LineItem label="Accounts receivable (411)" amount={creancesClients} indent />
                    <LineItem label="Other receivables (46, 47)" amount={autresCreances} indent />
                    <LineItem label="Inventory (classe 3)" amount={stocks} indent />
                    <EmptyRow />
                    <SubtotalRow label="Total Current Assets" amount={totalCurrentAssets} borderTop />

                    <EmptyRow />
                    <SectionHeader>Non-current Assets</SectionHeader>
                    <LineItem label="Fixed assets / Immobilisations (classe 2)" amount={immobilisations} indent />
                    <EmptyRow />
                    <SubtotalRow label="Total Non-current Assets" amount={totalNonCurrentAssets} borderTop />

                    <EmptyRow />
                    <GrandTotalRow label="TOTAL ASSETS" amount={totalAssets} bgColor={NAVY} />
                  </tbody>
                </table>
              </div>

              {/* ─── RIGHT: LIABILITIES & EQUITY ─── */}
              <div>
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: NAVY }}>
                      <th className={headerCell} style={{ color: GOLD }}>LIABILITIES &amp; EQUITY</th>
                      <th className={headerCellRight} style={{ color: GOLD }}>MUR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <EmptyRow />
                    <SectionHeader>Current Liabilities</SectionHeader>
                    <LineItem label="Accounts payable (401)" amount={dettesFournisseurs} indent />
                    <LineItem label="TVA payable (44)" amount={dettesFiscales} indent />
                    <LineItem label="Social charges payable (43)" amount={dettesSociales} indent />
                    <EmptyRow />
                    <SubtotalRow label="Total Current Liabilities" amount={totalCurrentLiabilities} borderTop />

                    <EmptyRow />
                    <SectionHeader>Long-term Liabilities</SectionHeader>
                    <LineItem label="Loans / Emprunts (16)" amount={emprunts} indent />
                    <EmptyRow />
                    <SubtotalRow label="Total Long-term Liabilities" amount={totalLongTermLiabilities} borderTop />

                    <EmptyRow />
                    <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                      <td className={`${cellLeft} font-semibold`} style={{ color: NAVY }}>Total Liabilities</td>
                      <td className={`${cellRight} font-bold`} style={{ color: NAVY }}>{fmt(totalLiabilities)} MUR</td>
                    </tr>

                    <EmptyRow />
                    <SectionHeader>Stockholders&apos; Equity</SectionHeader>
                    <LineItem label="Capital (classe 1)" amount={capitauxPropres} indent />
                    <LineItem label="Retained earnings (résultat)" amount={retainedEarnings} indent />
                    <EmptyRow />
                    <SubtotalRow label="Total Stockholders' Equity" amount={totalEquity} borderTop />

                    <EmptyRow />
                    <GrandTotalRow label="TOTAL LIABILITIES & EQUITY" amount={totalLiabilitiesAndEquity} bgColor={GOLD} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance check warning */}
            {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01 && (
              <div className="m-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <p className="text-sm text-orange-700 font-medium">
                  Note: Variance between Assets and Liabilities &amp; Equity of {fmt(Math.abs(totalAssets - totalLiabilitiesAndEquity))} MUR
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  This may be due to retained earnings not yet allocated or timing differences in entries.
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/*  PART 2: PROFIT & LOSS (COMPTE DE RÉSULTAT)                    */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: BORDER_COLOR }}>
            {/* Statement Title Block */}
            <div className="text-center py-5" style={{ backgroundColor: NAVY }}>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {selectedSocieteName.toUpperCase()}
              </h2>
              <h3 className="text-base font-semibold mt-1" style={{ color: GOLD }}>
                CONSOLIDATED STATEMENT OF OPERATIONS
              </h3>
              <p className="text-xs text-gray-300 mt-1">
                Period ended {currentPeriod}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: LIGHT_NAVY, borderBottom: `2px solid ${NAVY}` }}>
                    <th className={`${headerCell} w-2/3`} style={{ color: NAVY }}>&nbsp;</th>
                    <th className={headerCellRight} style={{ color: NAVY }}>Current Period (MUR)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ─── REVENUE ─── */}
                  <EmptyRow />
                  <SectionHeader>Revenue</SectionHeader>
                  {revenueDetails.map(([prefix, amount]) => (
                    <LineItem
                      key={prefix}
                      label={REVENUE_LABELS[prefix] || `Account ${prefix}x`}
                      amount={amount}
                      indent
                    />
                  ))}
                  <EmptyRow />
                  <tr style={{ borderTop: `2px solid ${NAVY}`, borderBottom: `2px solid ${NAVY}` }}>
                    <td className={`${cellLeft} font-bold`} style={{ color: NAVY }}>Total net sales</td>
                    <td className={`${cellRight} font-bold`} style={{ color: NAVY }}>{fmt(totalRevenue)} MUR</td>
                  </tr>

                  {/* ─── OPERATING EXPENSES ─── */}
                  <EmptyRow />
                  <SectionHeader>Operating expenses</SectionHeader>
                  {operatingExpenseGroups.map((group) => (
                    <tr key={group.label} className="border-b" style={{ borderColor: BORDER_COLOR }}>
                      <td className={cellLeftIndent} style={{ color: "#4A5568" }}>
                        {group.label} ({group.range})
                      </td>
                      <td className={cellRight} style={{ color: "#C53030" }}>
                        ({fmt(group.amount)}) MUR
                      </td>
                    </tr>
                  ))}
                  <EmptyRow />
                  <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                    <td className={`${cellLeft} font-bold`} style={{ color: NAVY }}>Total operating expenses</td>
                    <td className={`${cellRight} font-bold`} style={{ color: "#C53030" }}>
                      ({fmt(totalOperatingExpenses)}) MUR
                    </td>
                  </tr>

                  {/* ─── OPERATING INCOME ─── */}
                  <EmptyRow />
                  <tr style={{ backgroundColor: LIGHT_NAVY, borderTop: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}` }}>
                    <td className={`${cellLeft} font-bold text-base`} style={{ color: NAVY }}>Operating income</td>
                    <td className={`${cellRight} font-bold text-base`} style={{ color: operatingIncome >= 0 ? NAVY : "#C53030" }}>
                      {operatingIncome < 0 ? `(${fmt(Math.abs(operatingIncome))})` : fmt(operatingIncome)} MUR
                    </td>
                  </tr>

                  {/* ─── FINANCIAL CHARGES ─── */}
                  <EmptyRow />
                  {financialChargesAmount !== 0 && (
                    <tr className="border-b" style={{ borderColor: BORDER_COLOR }}>
                      <td className={cellLeft} style={{ color: "#4A5568" }}>
                        Interest / financial charges (661-669)
                      </td>
                      <td className={cellRight} style={{ color: "#C53030" }}>
                        ({fmt(financialChargesAmount)}) MUR
                      </td>
                    </tr>
                  )}
                  {financialChargesAmount === 0 && (
                    <tr className="border-b" style={{ borderColor: BORDER_COLOR }}>
                      <td className={cellLeft} style={{ color: "#4A5568" }}>
                        Interest / financial charges (661-669)
                      </td>
                      <td className={cellRight} style={{ color: "#4A5568" }}>
                        {fmt(0)} MUR
                      </td>
                    </tr>
                  )}

                  {/* ─── INCOME BEFORE TAX ─── */}
                  <EmptyRow />
                  <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                    <td className={`${cellLeft} font-semibold`} style={{ color: NAVY }}>Income before taxes</td>
                    <td className={`${cellRight} font-bold`} style={{ color: incomeBeforeTax >= 0 ? NAVY : "#C53030" }}>
                      {incomeBeforeTax < 0 ? `(${fmt(Math.abs(incomeBeforeTax))})` : fmt(incomeBeforeTax)} MUR
                    </td>
                  </tr>

                  {/* ─── NET INCOME ─── */}
                  <EmptyRow />
                  <tr style={{ backgroundColor: NAVY }}>
                    <td className="py-4 px-3 text-sm font-bold text-white">NET INCOME (RÉSULTAT NET)</td>
                    <td className="py-4 px-3 text-right text-sm font-bold font-mono tabular-nums" style={{ color: resultatNet >= 0 ? "#48BB78" : "#FC8181" }}>
                      {resultatNet < 0 ? `(${fmt(Math.abs(resultatNet))})` : fmt(resultatNet)} MUR
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Footer ─── */}
          <div className="text-center py-4 print:py-2">
            <p className="text-xs text-muted-foreground italic">
              Prepared from accounting entries &mdash; {formattedDate}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              All amounts in Mauritian Rupees (MUR)
            </p>
          </div>
        </>
      )}
    </div>
  )
}
