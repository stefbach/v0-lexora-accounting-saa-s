"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Loader2, Building2, Printer } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtColor(n: number) {
  if (n < 0) return { color: "#DC2626" }
  return {}
}

function fmtVal(n: number): string {
  if (n < 0) return `(${fmt(Math.abs(n))})`
  return fmt(n)
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
          Acces non autorise
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: GOLD }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  // ---- Data extraction ----
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
  const tresorerie = data?.totalBankMUR ?? 0

  const totalCurrentAssets = tresorerie + creancesClients + autresCreances + stocks
  const totalNonCurrentAssets = immobilisations
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  const capitauxPropres = data?.capitauxPropres ?? 0
  const emprunts = data?.emprunts ?? 0
  const dettesFournisseurs = data?.dettesFournisseurs ?? 0
  const dettesFiscales = data?.dettesFiscales ?? 0
  const dettesSociales = data?.dettesSociales ?? 0

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

  const selectedSocieteName = selectedSociete !== "all"
    ? societes.find(s => s.id === selectedSociete)?.nom ?? "Societe"
    : societes.length === 1
      ? societes[0].nom
      : "Consolide"

  const currentDate = new Date()
  const formattedDate = currentDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Mon Bilan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bilan &amp; Compte de Resultat — Exercice en cours
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
                  <SelectItem value="all">Toutes les societes</SelectItem>
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
            Imprimer
          </button>
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16">
            <p className="text-sm text-muted-foreground">
              Aucune ecriture comptable disponible pour le moment.
            </p>
            <p className="text-xs text-muted-foreground">
              Les donnees apparaitront ici une fois vos factures traitees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ================================================================ */}
          {/*  PART 1: BALANCE SHEET (BILAN)                                   */}
          {/* ================================================================ */}
          <Card className="overflow-hidden">
            <CardHeader className="text-center py-5" style={{ backgroundColor: NAVY }}>
              <CardTitle className="text-lg font-bold text-white tracking-wide">
                {selectedSocieteName.toUpperCase()}
              </CardTitle>
              <p className="text-base font-semibold mt-1" style={{ color: GOLD }}>
                BILAN
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Au {formattedDate}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {/* Two-column layout: ACTIF | PASSIF & CAPITAUX PROPRES */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-x">
                {/* LEFT: ACTIF */}
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ backgroundColor: NAVY }}>
                        <TableHead className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>ACTIF</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>MUR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Section: Actif circulant */}
                      <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                        <TableCell colSpan={2} className="text-sm font-bold" style={{ color: NAVY }}>Actif circulant</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Tresorerie et equivalents</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(tresorerie)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Creances clients (411)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(creancesClients)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Autres creances (46, 47)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(autresCreances)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Stocks (classe 3)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(stocks)} MUR</TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50">
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Actif Circulant</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalCurrentAssets)} MUR</TableCell>
                      </TableRow>

                      {/* Section: Actif immobilise */}
                      <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                        <TableCell colSpan={2} className="text-sm font-bold" style={{ color: NAVY }}>Actif immobilise</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Immobilisations (classe 2)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(immobilisations)} MUR</TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50">
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Actif Immobilise</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalNonCurrentAssets)} MUR</TableCell>
                      </TableRow>

                      {/* TOTAL ACTIF */}
                      <TableRow style={{ backgroundColor: NAVY }}>
                        <TableCell className="text-sm font-bold text-white">TOTAL ACTIF</TableCell>
                        <TableCell className="text-right text-sm font-bold text-white font-mono tabular-nums">{fmt(totalAssets)} MUR</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* RIGHT: PASSIF & CAPITAUX PROPRES */}
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ backgroundColor: NAVY }}>
                        <TableHead className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>PASSIF &amp; CAPITAUX PROPRES</TableHead>
                        <TableHead className="text-right text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>MUR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Section: Dettes a court terme */}
                      <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                        <TableCell colSpan={2} className="text-sm font-bold" style={{ color: NAVY }}>Dettes a court terme</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Fournisseurs (401)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(dettesFournisseurs)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Dettes fiscales (44)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(dettesFiscales)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Dettes sociales (43)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(dettesSociales)} MUR</TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50">
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Dettes Court Terme</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalCurrentLiabilities)} MUR</TableCell>
                      </TableRow>

                      {/* Section: Dettes a long terme */}
                      <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                        <TableCell colSpan={2} className="text-sm font-bold" style={{ color: NAVY }}>Dettes a long terme</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Emprunts (16)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(emprunts)} MUR</TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50">
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Dettes Long Terme</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalLongTermLiabilities)} MUR</TableCell>
                      </TableRow>

                      <TableRow className="bg-gray-50" style={{ borderTop: `2px solid ${GOLD}` }}>
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Dettes</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalLiabilities)} MUR</TableCell>
                      </TableRow>

                      {/* Section: Capitaux propres */}
                      <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                        <TableCell colSpan={2} className="text-sm font-bold" style={{ color: NAVY }}>Capitaux propres</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Capital (classe 1)</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(capitauxPropres)} MUR</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8 text-sm text-muted-foreground">Resultat de l&apos;exercice</TableCell>
                        <TableCell className="text-right text-sm font-mono tabular-nums" style={fmtColor(retainedEarnings)}>{fmtVal(retainedEarnings)} MUR</TableCell>
                      </TableRow>
                      <TableRow className="bg-gray-50">
                        <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Total Capitaux Propres</TableCell>
                        <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalEquity)} MUR</TableCell>
                      </TableRow>

                      {/* TOTAL PASSIF & CAPITAUX PROPRES */}
                      <TableRow style={{ backgroundColor: GOLD }}>
                        <TableCell className="text-sm font-bold text-white">TOTAL PASSIF &amp; CAPITAUX PROPRES</TableCell>
                        <TableCell className="text-right text-sm font-bold text-white font-mono tabular-nums">{fmt(totalLiabilitiesAndEquity)} MUR</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Balance check warning */}
              {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01 && (
                <div className="m-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="text-sm text-orange-700 font-medium">
                    Note : Ecart entre Actif et Passif de {fmt(Math.abs(totalAssets - totalLiabilitiesAndEquity))} MUR
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    Cela peut etre du a des resultats non encore affectes ou des ecarts temporels dans les ecritures.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ================================================================ */}
          {/*  PART 2: PROFIT & LOSS (COMPTE DE RESULTAT)                      */}
          {/* ================================================================ */}
          <Card className="overflow-hidden">
            <CardHeader className="text-center py-5" style={{ backgroundColor: NAVY }}>
              <CardTitle className="text-lg font-bold text-white tracking-wide">
                {selectedSocieteName.toUpperCase()}
              </CardTitle>
              <p className="text-base font-semibold mt-1" style={{ color: GOLD }}>
                COMPTE DE RESULTAT
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Exercice au {formattedDate}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow style={{ backgroundColor: "#F4F6FA" }}>
                    <TableHead className="w-2/3" style={{ color: NAVY }}>&nbsp;</TableHead>
                    <TableHead className="text-right" style={{ color: NAVY }}>Periode courante (MUR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* PRODUITS D'EXPLOITATION */}
                  <TableRow style={{ backgroundColor: NAVY }}>
                    <TableCell colSpan={2} className="text-sm font-bold text-white">PRODUITS D&apos;EXPLOITATION</TableCell>
                  </TableRow>
                  {revenueDetails.map(([prefix, amount]) => (
                    <TableRow key={prefix}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">
                        {REVENUE_LABELS[prefix] || `Compte ${prefix}x`}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono tabular-nums">{fmt(amount)} MUR</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50" style={{ borderTop: `2px solid ${NAVY}` }}>
                    <TableCell className="text-sm font-bold" style={{ color: NAVY }}>Total produits d&apos;exploitation</TableCell>
                    <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: NAVY }}>{fmt(totalRevenue)} MUR</TableCell>
                  </TableRow>

                  {/* CHARGES D'EXPLOITATION */}
                  <TableRow style={{ backgroundColor: NAVY }}>
                    <TableCell colSpan={2} className="text-sm font-bold text-white">CHARGES D&apos;EXPLOITATION</TableCell>
                  </TableRow>
                  {operatingExpenseGroups.map((group) => (
                    <TableRow key={group.label}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">
                        {group.label} ({group.range})
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono tabular-nums" style={{ color: "#DC2626" }}>
                        ({fmt(group.amount)}) MUR
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50" style={{ borderTop: `2px solid ${NAVY}` }}>
                    <TableCell className="text-sm font-bold" style={{ color: NAVY }}>Total charges d&apos;exploitation</TableCell>
                    <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={{ color: "#DC2626" }}>
                      ({fmt(totalOperatingExpenses)}) MUR
                    </TableCell>
                  </TableRow>

                  {/* RESULTAT D'EXPLOITATION */}
                  <TableRow style={{ backgroundColor: GOLD }}>
                    <TableCell className="text-sm font-bold text-white">RESULTAT D&apos;EXPLOITATION</TableCell>
                    <TableCell className="text-right text-sm font-bold text-white font-mono tabular-nums">
                      {fmtVal(operatingIncome)} MUR
                    </TableCell>
                  </TableRow>

                  {/* CHARGES FINANCIERES */}
                  <TableRow>
                    <TableCell className="text-sm text-muted-foreground">
                      Charges financieres (661-669)
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono tabular-nums" style={financialChargesAmount > 0 ? { color: "#DC2626" } : {}}>
                      {financialChargesAmount > 0 ? `(${fmt(financialChargesAmount)})` : fmt(0)} MUR
                    </TableCell>
                  </TableRow>

                  {/* RESULTAT AVANT IMPOTS */}
                  <TableRow className="bg-gray-50" style={{ borderTop: `2px solid ${NAVY}` }}>
                    <TableCell className="text-sm font-semibold" style={{ color: NAVY }}>Resultat avant impots</TableCell>
                    <TableCell className="text-right text-sm font-bold font-mono tabular-nums" style={fmtColor(incomeBeforeTax)}>
                      {fmtVal(incomeBeforeTax)} MUR
                    </TableCell>
                  </TableRow>

                  {/* RESULTAT NET */}
                  <TableRow style={{ backgroundColor: NAVY }}>
                    <TableCell className="py-4 text-sm font-bold text-white">RESULTAT NET</TableCell>
                    <TableCell className="py-4 text-right text-sm font-bold font-mono tabular-nums" style={{ color: resultatNet >= 0 ? "#4ADE80" : "#FCA5A5" }}>
                      {fmtVal(resultatNet)} MUR
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center py-4 print:py-2">
            <p className="text-xs text-muted-foreground italic">
              Etabli a partir des ecritures comptables — {formattedDate}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tous les montants sont en Roupies Mauriciennes (MUR)
            </p>
          </div>
        </>
      )}
    </div>
  )
}
