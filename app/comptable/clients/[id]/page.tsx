"use client"

import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  FileText,
  Upload,
  Eye,
  Code,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  MessageCircle,
  Mail,
  Send,
  XCircle,
  Building2,
} from "lucide-react"

// --- Mock client data ---
const clientsData: Record<string, {
  name: string
  societe: string
  email: string
  telephone: string
  derniereActivite: string
}> = {
  "cl-001": {
    name: "Jean-Marc Dupont",
    societe: "TIBOK Ltd",
    email: "jm.dupont@tibok.mu",
    telephone: "+230 5712 3456",
    derniereActivite: "24 mars 2026",
  },
  "cl-002": {
    name: "Marie Lefèvre",
    societe: "BPO Services Ltd",
    email: "m.lefevre@bpo.mu",
    telephone: "+230 5789 1234",
    derniereActivite: "23 mars 2026",
  },
  "cl-003": {
    name: "Pierre Martin",
    societe: "Obesity Care Malta",
    email: "p.martin@obesitycare.mt",
    telephone: "+356 9912 4567",
    derniereActivite: "22 mars 2026",
  },
  "cl-004": {
    name: "Sophie Bernard",
    societe: "NHS S2 Healthcare",
    email: "s.bernard@nhss2.mu",
    telephone: "+230 5734 8901",
    derniereActivite: "21 mars 2026",
  },
  "cl-005": {
    name: "Luc Moreau",
    societe: "TIBOK Ltd",
    email: "l.moreau@tibok.mu",
    telephone: "+230 5756 7890",
    derniereActivite: "20 mars 2026",
  },
  "cl-006": {
    name: "Claire Fontaine",
    societe: "NHS S2 Healthcare",
    email: "c.fontaine@nhss2.mu",
    telephone: "+230 5798 2345",
    derniereActivite: "19 mars 2026",
  },
  "cl-007": {
    name: "Antoine Rousseau",
    societe: "BPO Services Ltd",
    email: "a.rousseau@bpo.mu",
    telephone: "+230 5767 4321",
    derniereActivite: "18 mars 2026",
  },
  "cl-008": {
    name: "Nathalie Girard",
    societe: "Obesity Care Malta",
    email: "n.girard@obesitycare.mt",
    telephone: "+356 9923 6789",
    derniereActivite: "17 mars 2026",
  },
}

// --- Mock documents ---
const mockDocuments = [
  {
    id: "doc-001",
    nom_fichier: "facture_fournisseur_mars_2026.pdf",
    date: "24 mars 2026",
    type_document: "facture_fournisseur",
    societe_detectee: "TIBOK",
    statut: "traite",
    n8n_result: {
      fournisseur: "ABC Supplies Ltd",
      montant_ht: 45000,
      tva: 6750,
      montant_ttc: 51750,
      date_facture: "2026-03-20",
      numero_facture: "INV-2026-0342",
      compte_charge: "601100",
    },
  },
  {
    id: "doc-002",
    nom_fichier: "releve_bancaire_feb_2026.pdf",
    date: "22 mars 2026",
    type_document: "releve_bancaire",
    societe_detectee: "TIBOK",
    statut: "en_cours",
    n8n_result: {
      banque: "MCB Ltd",
      compte: "000-123456-01",
      periode: "Février 2026",
      solde_debut: 1250000,
      solde_fin: 1180000,
      nb_transactions: 47,
    },
  },
  {
    id: "doc-003",
    nom_fichier: "fiche_paie_mars_2026.xlsx",
    date: "20 mars 2026",
    type_document: "fiche_paie",
    societe_detectee: "TIBOK",
    statut: "traite",
    n8n_result: {
      employe: "Raj Doobah",
      salaire_brut: 35000,
      npf_employe: 1050,
      npf_employeur: 2100,
      paye: 3500,
      net: 30450,
    },
  },
  {
    id: "doc-004",
    nom_fichier: "facture_client_0089.pdf",
    date: "18 mars 2026",
    type_document: "facture_client",
    societe_detectee: "TIBOK",
    statut: "traite",
    n8n_result: {
      client: "XYZ Corp",
      montant_ht: 120000,
      tva: 18000,
      montant_ttc: 138000,
      date_facture: "2026-03-15",
      numero_facture: "TIB-2026-0089",
    },
  },
  {
    id: "doc-005",
    nom_fichier: "contrat_bail_commercial.pdf",
    date: "15 mars 2026",
    type_document: "contrat",
    societe_detectee: "TIBOK",
    statut: "en_attente",
    n8n_result: null,
  },
  {
    id: "doc-006",
    nom_fichier: "charges_sociales_feb_2026.pdf",
    date: "10 mars 2026",
    type_document: "charges_sociales",
    societe_detectee: "TIBOK",
    statut: "erreur",
    n8n_result: {
      erreur: "Format non reconnu",
      suggestion: "Vérifier le document et re-uploader",
    },
  },
]

