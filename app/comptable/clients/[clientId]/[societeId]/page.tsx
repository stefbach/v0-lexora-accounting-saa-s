"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, TrendingUp, TrendingDown, ChevronRight, Upload,
  BarChart3, Landmark, Wallet, Calculator, FolderOpen, Loader2,
  FileText as FileIcon, CheckCircle, AlertTriangle as AlertIcon, Pencil,
  Building2, Eye, Mail, Phone, BookOpen, Scale, Receipt,
} from "lucide-react"
import { t, getLocale, type Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) { return n.toLocaleString("fr-FR") + " MUR" }
function fmt2(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtColor(n: number) { if (n < 0) return { color: "#DC2626" }; return {} }
function fmtVal(n: number): string { if (n < 0) return `(${fmt2(Math.abs(n))})`; return fmt2(n) }

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
      if (group.match(prefix)) { total += amount; assigned.add(prefix) }
    }
    if (total !== 0) groups.push({ label: group.label, range: group.range, amount: total })
  }
  let otherTotal = 0
  for (const [prefix, amount] of Object.entries(expensesByAccount)) {
    if (!assigned.has(prefix)) otherTotal += amount
  }
  if (otherTotal !== 0) groups.push({ label: "Autres charges", range: "classe 6", amount: otherTotal })
  return groups
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Fournisseur {
  fournisseur: string; numero: string; date: string; ht: number; tva: number; ttc: number; echeance: string; statut: string; compte: string
}
interface FactureClient {
  client: string; numero: string; date: string; ht: number; tva: number; ttc: number; echeance: string; statut: string; jours: number
}
interface BanqueEntry {
  date: string; libelle: string; debit: number; credit: number; tiers: string; compte: string; statut: string
}
interface SalaireEntry {
  employe: string; brut: number; csg: number; nsf: number; paye: number; net: number; cout: number; statut: string
}
interface ChargeEntry {
  periode: string; csg_e: number; csg_p: number; nsf_e: number; nsf_p: number; training: number; paye: number; total: number; statut: string
}
interface TVAEntry {
  mois: string; collectee: number; deductible: number; nette: number; deadline: string; statut: string; ref: string
}
interface DossierEntry {
  nom: string; count: number; anomalies: number
}
interface GLAccount {
  compte: string; nom: string; entries: { date: string; ref: string; desc: string; debit: number; credit: number; solde: number }[]
}
interface AlerteEntry {
  niveau: string; titre: string; description: string; montant: number; echeance: string
}
interface KPI {
  label: string; value: number; green?: boolean
}
interface EcritureRaw {
  id: string; date_ecriture: string; journal: string; numero_piece: string; compte: string; libelle: string; debit: number; credit: number
}
interface FinancialRaw {
  totalRevenue: number; totalExpenses: number; resultat: number; totalBankMUR: number
  totalDocuments: number; totalEcritures: number
  immobilisations: number; stocks: number; creances: number; autresCreances: number
  capitauxPropres: number; emprunts: number; dettesFournisseurs: number; dettesFiscales: number; dettesSociales: number
  revenueByAccount: Record<string, number>; expensesByAccount: Record<string, number>
  ecritures: EcritureRaw[]
}
interface SocieteData {
  clientName: string
  societeName: string
  kpis: KPI[]
  fournisseurs: Fournisseur[]
  facturesClients: FactureClient[]
  banque: BanqueEntry[]
  salaires: SalaireEntry[]
  charges: ChargeEntry[]
  tva: TVAEntry[]
  dossiers: DossierEntry[]
  grandLivre: GLAccount[]
  alertes: AlerteEntry[]
  financial: FinancialRaw | null
}

function stBadge(s: string, locale: Locale) {
  if (["paye","solde","rapproche","declare","conforme"].includes(s)) return <Badge className="bg-green-100 text-green-700">{t(`cptb.soc.badge_${s}`, locale)}</Badge>
  if (["en_attente","a_declarer","a_verifier","a_payer","partiel"].includes(s)) return <Badge className="bg-orange-100 text-orange-700">{t(`cptb.soc.badge_${s}`, locale)}</Badge>
  if (["en_retard","impaye","non_identifie","ecart"].includes(s)) return <Badge className="bg-red-100 text-red-700">{t(`cptb.soc.badge_${s}`, locale)}</Badge>
  return <Badge variant="outline">{s}</Badge>
}

function EmptyTab({ icon: Icon, message, detail }: { icon: React.ComponentType<{ className?: string }>; message: string; detail: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Icon className="h-12 w-12 text-muted-foreground/40" />
        <p className="font-medium text-base">{message}</p>
        <p className="text-sm">{detail}</p>
      </CardContent>
    </Card>
  )
}

