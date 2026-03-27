"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Users, FileText, Calculator, AlertTriangle, Clock, Eye,
  CheckCircle, XCircle, Loader2, Calendar,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

// Mock data — will be replaced by real data from APIs
const mockAlerts = [
  { id: "1", niveau: "critique", type: "tva_retard", titre: "TVA TIBOK — Mars 2026 non déclarée", description: "Pénalité en cours : 5% + 1%/mois", montant: 195000, echeance: "2026-03-20", client: "Raj Doobur", societe: "TIBOK" },
  { id: "2", niveau: "critique", type: "facture_impayee", titre: "Créance impayée > 60 jours", description: "Mauritius Telecom doit 450,000 MUR depuis 65 jours", montant: 450000, echeance: "2026-01-20", client: "Raj Doobur", societe: "TIBOK" },
  { id: "3", niveau: "important", type: "tva_j5", titre: "TVA BPO — Deadline dans 3 jours", description: "Déclaration à soumettre avant le 20/04/2026", montant: 67500, echeance: "2026-04-20", client: "Marie Curie", societe: "BPO" },
  { id: "4", niveau: "important", type: "document_manquant", titre: "Documents manquants — Obesity Care", description: "Relevé bancaire BOV mars 2026 non reçu", montant: 0, echeance: "2026-03-31", client: "Ahmed Hassan", societe: "Obesity Care Malta" },
  { id: "5", niveau: "important", type: "facture_tva_invalide", titre: "3 factures fournisseurs sans TVA MRA valide", description: "TVA non déductible : 28,500 MUR", montant: 28500, echeance: "", client: "Raj Doobur", societe: "TIBOK" },
  { id: "6", niveau: "informatif", type: "seuil_tva", titre: "CA TIBOK proche du seuil TVA", description: "CA cumulé 5,200,000 MUR — seuil à 6M MUR", montant: 0, echeance: "", client: "Raj Doobur", societe: "TIBOK" },
  { id: "7", niveau: "informatif", type: "nouveau_document", titre: "5 documents uploadés par Raj Doobur", description: "Traitement en cours pour TIBOK", montant: 0, echeance: "", client: "Raj Doobur", societe: "TIBOK" },
]

const mockObligations = [
  { date: "20/04", obligation: "TVA mensuelle", societes: "TIBOK, BPO", montant: 262500, statut: "a_faire" },
  { date: "20/04", obligation: "PAYE mensuel", societes: "TIBOK, BPO", montant: 165000, statut: "fait" },
  { date: "30/04", obligation: "NPF/HRDC", societes: "TIBOK, BPO", montant: 147000, statut: "en_cours" },
  { date: "31/12", obligation: "13ème mois", societes: "Toutes", montant: 0, statut: "na" },
]

const mockActivity = [
  { time: "Il y a 10 min", text: "5 documents uploadés par Raj Doobur pour TIBOK" },
  { time: "Il y a 30 min", text: "TVA BPO février 2026 déclarée — Réf MRA: MRA-VAT-2026-0234" },
  { time: "Il y a 1h", text: "Alerte WhatsApp envoyée à Raj Doobur — Rappel facture impayée" },
  { time: "Il y a 2h", text: "Rapport P&L mars 2026 généré pour Obesity Care Malta" },
  { time: "Il y a 3h", text: "Fiche de paie mars 2026 traitée pour BPO (17 employés)" },
  { time: "Hier", text: "Relevé bancaire MCB mars 2026 rapproché — 45 opérations" },
  { time: "Hier", text: "Nouveau client ajouté : Claire Fontaine (NHS S2)" },
]

const niveauConfig: Record<string, { label: string; className: string; dot: string }> = {
  critique: { label: "Critique", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  important: { label: "Important", className: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  informatif: { label: "Info", className: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
}

export default function ComptableDashboardPage() {
  const { profile } = useProfile()
  const [clientCount, setClientCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const firstName = profile?.full_name?.split(" ")[0] || ""
  const isDedie = profile?.role === "comptable_dedie"

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/clients")
      const data = await res.json()
      if (data.clients) setClientCount(data.clients.length)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const criticalAlerts = mockAlerts.filter(a => a.niveau === "critique").length
  const pendingDocs = 8 // mock
  const obligationsThisMonth = mockObligations.filter(o => o.statut === "a_faire").length

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Bienvenue{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDedie ? "Vue d'ensemble de vos clients assignés" : "Vue d'ensemble de votre portefeuille"}
        </p>
      </div>

      {/* Section A — KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clients actifs</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? "..." : clientCount}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <Users className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Documents en attente</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>{pendingDocs}</p>
                {pendingDocs > 10 && <Badge className="mt-1 bg-red-100 text-red-700">Urgent</Badge>}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <FileText className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Obligations fiscales ce mois</p>
                <p className="text-3xl font-bold mt-1" style={{ color: obligationsThisMonth > 0 ? "#dc2626" : "#1E2A4A" }}>{obligationsThisMonth}</p>
                <p className="text-xs text-muted-foreground mt-1">à déclarer/payer</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <Calculator className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertes critiques</p>
                <p className="text-3xl font-bold mt-1" style={{ color: criticalAlerts > 0 ? "#dc2626" : "#1E2A4A" }}>{criticalAlerts}</p>
                <p className="text-xs text-muted-foreground mt-1">non traitées</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B — Alertes Fiscales & Comptables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <AlertTriangle className="h-5 w-5" />
            Alertes fiscales et comptables
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mockAlerts.map((alert) => {
            const config = niveauConfig[alert.niveau]
            return (
              <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${config.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={config.className}>{config.label}</Badge>
                    <span className="text-xs text-muted-foreground">{alert.societe} — {alert.client}</span>
                  </div>
                  <p className="text-sm font-medium">{alert.titre}</p>
                  <p className="text-xs text-muted-foreground">{alert.description}</p>
                </div>
                <div className="text-right shrink-0">
                  {alert.montant > 0 && <p className="text-sm font-semibold">{alert.montant.toLocaleString("fr-FR")} MUR</p>}
                  {alert.echeance && <p className="text-xs text-muted-foreground">{formatDate(alert.echeance)}</p>}
                </div>
                <Button variant="outline" size="sm" className="shrink-0">Gérer</Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section D — Obligations du mois */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Calendar className="h-5 w-5" />
              Obligations du mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Obligation</TableHead>
                  <TableHead>Sociétés</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockObligations.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{o.date}</TableCell>
                    <TableCell>{o.obligation}</TableCell>
                    <TableCell className="text-sm">{o.societes}</TableCell>
                    <TableCell className="text-right">{o.montant > 0 ? `${o.montant.toLocaleString("fr-FR")} MUR` : "—"}</TableCell>
                    <TableCell>
                      {o.statut === "fait" && <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Fait</Badge>}
                      {o.statut === "a_faire" && <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" />À faire</Badge>}
                      {o.statut === "en_cours" && <Badge className="bg-orange-100 text-orange-700"><Clock className="h-3 w-3 mr-1" />En cours</Badge>}
                      {o.statut === "na" && <Badge variant="outline">N/A</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Section E — Activité récente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Clock className="h-5 w-5" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockActivity.map((a, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#C9A84C20" }}>
                    <Clock className="h-4 w-4" style={{ color: "#C9A84C" }} />
                  </div>
                  <div>
                    <p className="text-sm">{a.text}</p>
                    <p className="text-xs text-muted-foreground">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