// --- Mock TVA data ---
const mockTVA = [
  {
    periode: "Mars 2026",
    tva_collectee: 285000,
    tva_deductible: 198000,
    credit_reporte: 0,
    tva_nette: 87000,
    statut: "a_payer",
    date_limite: "20 avril 2026",
    statut_declaration: "a_faire",
  },
  {
    periode: "Février 2026",
    tva_collectee: 312000,
    tva_deductible: 245000,
    credit_reporte: 0,
    tva_nette: 67000,
    statut: "a_payer",
    date_limite: "20 mars 2026",
    statut_declaration: "declare",
  },
  {
    periode: "Janvier 2026",
    tva_collectee: 198000,
    tva_deductible: 215000,
    credit_reporte: 0,
    tva_nette: -17000,
    statut: "credit",
    date_limite: "20 février 2026",
    statut_declaration: "declare",
  },
  {
    periode: "Décembre 2025",
    tva_collectee: 340000,
    tva_deductible: 278000,
    credit_reporte: 17000,
    tva_nette: 45000,
    statut: "a_payer",
    date_limite: "20 janvier 2026",
    statut_declaration: "declare",
  },
]

// --- Mock P&L data ---
const mockPL = [
  {
    periode: "Mars 2026",
    ca: 1900000,
    charges: 1420000,
    ebitda: 480000,
    tresorerie: 2150000,
    dso: 42,
  },
  {
    periode: "Février 2026",
    ca: 2080000,
    charges: 1580000,
    ebitda: 500000,
    tresorerie: 1980000,
    dso: 38,
  },
  {
    periode: "Janvier 2026",
    ca: 1750000,
    charges: 1390000,
    ebitda: 360000,
    tresorerie: 1870000,
    dso: 45,
  },
  {
    periode: "Décembre 2025",
    ca: 2250000,
    charges: 1690000,
    ebitda: 560000,
    tresorerie: 2310000,
    dso: 35,
  },
]

// --- Mock Charges Sociales data ---
const mockChargesSociales = [
  {
    periode: "Mars 2026",
    npf: 84000,
    hrdc: 16800,
    nps: 42000,
    paye: 126000,
    total: 268800,
    statut: "conforme",
  },
  {
    periode: "Février 2026",
    npf: 82500,
    hrdc: 16500,
    nps: 41250,
    paye: 123750,
    total: 264000,
    statut: "conforme",
  },
  {
    periode: "Janvier 2026",
    npf: 81000,
    hrdc: 16200,
    nps: 40500,
    paye: 121500,
    total: 259200,
    statut: "ecart_detecte",
  },
  {
    periode: "Décembre 2025",
    npf: 85500,
    hrdc: 17100,
    nps: 42750,
    paye: 128250,
    total: 273600,
    statut: "conforme",
  },
]