export default function SocieteContextPage() {
  const params = useParams()
  const locale = getLocale()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SocieteData | null>(null)
  const [societeInfo, setSocieteInfo] = useState<{ brn?: string; statut_tva?: boolean; email?: string; phone?: string } | null>(null)
  const [clientInfo, setClientInfo] = useState<{ email?: string; phone?: string } | null>(null)

  // Documents state
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedDossier, setSelectedDossier] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; status: string; type?: string; date: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        // Use comptable-accessible APIs (avoids 403 from /api/admin/* for non-admins)
        const [clientsRes, societesRes] = await Promise.all([
          fetch("/api/comptable/clients"),
          fetch("/api/comptable/societes"),
        ])
        const [clientsData, societesData] = await Promise.all([
          clientsRes.ok ? clientsRes.json() : { clients: [], dossiers: [] },
          societesRes.ok ? societesRes.json() : { societes: [] },
        ])

        const user = (clientsData.clients || []).find((u: any) => u.id === clientId)
        const societe = (societesData.societes || []).find((s: any) => s.id === societeId)
        // Fall back to dossiers enriched data if societe not found directly
        const societeFromDossier = !societe
          ? (clientsData.dossiers || []).find((d: any) => d.societe_id === societeId)?.societe
          : null
        const resolvedSociete = societe || societeFromDossier

        if (!user) throw new Error(t('cabclt.soc.client_not_found', locale))
        if (!resolvedSociete) throw new Error(t('cabclt.soc.company_not_found', locale))

        setSocieteInfo({ brn: resolvedSociete.brn, statut_tva: resolvedSociete.statut_tva })
        setClientInfo({ email: user.email, phone: user.phone })

        // Fetch financial data for this client filtered by société
        const finRes = await fetch(`/api/client/financial?client_id=${clientId}&societe_id=${societeId}`)
        const finData = finRes.ok ? await finRes.json() : { financial: null }
        const fin = finData.financial || {}

        // S4-G: Fetch real P&L and Bilan from ecritures_comptables_v2
        let pnlReal: any = null
        let bilanReal: any = null
        try {
          const [pnlRes, bilanRes] = await Promise.all([
            fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=pnl`),
            fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=bilan`),
          ])
          pnlReal   = pnlRes.ok   ? await pnlRes.json()   : null
          bilanReal = bilanRes.ok ? await bilanRes.json()  : null
        } catch { /* silently fail */ }

        // Enrich fin with real P&L data if available
        if (pnlReal && pnlReal.produits) {
          fin.totalRevenue   = pnlReal.produits.total || fin.totalRevenue || 0
          fin.totalExpenses  = pnlReal.charges.total  || fin.totalExpenses || 0
          fin.resultat       = pnlReal.resultats.resultat_net || fin.resultat || 0
          fin.totalEcritures = (fin.totalEcritures || 0) + 1 // force show
          // Build revenueByAccount from P&L details
          if (!fin.revenueByAccount || Object.keys(fin.revenueByAccount).length === 0) {
            fin.revenueByAccount = {
              "706": pnlReal.produits.ca_services || 0,
              "707": pnlReal.produits.ca_ventes   || 0,
              "708": pnlReal.produits.autres_produits || 0,
            }
          }
          if (!fin.expensesByAccount || Object.keys(fin.expensesByAccount).length === 0) {
            fin.expensesByAccount = {
              "601": pnlReal.charges.achats         || 0,
              "641": pnlReal.charges.charges_perso  || 0,
              "621": pnlReal.charges.autres_charges || 0,
              "681": pnlReal.charges.dotations      || 0,
            }
          }
        }
        if (bilanReal && bilanReal.actif) {
          fin.immobilisations     = bilanReal.actif.non_courant.immo_corp + bilanReal.actif.non_courant.immo_incorp || fin.immobilisations || 0
          fin.stocks              = bilanReal.actif.courant.stocks          || fin.stocks              || 0
          fin.creances            = bilanReal.actif.courant.clients         || fin.creances            || 0
          fin.capitauxPropres     = bilanReal.passif.capitaux_propres.total || fin.capitauxPropres     || 0
          fin.dettesFournisseurs  = bilanReal.passif.dettes_ct.fournisseurs || fin.dettesFournisseurs  || 0
        }

        // Build fournisseurs from extracted invoices
        const fournisseurs = (fin.extractedInvoices || [])
          .filter((inv: any) => inv.type === 'facture_fournisseur')
          .map((inv: any) => ({
            fournisseur: inv.emetteur || '—', numero: inv.numero || '—',
            date: inv.date || '—', ht: inv.montant_ht || 0, tva: inv.montant_tva || 0,
            ttc: inv.montant_ttc_mur || inv.montant_ttc || 0, echeance: '—',
            statut: 'en_attente', compte: '401',
          }))

        const facturesClients = (fin.extractedInvoices || [])
          .filter((inv: any) => inv.type === 'facture_client')
          .map((inv: any) => ({
            client: inv.destinataire || inv.emetteur || '—', numero: inv.numero || '—',
            date: inv.date || '—', ht: inv.montant_ht || 0, tva: inv.montant_tva || 0,
            ttc: inv.montant_ttc_mur || inv.montant_ttc || 0, echeance: '—',
            statut: 'en_attente', jours: 0,
          }))

        const kpis: KPI[] = [
          { label: t('cabclt.soc.kpi_revenue', locale), value: fin.totalRevenue || 0, green: true },
          { label: t('cabclt.soc.kpi_expenses', locale), value: fin.totalExpenses || 0 },
          { label: t('cabclt.soc.kpi_profit', locale), value: fin.resultat || 0, green: (fin.resultat || 0) > 0 },
          { label: t('cabclt.soc.kpi_treasury', locale), value: fin.totalBankMUR || 0, green: true },
        ]

        // Build bank entries from bankTransactions (individual lines from statements)
        // plus bank account summary rows
        const bankEntries: BanqueEntry[] = (fin.bankTransactions || []).map((tx: any) => ({
          date: tx.date || '—',
          libelle: tx.libelle || '—',
          debit: tx.debit || 0,
          credit: tx.credit || 0,
          tiers: tx.tiers || '',
          compte: tx.compte_comptable || '512',
          statut: tx.statut || 'non_identifie',
        }))

        // If no transactions, show bank account summaries
        if (bankEntries.length === 0) {
          for (const b of (fin.bankAccounts || [])) {
            bankEntries.push({
              date: '—', libelle: `${b.banque} — ${b.nom_compte || ''}`,
              debit: 0, credit: b.solde_actuel || 0,
              tiers: '', compte: '512', statut: 'rapproche',
            })
          }
        }

        // Build TVA rows from tvaRecords or from computed values
        const tvaRows: TVAEntry[] = (fin.tvaRecords || []).length > 0
          ? (fin.tvaRecords || []).map((rec: any) => ({
              mois: rec.periode, collectee: rec.tva_collectee || 0, deductible: rec.tva_deductible || 0,
              nette: rec.tva_nette || 0, deadline: rec.date_limite || '—',
              statut: rec.statut || 'a_declarer', ref: '',
            }))
          : (fin.tvaCollectee || fin.tvaDeductible)
            ? [{
                mois: fin.currentMonth || '—',
                collectee: fin.tvaCollectee || 0,
                deductible: fin.tvaDeductible || 0,
                nette: fin.tvaNette || 0,
                deadline: '—',
                statut: 'a_declarer',
                ref: '',
              }]
            : []

        // Fetch alertes
        let alertesData: AlerteEntry[] = []
        try {
          const alertesRes = await fetch(`/api/client/alertes?client_id=${clientId}`)
          if (alertesRes.ok) {
            const alertesJson = await alertesRes.json()
            const items = alertesJson.alertes || []
            alertesData = items.map((a: any) => ({
              niveau: a.type === 'urgent' ? 'critique' : a.type === 'attention' ? 'important' : 'info',
              titre: a.titre || '',
              description: a.description || '',
              montant: a.montant || 0,
              echeance: a.echeance || '',
            }))
          }
        } catch { /* silently fail */ }

        setData({
          clientName: user.full_name,
          societeName: resolvedSociete.nom,
          kpis,
          fournisseurs,
          facturesClients,
          banque: bankEntries,
          salaires: fin.salaires ? [{
            employe: t('cabclt.soc.total_payroll_mass', locale), brut: fin.salaires, csg: 0, nsf: 0,
            paye: 0, net: fin.salaires, cout: fin.salaires + (fin.chargesSociales || 0),
            statut: 'a_verifier',
          }] : [],
          charges: fin.chargesSociales ? [{
            periode: fin.currentMonth || '—',
            csg_e: 0, csg_p: 0, nsf_e: 0, nsf_p: 0, training: 0,
            paye: 0, total: fin.chargesSociales,
            statut: 'a_verifier',
          }] : [],
          tva: tvaRows,
          dossiers: [],
          grandLivre: [],
          alertes: alertesData,
          financial: {
            totalRevenue: fin.totalRevenue || 0,
            totalExpenses: fin.totalExpenses || 0,
            resultat: fin.resultat || 0,
            totalBankMUR: fin.totalBankMUR || 0,
            totalDocuments: fin.totalDocuments || 0,
            totalEcritures: fin.totalEcritures || 0,
            immobilisations: fin.immobilisations || 0,
            stocks: fin.stocks || 0,
            creances: fin.creances || 0,
            autresCreances: fin.autresCreances || 0,
            capitauxPropres: fin.capitauxPropres || 0,
            emprunts: fin.emprunts || 0,
            dettesFournisseurs: fin.dettesFournisseurs || 0,
            dettesFiscales: fin.dettesFiscales || 0,
            dettesSociales: fin.dettesSociales || 0,
            revenueByAccount: fin.revenueByAccount || {},
            expensesByAccount: fin.expensesByAccount || {},
            ecritures: fin.ecritures || [],
          },
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('cabclt.soc.error_occurred', locale))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [clientId, societeId])

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("societe_id", societeId)

      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        const respData = await res.json()
        if (res.ok) {
          setUploadedFiles(prev => [{ name: file.name, status: t('cabclt.soc.processing', locale), date: new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB'), type: t('cabclt.soc.detecting', locale) }, ...prev])
          setUploadSuccess(`${file.name} ${t('cabclt.soc.upload_success', locale)}`)
        } else {
          setUploadError(respData.error || t('cabclt.soc.upload_error', locale))
        }
      } catch {
        setUploadError(t('cabclt.soc.connection_error', locale))
      }
    }
    setUploading(false)
    setTimeout(() => { setUploadSuccess(null); setUploadError(null) }, 5000)
  }, [societeId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }, [handleUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true) }, [])
  const handleDragLeave = useCallback(() => setDragActive(false), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-2 text-sm mb-8">
          <Link href="/comptable/clients" className="text-muted-foreground hover:text-foreground">{t('cabclt.soc.portfolio', locale)}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link href={`/comptable/clients/${clientId}`} className="text-muted-foreground hover:text-foreground">{t('cabclt.soc.client', locale)}</Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-base">{error || t('cabclt.soc.company_not_found', locale)}</p>
            <p className="text-sm">{t('cabclt.soc.check_link', locale)}</p>
            <Link href={`/comptable/clients/${clientId}`}>
              <Button variant="outline" className="mt-2 gap-2" style={{ borderColor: NAVY, color: NAVY }}>
                <ArrowLeft className="h-4 w-4" /> {t('cabclt.soc.back_to_client', locale)}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { clientName, societeName, kpis, fournisseurs, facturesClients, banque, salaires, charges, tva, dossiers, grandLivre, alertes, financial } = data
  const fin = financial || {} as FinancialRaw

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/comptable/clients" className="text-muted-foreground hover:text-foreground">{t('cabclt.soc.portfolio', locale)}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link href={`/comptable/clients/${clientId}`} className="text-muted-foreground hover:text-foreground">{clientName}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium" style={{ color: NAVY }}>{societeName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/comptable/clients/${clientId}`}><ArrowLeft className="mr-1 h-4 w-4" />{t('cabclt.soc.back_to_client', locale)}</Link>
          </Button>
        </div>
      </div>

      {/* Société info header */}
      <Card style={{ borderLeft: `4px solid ${GOLD}`, backgroundColor: `${NAVY}06` }}>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col md:flex-row md:items-start gap-4">
            <div
              className="flex items-center justify-center h-12 w-12 rounded-lg text-white font-bold text-lg shrink-0"
              style={{ backgroundColor: NAVY }}
            >
              <Building2 className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold" style={{ color: NAVY }}>{societeName}</h1>
                {societeInfo?.statut_tva && (
                  <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">{t('cabclt.soc.vat_registered', locale)}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {societeInfo?.brn && (
                  <span className="flex items-center gap-1">
                    <FileIcon className="h-3.5 w-3.5" />
                    {t('cabclt.soc.brn_label', locale)} <strong>{societeInfo.brn}</strong>
                  </span>
                )}
                {clientInfo?.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {clientInfo.email}
                  </span>
                )}
                {clientInfo?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {clientInfo.phone}
                  </span>
                )}
              </div>
            </div>
            {/* Quick module links */}
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link href={`/comptable/clients/${clientId}/${societeId}/grand-livre`}>
                <Button variant="outline" size="sm" className="gap-1 text-xs" style={{ borderColor: `${NAVY}50`, color: NAVY }}>
                  <BookOpen className="h-3 w-3" />{t('cabclt.soc.general_ledger', locale)}
                </Button>
              </Link>
              <Link href={`/comptable/clients/${clientId}/${societeId}/balance`}>
                <Button variant="outline" size="sm" className="gap-1 text-xs" style={{ borderColor: `${NAVY}50`, color: NAVY }}>
                  <Scale className="h-3 w-3" />{t('cabclt.soc.trial_balance', locale)}
                </Button>
              </Link>
              <Link href={`/comptable/clients/${clientId}/${societeId}/bilan`}>
                <Button variant="outline" size="sm" className="gap-1 text-xs" style={{ borderColor: `${NAVY}50`, color: NAVY }}>
                  <TrendingUp className="h-3 w-3" />{t('cabclt.soc.balance_sheet_pl', locale)}
                </Button>
              </Link>
              <Link href={`/comptable/clients/${clientId}/${societeId}/tva`}>
                <Button variant="outline" size="sm" className="gap-1 text-xs" style={{ borderColor: `${NAVY}50`, color: NAVY }}>
                  <Receipt className="h-3 w-3" />{t('cabclt.soc.vat', locale)}
                </Button>
              </Link>
              <Link href={`/comptable/clients/${clientId}/${societeId}/it-form3`}>
                <Button variant="outline" size="sm" className="gap-1 text-xs" style={{ borderColor: `${NAVY}50`, color: NAVY }}>
                  <FileIcon className="h-3 w-3" />IT Form 3
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {kpis.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <Card key={k.label}><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className={`text-lg font-bold ${k.green ? "text-green-700" : ""}`} style={!k.green ? { color: NAVY } : undefined}>{fmt(k.value)}</p>
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: t('cabclt.soc.kpi_revenue_month', locale), icon: TrendingUp },
            { label: t('cabclt.soc.kpi_expenses', locale), icon: TrendingDown },
            { label: t('cabclt.soc.kpi_profit', locale), icon: BarChart3 },
            { label: t('cabclt.soc.kpi_vat_net', locale), icon: Calculator },
            { label: t('cabclt.soc.kpi_treasury', locale), icon: Landmark },
            { label: t('cabclt.soc.kpi_payroll_mass', locale), icon: Wallet },
          ].map((k) => (
            <Card key={k.label}><CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className="text-lg font-bold text-muted-foreground/40">—</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">{t('cabclt.soc.tab_overview', locale)}</TabsTrigger>
          <TabsTrigger value="fournisseurs">{t('cabclt.soc.tab_suppliers', locale)}</TabsTrigger>
          <TabsTrigger value="clients">{t('cabclt.soc.tab_client_invoices', locale)}</TabsTrigger>
          <TabsTrigger value="banque">{t('cabclt.soc.tab_bank', locale)}</TabsTrigger>
          <TabsTrigger value="salaires">{t('cabclt.soc.tab_salaries', locale)}</TabsTrigger>
          <TabsTrigger value="charges">{t('cabclt.soc.tab_social_charges', locale)}</TabsTrigger>
          <TabsTrigger value="tva">{t('cabclt.soc.tab_vat_mra', locale)}</TabsTrigger>
          <TabsTrigger value="grand-livre">{t('cabclt.soc.general_ledger', locale)}</TabsTrigger>
          <TabsTrigger value="etats-financiers">{t('cabclt.soc.tab_financial_statements', locale)}</TabsTrigger>
          <TabsTrigger value="immobilisations">{t('cabclt.soc.tab_fixed_assets', locale)}</TabsTrigger>
          <TabsTrigger value="documents">{t('cabclt.soc.tab_documents', locale)}</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="alertes">{t('cabclt.soc.tab_alerts', locale)}</TabsTrigger>
        </TabsList>

        {/* Quick links to full pages */}
        <div className="flex flex-wrap gap-2 -mt-2">
          <Link href={`/comptable/clients/${clientId}/${societeId}/tableau-de-bord`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><BarChart3 className="h-3 w-3" />{t('cabclt.soc.dashboard', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/grand-livre`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><BarChart3 className="h-3 w-3" />{t('cabclt.soc.general_ledger', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/balance`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><Landmark className="h-3 w-3" />{t('cabclt.soc.trial_balance', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/bilan`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><FileIcon className="h-3 w-3" />{t('cabclt.soc.balance_sheet_pl', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/far`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><Building2 className="h-3 w-3" />{t('cabclt.soc.far_immo', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/it-form3`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><FileIcon className="h-3 w-3" />IT Form 3</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/annual-return`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><FileIcon className="h-3 w-3" />Annual Return</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/previsionnel`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><TrendingUp className="h-3 w-3" />{t('cabclt.soc.forecast', locale)}</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/simulations`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><Calculator className="h-3 w-3" />{t('cabclt.soc.simulations', locale)}</Button>
          </Link>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          {fin.totalEcritures > 0 || fin.totalDocuments > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('cabclt.soc.kpi_revenue', locale)}</CardTitle>
                    <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(fin.totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.class7_accounts', locale)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('cabclt.soc.kpi_expenses', locale)}</CardTitle>
                    <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" style={{ color: "#EF4444" }}>{fmt(fin.totalExpenses)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.class6_accounts', locale)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('cabclt.soc.kpi_profit', locale)}</CardTitle>
                    <BarChart3 className="h-5 w-5" style={{ color: GOLD }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" style={{ color: fin.resultat >= 0 ? "#22C55E" : "#EF4444" }}>{fmt(fin.resultat)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.revenue_minus_expenses', locale)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t('cabclt.soc.kpi_treasury', locale)}</CardTitle>
                    <Landmark className="h-5 w-5" style={{ color: NAVY }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(fin.totalBankMUR)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.total_bank_balance', locale)}</p>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm" style={{ color: NAVY }}>{t('cabclt.soc.documents_processed', locale)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold" style={{ color: GOLD }}>{fin.totalDocuments}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.documents_processed_desc', locale)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm" style={{ color: NAVY }}>{t('cabclt.soc.accounting_entries', locale)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold" style={{ color: GOLD }}>{fin.totalEcritures}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cabclt.soc.accounting_entries_desc', locale)}</p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <EmptyTab icon={BarChart3} message={t('cabclt.soc.empty_overview', locale)} detail={t('cabclt.soc.empty_overview_detail', locale)} />
          )}
        </TabsContent>

        {/* Fournisseurs */}
        <TabsContent value="fournisseurs">
          {fournisseurs.length === 0 ? (
            <EmptyTab icon={FileIcon} message={t('cabclt.soc.empty_suppliers', locale)} detail={t('cabclt.soc.empty_suppliers_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_supplier', locale)}</TableHead><TableHead>{t('cabclt.soc.col_number', locale)}</TableHead><TableHead>{t('cabclt.soc.col_date', locale)}</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_ht', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_vat', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_ttc', locale)}</TableHead>
                <TableHead>{t('cabclt.soc.col_due', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead>{t('cabclt.soc.col_account', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{fournisseurs.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.fournisseur}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut, locale)}</TableCell><TableCell><Badge variant="outline">{f.compte}</Badge></TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* Factures Clients */}
        <TabsContent value="clients">
          {facturesClients.length === 0 ? (
            <EmptyTab icon={FileIcon} message={t('cabclt.soc.empty_client_invoices', locale)} detail={t('cabclt.soc.empty_client_invoices_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_client', locale)}</TableHead><TableHead>{t('cabclt.soc.col_number', locale)}</TableHead><TableHead>{t('cabclt.soc.col_date', locale)}</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_ht', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_vat', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_ttc', locale)}</TableHead>
                <TableHead>{t('cabclt.soc.col_due', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_delay', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{facturesClients.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.client}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut, locale)}</TableCell><TableCell className={`text-right ${f.jours>30?"text-red-600 font-bold":f.jours>0?"text-orange-600":""}`}>{f.jours>0?f.jours+t('cabclt.soc.days_short', locale):"—"}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* Banque */}
        <TabsContent value="banque" className="space-y-4">
          {banque.length === 0 ? (
            <EmptyTab icon={Landmark} message={t('cabclt.soc.empty_bank', locale)} detail={t('cabclt.soc.empty_bank_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_date', locale)}</TableHead><TableHead>{t('cabclt.soc.col_label', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_debit', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_credit', locale)}</TableHead>
                <TableHead>{t('cabclt.soc.col_party', locale)}</TableHead><TableHead>{t('cabclt.soc.col_account', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{banque.map((b,i)=>(<TableRow key={i} className={b.statut==="non_identifie"?"bg-red-50":b.statut==="a_verifier"?"bg-orange-50":""}><TableCell>{b.date}</TableCell><TableCell className="font-medium">{b.libelle}</TableCell><TableCell className="text-right text-red-600">{b.debit>0?fmt(b.debit):""}</TableCell><TableCell className="text-right text-green-600">{b.credit>0?fmt(b.credit):""}</TableCell><TableCell>{b.tiers}</TableCell><TableCell><Badge variant="outline">{b.compte}</Badge></TableCell><TableCell>{stBadge(b.statut, locale)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* Salaires */}
        <TabsContent value="salaires">
          {salaires.length === 0 ? (
            <EmptyTab icon={Wallet} message={t('cabclt.soc.empty_payslips', locale)} detail={t('cabclt.soc.empty_payslips_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_employee', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_gross', locale)}</TableHead><TableHead className="text-right">CSG 3%</TableHead><TableHead className="text-right">NSF 1.5%</TableHead><TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_net', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_employer_cost', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{salaires.map((s,i)=>(<TableRow key={i}><TableCell className="font-medium">{s.employe}</TableCell><TableCell className="text-right">{fmt(s.brut)}</TableCell><TableCell className="text-right">{fmt(s.csg)}</TableCell><TableCell className="text-right">{fmt(s.nsf)}</TableCell><TableCell className="text-right">{fmt(s.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(s.net)}</TableCell><TableCell className="text-right">{fmt(s.cout)}</TableCell><TableCell>{stBadge(s.statut, locale)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* Charges Sociales */}
        <TabsContent value="charges" className="space-y-4">
          {charges.length === 0 ? (
            <EmptyTab icon={Calculator} message={t('cabclt.soc.empty_social_charges', locale)} detail={t('cabclt.soc.empty_social_charges_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_period', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_csg_e', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_csg_p', locale)}</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_nsf_e', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_nsf_p', locale)}</TableHead><TableHead className="text-right">Training</TableHead><TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_total', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{charges.map((c,i)=>(<TableRow key={i}><TableCell className="font-medium">{c.periode}</TableCell><TableCell className="text-right">{fmt(c.csg_e)}</TableCell><TableCell className="text-right">{fmt(c.csg_p)}</TableCell><TableCell className="text-right">{fmt(c.nsf_e)}</TableCell><TableCell className="text-right">{fmt(c.nsf_p)}</TableCell><TableCell className="text-right">{fmt(c.training)}</TableCell><TableCell className="text-right">{fmt(c.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(c.total)}</TableCell><TableCell>{stBadge(c.statut, locale)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* TVA */}
        <TabsContent value="tva" className="space-y-4">
          {tva.length === 0 ? (
            <EmptyTab icon={Calculator} message={t('cabclt.soc.empty_vat', locale)} detail={t('cabclt.soc.empty_vat_detail', locale)} />
          ) : (
            <Card><CardContent className="p-0">
              <Table><TableHeader><TableRow>
                <TableHead>{t('cabclt.soc.col_month', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_collected', locale)}</TableHead><TableHead className="text-right">{t('cabclt.soc.col_deductible', locale)}</TableHead>
                <TableHead className="text-right">{t('cabclt.soc.col_net_vat', locale)}</TableHead><TableHead>Deadline</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead><TableHead>{t('cabclt.soc.col_ref', locale)}</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>{tva.map((t,i)=>(<TableRow key={i}><TableCell className="font-medium">{t.mois}</TableCell><TableCell className="text-right">{fmt(t.collectee)}</TableCell><TableCell className="text-right">{fmt(t.deductible)}</TableCell><TableCell className="text-right font-semibold">{fmt(t.nette)}</TableCell><TableCell>{t.deadline}</TableCell><TableCell>{stBadge(t.statut, locale)}</TableCell><TableCell className="text-xs text-muted-foreground">{t.ref||"—"}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
              </Table></CardContent></Card>
          )}
        </TabsContent>

        {/* Grand Livre */}
        <TabsContent value="grand-livre" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold" style={{ color: NAVY }}>{t('cabclt.soc.general_ledger', locale)} — {societeName}</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">{t('cabclt.soc.export_excel', locale)}</Button>
              <Button variant="outline" size="sm">{t('cabclt.soc.print', locale)}</Button>
            </div>
          </div>
          {(fin.ecritures && fin.ecritures.length > 0) ? (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t('cabclt.soc.col_date', locale)}</TableHead><TableHead>{t('cabclt.soc.col_journal', locale)}</TableHead><TableHead>{t('cabclt.soc.col_voucher_no', locale)}</TableHead>
                  <TableHead>{t('cabclt.soc.col_account', locale)}</TableHead><TableHead>{t('cabclt.soc.col_label', locale)}</TableHead>
                  <TableHead className="text-right">{t('cabclt.soc.col_debit', locale)} (MUR)</TableHead><TableHead className="text-right">{t('cabclt.soc.col_credit', locale)} (MUR)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {fin.ecritures.map((e, i) => (
                    <TableRow key={e.id || i}>
                      <TableCell>{e.date_ecriture || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{e.journal || '—'}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.numero_piece || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="font-mono">{e.compte || '—'}</Badge></TableCell>
                      <TableCell className="font-medium">{e.libelle || '—'}</TableCell>
                      <TableCell className="text-right text-red-600">{e.debit > 0 ? fmt(e.debit) : ''}</TableCell>
                      <TableCell className="text-right text-green-600">{e.credit > 0 ? fmt(e.credit) : ''}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={5} className="text-right">{t('cabclt.soc.col_total', locale)}</TableCell>
                    <TableCell className="text-right text-red-600">{fmt(fin.ecritures.reduce((s, e) => s + (e.debit || 0), 0))}</TableCell>
                    <TableCell className="text-right text-green-600">{fmt(fin.ecritures.reduce((s, e) => s + (e.credit || 0), 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent></Card>
          ) : grandLivre.length > 0 ? (
            grandLivre.map((account) => (
              <Card key={account.compte}>
                <CardHeader className="py-3" style={{ backgroundColor: `${NAVY}08` }}>
                  <CardTitle className="text-sm">{t('cabclt.soc.col_account', locale).toUpperCase()}: {account.compte} — {account.nom}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t('cabclt.soc.col_date', locale)}</TableHead><TableHead>{t('cabclt.soc.col_ref', locale)}</TableHead><TableHead>{t('cabclt.soc.col_description', locale)}</TableHead>
                      <TableHead className="text-right">{t('cabclt.soc.col_debit', locale)} (MUR)</TableHead><TableHead className="text-right">{t('cabclt.soc.col_credit', locale)} (MUR)</TableHead><TableHead className="text-right">{t('cabclt.soc.col_balance', locale)} (MUR)</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {account.entries.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.date}</TableCell><TableCell className="text-xs">{e.ref}</TableCell><TableCell>{e.desc}</TableCell>
                          <TableCell className="text-right">{e.debit > 0 ? fmt(e.debit) : ""}</TableCell>
                          <TableCell className="text-right">{e.credit > 0 ? fmt(e.credit) : ""}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(e.solde)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyTab icon={FileIcon} message={t('cabclt.soc.empty_ledger', locale)} detail={t('cabclt.soc.empty_ledger_detail', locale)} />
          )}
        </TabsContent>

        {/* États Financiers */}
        <TabsContent value="etats-financiers" className="space-y-4">
          {fin.totalEcritures > 0 ? (() => {
            const immobilisations = fin.immobilisations || 0
            const creancesClients = fin.creances || 0
            const tresorerie = fin.totalBankMUR || 0
            const totalNonCurrentAssets = immobilisations
            const totalCurrentAssets = tresorerie + creancesClients
            const totalAssets = totalCurrentAssets + totalNonCurrentAssets

            const capitauxPropres = fin.capitauxPropres || 0
            const totalRevenue = fin.totalRevenue || 0
            const totalExpenses = fin.totalExpenses || 0
            const retainedEarnings = totalRevenue - totalExpenses
            const totalEquity = capitauxPropres + retainedEarnings

            const dettesFournisseurs = fin.dettesFournisseurs || 0
            const dettesFiscales = fin.dettesFiscales || 0
            const dettesSociales = fin.dettesSociales || 0
            const totalCurrentLiabilities = dettesFournisseurs + dettesFiscales + dettesSociales

            const totalEquityAndLiabilities = totalEquity + totalCurrentLiabilities

            const revenueByAccount: Record<string, number> = fin.revenueByAccount || {}
            const expensesByAccount: Record<string, number> = fin.expensesByAccount || {}
            const revenueDetails = Object.entries(revenueByAccount)
              .filter(([, v]) => v !== 0)
              .sort(([a], [b]) => a.localeCompare(b))
            const allExpenseGroups = groupExpenses(expensesByAccount)
            const profitBeforeTax = totalRevenue - totalExpenses
            const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * 0.15 : 0
            const netProfit = profitBeforeTax - incomeTax

            const amtCell = (n: number) => {
              const s: React.CSSProperties = {}
              if (n > 0) s.color = "#16A34A"
              if (n < 0) s.color = "#DC2626"
              const d = n < 0 ? `(${fmt2(Math.abs(n))})` : fmt2(n)
              return { d, s }
            }

            const SectionHdr = ({ label }: { label: string }) => (
              <TableRow>
                <TableCell colSpan={3} className="text-sm font-bold pt-5 pb-2 border-b">{label}</TableCell>
              </TableRow>
            )
            const SubLine = ({ label, current }: { label: string; current: number }) => {
              const a = amtCell(current)
              return (
                <TableRow>
                  <TableCell className="pl-8 text-sm py-2">{label}</TableCell>
                  <TableCell className="text-right text-sm font-mono tabular-nums py-2" style={a.s}>{a.d}</TableCell>
                  <TableCell className="text-right text-sm font-mono tabular-nums py-2 text-muted-foreground">{"\u2014"}</TableCell>
                </TableRow>
              )
            }
            const TotLine = ({ label, current, grand = false }: { label: string; current: number; grand?: boolean }) => {
              const a = amtCell(current)
              return (
                <TableRow className={grand ? "border-t-2 border-b-2" : "border-t"}>
                  <TableCell className={`text-sm py-2 ${grand ? "font-bold text-base" : "font-bold"}`}>{label}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums py-2 ${grand ? "font-bold text-base" : "text-sm font-bold"}`} style={a.s}>{a.d}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums py-2 text-muted-foreground ${grand ? "text-base" : "text-sm"}`}>{"\u2014"}</TableCell>
                </TableRow>
              )
            }

            return (
              <div className="max-w-[900px] mx-auto space-y-6">
                <div className="text-center space-y-1">
                  <h1 className="text-2xl font-bold">{societeName.toUpperCase()}</h1>
                  <p className="text-sm text-muted-foreground">
                    Prepared in accordance with IFRS for SMEs &mdash; Companies Act 2001 Mauritius
                  </p>
                </div>

                <Tabs defaultValue="balance-sheet" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
                    <TabsTrigger value="profit-loss">Profit &amp; Loss</TabsTrigger>
                  </TabsList>

                  <TabsContent value="balance-sheet">
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/2">Poste</TableHead>
                            <TableHead className="text-right">2025-2026 (MUR)</TableHead>
                            <TableHead className="text-right">2024-2025 (MUR)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SectionHdr label="NON-CURRENT ASSETS" />
                          <SubLine label="Property, Plant & Equipment" current={immobilisations} />
                          <SubLine label="Intangible Assets" current={0} />
                          <TotLine label="Total Non-Current Assets" current={totalNonCurrentAssets} />

                          <SectionHdr label="CURRENT ASSETS" />
                          <SubLine label="Trade Receivables" current={creancesClients} />
                          <SubLine label="Cash & Bank" current={tresorerie} />
                          <TotLine label="Total Current Assets" current={totalCurrentAssets} />

                          <TotLine label="TOTAL ASSETS" current={totalAssets} grand />

                          <SectionHdr label="EQUITY" />
                          <SubLine label="Share Capital" current={capitauxPropres} />
                          <SubLine label="Retained Earnings" current={retainedEarnings} />
                          <TotLine label="Total Equity" current={totalEquity} />

                          <SectionHdr label="CURRENT LIABILITIES" />
                          <SubLine label="Trade Payables" current={dettesFournisseurs} />
                          <SubLine label="VAT Payable" current={dettesFiscales} />
                          <SubLine label="CSG/NSF/PAYE Payable" current={dettesSociales} />
                          <TotLine label="Total Current Liabilities" current={totalCurrentLiabilities} />

                          <TotLine label="TOTAL EQUITY & LIABILITIES" current={totalEquityAndLiabilities} grand />
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="profit-loss">
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/2">Poste</TableHead>
                            <TableHead className="text-right">2025-2026 (MUR)</TableHead>
                            <TableHead className="text-right">2024-2025 (MUR)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SectionHdr label="REVENUE" />
                          {revenueDetails.map(([prefix, amount]) => (
                            <SubLine key={prefix} label={REVENUE_LABELS[prefix] || `Compte ${prefix}x`} current={amount} />
                          ))}
                          {revenueDetails.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">{t('cabclt.soc.no_revenue', locale)}</TableCell>
                            </TableRow>
                          )}
                          <TotLine label="TOTAL REVENUE" current={totalRevenue} />

                          <SectionHdr label="OPERATING EXPENSES" />
                          {allExpenseGroups.map((group) => (
                            <SubLine key={group.label} label={`${group.label} (${group.range})`} current={-group.amount} />
                          ))}
                          {allExpenseGroups.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">{t('cabclt.soc.no_expense', locale)}</TableCell>
                            </TableRow>
                          )}
                          <TotLine label="TOTAL EXPENSES" current={-totalExpenses} />

                          <TotLine label="PROFIT BEFORE TAX" current={profitBeforeTax} />
                          <SubLine label="Income Tax (15%)" current={-incomeTax} />
                          <TotLine label="NET PROFIT" current={netProfit} grand />
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground italic">
                    All amounts are in Mauritian Rupees (MUR)
                  </p>
                </div>
              </div>
            )
          })() : (
            <EmptyTab icon={FileIcon} message={t('cabclt.soc.empty_fs', locale)} detail={t('cabclt.soc.empty_fs_detail', locale)} />
          )}
        </TabsContent>

        {/* Immobilisations */}
        <TabsContent value="immobilisations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold" style={{ color: NAVY }}>{t('cabclt.soc.fixed_assets_register', locale)} — {societeName}</h3>
            <Button size="sm" style={{ backgroundColor: GOLD }}>+ {t('cabclt.soc.add_asset', locale)}</Button>
          </div>
          <EmptyTab icon={Landmark} message={t('cabclt.soc.empty_fixed_assets', locale)} detail={t('cabclt.soc.empty_fixed_assets_detail', locale)} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-4">
          {/* Upload Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? "border-amber-400 bg-amber-50" : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.jpeg,.jpg,.png,.xlsx" onChange={(e) => handleUpload(e.target.files)} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
                <p className="text-sm text-muted-foreground">{t('cabclt.soc.uploading', locale)}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{t('cabclt.soc.drop_files_here', locale)}</p>
                <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, XLSX — max 10 MB</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => fileInputRef.current?.click()}>{t('cabclt.soc.browse', locale)}</Button>
              </div>
            )}
          </div>

          {uploadSuccess && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{uploadSuccess}</div>}
          {uploadError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2"><AlertIcon className="h-4 w-4" />{uploadError}</div>}

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{t('cabclt.soc.uploaded_documents', locale)}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('cabclt.soc.col_file', locale)}</TableHead><TableHead>{t('cabclt.soc.col_date', locale)}</TableHead><TableHead>{t('cabclt.soc.col_detected_type', locale)}</TableHead><TableHead>{t('cabclt.soc.col_status', locale)}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {uploadedFiles.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="flex items-center gap-2"><FileIcon className="h-4 w-4 text-muted-foreground" />{f.name}</TableCell>
                        <TableCell>{f.date}</TableCell>
                        <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                        <TableCell><Badge className="bg-blue-100 text-blue-700">{f.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Dossiers */}
          <div>
            <h3 className="font-semibold mb-3" style={{ color: NAVY }}>{t('cabclt.soc.company_folders', locale)}</h3>
            {dossiers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium">{t('cabclt.soc.no_folder', locale)}</p>
                <p className="text-sm">{t('cabclt.soc.folders_auto_created', locale)}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {dossiers.map((d,i)=>(
                  <Card key={i} className={`cursor-pointer hover:bg-muted/50 ${d.count===0?"opacity-50":""}`} onClick={() => setSelectedDossier(selectedDossier === d.nom ? null : d.nom)}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-5 w-5" style={{ color: GOLD }} />
                        <div><p className="text-sm font-medium">{d.nom}</p><p className="text-xs text-muted-foreground">{d.count} {d.count!==1 ? t('cabclt.soc.docs_plural', locale) : t('cabclt.soc.docs_singular', locale)}{d.count===0 ? ' — ' + t('cabclt.soc.empty_label', locale) : ''}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.anomalies>0&&<Badge className="bg-red-100 text-red-700">{d.anomalies} {d.anomalies>1 ? t('cabclt.soc.anomalies_plural', locale) : t('cabclt.soc.anomaly_singular', locale)}</Badge>}
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedDossier===d.nom?"rotate-90":""}`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pnl" className="space-y-4">
          {fin.totalEcritures > 0 ? (() => {
            const revenueByAccount: Record<string, number> = fin.revenueByAccount || {}
            const expensesByAccount: Record<string, number> = fin.expensesByAccount || {}
            const totalRevenue = fin.totalRevenue || 0
            const totalExpenses = fin.totalExpenses || 0
            const revenueDetails = Object.entries(revenueByAccount)
              .filter(([, v]) => v !== 0)
              .sort(([a], [b]) => a.localeCompare(b))
            const allExpenseGroups = groupExpenses(expensesByAccount)
            const profitBeforeTax = totalRevenue - totalExpenses
            const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * 0.15 : 0
            const netProfit = profitBeforeTax - incomeTax

            const amtCell = (n: number) => {
              const s: React.CSSProperties = {}
              if (n > 0) s.color = "#16A34A"
              if (n < 0) s.color = "#DC2626"
              const d = n < 0 ? `(${fmt2(Math.abs(n))})` : fmt2(n)
              return { d, s }
            }

            const SectionHdr = ({ label }: { label: string }) => (
              <TableRow>
                <TableCell colSpan={3} className="text-sm font-bold pt-5 pb-2 border-b">{label}</TableCell>
              </TableRow>
            )
            const SubLine = ({ label, current }: { label: string; current: number }) => {
              const a = amtCell(current)
              return (
                <TableRow>
                  <TableCell className="pl-8 text-sm py-2">{label}</TableCell>
                  <TableCell className="text-right text-sm font-mono tabular-nums py-2" style={a.s}>{a.d}</TableCell>
                  <TableCell className="text-right text-sm font-mono tabular-nums py-2 text-muted-foreground">{"\u2014"}</TableCell>
                </TableRow>
              )
            }
            const TotLine = ({ label, current, grand = false }: { label: string; current: number; grand?: boolean }) => {
              const a = amtCell(current)
              return (
                <TableRow className={grand ? "border-t-2 border-b-2" : "border-t"}>
                  <TableCell className={`text-sm py-2 ${grand ? "font-bold text-base" : "font-bold"}`}>{label}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums py-2 ${grand ? "font-bold text-base" : "text-sm font-bold"}`} style={a.s}>{a.d}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums py-2 text-muted-foreground ${grand ? "text-base" : "text-sm"}`}>{"\u2014"}</TableCell>
                </TableRow>
              )
            }

            return (
              <div className="max-w-[900px] mx-auto space-y-6">
                <div className="text-center space-y-1">
                  <h1 className="text-2xl font-bold">{societeName.toUpperCase()}</h1>
                  <p className="text-sm text-muted-foreground">
                    Prepared in accordance with IFRS for SMEs &mdash; Companies Act 2001 Mauritius
                  </p>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/2">Poste</TableHead>
                        <TableHead className="text-right">2025-2026 (MUR)</TableHead>
                        <TableHead className="text-right">2024-2025 (MUR)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SectionHdr label="REVENUE" />
                      {revenueDetails.map(([prefix, amount]) => (
                        <SubLine key={prefix} label={REVENUE_LABELS[prefix] || `Compte ${prefix}x`} current={amount} />
                      ))}
                      {revenueDetails.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">{t('cabclt.soc.no_revenue', locale)}</TableCell>
                        </TableRow>
                      )}
                      <TotLine label="TOTAL REVENUE" current={totalRevenue} />

                      <SectionHdr label="OPERATING EXPENSES" />
                      {allExpenseGroups.map((group) => (
                        <SubLine key={group.label} label={`${group.label} (${group.range})`} current={-group.amount} />
                      ))}
                      {allExpenseGroups.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">{t('cabclt.soc.no_expense', locale)}</TableCell>
                        </TableRow>
                      )}
                      <TotLine label="TOTAL EXPENSES" current={-totalExpenses} />

                      <TotLine label="PROFIT BEFORE TAX" current={profitBeforeTax} />
                      <SubLine label="Income Tax (15%)" current={-incomeTax} />
                      <TotLine label="NET PROFIT" current={netProfit} grand />
                    </TableBody>
                  </Table>
                </div>

                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground italic">
                    All amounts are in Mauritian Rupees (MUR)
                  </p>
                </div>
              </div>
            )
          })() : (
            <EmptyTab icon={BarChart3} message={t('cabclt.soc.empty_pnl', locale)} detail={t('cabclt.soc.empty_pnl_detail', locale)} />
          )}
        </TabsContent>

        {/* Alertes */}
        <TabsContent value="alertes" className="space-y-3">
          {alertes.length === 0 ? (
            <EmptyTab icon={AlertIcon} message={t('cabclt.soc.empty_alerts', locale)} detail={t('cabclt.soc.empty_alerts_detail', locale)} />
          ) : (
            alertes.map((a,i)=>(
              <Card key={i}><CardContent className="flex items-start gap-3 py-4">
                <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${a.niveau==="critique"?"bg-red-500":a.niveau==="important"?"bg-orange-500":"bg-blue-500"}`} />
                <div className="flex-1">
                  <Badge className={a.niveau==="critique"?"bg-red-100 text-red-800":a.niveau==="important"?"bg-orange-100 text-orange-800":"bg-blue-100 text-blue-800"}>{a.niveau==="critique" ? t('cabclt.soc.lvl_critical', locale) : a.niveau==="important" ? t('cabclt.soc.lvl_important', locale) : t('cabclt.soc.lvl_info', locale)}</Badge>
                  <p className="text-sm font-medium mt-1">{a.titre}</p><p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
                <div className="text-right shrink-0"><p className="text-sm font-semibold">{fmt(a.montant)}</p>{a.echeance&&<p className="text-xs text-muted-foreground">{a.echeance}</p>}</div>
                <Button variant="outline" size="sm">{t('cabclt.soc.action_process', locale)}</Button>
              </CardContent></Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
