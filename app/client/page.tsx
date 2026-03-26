"use client"

import { useState, useEffect, useMemo } from "react"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  AlertTriangle,
  Banknote,
  Clock,
  CheckCircle,
  FileText,
  Building2,
  ShieldCheck,
  Info,
  Loader2,
  User,
} from "lucide-react"

interface AssignedSociete {
  id: string
  dossier_id: string
  nom: string
  brn?: string
  numero_tva_mra?: string
  statut_tva?: string
  comptable?: { id: string; full_name: string; email: string; phone?: string | null } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency = "MUR"): string {
  return `${currency} ${amount.toLocaleString("en-US")}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Mock data — Performance par société
// ---------------------------------------------------------------------------

interface SocietePerf {
  societe: string
  ca: number
  charges: number
  resultatNet: number
  margePct: number
  tvaCollectee: number
  tvaDeductible: number
  tvaAPayer: number
  tresorerie: number
  impayesClients: number
  fournisseursDus: number
  npfHrdcDus: number
  payeDus: number
  statut: "En attente" | "À jour"
}

const performanceData: SocietePerf[] = [
  {
    societe: "TIBOK",
    ca: 4_500_000,
    charges: 3_200_000,
    resultatNet: 1_300_000,
    margePct: 28.9,
    tvaCollectee: 675_000,
    tvaDeductible: 480_000,
    tvaAPayer: 195_000,
    tresorerie: 3_340_000,
    impayesClients: 450_000,
    fournisseursDus: 320_000,
    npfHrdcDus: 85_000,
    payeDus: 120_000,
    statut: "En attente",
  },
  {
    societe: "BPO COMPANY",
    ca: 2_800_000,
    charges: 2_350_000,
    resultatNet: 450_000,
    margePct: 16.1,
    tvaCollectee: 420_000,
    tvaDeductible: 352_500,
    tvaAPayer: 67_500,
    tresorerie: 1_200_000,
    impayesClients: 180_000,
    fournisseursDus: 210_000,
    npfHrdcDus: 62_000,
    payeDus: 95_000,
    statut: "À jour",
  },
  {
    societe: "OBESITY CARE CLINIC MALTA",
    ca: 1_200_000,
    charges: 1_050_000,
    resultatNet: 150_000,
    margePct: 12.5,
    tvaCollectee: 180_000,
    tvaDeductible: 157_500,
    tvaAPayer: 22_500,
    tresorerie: 120_000,
    impayesClients: 95_000,
    fournisseursDus: 78_000,
    npfHrdcDus: 0,
    payeDus: 0,
    statut: "À jour",
  },
  {
    societe: "NHS S2 CROSS-BORDER",
    ca: 850_000,
    charges: 920_000,
    resultatNet: -70_000,
    margePct: -8.2,
    tvaCollectee: 127_500,
    tvaDeductible: 138_000,
    tvaAPayer: -10_500,
    tresorerie: 85_000,
    impayesClients: 210_000,
    fournisseursDus: 45_000,
    npfHrdcDus: 0,
    payeDus: 0,
    statut: "En attente",
  },
]

function totals(data: SocietePerf[]) {
  const sum = (fn: (r: SocietePerf) => number) =>
    data.reduce((a, r) => a + fn(r), 0)
  const ca = sum((r) => r.ca)
  const charges = sum((r) => r.charges)
  const resultatNet = sum((r) => r.resultatNet)
  return {
    ca,
    charges,
    resultatNet,
    margePct: ca > 0 ? (resultatNet / ca) * 100 : 0,
    tvaCollectee: sum((r) => r.tvaCollectee),
    tvaDeductible: sum((r) => r.tvaDeductible),
    tvaAPayer: sum((r) => r.tvaAPayer),
    tresorerie: sum((r) => r.tresorerie),
    impayesClients: sum((r) => r.impayesClients),
    fournisseursDus: sum((r) => r.fournisseursDus),
    npfHrdcDus: sum((r) => r.npfHrdcDus),
    payeDus: sum((r) => r.payeDus),
  }
}

// ---------------------------------------------------------------------------
// Mock data — Alertes
// ---------------------------------------------------------------------------

interface Alerte {
  priorite: "URGENT" | "MOYEN" | "INFO"
  type: string
  societe: string
  description: string
  montant: string
  echeance: string
  joursRestants: number
  action: string
}

const alertes: Alerte[] = [
  {
    priorite: "URGENT",
    type: "Impayé client",
    societe: "TIBOK",
    description: "Facture #INV-2025-0847 — Client Mauritius Telecom",
    montant: "MUR 450,000",
    echeance: "2026-03-15",
    joursRestants: -10,
    action: "Relancer client",
  },
  {
    priorite: "MOYEN",
    type: "Échéance NPF",
    societe: "BPO COMPANY",
    description: "Cotisations NPF Q1 2026",
    montant: "MUR 62,000",
    echeance: "2026-04-15",
    joursRestants: 21,
    action: "Préparer paiement",
  },
  {
    priorite: "MOYEN",
    type: "TVA à déclarer",
    societe: "TIBOK",
    description: "Déclaration TVA mensuelle mars 2026",
    montant: "MUR 195,000",
    echeance: "2026-04-20",
    joursRestants: 26,
    action: "Soumettre MRA",
  },
  {
    priorite: "INFO",
    type: "Rapprochement",
    societe: "BPO COMPANY",
    description: "Relevé bancaire MCB — 12 écritures à valider",
    montant: "-",
    echeance: "2026-03-31",
    joursRestants: 6,
    action: "Valider écritures",
  },
]

// ---------------------------------------------------------------------------
// Mock data — Trésorerie par compte bancaire
// ---------------------------------------------------------------------------

interface CompteBancaire {
  societe: string
  banque: string
  noCompte: string
  devise: string
  solde: number
  derniereMAJ: string
  statut: "À jour"
}

const comptesBancaires: CompteBancaire[] = [
  { societe: "TIBOK", banque: "MCB Mauritius", noCompte: "ACC-MCB-001", devise: "MUR", solde: 2_450_000, derniereMAJ: "2026-03-24", statut: "À jour" },
  { societe: "TIBOK", banque: "SBM Bank", noCompte: "ACC-SBM-001", devise: "MUR", solde: 890_000, derniereMAJ: "2026-03-24", statut: "À jour" },
  { societe: "BPO COMPANY", banque: "MCB Mauritius", noCompte: "ACC-MCB-002", devise: "MUR", solde: 1_200_000, derniereMAJ: "2026-03-23", statut: "À jour" },
  { societe: "BPO COMPANY", banque: "CIC France", noCompte: "00096355901", devise: "EUR", solde: 45_000, derniereMAJ: "2026-03-20", statut: "À jour" },
  { societe: "OBESITY CARE CLINIC MALTA", banque: "Bank of Valletta", noCompte: "ACC-BOV-001", devise: "EUR", solde: 120_000, derniereMAJ: "2026-03-22", statut: "À jour" },
  { societe: "NHS S2 CROSS-BORDER", banque: "Barclays UK", noCompte: "ACC-BAR-001", devise: "GBP", solde: 85_000, derniereMAJ: "2026-03-21", statut: "À jour" },
]

// ---------------------------------------------------------------------------
// Mock data — TVA prochaines échéances
// ---------------------------------------------------------------------------

interface TVAEcheance {
  societe: string
  moisTVA: string
  tvaCollectee: number
  tvaDeductible: number
  montantAPayer: number
  deadline: string
  devise: string
  statut: "À déclarer" | "Déclaré" | "En retard"
}

const tvaEcheances: TVAEcheance[] = [
  { societe: "TIBOK", moisTVA: "Mars 2026", tvaCollectee: 675_000, tvaDeductible: 480_000, montantAPayer: 195_000, deadline: "2026-04-20", devise: "MUR", statut: "À déclarer" },
  { societe: "BPO COMPANY", moisTVA: "Mars 2026", tvaCollectee: 420_000, tvaDeductible: 352_500, montantAPayer: 67_500, deadline: "2026-04-20", devise: "MUR", statut: "À déclarer" },
  { societe: "OBESITY CARE CLINIC MALTA", moisTVA: "Mars 2026", tvaCollectee: 180_000, tvaDeductible: 157_500, montantAPayer: 22_500, deadline: "2026-04-20", devise: "EUR", statut: "Déclaré" },
  { societe: "NHS S2 CROSS-BORDER", moisTVA: "Mars 2026", tvaCollectee: 127_500, tvaDeductible: 138_000, montantAPayer: -10_500, deadline: "2026-04-20", devise: "GBP", statut: "En retard" },
]

// ---------------------------------------------------------------------------
// Mock data — client_user documents
// ---------------------------------------------------------------------------

const recentDocuments = [
  { id: "1", fichier: "facture_fournisseur_2026_03.pdf", date: "2026-03-24", type: "Facture fournisseur", statut: "Traité" },
  { id: "2", fichier: "releve_bancaire_feb.pdf", date: "2026-03-22", type: "Relevé bancaire", statut: "En cours" },
  { id: "3", fichier: "facture_client_0045.pdf", date: "2026-03-20", type: "Facture client", statut: "Traité" },
  { id: "4", fichier: "fiche_paie_mars_2026.xlsx", date: "2026-03-18", type: "Fiche de paie", statut: "En cours" },
  { id: "5", fichier: "charges_sociales_q1.pdf", date: "2026-03-15", type: "Charges sociales", statut: "Traité" },
]

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function MargeBadge({ pct }: { pct: number }) {
  const label = `${pct.toFixed(1)} %`
  if (pct > 15)
    return <Badge className="bg-green-100 text-green-700 border-green-200">{label}</Badge>
  if (pct >= 5)
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{label}</Badge>
  return <Badge className="bg-red-100 text-red-700 border-red-200">{label}</Badge>
}

function StatutSocieteBadge({ statut }: { statut: string }) {
  if (statut === "À jour")
    return <Badge className="bg-green-100 text-green-700 border-green-200">{statut}</Badge>
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{statut}</Badge>
}

function PrioriteDot({ priorite }: { priorite: Alerte["priorite"] }) {
  const colors: Record<string, string> = {
    URGENT: "bg-red-500",
    MOYEN: "bg-orange-500",
    INFO: "bg-blue-500",
  }
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[priorite]}`} />
      {priorite}
    </span>
  )
}

