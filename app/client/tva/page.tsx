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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import Link from "next/link"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as XLSX from "xlsx"
import { MonthPicker } from "@/components/ui/MonthPicker"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
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
  const { societeId, societe } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [computing, setComputing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [showAllClient, setShowAllClient] = useState(false)
  const [showAllLocal, setShowAllLocal] = useState(false)
  const [showAllForeign, setShowAllForeign] = useState(false)

  // Period filter — Mauritius fiscal year quarters
  // T1 = Jul-Sep, T2 = Oct-Dec, T3 = Jan-Mar, T4 = Apr-Jun
  type PeriodMode = "mensuel" | "trimestriel"
  const nowDate = new Date()
  const [periodMode, setPeriodMode] = useState<PeriodMode>("mensuel")
  const [selectedMonth, setSelectedMonth] = useState(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`)
  const [selectedTrimestre, setSelectedTrimestre] = useState(() => {
    const m = nowDate.getMonth() + 1 // 1-12
    if (m >= 7 && m <= 9) return 'T1'
    if (m >= 10 && m <= 12) return 'T2'
    if (m >= 1 && m <= 3) return 'T3'
    return 'T4'
  })
  const [selectedYear, setSelectedYear] = useState(() => {
    // Fiscal year: T1/T2 are in first calendar year, T3/T4 in second
    const m = nowDate.getMonth() + 1
    return m >= 7 ? nowDate.getFullYear() : nowDate.getFullYear() - 1
  })

  // Mauritius fiscal quarter → calendar month mapping
  const QUARTER_MONTHS: Record<string, number[]> = {
    'T1': [7, 8, 9], 'T2': [10, 11, 12], 'T3': [1, 2, 3], 'T4': [4, 5, 6]
  }
  const QUARTER_LABELS: Record<string, string> = {
    'T1': 'T1 (Juil-Sep)', 'T2': 'T2 (Oct-Déc)', 'T3': 'T3 (Jan-Mar)', 'T4': 'T4 (Avr-Jun)'
  }

  function getPeriodDates(): { debut: string; fin: string } {
    if (periodMode === "mensuel") {
      const [y, m] = selectedMonth.split("-").map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      return { debut: `${y}-${String(m).padStart(2, "0")}-01`, fin: `${y}-${String(m).padStart(2, "0")}-${lastDay}` }
    }
    const months = QUARTER_MONTHS[selectedTrimestre] || [1, 2, 3]
    const startM = months[0]
    const endM = months[months.length - 1]
    // T1/T2 use selectedYear, T3/T4 use selectedYear+1
    const startY = startM >= 7 ? selectedYear : selectedYear + 1
    const endY = endM >= 7 ? selectedYear : selectedYear + 1
    const lastDay = new Date(endY, endM, 0).getDate()
    return { debut: `${startY}-${String(startM).padStart(2, "0")}-01`, fin: `${endY}-${String(endM).padStart(2, "0")}-${lastDay}` }
  }

  function getPeriodLabel(): string {
    if (periodMode === "mensuel") {
      const [y, mo] = selectedMonth.split("-").map(Number)
      return new Date(y, mo - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    }
    return `${QUARTER_LABELS[selectedTrimestre] || selectedTrimestre} ${selectedYear}-${selectedYear + 1}`
  }

  useEffect(() => {
    if (!societeId) { setFetching(false); return }
    setFetching(true)
    const { debut, fin } = getPeriodDates()
    const url = `/api/client/financial?societe_id=${societeId}&date_debut=${debut}&date_fin=${fin}`
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json.financial)
      })
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [societeId, periodMode, selectedMonth, selectedTrimestre, selectedYear])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  const tvaCollectee = data?.tvaCollectee ?? 0
  const tvaDeductible = data?.tvaDeductible ?? 0
  const tvaRecords: any[] = data?.tvaRecords ?? []
  const invoices: any[] = data?.extractedInvoices ?? []
  const factures: any[] = data?.factures ?? []
  const creditReporte = 0

  // TVA from factures table — LOCAL fournisseurs only (exclude reverse charge)
  const facturesClient = factures.filter((f: any) => f.type_facture === 'client')
  const facturesClientLocal = facturesClient.filter((f: any) => !f.client_offshore)
  const facturesFournisseur = factures.filter((f: any) => f.type_facture === 'fournisseur')
  const facturesFournisseurLocal = facturesFournisseur.filter((f: any) => {
    // Exclude foreign suppliers from TVA déductible (they go in reverse charge)
    if (f.devise && f.devise !== 'MUR') {
      const tiers = (f.tiers || '').toLowerCase()
      if (!tiers.includes('magellan')) return false // foreign → exclude
    }
    return true
  })
  const tvaCollecteeFactures = facturesClientLocal.reduce((s: number, f: any) => s + (Number(f.montant_tva) || 0), 0)
  const tvaDeductibleFactures = facturesFournisseurLocal.reduce((s: number, f: any) => s + (Number(f.montant_tva) || 0), 0)

  // Factures non soumises à TVA (montant_tva = 0 but montant_ht > 0)
  // Exclude invoices already shown in Reverse Charge R5 (foreign fournisseurs with devise != MUR)
  const isReverseCharge = (f: any) => f.type_facture === 'fournisseur' && f.devise && f.devise !== 'MUR' && !(f.tiers || '').toLowerCase().includes('magellan')
  const facturesNonTVA = factures.filter((f: any) => (Number(f.montant_tva) || 0) === 0 && (Number(f.montant_ht) || 0) > 0 && !isReverseCharge(f))

  // Reverse charge: foreign fournisseurs (devise != MUR, not known Mauritius company)
  const reverseChargeFacts = facturesFournisseur.filter((f: any) => {
    if (!f.devise || f.devise === 'MUR') return false
    const tiers = (f.tiers || '').toLowerCase()
    // Exclude known Mauritius companies despite EUR invoices
    if (tiers.includes('magellan')) return false
    return true
  })

  // Separate client invoices (TVA collectee) and supplier invoices — filtered by period
  const { debut: pDebut, fin: pFin } = getPeriodDates()
  const inPeriod = (inv: any) => {
    const d = inv.date || inv.date_document || ''
    if (!d) return true // include undated items
    return d >= pDebut && d <= pFin
  }
  const clientInvoices = invoices.filter((inv: any) => inv.type === "facture_client" && inPeriod(inv))
  const supplierInvoices = invoices.filter((inv: any) => inv.type === "facture_fournisseur" && inPeriod(inv))

  // Classify supplier invoices: local vs foreign
  // Uses same currency-based logic as facturesFournisseurLocal (Filter A) and reverseChargeFacts (Filter C)
  // A Mauritius company invoicing in EUR (e.g. Magellan Hub Ltd) is LOCAL.
  const localSupplierInvoices = supplierInvoices.filter(
    (inv: any) => {
      if (inv.devise && inv.devise !== 'MUR') {
        const t = (inv.emetteur || '').toLowerCase()
        if (!t.includes('magellan')) return false
      }
      return true
    }
  )
  const foreignSupplierInvoices = supplierInvoices.filter(
    (inv: any) => {
      if (!inv.devise || inv.devise === 'MUR') return false
      const t = (inv.emetteur || '').toLowerCase()
      return !t.includes('magellan')
    }
  )

  // Local valid: must have TVA amount, emetteur, and numero (implies MRA TVA number)
  const validLocalInvoices = localSupplierInvoices.filter(
    (inv: any) => (inv.montant_tva ?? 0) > 0 && inv.emetteur && inv.numero
  )
  const rejectedLocalInvoices = localSupplierInvoices.filter(
    (inv: any) => (inv.montant_tva ?? 0) > 0 && (!inv.emetteur || !inv.numero)
  )

  // Group invoices by normalized tiers name for cleaner display
  function groupByTiers(items: any[], tiersField: string, tvaField: string): { tiers: string; totalTVA: number; count: number }[] {
    const groups: Record<string, { tiers: string; totalTVA: number; count: number }> = {}
    for (const item of items) {
      const raw = item[tiersField] || item.emetteur || item.destinataire || '—'
      const key = raw.toLowerCase().split(/[—,]/)[0].trim().replace(/\s+(ltd|limited|sarl)\.?$/i, '').trim()
      if (!groups[key]) groups[key] = { tiers: raw.split(/[—,]/)[0].trim(), totalTVA: 0, count: 0 }
      groups[key].totalTVA += Number(item[tvaField]) || 0
      groups[key].count++
    }
    return Object.values(groups).sort((a, b) => b.totalTVA - a.totalTVA)
  }
  // Group from factures table (correct names) — NOT from extractedInvoices/OCR
  const groupedClientInvoices = groupByTiers(facturesClientLocal, 'tiers', 'montant_tva')
  const groupedLocalInvoices = groupByTiers(facturesFournisseurLocal, 'tiers', 'montant_tva')
  const groupedForeignInvoices = groupByTiers(reverseChargeFacts, 'tiers', 'montant_ht')

  // TVA collectee from client invoices
  const totalTvaCollecteeFromInvoices = clientInvoices.reduce(
    (s: number, inv: any) => s + (inv.montant_tva_mur ?? inv.montant_tva ?? 0), 0
  )

  // TVA deductible ONLY from local valid invoices
  const totalTvaDeductibleLocale = validLocalInvoices.reduce(
    (s: number, inv: any) => s + (inv.montant_tva_mur ?? inv.montant_tva ?? 0), 0
  )

  // Reverse charge on foreign invoices: output + input = net 0
  const totalReverseChargeBase = reverseChargeFacts.reduce(
    (s: number, f: any) => s + (Number(f.montant_ht) || 0), 0
  )
  const reverseChargeTVA = totalReverseChargeBase * TVA_RATE

  // Factures table is ALWAYS the source of truth (already period-filtered by API)
  // Only fallback to écritures if factures array is completely empty
  const hasFacures = factures.length > 0
  const effectiveCollectee = hasFacures ? tvaCollecteeFactures : (tvaCollectee || totalTvaCollecteeFromInvoices || 0)
  const effectiveDeductible = hasFacures ? tvaDeductibleFactures : (tvaDeductible || totalTvaDeductibleLocale || 0)
  // TVA a payer = collectee - deductible locale (reverse charge nets to 0)
  const effectiveNette = effectiveCollectee - effectiveDeductible - creditReporte
  const tvaAPayer = Math.max(0, effectiveNette)
  const creditTVA = effectiveNette < 0 ? Math.abs(effectiveNette) : 0

  // Export handlers
  const handleExport = (type: "normale" | "deductible" | "reverse") => {
    const dateStr = new Date().toISOString().split("T")[0]
    const period = periodMode === "mensuel" ? selectedMonth : `${selectedTrimestre}_${selectedYear}`
    const wb = XLSX.utils.book_new()

    if (type === "normale") {
      const rows = [
        ...clientInvoices.map((inv: any) => ({
          "Date": inv.date || "—",
          "N° Facture": inv.numero || "—",
          "Tiers": inv.destinataire || inv.emetteur || "—",
          "Montant HT": inv.montant_ht_mur ?? inv.montant_ht ?? 0,
          "TVA 15%": inv.montant_tva_mur ?? inv.montant_tva ?? 0,
          "Montant TTC": inv.montant_ttc_mur ?? inv.montant_ttc ?? 0,
          "Type": "Client",
        })),
        ...localSupplierInvoices.map((inv: any) => ({
          "Date": inv.date || "—",
          "N° Facture": inv.numero || "—",
          "Tiers": inv.emetteur || "—",
          "Montant HT": inv.montant_ht_mur ?? inv.montant_ht ?? 0,
          "TVA 15%": inv.montant_tva_mur ?? inv.montant_tva ?? 0,
          "Montant TTC": inv.montant_ttc_mur ?? inv.montant_ttc ?? 0,
          "Type": "Fournisseur local",
        })),
      ]
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "TVA Normale")
      XLSX.writeFile(wb, `tva_normale_${period}_${dateStr}.xlsx`)
    } else if (type === "deductible") {
      const rows = validLocalInvoices.map((inv: any) => ({
        "Date": inv.date || "—",
        "N° Facture": inv.numero || "—",
        "Fournisseur": inv.emetteur || "—",
        "Montant HT": inv.montant_ht_mur ?? inv.montant_ht ?? 0,
        "TVA déductible": inv.montant_tva_mur ?? inv.montant_tva ?? 0,
        "Montant TTC": inv.montant_ttc_mur ?? inv.montant_ttc ?? 0,
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "TVA Déductible")
      XLSX.writeFile(wb, `tva_deductible_${period}_${dateStr}.xlsx`)
    } else {
      const rows = foreignSupplierInvoices.map((inv: any) => {
        const ht = inv.montant_ht_mur ?? inv.montant_ht ?? 0
        return {
          "Date": inv.date || "—",
          "Fournisseur": inv.emetteur || "—",
          "Devise": inv.devise || "—",
          "Base HT (MUR)": ht,
          "TVA collectée (15%)": ht * TVA_RATE,
          "TVA déductible (15%)": ht * TVA_RATE,
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, "TVA Reverse Charge")
      XLSX.writeFile(wb, `tva_reverse_charge_${period}_${dateStr}.xlsx`)
    }
  }

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
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 15mm; size: A4; }
        }
      `}</style>

      {/* Header with deadline */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Ma TVA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi de vos d&eacute;clarations TVA et obligations fiscales aupr&egrave;s de la MRA.
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Period selector */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex rounded-lg border overflow-hidden">
              {(["mensuel", "trimestriel"] as PeriodMode[]).map(mode => (
                <button key={mode} onClick={() => setPeriodMode(mode)}
                  className={`px-4 py-1.5 text-xs font-medium transition-colors ${periodMode === mode ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {mode === "mensuel" ? "Mensuel" : "Trimestriel"}
                </button>
              ))}
            </div>
            {periodMode === "mensuel" && (
              <MonthPicker value={selectedMonth} onChange={v => { if (v) setSelectedMonth(v) }} showTout={false} />
            )}
            {periodMode === "trimestriel" && (
              <div className="flex items-center gap-2">
                <Select value={selectedTrimestre} onValueChange={setSelectedTrimestre}>
                  <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{["T1", "T2", "T3", "T4"].map(t => <SelectItem key={t} value={t}>{QUARTER_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                  <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{[nowDate.getFullYear() - 1, nowDate.getFullYear(), nowDate.getFullYear() + 1].map(y => <SelectItem key={y} value={String(y)}>{y}-{y + 1}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <Badge variant="outline" className="text-xs capitalize">{getPeriodLabel()}</Badge>
            <div className="flex-1" />
            {/* Export dropdown */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setExportOpen(!exportOpen)}>
                <Download className="w-4 h-4 mr-1" /> Exporter
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 w-56">
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { handleExport("normale"); setExportOpen(false) }}>TVA normale</button>
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { handleExport("deductible"); setExportOpen(false) }}>TVA déductible</button>
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t" onClick={() => { handleExport("reverse"); setExportOpen(false) }}>TVA reverse charge</button>
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t" onClick={async () => {
                    setExportOpen(false)
                    try {
                      const { pdf } = await import('@react-pdf/renderer')
                      const { TVADeclarationPDF } = await import('@/components/pdf/TVADeclarationPDF')
                      const socData = societe
                      const pLabel = getPeriodLabel()
                      const taxableAchatsHT = facturesFournisseurLocal.filter((fac: any) => (Number(fac.montant_tva) || 0) > 0).reduce((sum: number, fac: any) => sum + (Number(fac.montant_ht) || 0), 0)
                      const caHT = facturesClientLocal.reduce((sum: number, fac: any) => sum + (Number(fac.montant_ht) || 0), 0)
                      const taxableSuppliers = groupedLocalInvoices.filter(g => g.totalTVA > 0)
                      const blob = await pdf(
                        <TVADeclarationPDF societe={socData} periodeLabel={pLabel} effectiveCollectee={effectiveCollectee} effectiveDeductible={effectiveDeductible} tvaAPayer={tvaAPayer} creditTVA={creditTVA} totalReverseChargeBase={totalReverseChargeBase} reverseChargeTVA={reverseChargeTVA} caHT={caHT} taxableAchatsHT={taxableAchatsHT} groupedSuppliers={taxableSuppliers} reverseChargeFacts={reverseChargeFacts} />
                      ).toBlob()
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `TVA_${(socData?.nom || 'Societe').replace(/\s+/g, '_')}_${pLabel.replace(/[\s()]/g, '_')}_MRA.pdf`
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      URL.revokeObjectURL(url)
                    } catch (err) {
                      console.error('PDF export error:', err)
                      alert('Erreur génération PDF')
                    }
                  }}>PDF (Déclaration MRA)</button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
      {reverseChargeFacts.length > 0 && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Reverse Charge (R5) applicable sur {reverseChargeFacts.length} facture(s) &eacute;trang&egrave;re(s)
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
          <p className="text-xs text-muted-foreground">Période : <span className="capitalize">{getPeriodLabel()}</span></p>
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
                <td className="py-2 text-right font-medium">{formatMUR(facturesClientLocal.reduce((s: number, f: any) => s + (Number(f.montant_ht) || 0), 0))}</td>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        {/* TVA sur ventes locales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
              TVA sur ventes locales ({facturesClientLocal.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {facturesClientLocal.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllClient ? groupedClientInvoices : groupedClientInvoices.slice(0, 8)).map((g, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-xs">{g.tiers} {g.count > 1 ? <Badge variant="outline" className="text-[10px] ml-1">×{g.count}</Badge> : null}</TableCell>
                      <TableCell className="text-right text-xs" style={{ color: "#22C55E" }}>{formatMUR(g.totalTVA)}</TableCell>
                    </TableRow>
                  ))}
                  {groupedClientInvoices.length > 8 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center">
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAllClient(!showAllClient)}>
                          {showAllClient ? "Voir moins ↑" : `Voir les ${groupedClientInvoices.length - 8} autres →`}
                        </Button>
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
          <CardContent>
            {validLocalInvoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllLocal ? groupedLocalInvoices : groupedLocalInvoices.slice(0, 8)).map((g, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-xs">{g.tiers} {g.count > 1 ? <Badge variant="outline" className="text-[10px] ml-1">×{g.count}</Badge> : null}</TableCell>
                      <TableCell className="text-right text-xs">{formatMUR(g.totalTVA)}</TableCell>
                    </TableRow>
                  ))}
                  {groupedLocalInvoices.length > 8 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center">
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAllLocal(!showAllLocal)}>
                          {showAllLocal ? "Voir moins ↑" : `Voir les ${groupedLocalInvoices.length - 8} autres →`}
                        </Button>
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
        <Card className={reverseChargeFacts.length > 0 ? "border-amber-200" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <Globe className="h-5 w-5" style={{ color: "#F59E0B" }} />
              Reverse Charge R5 ({reverseChargeFacts.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Fournisseurs &eacute;trangers — TVA net = 0
            </p>
          </CardHeader>
          <CardContent>
            {reverseChargeFacts.length > 0 ? (
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
                    {(showAllForeign ? foreignSupplierInvoices : foreignSupplierInvoices.slice(0, 8)).map((inv: any) => {
                      const ht = inv.montant_ht_mur ?? inv.montant_ht ?? 0
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-xs"><TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="block max-w-[200px] truncate cursor-help">{inv.emetteur || "—"}</span></TooltipTrigger><TooltipContent className="max-w-[400px] break-words">{inv.emetteur || "—"}</TooltipContent></Tooltip></TooltipProvider></TableCell>
                          <TableCell className="text-right text-xs">{formatMUR(ht)}</TableCell>
                          <TableCell className="text-right text-xs text-amber-600">{formatMUR(ht * TVA_RATE)}</TableCell>
                        </TableRow>
                      )
                    })}
                    {reverseChargeFacts.length > 8 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center">
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAllForeign(!showAllForeign)}>
                            {showAllForeign ? "Voir moins ↑" : `Voir les ${reverseChargeFacts.length - 8} autres →`}
                          </Button>
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

      {/* Factures non soumises à TVA */}
      {facturesNonTVA.length > 0 && (
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <Info className="h-5 w-5" style={{ color: "#6B7280" }} />
              Factures non soumises à TVA ({facturesNonTVA.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>N°</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Montant HT</TableHead><TableHead>Devise</TableHead><TableHead>Raison</TableHead></TableRow></TableHeader>
              <TableBody>
                {facturesNonTVA.slice(0, showAllClient ? 100 : 8).map((f: any) => {
                  const raison = f.devise && f.devise !== 'MUR' && f.type_facture === 'client' ? 'Export — Exonéré' : f.devise && f.devise !== 'MUR' && f.type_facture === 'fournisseur' ? 'Import — Reverse charge possible' : 'Non assujetti à TVA'
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs">{f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{f.numero_facture || '—'}</TableCell>
                      <TableCell className="text-xs">{f.tiers || '—'}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatMUR(Number(f.montant_ht) || 0)}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{f.devise || 'MUR'}</Badge></TableCell>
                      <TableCell className="text-xs text-gray-500">{raison}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Reverse Charge Section */}
      {reverseChargeFacts.length > 0 && (
        <Card className="border-amber-200 no-print">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
              <Globe className="h-5 w-5 text-amber-500" />
              Reverse Charge — Fournisseurs étrangers ({reverseChargeFacts.length})
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Services importés soumis au mécanisme de reverse charge (R5). TVA auto-déclarée : output + input = net 0.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Fournisseur</TableHead><TableHead>Devise</TableHead><TableHead className="text-right">Base HT</TableHead><TableHead className="text-right">TVA 15% (auto)</TableHead></TableRow></TableHeader>
              <TableBody>
                {reverseChargeFacts.map((f: any) => {
                  const ht = Number(f.montant_ht) || Number(f.montant_ttc) || 0
                  const tvaAuto = Math.round(ht * 0.15 * 100) / 100
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-xs">{f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '—'}</TableCell>
                      <TableCell className="text-xs font-medium">{f.tiers || '—'}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{f.devise}</Badge></TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatMUR(ht)} {f.devise}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-amber-600">{formatMUR(tvaAuto)} MUR</TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-amber-50/50 font-bold">
                  <TableCell colSpan={4} className="text-right text-xs">Total Reverse Charge TVA</TableCell>
                  <TableCell className="text-right text-xs font-mono text-amber-600">{formatMUR(reverseChargeFacts.reduce((s: number, f: any) => s + Math.round((Number(f.montant_ht) || Number(f.montant_ttc) || 0) * 0.15 * 100) / 100, 0))} MUR</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-blue-700 mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" /> Output TVA + Input TVA = effet net 0. Montants à déclarer dans les cases R5 de la déclaration MRA.
            </p>
          </CardContent>
        </Card>
      )}

      {/* TVA Records Table */}
      {tvaRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: NAVY }}>Historique des d&eacute;clarations TVA</CardTitle>
          </CardHeader>
          <CardContent>
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
    </ClientPageShell>
  )
}
