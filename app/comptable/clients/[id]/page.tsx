"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect } from "react"
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
import { Spinner } from "@/components/ui/spinner"
import { useProfile } from "@/hooks/use-profile"
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  User,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Users,
  Receipt,
  AlertTriangle,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientProfile {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
}

interface Societe {
  id: string
  nom: string
  brn?: string
  tva_registered?: boolean
  statut?: string
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  societe: Societe | null
  statut: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMUR(amount: number): string {
  return `MUR ${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Deterministic pseudo-random from a seed string
function seededRandom(seed: string): () => number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b)
    h = (h ^ (h >>> 16)) >>> 0
    return (h % 10000) / 10000
  }
}

function generateMockData(societeName: string) {
  const rng = seededRandom(societeName)
  const r = (min: number, max: number) => Math.round(min + rng() * (max - min))

  const ca = r(800000, 3500000)
  const charges = r(300000, ca * 0.7)
  const resultat = ca - charges
  const tvaCollectee = Math.round(ca * 0.15)
  const tvaDeductible = Math.round(charges * 0.12)
  const tvaNet = tvaCollectee - tvaDeductible
  const tresorerie = r(200000, 2000000)
  const masseSalariale = r(150000, 800000)

  const fournisseurs = [
    { fournisseur: "ABC Supplies Ltd", numero: "FAF-2026-001", date: "03/03/2026", montantHT: r(50000, 250000) },
    { fournisseur: "MegaTech SARL", numero: "FAF-2026-002", date: "07/03/2026", montantHT: r(30000, 180000) },
    { fournisseur: "Island Logistics Co", numero: "FAF-2026-003", date: "12/03/2026", montantHT: r(20000, 120000) },
    { fournisseur: "ProClean Services", numero: "FAF-2026-004", date: "15/03/2026", montantHT: r(10000, 80000) },
    { fournisseur: "Global Trading Ltd", numero: "FAF-2026-005", date: "20/03/2026", montantHT: r(60000, 300000) },
  ].map((f) => ({
    ...f,
    tva: Math.round(f.montantHT * 0.15),
    ttc: Math.round(f.montantHT * 1.15),
    statut: rng() > 0.3 ? "Payée" : "En attente",
  }))

  const facturesClients = [
    { client: "Client Alpha", numero: "FAC-2026-101", date: "02/03/2026", montantHT: r(100000, 500000) },
    { client: "Client Beta", numero: "FAC-2026-102", date: "08/03/2026", montantHT: r(80000, 400000) },
    { client: "Client Gamma", numero: "FAC-2026-103", date: "14/03/2026", montantHT: r(50000, 250000) },
    { client: "Client Delta", numero: "FAC-2026-104", date: "19/03/2026", montantHT: r(120000, 600000) },
  ].map((f) => ({
    ...f,
    tva: Math.round(f.montantHT * 0.15),
    ttc: Math.round(f.montantHT * 1.15),
    statut: rng() > 0.4 ? "Encaissée" : "En attente",
  }))

  const banque = [
    { date: "01/03/2026", libelle: "Virement Client Alpha", credit: r(100000, 500000), debit: 0 },
    { date: "05/03/2026", libelle: "Paiement loyer bureau", credit: 0, debit: r(30000, 80000) },
    { date: "10/03/2026", libelle: "Salaires Mars 2026", credit: 0, debit: masseSalariale },
    { date: "12/03/2026", libelle: "Virement Client Beta", credit: r(80000, 300000), debit: 0 },
    { date: "18/03/2026", libelle: "Achat fournitures", credit: 0, debit: r(5000, 25000) },
    { date: "22/03/2026", libelle: "Paiement fournisseur ABC", credit: 0, debit: r(50000, 200000) },
  ]

  const salaires = [
    { employe: "Raj Doorgakant", poste: "Directeur", brut: r(80000, 150000) },
    { employe: "Priya Doosing", poste: "Comptable", brut: r(45000, 85000) },
    { employe: "Kevin Li", poste: "Commercial", brut: r(35000, 65000) },
    { employe: "Anisha Ramgolam", poste: "Assistante admin", brut: r(25000, 45000) },
  ].map((s) => ({
    ...s,
    npf: Math.round(s.brut * 0.06),
    paye: Math.round(s.brut * 0.15),
    net: Math.round(s.brut * 0.79),
  }))

  const chargesSociales = {
    npf: salaires.reduce((a, s) => a + s.npf, 0),
    hrdc: Math.round(masseSalariale * 0.015),
    nps: Math.round(masseSalariale * 0.025),
    paye: salaires.reduce((a, s) => a + s.paye, 0),
  }

  const documents = [
    { nom: `bilan_${societeName.replace(/\s/g, "_")}_mars_2026.pdf`, type: "Bilan", date: "25/03/2026", statut: "Validé" },
    { nom: `factures_fournisseurs_mars_2026.zip`, type: "Factures", date: "24/03/2026", statut: "En traitement" },
    { nom: `releve_bancaire_mars_2026.pdf`, type: "Relevé bancaire", date: "23/03/2026", statut: "Validé" },
    { nom: `declaration_tva_T1_2026.pdf`, type: "TVA", date: "20/03/2026", statut: "Soumis" },
    { nom: `bulletins_paie_mars_2026.pdf`, type: "Paie", date: "18/03/2026", statut: "Validé" },
  ]

  const alertes = [
    { type: "urgent", message: `Déclaration TVA T1 2026 — échéance le 31 mars 2026`, date: "20/03/2026" },
    { type: "attention", message: `Facture FAF-2026-005 (Global Trading) en retard de paiement`, date: "25/03/2026" },
    { type: "info", message: `Rapprochement bancaire mars 2026 en cours`, date: "24/03/2026" },
  ]

  return {
    kpis: { ca, charges, resultat, tvaNet, tresorerie, masseSalariale },
    fournisseurs,
    facturesClients,
    banque,
    salaires,
    chargesSociales,
    tva: { collectee: tvaCollectee, deductible: tvaDeductible, net: tvaNet },
    documents,
    alertes,
    pl: {
      revenus: ca,
      coutDesVentes: Math.round(ca * 0.35),
      margeBrute: Math.round(ca * 0.65),
      fraisGeneraux: Math.round(charges * 0.4),
      salairesTotal: masseSalariale,
      amortissements: r(20000, 80000),
      resultatNet: resultat,
    },
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientDetailPage() {
  const params = useParams()
  const clientId = params.id as string
  const { profile } = useProfile()

  const [loading, setLoading] = useState(true)
  const [clientInfo, setClientInfo] = useState<ClientProfile | null>(null)
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<Societe | null>(null)

  // Fetch client info + sociétés from API
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [usersRes, dossiersRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/dossiers"),
        ])

        const usersJson = await usersRes.json()
        const dossiersJson = await dossiersRes.json()

        // Find the client
        const allUsers: ClientProfile[] = usersJson.users || []
        const client = allUsers.find((u) => u.id === clientId)
        if (client) setClientInfo(client)

        // Find sociétés linked to this client via dossiers
        const allDossiers: Dossier[] = dossiersJson.dossiers || []
        const clientDossiers = allDossiers.filter((d) => d.client_id === clientId)
        const uniqueSocietes = new Map<string, Societe>()
        clientDossiers.forEach((d) => {
          if (d.societe) {
            uniqueSocietes.set(d.societe.id, d.societe)
          }
        })
        setSocietes(Array.from(uniqueSocietes.values()))
      } catch (err) {
        console.error("Erreur chargement données client:", err)
      } finally {
        setLoading(false)
      }
    }

    if (clientId) fetchData()
  }, [clientId])

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner className="size-8 text-[#C9A84C]" />
        <span className="ml-3 text-[#1E2A4A] font-medium">Chargement du dossier client...</span>
      </div>
    )
  }

  // ---- Client not found ----
  if (!clientInfo) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#1E2A4A] text-lg mb-4">Client introuvable.</p>
        <Link href="/comptable/clients">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux clients
          </Button>
        </Link>
      </div>
    )
  }

  const clientName = clientInfo.full_name || clientInfo.email

  // =========================================================================
  // STEP 2: Société selected — Accounting Dashboard
  // =========================================================================
  if (selectedSociete) {
    const mock = generateMockData(selectedSociete.nom)
    const { kpis, fournisseurs, facturesClients, banque, salaires, chargesSociales, tva, documents, alertes, pl } = mock

    const kpiCards = [
      { label: "CA du mois", value: kpis.ca, icon: TrendingUp, color: "text-green-600" },
      { label: "Charges du mois", value: kpis.charges, icon: TrendingDown, color: "text-red-500" },
      { label: "Résultat d'exploitation", value: kpis.resultat, icon: DollarSign, color: kpis.resultat >= 0 ? "text-green-600" : "text-red-500" },
      { label: "TVA nette à payer", value: kpis.tvaNet, icon: Receipt, color: "text-orange-500" },
      { label: "Trésorerie", value: kpis.tresorerie, icon: Wallet, color: "text-blue-600" },
      { label: "Masse salariale", value: kpis.masseSalariale, icon: Users, color: "text-purple-600" },
    ]

    return (
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="text-sm text-gray-500">
          <Link href="/comptable/clients" className="hover:text-[#C9A84C] transition-colors">Portefeuille</Link>
          <span className="mx-2">&gt;</span>
          <button onClick={() => setSelectedSociete(null)} className="hover:text-[#C9A84C] transition-colors">{clientName}</button>
          <span className="mx-2">&gt;</span>
          <span className="text-[#1E2A4A] font-medium">{selectedSociete.nom}</span>
        </div>

        {/* Back button */}
        <Button variant="outline" onClick={() => setSelectedSociete(null)} className="border-[#1E2A4A] text-[#1E2A4A] hover:bg-[#1E2A4A] hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Changer de société
        </Button>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="border-l-4 border-l-[#C9A84C]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.color}`}>{formatMUR(kpi.value)}</p>
                </div>
                <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-40`} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="vue-ensemble" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-[#1E2A4A]/5 p-1 rounded-lg">
            <TabsTrigger value="vue-ensemble" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Vue d&apos;ensemble</TabsTrigger>
            <TabsTrigger value="fournisseurs" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Fournisseurs</TabsTrigger>
            <TabsTrigger value="factures" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Factures Clients</TabsTrigger>
            <TabsTrigger value="banque" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Banque</TabsTrigger>
            <TabsTrigger value="salaires" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Salaires</TabsTrigger>
            <TabsTrigger value="charges" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Charges Sociales</TabsTrigger>
            <TabsTrigger value="tva" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">TVA</TabsTrigger>
            <TabsTrigger value="pl" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">P&amp;L</TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Documents</TabsTrigger>
            <TabsTrigger value="alertes" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white text-xs">Alertes</TabsTrigger>
          </TabsList>

          {/* Vue d'ensemble */}
          <TabsContent value="vue-ensemble">
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A]">Vue d&apos;ensemble — {selectedSociete.nom}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>Société : <strong>{selectedSociete.nom}</strong></p>
                {selectedSociete.brn && <p>BRN : <strong>{selectedSociete.brn}</strong></p>}
                <p>Enregistrée TVA : <Badge variant={selectedSociete.tva_registered ? "default" : "secondary"}>{selectedSociete.tva_registered ? "Oui" : "Non"}</Badge></p>
                <hr className="my-3" />
                <p>Chiffre d&apos;affaires du mois : <strong className="text-green-600">{formatMUR(kpis.ca)}</strong></p>
                <p>Charges totales : <strong className="text-red-500">{formatMUR(kpis.charges)}</strong></p>
                <p>Résultat d&apos;exploitation : <strong className={kpis.resultat >= 0 ? "text-green-600" : "text-red-500"}>{formatMUR(kpis.resultat)}</strong></p>
                <p>Trésorerie disponible : <strong className="text-blue-600">{formatMUR(kpis.tresorerie)}</strong></p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fournisseurs */}
          <TabsContent value="fournisseurs">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Factures Fournisseurs — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant HT</TableHead>
                      <TableHead className="text-right">TVA</TableHead>
                      <TableHead className="text-right">TTC</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fournisseurs.map((f) => (
                      <TableRow key={f.numero}>
                        <TableCell className="font-medium">{f.fournisseur}</TableCell>
                        <TableCell>{f.numero}</TableCell>
                        <TableCell>{f.date}</TableCell>
                        <TableCell className="text-right">{formatMUR(f.montantHT)}</TableCell>
                        <TableCell className="text-right">{formatMUR(f.tva)}</TableCell>
                        <TableCell className="text-right font-medium">{formatMUR(f.ttc)}</TableCell>
                        <TableCell>
                          <Badge variant={f.statut === "Payée" ? "default" : "secondary"} className={f.statut === "Payée" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                            {f.statut}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Factures Clients */}
          <TabsContent value="factures">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Factures Clients — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant HT</TableHead>
                      <TableHead className="text-right">TVA</TableHead>
                      <TableHead className="text-right">TTC</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturesClients.map((f) => (
                      <TableRow key={f.numero}>
                        <TableCell className="font-medium">{f.client}</TableCell>
                        <TableCell>{f.numero}</TableCell>
                        <TableCell>{f.date}</TableCell>
                        <TableCell className="text-right">{formatMUR(f.montantHT)}</TableCell>
                        <TableCell className="text-right">{formatMUR(f.tva)}</TableCell>
                        <TableCell className="text-right font-medium">{formatMUR(f.ttc)}</TableCell>
                        <TableCell>
                          <Badge variant={f.statut === "Encaissée" ? "default" : "secondary"} className={f.statut === "Encaissée" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                            {f.statut}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Banque */}
          <TabsContent value="banque">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Mouvements Bancaires — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead className="text-right">Crédit</TableHead>
                      <TableHead className="text-right">Débit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banque.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell>{b.date}</TableCell>
                        <TableCell className="font-medium">{b.libelle}</TableCell>
                        <TableCell className="text-right text-green-600">{b.credit > 0 ? formatMUR(b.credit) : "—"}</TableCell>
                        <TableCell className="text-right text-red-500">{b.debit > 0 ? formatMUR(b.debit) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salaires */}
          <TabsContent value="salaires">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Bulletin de Paie — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employé</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">NPF (6%)</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaires.map((s) => (
                      <TableRow key={s.employe}>
                        <TableCell className="font-medium">{s.employe}</TableCell>
                        <TableCell>{s.poste}</TableCell>
                        <TableCell className="text-right">{formatMUR(s.brut)}</TableCell>
                        <TableCell className="text-right">{formatMUR(s.npf)}</TableCell>
                        <TableCell className="text-right">{formatMUR(s.paye)}</TableCell>
                        <TableCell className="text-right font-medium">{formatMUR(s.net)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charges Sociales */}
          <TabsContent value="charges">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Charges Sociales — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "NPF (National Pensions Fund)", value: chargesSociales.npf, desc: "6% part employeur" },
                    { label: "HRDC (Human Resource Development Council)", value: chargesSociales.hrdc, desc: "1.5% de la masse salariale" },
                    { label: "NPS (National Savings Fund)", value: chargesSociales.nps, desc: "2.5% de la masse salariale" },
                    { label: "PAYE (Pay As You Earn)", value: chargesSociales.paye, desc: "Impôt sur le revenu retenu à la source" },
                  ].map((c) => (
                    <Card key={c.label} className="border-[#1E2A4A]/20">
                      <CardContent className="p-4">
                        <p className="text-sm text-gray-500">{c.label}</p>
                        <p className="text-xl font-bold text-[#1E2A4A]">{formatMUR(c.value)}</p>
                        <p className="text-xs text-gray-400 mt-1">{c.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-[#1E2A4A]/5 rounded-lg">
                  <p className="font-medium text-[#1E2A4A]">Total charges sociales : <span className="text-[#C9A84C] font-bold">{formatMUR(chargesSociales.npf + chargesSociales.hrdc + chargesSociales.nps + chargesSociales.paye)}</span></p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TVA */}
          <TabsContent value="tva">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Déclaration TVA — T1 2026</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-gray-600">TVA Collectée</p>
                      <p className="text-2xl font-bold text-green-700">{formatMUR(tva.collectee)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-gray-600">TVA Déductible</p>
                      <p className="text-2xl font-bold text-blue-700">{formatMUR(tva.deductible)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-gray-600">TVA Nette à Payer</p>
                      <p className="text-2xl font-bold text-orange-700">{formatMUR(tva.net)}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="p-4 bg-[#1E2A4A]/5 rounded-lg text-sm">
                  <p className="font-medium text-[#1E2A4A]">Période : Janvier — Mars 2026</p>
                  <p className="text-gray-500 mt-1">Date limite de soumission : 31 mars 2026</p>
                  <Badge className="mt-2 bg-yellow-100 text-yellow-800">En préparation</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* P&L */}
          <TabsContent value="pl">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Compte de Résultat (P&amp;L) — Mars 2026</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Revenus / Chiffre d'affaires", value: pl.revenus, bold: true, color: "text-green-600" },
                    { label: "Coût des ventes", value: -pl.coutDesVentes, bold: false, color: "text-red-500" },
                    { label: "Marge brute", value: pl.margeBrute, bold: true, color: "text-[#1E2A4A]" },
                    { label: "Frais généraux & administratifs", value: -pl.fraisGeneraux, bold: false, color: "text-red-500" },
                    { label: "Salaires & charges sociales", value: -pl.salairesTotal, bold: false, color: "text-red-500" },
                    { label: "Amortissements", value: -pl.amortissements, bold: false, color: "text-red-500" },
                    { label: "Résultat net", value: pl.resultatNet, bold: true, color: pl.resultatNet >= 0 ? "text-green-600" : "text-red-500" },
                  ].map((row) => (
                    <div key={row.label} className={`flex justify-between items-center py-2 px-3 rounded ${row.bold ? "bg-[#1E2A4A]/5" : ""}`}>
                      <span className={`${row.bold ? "font-bold text-[#1E2A4A]" : "text-gray-600"}`}>{row.label}</span>
                      <span className={`font-mono ${row.bold ? "font-bold text-lg" : ""} ${row.color}`}>
                        {row.value < 0 ? `(${formatMUR(Math.abs(row.value))})` : formatMUR(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Documents — {selectedSociete.nom}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom du fichier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.nom}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#C9A84C]" />
                          {d.nom}
                        </TableCell>
                        <TableCell>{d.type}</TableCell>
                        <TableCell>{d.date}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              d.statut === "Validé" ? "bg-green-100 text-green-800" :
                              d.statut === "Soumis" ? "bg-blue-100 text-blue-800" :
                              "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {d.statut}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alertes */}
          <TabsContent value="alertes">
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A]">Alertes — {selectedSociete.nom}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {alertes.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      a.type === "urgent" ? "border-red-200 bg-red-50" :
                      a.type === "attention" ? "border-yellow-200 bg-yellow-50" :
                      "border-blue-200 bg-blue-50"
                    }`}
                  >
                    {a.type === "urgent" ? <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" /> :
                     a.type === "attention" ? <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" /> :
                     <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />}
                    <div>
                      <p className="text-sm font-medium text-[#1E2A4A]">{a.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{a.date}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // =========================================================================
  // STEP 1: Client Overview + Société Selection
  // =========================================================================
  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link href="/comptable/clients" className="hover:text-[#C9A84C] transition-colors">Portefeuille</Link>
        <span className="mx-2">&gt;</span>
        <span className="text-[#1E2A4A] font-medium">{clientName}</span>
      </div>

      {/* Back button */}
      <Link href="/comptable/clients">
        <Button variant="outline" className="border-[#1E2A4A] text-[#1E2A4A] hover:bg-[#1E2A4A] hover:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux clients
        </Button>
      </Link>

      {/* Client Info Card */}
      <Card className="border-t-4 border-t-[#C9A84C]">
        <CardHeader>
          <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations du client
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Nom complet</p>
              <p className="font-medium text-[#1E2A4A]">{clientInfo.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
              <p className="font-medium text-[#1E2A4A]">{clientInfo.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" /> Téléphone</p>
              <p className="font-medium text-[#1E2A4A]">{clientInfo.phone || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Rôle</p>
              <Badge className="bg-[#1E2A4A] text-white">{clientInfo.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sociétés */}
      <div>
        <h2 className="text-lg font-bold text-[#1E2A4A] mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[#C9A84C]" />
          Sociétés de ce client
        </h2>

        {societes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune société liée à ce client.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {societes.map((soc) => (
              <Card
                key={soc.id}
                className="cursor-pointer hover:shadow-lg hover:border-[#C9A84C] transition-all duration-200 border-l-4 border-l-[#1E2A4A]"
                onClick={() => setSelectedSociete(soc)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-[#1E2A4A] text-lg">{soc.nom}</h3>
                      {soc.brn && (
                        <p className="text-sm text-gray-500 mt-1">BRN : {soc.brn}</p>
                      )}
                      <div className="mt-3">
                        <Badge
                          variant="secondary"
                          className={soc.tva_registered ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}
                        >
                          {soc.tva_registered ? "TVA enregistrée" : "Non assujettie TVA"}
                        </Badge>
                      </div>
                    </div>
                    <Building2 className="h-8 w-8 text-[#C9A84C] opacity-40" />
                  </div>
                  <p className="text-xs text-[#C9A84C] font-medium mt-4">Cliquer pour ouvrir le tableau de bord →</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
