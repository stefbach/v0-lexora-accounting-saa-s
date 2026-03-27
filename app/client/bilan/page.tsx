"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

// Map 3-digit account prefixes to labels
const REVENUE_LABELS: Record<string, string> = {
  "706": "Prestations de services",
  "707": "Ventes de marchandises",
  "701": "Ventes de produits finis",
  "702": "Ventes de produits interm\u00e9diaires",
  "703": "Ventes de produits r\u00e9siduels",
  "704": "Travaux",
  "705": "\u00c9tudes",
  "708": "Produits des activit\u00e9s annexes",
  "709": "Rabais, remises et ristournes accord\u00e9s",
  "711": "Variation des stocks",
  "713": "Variation des en-cours de production",
  "721": "Production immobilis\u00e9e",
  "741": "Subventions d\u2019exploitation",
  "751": "Produits de gestion courante",
  "758": "Produits divers de gestion courante",
  "761": "Produits financiers",
  "771": "Produits exceptionnels",
}

const EXPENSE_GROUPS: { label: string; match: (prefix: string) => boolean }[] = [
  { label: "Achats (601-609)", match: (p) => { const n = parseInt(p); return n >= 601 && n <= 609 } },
  { label: "Services ext\u00e9rieurs (611-619)", match: (p) => { const n = parseInt(p); return n >= 611 && n <= 619 } },
  { label: "Autres services ext\u00e9rieurs (621-629)", match: (p) => { const n = parseInt(p); return n >= 621 && n <= 629 } },
  { label: "Imp\u00f4ts et taxes (631-639)", match: (p) => { const n = parseInt(p); return n >= 631 && n <= 639 } },
  { label: "Charges de personnel (641-649)", match: (p) => { const n = parseInt(p); return n >= 641 && n <= 649 } },
  { label: "Autres charges (651-659)", match: (p) => { const n = parseInt(p); return n >= 651 && n <= 659 } },
  { label: "Charges financi\u00e8res (661-669)", match: (p) => { const n = parseInt(p); return n >= 661 && n <= 669 } },
]

function groupExpenses(expensesByAccount: Record<string, number>) {
  const groups: { label: string; amount: number; details: { prefix: string; amount: number }[] }[] = []
  const assigned = new Set<string>()

  for (const group of EXPENSE_GROUPS) {
    const details: { prefix: string; amount: number }[] = []
    let total = 0
    for (const [prefix, amount] of Object.entries(expensesByAccount)) {
      if (group.match(prefix)) {
        details.push({ prefix, amount })
        total += amount
        assigned.add(prefix)
      }
    }
    if (total !== 0) {
      groups.push({ label: group.label, amount: total, details: details.sort((a, b) => a.prefix.localeCompare(b.prefix)) })
    }
  }

  // Catch-all for other class 6 accounts
  const otherDetails: { prefix: string; amount: number }[] = []
  let otherTotal = 0
  for (const [prefix, amount] of Object.entries(expensesByAccount)) {
    if (!assigned.has(prefix)) {
      otherDetails.push({ prefix, amount })
      otherTotal += amount
    }
  }
  if (otherTotal !== 0) {
    groups.push({ label: "Autres charges de classe 6", amount: otherTotal, details: otherDetails })
  }

  return groups
}