// --- Mock Alertes/Notifications data ---
const mockAlertes = [
  {
    id: "notif-001",
    date: "24 mars 2026 - 14:30",
    type: "whatsapp" as const,
    message: "Rappel : Votre déclaration TVA pour mars 2026 est due le 20 avril. Merci de préparer les documents nécessaires.",
    statut: "sent" as const,
  },
  {
    id: "notif-002",
    date: "22 mars 2026 - 09:15",
    type: "email" as const,
    message: "Rapport P&L de février 2026 disponible. Connectez-vous pour le consulter.",
    statut: "sent" as const,
  },
  {
    id: "notif-003",
    date: "20 mars 2026 - 16:45",
    type: "whatsapp" as const,
    message: "Alerte : Écart détecté sur les charges sociales de janvier 2026. Veuillez vérifier.",
    statut: "sent" as const,
  },
  {
    id: "notif-004",
    date: "18 mars 2026 - 11:00",
    type: "email" as const,
    message: "Nouveau document à traiter : facture_client_0089.pdf. Veuillez valider.",
    statut: "sent" as const,
  },
  {
    id: "notif-005",
    date: "15 mars 2026 - 08:30",
    type: "whatsapp" as const,
    message: "Rappel : 3 documents en attente de validation dans votre dossier.",
    statut: "pending" as const,
  },
  {
    id: "notif-006",
    date: "12 mars 2026 - 14:00",
    type: "email" as const,
    message: "Déclaration TVA de février 2026 soumise avec succès. Référence MRA : TVA-2026-02-0456.",
    statut: "sent" as const,
  },
  {
    id: "notif-007",
    date: "10 mars 2026 - 10:20",
    type: "whatsapp" as const,
    message: "Erreur de traitement sur le document charges_sociales_feb_2026.pdf. Veuillez ré-uploader.",
    statut: "failed" as const,
  },
  {
    id: "notif-008",
    date: "08 mars 2026 - 17:00",
    type: "email" as const,
    message: "Bienvenue sur Lexora ! Votre espace client a été configuré. Connectez-vous pour commencer.",
    statut: "sent" as const,
  },
]

