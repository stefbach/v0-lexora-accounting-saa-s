"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Eye, Upload, FileText, Image, Table2, MessageSquare, Mail, CheckCircle, AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

// Mock client data
const mockClients: Record<string, { nom: string; societe: string; email: string; telephone: string; derniere_activite: string }> = {
  "1": { nom: "Jean-Pierre Dupont", societe: "TIBOK", email: "jp@tibok.mu", telephone: "+230 5700 1234", derniere_activite: "2025-03-20" },
  "2": { nom: "Marie Curie", societe: "BPO", email: "marie@bpo.mu", telephone: "+230 5700 5678", derniere_activite: "2025-03-18" },
  "3": { nom: "Ahmed Hassan", societe: "Obesity Care Malta", email: "ahmed@obesitycare.mt", telephone: "+356 9900 1234", derniere_activite: "2025-03-15" },
}

const mockDocuments = [
  { id: "1", nom_fichier: "facture_001.pdf", date: "2025-03-20", type_document: "facture_fournisseur", societe_detectee: "TIBOK", statut: "traite", n8n_result: { type: "facture_fournisseur", fournisseur: "ABC Ltd", montant_ht: 45000, tva: 6750, total: 51750, date_facture: "2025-03-15", numero: "FAC-2025-001" } },
  { id: "2", nom_fichier: "releve_mcb_mars.pdf", date: "2025-03-18", type_document: "releve_bancaire", societe_detectee: "TIBOK", statut: "traite", n8n_result: { type: "releve_bancaire", banque: "MCB", periode: "Mars 2025", solde_debut: 1250000, solde_fin: 1380000, operations: 45 } },
  { id: "3", nom_fichier: "fiche_paie_fevrier.xlsx", date: "2025-03-10", type_document: "fiche_paie", societe_detectee: "TIBOK", statut: "en_cours", n8n_result: null },
  { id: "4", nom_fichier: "facture_client_XYZ.pdf", date: "2025-03-08", type_document: "facture_client", societe_detectee: "TIBOK", statut: "traite", n8n_result: { type: "facture_client", client: "XYZ Corp", montant_ht: 120000, tva: 18000, total: 138000 } },
  { id: "5", nom_fichier: "contrat_location.pdf", date: "2025-03-05", type_document: "contrat", societe_detectee: "TIBOK", statut: "traite", n8n_result: { type: "contrat", objet: "Location bureau", duree: "24 mois", loyer_mensuel: 35000 } },
  { id: "6", nom_fichier: "charges_sociales_Q1.xlsx", date: "2025-02-28", type_document: "charges_sociales", societe_detectee: "TIBOK", statut: "erreur", n8n_result: null },
]

const mockTVA = [
  { id: "1", periode: "2025-03", societe: "TIBOK", tva_collectee: 180000, tva_deductible: 135000, tva_nette: 45000, statut: "a_payer", date_limite: "2025-04-20", statut_declaration: "a_faire", penalites: 0 },
  { id: "2", periode: "2025-02", societe: "TIBOK", tva_collectee: 165000, tva_deductible: 170000, tva_nette: -5000, statut: "credit", date_limite: "2025-03-20", statut_declaration: "declare", date_declaration: "2025-03-18", penalites: 0 },
  { id: "3", periode: "2025-01", societe: "TIBOK", tva_collectee: 200000, tva_deductible: 145000, tva_nette: 55000, statut: "a_payer", date_limite: "2025-02-20", statut_declaration: "declare", date_declaration: "2025-02-19", penalites: 0 },
  { id: "4", periode: "2024-12", societe: "TIBOK", tva_collectee: 190000, tva_deductible: 190000, tva_nette: 0, statut: "neant", date_limite: "2025-01-20", statut_declaration: "en_retard", penalites: 5000 },
]

const mockPnL = {
  ca_total: 2450000,
  total_charges: 1850000,
  ebitda: 600000,
  tresorerie: 1380000,
  dso: 42,
  details: [
    { poste: "Chiffre d'affaires", montant: 2450000, type: "revenu" },
    { poste: "Achats & matières", montant: -750000, type: "charge" },
    { poste: "Salaires & charges sociales", montant: -620000, type: "charge" },
    { poste: "Loyer & charges", montant: -180000, type: "charge" },
    { poste: "Frais généraux", montant: -150000, type: "charge" },
    { poste: "Amortissements", montant: -85000, type: "charge" },
    { poste: "Autres charges", montant: -65000, type: "charge" },
  ],
}