export default function BilanPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch("/api/client/financial")
      .then((res) => res.json())
      .then((json) => setData(json.financial))
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [])

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

  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const resultatExploitation = totalRevenue - totalExpenses
  const resultatNet = resultatExploitation

  const revenueByAccount: Record<string, number> = data?.revenueByAccount ?? {}
  const expensesByAccount: Record<string, number> = data?.expensesByAccount ?? {}

  // Build revenue details sorted by prefix
  const revenueDetails = Object.entries(revenueByAccount)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))

  // Build expense groups
  const expenseGroups = groupExpenses(expensesByAccount)

  const hasData = totalRevenue !== 0 || totalExpenses !== 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
          Compte de R&eacute;sultat (P&amp;L)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Synth&egrave;se Produits &amp; Charges de l&apos;exercice en cours
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: "#22C55E" }} />
              Total Produits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "#22C55E" }}>
              {formatMUR(totalRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" style={{ color: "#EF4444" }} />
              Total Charges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "#EF4444" }}>
              {formatMUR(totalExpenses)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" style={{ color: GOLD }} />
              R&eacute;sultat Net
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: resultatNet >= 0 ? "#22C55E" : "#EF4444" }}>
              {formatMUR(resultatNet)}
            </p>
          </CardContent>
        </Card>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucune &eacute;criture comptable disponible pour le moment.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Les donn&eacute;es appara&icirc;tront ici une fois vos factures trait&eacute;es.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* P&L Detail Table */}
          <Card>
            <CardHeader>
              <CardTitle style={{ color: NAVY }}>D&eacute;tail du Compte de R&eacute;sultat</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2" style={{ borderColor: NAVY }}>
                    <th className="text-left py-2 font-semibold" style={{ color: NAVY }}>Poste</th>
                    <th className="text-right py-2 font-semibold" style={{ color: NAVY }}>Montant (MUR)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* PRODUITS Section */}
                  <tr className="border-b" style={{ backgroundColor: "#f0fdf4" }}>
                    <td className="py-3 font-bold" style={{ color: NAVY }} colSpan={2}>
                      <TrendingUp className="inline h-4 w-4 mr-2" style={{ color: "#22C55E" }} />
                      PRODUITS (Classe 7)
                    </td>
                  </tr>
                  {revenueDetails.map(([prefix, amount]) => (
                    <tr key={prefix} className="border-b border-gray-100">
                      <td className="py-2 pl-8 text-muted-foreground">
                        {prefix} — {REVENUE_LABELS[prefix] || `Compte ${prefix}x`}
                      </td>
                      <td className="py-2 text-right font-medium" style={{ color: "#22C55E" }}>
                        {formatMUR(amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2" style={{ borderColor: GOLD }}>
                    <td className="py-2 pl-4 font-semibold" style={{ color: NAVY }}>
                      Total Produits
                    </td>
                    <td className="py-2 text-right font-bold" style={{ color: "#22C55E" }}>
                      {formatMUR(totalRevenue)}
                    </td>
                  </tr>

                  {/* Spacer */}
                  <tr><td className="py-2" colSpan={2}></td></tr>

                  {/* CHARGES Section */}
                  <tr className="border-b" style={{ backgroundColor: "#fef2f2" }}>
                    <td className="py-3 font-bold" style={{ color: NAVY }} colSpan={2}>
                      <TrendingDown className="inline h-4 w-4 mr-2" style={{ color: "#EF4444" }} />
                      CHARGES (Classe 6)
                    </td>
                  </tr>
                  {expenseGroups.map((group) => (
                    <tr key={group.label} className="border-b border-gray-100">
                      <td className="py-2 pl-8 text-muted-foreground">
                        {group.label}
                        {group.details.length > 1 && (
                          <span className="text-xs ml-2 text-gray-400">
                            ({group.details.map(d => d.prefix).join(", ")})
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-medium" style={{ color: "#EF4444" }}>
                        {formatMUR(group.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b-2" style={{ borderColor: GOLD }}>
                    <td className="py-2 pl-4 font-semibold" style={{ color: NAVY }}>
                      Total Charges
                    </td>
                    <td className="py-2 text-right font-bold" style={{ color: "#EF4444" }}>
                      {formatMUR(totalExpenses)}
                    </td>
                  </tr>

                  {/* Spacer */}
                  <tr><td className="py-2" colSpan={2}></td></tr>

                  {/* RESULTAT */}
                  <tr style={{ backgroundColor: NAVY }}>
                    <td className="py-3 pl-4 font-bold text-white rounded-bl-lg">
                      R&eacute;sultat d&apos;exploitation
                    </td>
                    <td className="py-3 text-right font-bold text-white rounded-br-lg">
                      {formatMUR(resultatExploitation)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: GOLD }}>
                    <td className="py-3 pl-4 font-bold text-white rounded-bl-lg">
                      R&eacute;sultat net
                    </td>
                    <td className="py-3 text-right font-bold text-white rounded-br-lg">
                      {formatMUR(resultatNet)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Footer note */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground italic">
          Calcul&eacute; automatiquement &agrave; partir de vos &eacute;critures comptables
        </p>
      </div>
    </div>
  )
}