// --- Helpers ---
function formatMUR(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const typeDocumentLabels: Record<string, { label: string; className: string }> = {
  facture_fournisseur: { label: "Facture fournisseur", className: "bg-blue-100 text-blue-700 border-blue-200" },
  facture_client: { label: "Facture client", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  releve_bancaire: { label: "Relevé bancaire", className: "bg-purple-100 text-purple-700 border-purple-200" },
  fiche_paie: { label: "Fiche de paie", className: "bg-teal-100 text-teal-700 border-teal-200" },
  charges_sociales: { label: "Charges sociales", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  contrat: { label: "Contrat", className: "bg-gray-100 text-gray-700 border-gray-200" },
  autre: { label: "Autre", className: "bg-gray-100 text-gray-500 border-gray-200" },
}

const statutDocLabels: Record<string, { label: string; className: string }> = {
  en_attente: { label: "En attente", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  en_cours: { label: "En cours", className: "bg-blue-100 text-blue-700 border-blue-200" },
  traite: { label: "Traité", className: "bg-green-100 text-green-700 border-green-200" },
  erreur: { label: "Erreur", className: "bg-red-100 text-red-700 border-red-200" },
}

const statutTVADeclarationLabels: Record<string, { label: string; className: string }> = {
  a_faire: { label: "À faire", className: "bg-orange-100 text-orange-700 border-orange-200" },
  declare: { label: "Déclaré", className: "bg-green-100 text-green-700 border-green-200" },
  en_retard: { label: "En retard", className: "bg-red-100 text-red-700 border-red-200" },
}

const statutTVALabels: Record<string, { label: string; className: string }> = {
  a_payer: { label: "À payer", className: "bg-orange-100 text-orange-700 border-orange-200" },
  credit: { label: "Crédit TVA", className: "bg-blue-100 text-blue-700 border-blue-200" },
  neant: { label: "Néant", className: "bg-gray-100 text-gray-500 border-gray-200" },
}

// ===================== COMPONENT =====================

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string
  const client = clientsData[clientId]

  if (!client) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={() => router.push("/comptable/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux clients
        </Button>
        <div className="mt-8 text-center text-gray-500">
          Client introuvable.
        </div>
      </div>
    )
  }

  // Current month P&L for summary cards
  const currentPL = mockPL[0]

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <Link href="/comptable/clients">
        <Button variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour aux clients
        </Button>
      </Link>

      {/* Client info header */}
      <Card>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
              style={{ backgroundColor: "#1E2A4A" }}
            >
              {client.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {client.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {client.societe}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {client.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Dernière activité : {client.derniereActivite}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="tva">TVA</TabsTrigger>
          <TabsTrigger value="pl">P&L Mensuel</TabsTrigger>
          <TabsTrigger value="charges">Charges Sociales</TabsTrigger>
          <TabsTrigger value="alertes">Alertes</TabsTrigger>
        </TabsList>

        {/* =================== TAB 1: DOCUMENTS =================== */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle style={{ color: "#1E2A4A" }}>
                  Documents du client
                </CardTitle>
                <Button size="sm" style={{ backgroundColor: "#C9A84C" }} className="text-white hover:opacity-90">
                  <Upload className="h-4 w-4 mr-1" />
                  Ajouter un document
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type détecté</TableHead>
                    <TableHead>Société détectée</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockDocuments.map((doc) => {
                    const typeConfig = typeDocumentLabels[doc.type_document] || typeDocumentLabels.autre
                    const statutConfig = statutDocLabels[doc.statut]
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-sm">{doc.nom_fichier}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{doc.date}</TableCell>
                        <TableCell>
                          <Badge className={typeConfig.className}>{typeConfig.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{doc.societe_detectee}</TableCell>
                        <TableCell>
                          <Badge className={statutConfig.className}>{statutConfig.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              Voir
                            </Button>
                            {doc.n8n_result && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Code className="h-4 w-4 mr-1" />
                                    Voir JSON Claude
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle style={{ color: "#1E2A4A" }}>
                                      Résultat d&apos;analyse - {doc.nom_fichier}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 text-sm text-green-400">
                                    {JSON.stringify(doc.n8n_result, null, 2)}
                                  </pre>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================== TAB 2: TVA =================== */}
        <TabsContent value="tva">
          <div className="space-y-6">
            {/* TVA Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-500">TVA collectée (ce mois)</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                    {formatMUR(mockTVA[0].tva_collectee)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-500">TVA déductible (ce mois)</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                    {formatMUR(mockTVA[0].tva_deductible)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-500">TVA nette</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: mockTVA[0].tva_nette >= 0 ? "#1E2A4A" : "#16a34a" }}>
                    {formatMUR(mockTVA[0].tva_nette)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-500">Prochaine échéance</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#C9A84C" }}>
                    {mockTVA[0].date_limite}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* TVA Table */}
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>
                  Historique TVA mensuelle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">TVA collectée</TableHead>
                      <TableHead className="text-right">TVA déductible</TableHead>
                      <TableHead className="text-right">Crédit reporté</TableHead>
                      <TableHead className="text-right">TVA nette</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date limite</TableHead>
                      <TableHead>Déclaration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockTVA.map((tva, i) => {
                      const statutConfig = statutTVALabels[tva.statut]
                      const declConfig = statutTVADeclarationLabels[tva.statut_declaration]
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{tva.periode}</TableCell>
                          <TableCell className="text-right">{formatMUR(tva.tva_collectee)}</TableCell>
                          <TableCell className="text-right">{formatMUR(tva.tva_deductible)}</TableCell>
                          <TableCell className="text-right">{formatMUR(tva.credit_reporte)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className={tva.tva_nette < 0 ? "text-green-600" : ""}>
                              {formatMUR(tva.tva_nette)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={statutConfig.className}>{statutConfig.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{tva.date_limite}</TableCell>
                          <TableCell>
                            <Badge className={declConfig.className}>{declConfig.label}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =================== TAB 3: P&L MENSUEL =================== */}
        <TabsContent value="pl">
          <div className="space-y-6">
            {/* P&L Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">CA Total</p>
                      <p className="text-xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                        {formatMUR(currentPL.ca)}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                      <TrendingUp className="h-5 w-5" style={{ color: "#C9A84C" }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total Charges</p>
                      <p className="text-xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                        {formatMUR(currentPL.charges)}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                      <TrendingDown className="h-5 w-5 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">EBITDA</p>
                      <p className="text-xl font-bold mt-1" style={{ color: "#16a34a" }}>
                        {formatMUR(currentPL.ebitda)}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Trésorerie</p>
                      <p className="text-xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                        {formatMUR(currentPL.tresorerie)}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                      <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">DSO (jours)</p>
                      <p className="text-xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                        {currentPL.dso}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <Clock className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* P&L Monthly Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle style={{ color: "#1E2A4A" }}>
                    P&L Mensuel - {client.societe}
                  </CardTitle>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    <Building2 className="h-3 w-3 mr-1" />
                    {client.societe}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                      <TableHead className="text-right">Total Charges</TableHead>
                      <TableHead className="text-right">EBITDA</TableHead>
                      <TableHead className="text-right">Marge %</TableHead>
                      <TableHead className="text-right">Trésorerie</TableHead>
                      <TableHead className="text-right">DSO (jours)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPL.map((pl, i) => {
                      const marge = ((pl.ebitda / pl.ca) * 100).toFixed(1)
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{pl.periode}</TableCell>
                          <TableCell className="text-right">{formatMUR(pl.ca)}</TableCell>
                          <TableCell className="text-right">{formatMUR(pl.charges)}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatMUR(pl.ebitda)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              {marge}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatMUR(pl.tresorerie)}</TableCell>
                          <TableCell className="text-right">{pl.dso}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =================== TAB 4: CHARGES SOCIALES =================== */}
        <TabsContent value="charges">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>
                Charges sociales mensuelles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">NPF</TableHead>
                    <TableHead className="text-right">HRDC</TableHead>
                    <TableHead className="text-right">NPS</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockChargesSociales.map((cs, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{cs.periode}</TableCell>
                      <TableCell className="text-right">{formatMUR(cs.npf)}</TableCell>
                      <TableCell className="text-right">{formatMUR(cs.hrdc)}</TableCell>
                      <TableCell className="text-right">{formatMUR(cs.nps)}</TableCell>
                      <TableCell className="text-right">{formatMUR(cs.paye)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMUR(cs.total)}</TableCell>
                      <TableCell>
                        {cs.statut === "conforme" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Conforme
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Écart détecté
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =================== TAB 5: ALERTES =================== */}
        <TabsContent value="alertes">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>
                Notifications envoyées
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockAlertes.map((alerte) => (
                    <TableRow key={alerte.id}>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {alerte.date}
                      </TableCell>
                      <TableCell>
                        {alerte.type === "whatsapp" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <MessageCircle className="h-3 w-3 mr-1" />
                            WhatsApp
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                            <Mail className="h-3 w-3 mr-1" />
                            Email
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-md">
                        {alerte.message}
                      </TableCell>
                      <TableCell>
                        {alerte.statut === "sent" && (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <Send className="h-3 w-3 mr-1" />
                            Envoyé
                          </Badge>
                        )}
                        {alerte.statut === "pending" && (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                            <Clock className="h-3 w-3 mr-1" />
                            En attente
                          </Badge>
                        )}
                        {alerte.statut === "failed" && (
                          <Badge className="bg-red-100 text-red-700 border-red-200">
                            <XCircle className="h-3 w-3 mr-1" />
                            Échoué
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