function TVAStatutBadge({ statut }: { statut: TVAEcheance["statut"] }) {
  if (statut === "Déclaré")
    return <Badge className="bg-green-100 text-green-700 border-green-200">{statut}</Badge>
  if (statut === "En retard")
    return <Badge className="bg-red-100 text-red-700 border-red-200">{statut}</Badge>
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{statut}</Badge>
}

function DocStatutBadge({ statut }: { statut: string }) {
  if (statut === "Traité")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Traité</Badge>
  if (statut === "En cours")
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">En cours</Badge>
  return <Badge variant="secondary">{statut}</Badge>
}

// ---------------------------------------------------------------------------
// Client User — simple view
// ---------------------------------------------------------------------------

function ClientUserDashboard({ name }: { name: string }) {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Bienvenue{name ? `, ${name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Voici un aperçu de vos documents.
        </p>
      </div>

      {/* Two summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Derniers documents uploadés
            </CardTitle>
            <FileText className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>12</div>
            <p className="text-xs text-muted-foreground mt-1">Ce mois-ci</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents en traitement
            </CardTitle>
            <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" style={{ color: "#C9A84C" }}>3</div>
            <p className="text-xs text-muted-foreground mt-1">En cours d{"'"}analyse</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent documents table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>Documents récents</CardTitle>
          <CardDescription>Les 5 derniers documents uploadés</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[250px]">{doc.fichier}</span>
                  </TableCell>
                  <TableCell>{formatDate(doc.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <DocStatutBadge statut={doc.statut} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Client Admin — consolidated accounting dashboard
// ---------------------------------------------------------------------------

function ClientAdminDashboard({
  name,
  assignedSocietes,
  loadingSocietes,
}: {
  name: string
  assignedSocietes: AssignedSociete[]
  loadingSocietes: boolean
}) {
  const [selectedSociete, setSelectedSociete] = useState<string>("all")

  // Names of assigned societes for filtering mock data
  const assignedNames = useMemo(
    () => assignedSocietes.map((s) => s.nom),
    [assignedSocietes],
  )

  // Helper: check if a societe name from mock data matches an assigned name
  const isAssigned = (mockName: string) =>
    assignedNames.length === 0 || assignedNames.includes(mockName)

  const matchesFilter = (mockName: string) =>
    selectedSociete === "all" || mockName === selectedSociete

  // Filtered datasets
  const filteredPerf = useMemo(
    () => performanceData.filter((r) => isAssigned(r.societe) && matchesFilter(r.societe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignedNames, selectedSociete],
  )

  const filteredAlertes = useMemo(
    () => alertes.filter((a) => isAssigned(a.societe) && matchesFilter(a.societe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignedNames, selectedSociete],
  )

  const filteredComptes = useMemo(
    () => comptesBancaires.filter((c) => isAssigned(c.societe) && matchesFilter(c.societe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignedNames, selectedSociete],
  )

  const filteredTVA = useMemo(
    () => tvaEcheances.filter((t) => isAssigned(t.societe) && matchesFilter(t.societe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignedNames, selectedSociete],
  )

  const t = totals(filteredPerf)

  // Comptable info — from selected societe or first available
  const comptableInfo = useMemo(() => {
    if (selectedSociete !== "all") {
      return assignedSocietes.find((s) => s.nom === selectedSociete)?.comptable ?? null
    }
    return assignedSocietes.find((s) => s.comptable)?.comptable ?? null
  }, [assignedSocietes, selectedSociete])

  if (loadingSocietes) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (assignedSocietes.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7" style={{ color: "#C9A84C" }} />
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Tableau de bord</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Info className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2" style={{ color: "#1E2A4A" }}>Aucune societe assignee</h2>
            <p className="text-muted-foreground">
              Votre comptable n{"'"}a pas encore assigne de societe a votre compte.
              Veuillez le contacter pour configurer votre dossier.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* ---- Section 1: Header + Filter ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-7 w-7" style={{ color: "#C9A84C" }} />
            <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              Tableau de bord consolide
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {name ? `${name} — ` : ""}Mauritius Revenue Authority (MRA) Compliant&nbsp;/&nbsp;TVA 15%
            {selectedSociete === "all" ? " / Multi-Societes" : ` / ${selectedSociete}`}
          </p>
          {comptableInfo && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Comptable : <strong>{comptableInfo.full_name}</strong> — {comptableInfo.email}
            </p>
          )}
        </div>

        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-[280px]">
            <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Toutes les societes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les societes</SelectItem>
            {assignedSocietes.map((s) => (
              <SelectItem key={s.id} value={s.nom}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---- Section 2: Performance par société ---- */}
      <Card className="overflow-hidden">
        <CardHeader
          className="rounded-t-xl py-3"
          style={{ backgroundColor: "#1E2A4A" }}
        >
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance par société
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Société</TableHead>
                  <TableHead className="font-semibold text-right">CA (MUR)</TableHead>
                  <TableHead className="font-semibold text-right">Charges</TableHead>
                  <TableHead className="font-semibold text-right">Résultat Net</TableHead>
                  <TableHead className="font-semibold text-center">Marge %</TableHead>
                  <TableHead className="font-semibold text-right">TVA Collectée</TableHead>
                  <TableHead className="font-semibold text-right">TVA Déductible</TableHead>
                  <TableHead className="font-semibold text-right">TVA à Payer</TableHead>
                  <TableHead className="font-semibold text-right">Trésorerie</TableHead>
                  <TableHead className="font-semibold text-right">Impayés Clients</TableHead>
                  <TableHead className="font-semibold text-right">Fournisseurs Dus</TableHead>
                  <TableHead className="font-semibold text-right">NPF/HRDC Dus</TableHead>
                  <TableHead className="font-semibold text-right">PAYE Dus</TableHead>
                  <TableHead className="font-semibold text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPerf.map((row) => (
                  <TableRow key={row.societe}>
                    <TableCell className="font-semibold" style={{ color: "#1E2A4A" }}>
                      {row.societe}
                    </TableCell>
                    <TableCell className="text-right">{fmt(row.ca)}</TableCell>
                    <TableCell className="text-right">{fmt(row.charges)}</TableCell>
                    <TableCell
                      className="text-right font-semibold"
                      style={{ color: row.resultatNet >= 0 ? "#16a34a" : "#dc2626" }}
                    >
                      {fmt(row.resultatNet)}
                    </TableCell>
                    <TableCell className="text-center">
                      <MargeBadge pct={row.margePct} />
                    </TableCell>
                    <TableCell className="text-right">{fmt(row.tvaCollectee)}</TableCell>
                    <TableCell className="text-right">{fmt(row.tvaDeductible)}</TableCell>
                    <TableCell className="text-right">{fmt(row.tvaAPayer)}</TableCell>
                    <TableCell className="text-right">{fmt(row.tresorerie)}</TableCell>
                    <TableCell className="text-right">{fmt(row.impayesClients)}</TableCell>
                    <TableCell className="text-right">{fmt(row.fournisseursDus)}</TableCell>
                    <TableCell className="text-right">{fmt(row.npfHrdcDus)}</TableCell>
                    <TableCell className="text-right">{fmt(row.payeDus)}</TableCell>
                    <TableCell className="text-center">
                      <StatutSocieteBadge statut={row.statut} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold" style={{ backgroundColor: "#f1f5f9" }}>
                  <TableCell style={{ color: "#1E2A4A" }}>TOTAL</TableCell>
                  <TableCell className="text-right">{fmt(t.ca)}</TableCell>
                  <TableCell className="text-right">{fmt(t.charges)}</TableCell>
                  <TableCell
                    className="text-right"
                    style={{ color: t.resultatNet >= 0 ? "#16a34a" : "#dc2626" }}
                  >
                    {fmt(t.resultatNet)}
                  </TableCell>
                  <TableCell className="text-center">
                    <MargeBadge pct={t.margePct} />
                  </TableCell>
                  <TableCell className="text-right">{fmt(t.tvaCollectee)}</TableCell>
                  <TableCell className="text-right">{fmt(t.tvaDeductible)}</TableCell>
                  <TableCell className="text-right">{fmt(t.tvaAPayer)}</TableCell>
                  <TableCell className="text-right">{fmt(t.tresorerie)}</TableCell>
                  <TableCell className="text-right">{fmt(t.impayesClients)}</TableCell>
                  <TableCell className="text-right">{fmt(t.fournisseursDus)}</TableCell>
                  <TableCell className="text-right">{fmt(t.npfHrdcDus)}</TableCell>
                  <TableCell className="text-right">{fmt(t.payeDus)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- Section 3: Alertes en cours ---- */}
      <Card className="overflow-hidden">
        <CardHeader className="rounded-t-xl py-3 bg-red-600">
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertes en cours
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-red-50">
                  <TableHead className="font-semibold">Priorité</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Société</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold text-right">Montant (MUR)</TableHead>
                  <TableHead className="font-semibold">Échéance</TableHead>
                  <TableHead className="font-semibold text-right">Jours Restants</TableHead>
                  <TableHead className="font-semibold">Action Requise</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlertes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Aucune alerte pour cette societe
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlertes.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <PrioriteDot priorite={a.priorite} />
                      </TableCell>
                      <TableCell>{a.type}</TableCell>
                      <TableCell className="font-semibold" style={{ color: "#1E2A4A" }}>
                        {a.societe}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate">{a.description}</TableCell>
                      <TableCell className="text-right">{a.montant}</TableCell>
                      <TableCell>{formatDate(a.echeance)}</TableCell>
                      <TableCell
                        className="text-right font-semibold"
                        style={{ color: a.joursRestants < 0 ? "#dc2626" : a.joursRestants <= 7 ? "#ea580c" : "#1E2A4A" }}
                      >
                        {a.joursRestants}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="cursor-pointer"
                          style={{ backgroundColor: "#1E2A4A", color: "#fff", borderColor: "#1E2A4A" }}
                        >
                          {a.action}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- Section 4: Trésorerie par compte bancaire ---- */}
      <Card className="overflow-hidden">
        <CardHeader className="rounded-t-xl py-3 bg-teal-700">
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Trésorerie par compte bancaire
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-teal-50">
                  <TableHead className="font-semibold">Société</TableHead>
                  <TableHead className="font-semibold">Banque</TableHead>
                  <TableHead className="font-semibold">N° Compte</TableHead>
                  <TableHead className="font-semibold">Devise</TableHead>
                  <TableHead className="font-semibold text-right">Solde</TableHead>
                  <TableHead className="font-semibold">Dernière MAJ</TableHead>
                  <TableHead className="font-semibold text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredComptes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun compte bancaire pour cette societe
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredComptes.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-semibold" style={{ color: "#1E2A4A" }}>
                        {c.societe}
                      </TableCell>
                      <TableCell>{c.banque}</TableCell>
                      <TableCell className="font-mono text-xs">{c.noCompte}</TableCell>
                      <TableCell>{c.devise}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(c.solde, c.devise)}
                      </TableCell>
                      <TableCell>{formatDate(c.derniereMAJ)}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          {c.statut}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- Section 5: TVA à déclarer — Prochaines échéances ---- */}
      <Card className="overflow-hidden">
        <CardHeader className="rounded-t-xl py-3 bg-amber-600">
          <CardTitle className="text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            TVA à déclarer — Prochaines échéances
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50">
                  <TableHead className="font-semibold">Société</TableHead>
                  <TableHead className="font-semibold">Mois TVA</TableHead>
                  <TableHead className="font-semibold text-right">TVA Collectée</TableHead>
                  <TableHead className="font-semibold text-right">TVA Déductible</TableHead>
                  <TableHead className="font-semibold text-right">Montant à Payer</TableHead>
                  <TableHead className="font-semibold">Deadline</TableHead>
                  <TableHead className="font-semibold text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTVA.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucune echeance TVA pour cette societe
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTVA.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-semibold" style={{ color: "#1E2A4A" }}>
                        {row.societe}
                      </TableCell>
                      <TableCell>{row.moisTVA}</TableCell>
                      <TableCell className="text-right">{fmt(row.tvaCollectee, row.devise)}</TableCell>
                      <TableCell className="text-right">{fmt(row.tvaDeductible, row.devise)}</TableCell>
                      <TableCell
                        className="text-right font-semibold"
                        style={{ color: row.montantAPayer >= 0 ? "#1E2A4A" : "#16a34a" }}
                      >
                        {fmt(row.montantAPayer, row.devise)}
                      </TableCell>
                      <TableCell>{formatDate(row.deadline)}</TableCell>
                      <TableCell className="text-center">
                        <TVAStatutBadge statut={row.statut} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ClientDashboard() {
  const { profile, loading } = useProfile()
  const fullName = profile?.full_name || ""
  const firstName = fullName.split(" ")[0] || ""
  const isClientUser = profile?.role === "client_user"

  const [assignedSocietes, setAssignedSocietes] = useState<AssignedSociete[]>([])
  const [loadingSocietes, setLoadingSocietes] = useState(true)

  useEffect(() => {
    if (loading || isClientUser) {
      setLoadingSocietes(false)
      return
    }
    async function fetchSocietes() {
      try {
        const res = await fetch("/api/client/societes")
        if (res.ok) {
          const data = await res.json()
          if (data.societes) setAssignedSocietes(data.societes)
        }
      } catch {
        console.error("Failed to fetch societes")
      } finally {
        setLoadingSocietes(false)
      }
    }
    fetchSocietes()
  }, [loading, isClientUser])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isClientUser) {
    return <ClientUserDashboard name={firstName} />
  }

  return (
    <ClientAdminDashboard
      name={fullName}
      assignedSocietes={assignedSocietes}
      loadingSocietes={loadingSocietes}
    />
  )
}
