"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  AlertTriangle,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  CalendarClock,
  Building2,
  Globe,
  MapPin,
  Info,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"
const TVA_RATE = 0.15

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

function getDeadlineInfo() {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const deadline = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20)
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const monthNames = [
    "Janvier", "F\u00e9vrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Ao\u00fbt", "Septembre", "Octobre", "Novembre", "D\u00e9cembre",
  ]
  return {
    deadlineStr: `20 ${monthNames[deadline.getMonth()]} ${deadline.getFullYear()}`,
    daysLeft: diffDays,
    periodLabel: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
    isUrgent: diffDays <= 5,
    isOverdue: diffDays < 0,
  }
}

// Known foreign suppliers (no MRA TVA number)
const FOREIGN_SUPPLIERS = [
  "openai", "aws", "amazon web services", "vercel", "google cloud",
  "microsoft", "azure", "stripe", "digitalocean", "heroku", "netlify",
  "github", "gitlab", "cloudflare", "twilio", "sendgrid", "mailgun",
  "atlassian", "slack", "zoom", "notion", "figma", "adobe",
]

function isForeignSupplier(emetteur: string): boolean {
  if (!emetteur) return false
  const lower = emetteur.toLowerCase()
  return FOREIGN_SUPPLIERS.some(f => lower.includes(f))
}

