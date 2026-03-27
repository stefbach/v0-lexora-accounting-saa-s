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

function getStatusBadge(statut: string) {
  const config: Record<string, { label: string; className: string }> = {
    en_attente: { label: "En attente", className: "bg-yellow-100 text-yellow-800" },
    en_cours: { label: "En cours", className: "bg-blue-100 text-blue-800" },
    traite: { label: "Traite", className: "bg-green-100 text-green-800" },
    erreur: { label: "Erreur", className: "bg-red-100 text-red-800" },
  }
  const c = config[statut] || { label: statut, className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

function getDocTypeBadge(type: string) {
  const config: Record<string, { label: string; className: string }> = {
    facture_fournisseur: { label: "Fact. fournisseur", className: "bg-purple-100 text-purple-800" },
    facture_client: { label: "Fact. client", className: "bg-blue-100 text-blue-800" },
    releve_bancaire: { label: "Releve bancaire", className: "bg-green-100 text-green-800" },
    fiche_paie: { label: "Fiche de paie", className: "bg-orange-100 text-orange-800" },
    charges_sociales: { label: "Charges sociales", className: "bg-pink-100 text-pink-800" },
  }
  const c = config[type] || { label: type || "Autre", className: "bg-gray-100 text-gray-800" }
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

const niveauConfig: Record<string, { label: string; className: string; dot: string }> = {
  critique: { label: "Critique", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  important: { label: "Important", className: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  informatif: { label: "Info", className: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
}

interface RecentDoc {
  id: string
  nom_fichier: string
  type_document: string
  statut: string
  created_at: string
  client_name: string
}

export default function ComptableDashboardPage() {
  const { profile } = useProfile()
  const [clientCount, setClientCount] = useState(0)
  const [dossierCount, setDossierCount] = useState(0)
  const [pendingDocs, setPendingDocs] = useState(0)
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([])
  const [loading, setLoading] = useState(true)

  const firstName = profile?.full_name?.split(" ")[0] || ""
  const isDedie = profile?.role === "comptable_dedie"

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, dossiersRes, docsRes] = await Promise.all([
        fetch("/api/comptable/clients"),
        fetch("/api/admin/dossiers"),
        fetch("/api/comptable/documents"),
      ])

      const clientsData = await clientsRes.json()
      const dossiersData = await dossiersRes.json()
      const docsData = await docsRes.json()

      if (clientsData.clients) setClientCount(clientsData.clients.length)
      if (dossiersData.dossiers) setDossierCount(dossiersData.dossiers.length)

      if (docsData.documents) {
        const docs = docsData.documents as RecentDoc[]
        setPendingDocs(docs.filter(d => d.statut === "en_cours").length)
        setRecentDocs(docs.slice(0, 5))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Fiscal obligations for current month
  const now = new Date()
  const currentMonth = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const obligations = [
    { label: "Declaration TVA (MRA)", deadline: `20 ${currentMonth}`, done: false },
    { label: "Paiement CSG", deadline: `15 ${currentMonth}`, done: false },
    { label: "Declaration PAYE (MRA)", deadline: `20 ${currentMonth}`, done: false },
  ]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Bienvenue{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDedie ? "Vue d'ensemble de vos clients assignes" : "Vue d'ensemble de votre portefeuille"}
        </p>
      </div>

      {/* Section A -- KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clients actifs</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : clientCount}
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
                <p className="text-sm text-muted-foreground">Dossiers actifs</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : dossierCount}
                </p>
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
                <p className="text-sm text-muted-foreground">Documents en cours</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : pendingDocs}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingDocs > 0 ? "En attente d'analyse" : "Aucun document en attente"}
                </p>
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
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>0</p>
                <p className="text-xs text-muted-foreground mt-1">Aucune alerte</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B -- Alertes Fiscales & Comptables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <AlertTriangle className="h-5 w-5" />
            Alertes fiscales et comptables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune alerte pour le moment.</p>
            <p className="text-xs text-muted-foreground mt-1">Les alertes fiscales et comptables apparaitront ici automatiquement.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section D -- Obligations du mois */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Calendar className="h-5 w-5" />
              Obligations du mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {obligations.map((ob, i) => {
                const deadlineDate = new Date(now.getFullYear(), now.getMonth(), parseInt(ob.deadline))
                const isPast = now > deadlineDate
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${isPast ? "bg-red-500" : "bg-yellow-500"}`} />
                      <div>
                        <p className="text-sm font-medium">{ob.label}</p>
                        <p className="text-xs text-muted-foreground">Echeance: {ob.deadline}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={isPast ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}>
                      {isPast ? "En retard" : "A venir"}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Section E -- Documents recents */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
                <Clock className="h-5 w-5" />
                Documents recents
              </CardTitle>
              <Link href="/comptable/documents">
                <Button variant="ghost" size="sm" className="text-xs">Voir tout</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : recentDocs.length > 0 ? (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.nom_fichier}</p>
                        <p className="text-xs text-muted-foreground">{doc.client_name} - {formatDate(doc.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(doc.statut)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Aucun document recent.</p>
                <p className="text-xs text-muted-foreground mt-1">{"Les documents televerses par vos clients apparaitront ici."}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