const mockChargesSociales = [
  { id: "1", periode: "2025-03", npf: 31000, hrdc: 7750, nps: 18600, paye: 45000, statut: "conforme" },
  { id: "2", periode: "2025-02", npf: 31000, hrdc: 7750, nps: 18600, paye: 44500, statut: "conforme" },
  { id: "3", periode: "2025-01", npf: 30500, hrdc: 7625, nps: 18300, paye: 43800, statut: "ecart_detecte" },
  { id: "4", periode: "2024-12", npf: 30500, hrdc: 7625, nps: 18300, paye: 43800, statut: "conforme" },
]

const mockNotifications = [
  { id: "1", date: "2025-03-20 14:30", type: "whatsapp", message: "Votre facture FAC-2025-001 a été traitée avec succès.", statut: "sent" },
  { id: "2", date: "2025-03-18 10:00", type: "email", message: "Récapitulatif TVA février 2025 — Crédit de 5,000 MUR reporté.", statut: "sent" },
  { id: "3", date: "2025-03-15 09:00", type: "whatsapp", message: "Rappel : deadline TVA le 20 mars 2025.", statut: "sent" },
  { id: "4", date: "2025-03-10 16:45", type: "whatsapp", message: "Document fiche_paie_fevrier.xlsx en cours de traitement.", statut: "sent" },
  { id: "5", date: "2025-03-05 11:20", type: "email", message: "Rapport P&L mensuel février 2025 disponible.", statut: "sent" },
  { id: "6", date: "2025-02-28 08:00", type: "whatsapp", message: "Erreur de traitement sur charges_sociales_Q1.xlsx. Veuillez vérifier.", statut: "failed" },
  { id: "7", date: "2025-02-20 14:00", type: "whatsapp", message: "TVA janvier 2025 déclarée avec succès. Montant : 55,000 MUR.", statut: "sent" },
  { id: "8", date: "2025-02-18 09:30", type: "email", message: "URGENT : Deadline TVA décembre 2024 dépassée. Pénalité estimée : 5,000 MUR.", statut: "sent" },
]