export default function TVAPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [computing, setComputing] = useState(false)
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
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: GOLD }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  const tvaCollectee = data?.tvaCollectee ?? 0
  const tvaDeductible = data?.tvaDeductible ?? 0
  const tvaRecords: any[] = data?.tvaRecords ?? []
  const invoices: any[] = data?.extractedInvoices ?? []
  const creditReporte = 0

  // Separate client invoices (TVA collectee) and supplier invoices
  const clientInvoices = invoices.filter((inv: any) => inv.type === "facture_client")
  const supplierInvoices = invoices.filter((inv: any) => inv.type === "facture_fournisseur")

  // Classify supplier invoices: local vs foreign
  const localSupplierInvoices = supplierInvoices.filter(
    (inv: any) => !isForeignSupplier(inv.emetteur) && inv.devise === "MUR"
  )
  const foreignSupplierInvoices = supplierInvoices.filter(
    (inv: any) => isForeignSupplier(inv.emetteur) || (inv.devise && inv.devise !== "MUR")
  )

  // Local valid: must have TVA amount, emetteur, and numero (implies MRA TVA number)
  const validLocalInvoices = localSupplierInvoices.filter(
    (inv: any) => (inv.montant_tva ?? 0) > 0 && inv.emetteur && inv.numero
  )
  const rejectedLocalInvoices = localSupplierInvoices.filter(
    (inv: any) => (inv.montant_tva ?? 0) > 0 && (!inv.emetteur || !inv.numero)
  )

  // TVA collectee from client invoices
  const totalTvaCollecteeFromInvoices = clientInvoices.reduce(
    (s: number, inv: any) => s + (inv.montant_tva_mur ?? inv.montant_tva ?? 0), 0
  )

  // TVA deductible ONLY from local valid invoices
  const totalTvaDeductibleLocale = validLocalInvoices.reduce(
    (s: number, inv: any) => s + (inv.montant_tva_mur ?? inv.montant_tva ?? 0), 0
  )

  // Reverse charge on foreign invoices: output + input = net 0
  const totalReverseChargeBase = foreignSupplierInvoices.reduce(
    (s: number, inv: any) => s + (inv.montant_ht_mur ?? inv.montant_ht ?? 0), 0
  )
  const reverseChargeTVA = totalReverseChargeBase * TVA_RATE

  // Use ecritures-based values if available, else computed from invoices
  const effectiveCollectee = tvaCollectee || totalTvaCollecteeFromInvoices
  const effectiveDeductible = tvaDeductible || totalTvaDeductibleLocale
  // TVA a payer = collectee - deductible locale (reverse charge nets to 0)
  const effectiveNette = effectiveCollectee - effectiveDeductible - creditReporte
  const tvaAPayer = Math.max(0, effectiveNette)
  const creditTVA = effectiveNette < 0 ? Math.abs(effectiveNette) : 0

  const deadline = getDeadlineInfo()

  const handleCalculerTVA = async () => {
    setComputing(true)
    await new Promise((r) => setTimeout(r, 1500))
    setComputing(false)
  }

  const summaryCards = [
    { title: "TVA Collect\u00e9e (ventes)", value: effectiveCollectee, icon: TrendingUp, color: NAVY, bg: "bg-blue-50" },
    { title: "TVA D\u00e9ductible (local)", value: effectiveDeductible, icon: TrendingDown, color: GOLD, bg: "bg-amber-50" },
    { title: "TVA Nette \u00e0 payer", value: tvaAPayer, icon: Calculator, color: "#DC2626", bg: "bg-red-50" },
    { title: "Cr\u00e9dit TVA", value: creditTVA, icon: AlertTriangle, color: "#22C55E", bg: "bg-green-50" },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header with deadline */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Ma TVA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi de vos d&eacute;clarations TVA et obligations fiscales aupr&egrave;s de la MRA.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les soci&eacute;t&eacute;s</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Deadline indicator */}
          <Card className={`border-2 ${deadline.isOverdue ? "border-red-500" : deadline.isUrgent ? "border-orange-400" : "border-gray-200"}`}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <CalendarClock className="h-5 w-5" style={{ color: deadline.isOverdue ? "#EF4444" : deadline.isUrgent ? "#F59E0B" : NAVY }} />
              <div>
                <p className="text-xs text-muted-foreground">Prochaine &eacute;ch&eacute;ance TVA</p>
                <p className="text-sm font-semibold" style={{ color: deadline.isOverdue ? "#EF4444" : NAVY }}>
                  {deadline.deadlineStr}
                </p>
                <p className="text-xs" style={{ color: deadline.isOverdue ? "#EF4444" : deadline.isUrgent ? "#F59E0B" : "#6B7280" }}>
                  {deadline.isOverdue
                    ? `En retard de ${Math.abs(deadline.daysLeft)} jour(s)`
                    : `${deadline.daysLeft} jour(s) restant(s)`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Calculate button */}
      <div>
        <button
          onClick={handleCalculerTVA}
          disabled={computing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-60"
          style={{ backgroundColor: NAVY }}
        >
          {computing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Calculator className="h-4 w-4" />
          )}
          {computing ? "Calcul en cours..." : `Calculer la TVA — ${deadline.periodLabel}`}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>
                {formatMUR(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reverse Charge Warning */}
      {foreignSupplierInvoices.length > 0 && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Reverse Charge (R5) applicable sur {foreignSupplierInvoices.length} facture(s) &eacute;trang&egrave;re(s)
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Les factures de fournisseurs &eacute;trangers (sans num&eacute;ro TVA MRA) sont soumises au m&eacute;canisme de Reverse Charge :
                  TVA de sortie 15% (4457) + TVA d&apos;entr&eacute;e 15% (4456) = effet net 0 MUR.
                  Ces montants ne sont PAS inclus dans la TVA &agrave; payer.
                </p>
                <p className="text-xs text-amber-700 mt-1 font-medium">
                  Base Reverse Charge : {formatMUR(totalReverseChargeBase)} — TVA (15%) : {formatMUR(reverseChargeTVA)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MRA Declaration Form (Box 1-9) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <FileText className="h-5 w-5" style={{ color: GOLD }} />
            D&eacute;claration TVA — Format MRA
          </CardTitle>
          <p className="text-xs text-muted-foreground">P&eacute;riode : {deadline.periodLabel}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2" style={{ borderColor: NAVY }}>
                <th className="text-left py-2 font-semibold" style={{ color: NAVY }}>Box</th>
                <th className="text-left py-2 font-semibold" style={{ color: NAVY }}>Description</th>
                <th className="text-right py-2 font-semibold" style={{ color: NAVY }}>Montant (MUR)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>1</td>
                <td className="py-2">Chiffre d&apos;affaires taxable</td>
                <td className="py-2 text-right font-medium">{formatMUR(data?.totalRevenue ?? 0)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>2</td>
                <td className="py-2">TVA sur ventes (Output Tax)</td>
                <td className="py-2 text-right font-medium">{formatMUR(effectiveCollectee)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>3</td>
                <td className="py-2">Achats locaux taxables</td>
                <td className="py-2 text-right font-medium">{formatMUR(validLocalInvoices.reduce((s: number, inv: any) => s + (inv.montant_ht_mur ?? inv.montant_ht ?? 0), 0))}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>4</td>
                <td className="py-2">TVA sur achats locaux (Input Tax)</td>
                <td className="py-2 text-right font-medium">{formatMUR(effectiveDeductible)}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-amber-50/50">
                <td className="py-2 font-medium" style={{ color: NAVY }}>R5</td>
                <td className="py-2">
                  Reverse Charge — services import&eacute;s
                  <span className="text-xs text-muted-foreground ml-2">(output + input = net 0)</span>
                </td>
                <td className="py-2 text-right font-medium text-amber-600">{formatMUR(reverseChargeTVA)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>5</td>
                <td className="py-2">Cr&eacute;dit TVA report&eacute; du mois pr&eacute;c&eacute;dent</td>
                <td className="py-2 text-right font-medium">{formatMUR(creditReporte)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>6</td>
                <td className="py-2">Total TVA d&eacute;ductible (Box 4 + Box 5)</td>
                <td className="py-2 text-right font-medium">{formatMUR(effectiveDeductible + creditReporte)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>7</td>
                <td className="py-2">TVA nette (Box 2 - Box 6)</td>
                <td className="py-2 text-right font-medium" style={{ color: effectiveNette >= 0 ? "#EF4444" : "#22C55E" }}>
                  {formatMUR(effectiveNette)}
                </td>
              </tr>
              <tr className="border-b border-gray-100" style={{ backgroundColor: tvaAPayer > 0 ? "#fef2f2" : "#f0fdf4" }}>
                <td className="py-2 font-bold" style={{ color: NAVY }}>8</td>
                <td className="py-2 font-bold">TVA &agrave; payer</td>
                <td className="py-2 text-right font-bold" style={{ color: "#EF4444" }}>
                  {formatMUR(tvaAPayer)}
                </td>
              </tr>
              <tr style={{ backgroundColor: creditTVA > 0 ? "#f0fdf4" : undefined }}>
                <td className="py-2 font-bold" style={{ color: NAVY }}>9</td>
                <td className="py-2 font-bold">Cr&eacute;dit TVA &agrave; reporter</td>
                <td className="py-2 text-right font-bold" style={{ color: "#22C55E" }}>
                  {formatMUR(creditTVA)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Three sections: Local sales, Local deductible, Foreign reverse charge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TVA sur ventes locales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
              TVA sur ventes locales ({clientInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {clientInvoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientInvoices.slice(0, 8).map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium text-xs">{inv.destinataire || inv.emetteur || "\u2014"}</TableCell>
                      <TableCell className="text-right text-xs" style={{ color: "#22C55E" }}>
                        {formatMUR(inv.montant_tva_mur ?? inv.montant_tva ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {clientInvoices.length > 8 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                        ... et {clientInvoices.length - 8} autres
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucune facture client
              </p>
            )}
          </CardContent>
        </Card>

        {/* TVA deductible (fournisseurs locaux) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <MapPin className="h-5 w-5" style={{ color: GOLD }} />
              TVA d&eacute;ductible — locaux ({validLocalInvoices.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Fournisseurs locaux avec n&deg; TVA MRA valide
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {validLocalInvoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validLocalInvoices.slice(0, 8).map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium text-xs">{inv.emetteur || "\u2014"}</TableCell>
                      <TableCell className="text-right text-xs">{formatMUR(inv.montant_tva_mur ?? inv.montant_tva ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                  {validLocalInvoices.length > 8 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                        ... et {validLocalInvoices.length - 8} autres
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucune facture locale avec TVA d&eacute;ductible
              </p>
            )}
            {rejectedLocalInvoices.length > 0 && (
              <div className="mt-3 p-2 rounded bg-red-50 border border-red-200">
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {rejectedLocalInvoices.length} facture(s) rejet&eacute;e(s) — informations manquantes
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reverse Charge (fournisseurs etrangers) */}
        <Card className={foreignSupplierInvoices.length > 0 ? "border-amber-200" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <Globe className="h-5 w-5" style={{ color: "#F59E0B" }} />
              Reverse Charge R5 ({foreignSupplierInvoices.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Fournisseurs &eacute;trangers — TVA net = 0
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {foreignSupplierInvoices.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead className="text-right">HT (MUR)</TableHead>
                      <TableHead className="text-right">TVA 15%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {foreignSupplierInvoices.slice(0, 8).map((inv: any) => {
                      const ht = inv.montant_ht_mur ?? inv.montant_ht ?? 0
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-xs">{inv.emetteur || "\u2014"}</TableCell>
                          <TableCell className="text-right text-xs">{formatMUR(ht)}</TableCell>
                          <TableCell className="text-right text-xs text-amber-600">{formatMUR(ht * TVA_RATE)}</TableCell>
                        </TableRow>
                      )
                    })}
                    {foreignSupplierInvoices.length > 8 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                          ... et {foreignSupplierInvoices.length - 8} autres
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="mt-3 p-2 rounded bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-700 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Output TVA (4457) : {formatMUR(reverseChargeTVA)} | Input TVA (4456) : {formatMUR(reverseChargeTVA)} | Net : 0,00 MUR
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucune facture &eacute;trang&egrave;re
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TVA Records Table */}
      {tvaRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: NAVY }}>Historique des d&eacute;clarations TVA</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>P&eacute;riode</TableHead>
                  <TableHead className="text-right">TVA Collect&eacute;e</TableHead>
                  <TableHead className="text-right">TVA D&eacute;ductible</TableHead>
                  <TableHead className="text-right">TVA Nette</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tvaRecords.map((rec: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{rec.periode || rec.month || "\u2014"}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaCollectee ?? rec.collectee ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaDeductible ?? rec.deductible ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaNette ?? rec.nette ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