function formatMUR(amount: number): string {
  return new Intl.NumberFormat("fr-MU", { style: "decimal", minimumFractionDigits: 0 }).format(amount) + " MUR"
}

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Facture fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Facture client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Relevé bancaire", className: "bg-green-100 text-green-800" },
    fiche_paie: { label: "Fiche de paie", className: "bg-orange-100 text-orange-800" },
    charges_sociales: { label: "Charges sociales", className: "bg-pink-100 text-pink-800" },
    contrat: { label: "Contrat", className: "bg-indigo-100 text-indigo-800" },
    autre: { label: "Autre", className: "bg-gray-100 text-gray-800" },
  }
  const c = config[type] || config.autre
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function getStatusBadge(statut: string) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    en_attente: { label: "En attente", variant: "outline" },
    en_cours: { label: "En cours", variant: "secondary" },
    traite: { label: "Traité", variant: "default" },
    erreur: { label: "Erreur", variant: "destructive" },
  }
  const c = config[statut] || { label: statut, variant: "outline" as const }
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export default function ClientDossierPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string
  const client = mockClients[clientId] || mockClients["1"]
  const [selectedJson, setSelectedJson] = useState<Record<string, unknown> | null>(null)

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/comptable/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>{client.nom}</h1>
          <p className="text-muted-foreground">{client.societe} — {client.email} — {client.telephone}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="tva">TVA</TabsTrigger>
          <TabsTrigger value="pnl">P&L Mensuel</TabsTrigger>
          <TabsTrigger value="charges">Charges Sociales</TabsTrigger>
          <TabsTrigger value="alertes">Alertes</TabsTrigger>
        </TabsList>

        {/* TAB 1 — Documents */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Documents du client</h2>
            <Button className="gap-2" style={{ backgroundColor: "#C9A84C" }}>
              <Upload className="h-4 w-4" />
              Ajouter un document
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type détecté</TableHead>
                    <TableHead>Société</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {doc.nom_fichier}
                      </TableCell>
                      <TableCell>{doc.date}</TableCell>
                      <TableCell>{getDocTypeBadge(doc.type_document)}</TableCell>
                      <TableCell>{doc.societe_detectee}</TableCell>
                      <TableCell>{getStatusBadge(doc.statut)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {doc.n8n_result && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedJson(doc.n8n_result)}>
                                  JSON Claude
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                                <DialogHeader>
                                  <DialogTitle>Résultat Claude AI — {doc.nom_fichier}</DialogTitle>
                                </DialogHeader>
                                <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
                                  {JSON.stringify(doc.n8n_result, null, 2)}
                                </pre>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2 — TVA */}
        <TabsContent value="tva" className="space-y-4">
          <h2 className="text-lg font-semibold">TVA & Fiscal</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>TVA Collectée (total)</CardDescription>
                <CardTitle className="text-xl">{formatMUR(735000)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>TVA Déductible (total)</CardDescription>
                <CardTitle className="text-xl">{formatMUR(640000)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>TVA Nette</CardDescription>
                <CardTitle className="text-xl">{formatMUR(95000)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Déclarations en retard</CardDescription>
                <CardTitle className="text-xl text-red-600">1</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead>Société</TableHead>
                    <TableHead className="text-right">TVA Collectée</TableHead>
                    <TableHead className="text-right">TVA Déductible</TableHead>
                    <TableHead className="text-right">TVA Nette</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Déclaration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTVA.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.periode}</TableCell>
                      <TableCell>{row.societe}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.tva_collectee)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.tva_deductible)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMUR(Math.abs(row.tva_nette))}</TableCell>
                      <TableCell>
                        {row.statut === "a_payer" && <Badge className="bg-red-100 text-red-800">À PAYER</Badge>}
                        {row.statut === "credit" && <Badge className="bg-green-100 text-green-800">CRÉDIT</Badge>}
                        {row.statut === "neant" && <Badge variant="secondary">NÉANT</Badge>}
                      </TableCell>
                      <TableCell>{row.date_limite}</TableCell>
                      <TableCell>
                        {row.statut_declaration === "a_faire" && <Badge className="bg-orange-100 text-orange-800">À faire</Badge>}
                        {row.statut_declaration === "declare" && <Badge className="bg-green-100 text-green-800">Déclaré {row.date_declaration}</Badge>}
                        {row.statut_declaration === "en_retard" && <Badge className="bg-red-100 text-red-800">En retard — {formatMUR(row.penalites)} pénalité</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3 — P&L Mensuel */}
        <TabsContent value="pnl" className="space-y-4">
          <h2 className="text-lg font-semibold">Rapport P&L Mensuel — {client.societe}</h2>
          <div className="grid gap-4 sm:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CA Total</CardDescription>
                <CardTitle className="text-xl text-green-700">{formatMUR(mockPnL.ca_total)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Charges</CardDescription>
                <CardTitle className="text-xl text-red-600">{formatMUR(mockPnL.total_charges)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>EBITDA</CardDescription>
                <CardTitle className="text-xl" style={{ color: "#C9A84C" }}>{formatMUR(mockPnL.ebitda)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Trésorerie</CardDescription>
                <CardTitle className="text-xl">{formatMUR(mockPnL.tresorerie)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>DSO</CardDescription>
                <CardTitle className="text-xl">{mockPnL.dso} jours</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Détail du compte de résultat</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Poste</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockPnL.details.map((ligne, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{ligne.poste}</TableCell>
                      <TableCell className={`text-right font-semibold ${ligne.type === "revenu" ? "text-green-700" : "text-red-600"}`}>
                        {formatMUR(Math.abs(ligne.montant))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ligne.type === "revenu" ? "default" : "destructive"}>
                          {ligne.type === "revenu" ? "Revenu" : "Charge"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>Résultat Net</TableCell>
                    <TableCell className="text-right text-green-700">{formatMUR(mockPnL.ca_total - mockPnL.total_charges)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4 — Charges Sociales */}
        <TabsContent value="charges" className="space-y-4">
          <h2 className="text-lg font-semibold">Charges Sociales — {client.societe}</h2>
          <Card>
            <CardContent className="p-0">
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
                  {mockChargesSociales.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.periode}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.npf)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.hrdc)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.nps)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.paye)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMUR(row.npf + row.hrdc + row.nps + row.paye)}</TableCell>
                      <TableCell>
                        {row.statut === "conforme" ? (
                          <Badge className="bg-green-100 text-green-800 gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Conforme
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 gap-1">
                            <AlertTriangle className="h-3 w-3" />
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

        {/* TAB 5 — Alertes */}
        <TabsContent value="alertes" className="space-y-4">
          <h2 className="text-lg font-semibold">Historique des alertes — {client.nom}</h2>
          <Card>
            <CardContent className="p-0">
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
                  {mockNotifications.map((notif) => (
                    <TableRow key={notif.id}>
                      <TableCell className="whitespace-nowrap">{notif.date}</TableCell>
                      <TableCell>
                        {notif.type === "whatsapp" ? (
                          <Badge variant="outline" className="gap-1 bg-green-50 text-green-700">
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700">
                            <Mail className="h-3 w-3" />
                            Email
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">{notif.message}</TableCell>
                      <TableCell>
                        {notif.statut === "sent" && <Badge className="bg-green-100 text-green-800">Envoyé</Badge>}
                        {notif.statut === "pending" && <Badge className="bg-yellow-100 text-yellow-800">En attente</Badge>}
                        {notif.statut === "failed" && <Badge className="bg-red-100 text-red-800">Échec</Badge>}
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
