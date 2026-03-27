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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Upload,
  Bell,
  BarChart3,
  Send,
  Clock,
  ShieldAlert,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockClient = {
  id: "client-001",
  full_name: "Raj Doorgakant",
  email: "raj.doorgakant@email.mu",
  phone: "+230 5 234 8901",
  type: "groupe" as const, // "individuel" | "mono" | "groupe"
  societeCount: 2,
  created_at: "2022-06-15",
}

interface Alerte {
  id: string
  niveau: "critique" | "important" | "info"
  titre: string
  societe: string
  montant?: string
  echeance?: string
}

const mockAlertes: Alerte[] = [
  {
    id: "a1",
    niveau: "critique",
    titre: "TVA TIBOK Mars 2026 non déclarée",
    societe: "TIBOK",
    montant: "45 230 MUR",
    echeance: "20/03/2026",
  },
  {
    id: "a2",
    niveau: "important",
    titre: "5 documents non traités",
    societe: "TIBOK",
  },
  {
    id: "a3",
    niveau: "important",
    titre: "Relevé MCB février manquant",
    societe: "TIBOK",
  },
]

interface Societe {
  id: string
  nom: string
  active: boolean
  brn: string
  statut_tva: boolean
  ca_mois: number
  tva_nette: number
  docs_attente: number
  derniere_activite: string
  alertes_critiques: number
  alertes_importantes: number
}

const mockSocietes: Societe[] = [
  {
    id: "soc-001",
    nom: "TIBOK Ltd",
    active: true,
    brn: "C12345678",
    statut_tva: true,
    ca_mois: 1_250_000,
    tva_nette: 45_230,
    docs_attente: 5,
    derniere_activite: "Il y a 2 heures",
    alertes_critiques: 1,
    alertes_importantes: 2,
  },
  {
    id: "soc-002",
    nom: "BPO Services Ltd",
    active: true,
    brn: "C98765432",
    statut_tva: true,
    ca_mois: 780_000,
    tva_nette: 28_400,
    docs_attente: 0,
    derniere_activite: "Hier",
    alertes_critiques: 0,
    alertes_importantes: 0,
  },
]

interface Obligation {
  echeance: string
  type: string
  societe: string
  montant: number
  statut: "en_retard" | "a_faire" | "declare"
}

const mockObligations: Obligation[] = [
  {
    echeance: "20/04/2026",
    type: "TVA mensuelle",
    societe: "TIBOK Ltd",
    montant: 45_230,
    statut: "en_retard",
  },
  {
    echeance: "15/04/2026",
    type: "PAYE",
    societe: "TIBOK Ltd",
    montant: 32_800,
    statut: "a_faire",
  },
  {
    echeance: "15/04/2026",
    type: "NPF / HRDC",
    societe: "BPO Services Ltd",
    montant: 18_750,
    statut: "a_faire",
  },
  {
    echeance: "15/04/2026",
    type: "NPS",
    societe: "BPO Services Ltd",
    montant: 12_400,
    statut: "declare",
  },
]

interface ConsolideLine {
  indicateur: string
  tibok: number
  bpo: number
}

const mockConsolide: ConsolideLine[] = [
  { indicateur: "CA HT", tibok: 1_250_000, bpo: 780_000 },
  { indicateur: "Charges", tibok: 890_000, bpo: 520_000 },
  { indicateur: "Résultat exploitation", tibok: 360_000, bpo: 260_000 },
  { indicateur: "TVA nette", tibok: 45_230, bpo: 28_400 },
  { indicateur: "Trésorerie", tibok: 2_150_000, bpo: 1_430_000 },
  { indicateur: "Masse salariale", tibok: 485_000, bpo: 310_000 },
]

interface Activite {
  id: string
  type: "document" | "declaration" | "whatsapp" | "alerte" | "rapport"
  description: string
  societe: string
  temps: string
}

const mockActivites: Activite[] = [
  { id: "act1", type: "document", description: "Facture #INV-2026-0412 téléversée", societe: "TIBOK", temps: "Il y a 25 min" },
  { id: "act2", type: "alerte", description: "Alerte TVA Mars générée automatiquement", societe: "TIBOK", temps: "Il y a 1 heure" },
  { id: "act3", type: "whatsapp", description: "Message envoyé : rappel documents manquants", societe: "TIBOK", temps: "Il y a 2 heures" },
  { id: "act4", type: "declaration", description: "Déclaration NPS soumise à la MRA", societe: "BPO Services", temps: "Il y a 3 heures" },
  { id: "act5", type: "document", description: "Relevé SBM mars 2026 importé", societe: "BPO Services", temps: "Il y a 5 heures" },
  { id: "act6", type: "rapport", description: "Rapport mensuel février généré", societe: "TIBOK", temps: "Hier à 16:30" },
  { id: "act7", type: "declaration", description: "PAYE février déclarée et payée", societe: "TIBOK", temps: "Hier à 14:00" },
  { id: "act8", type: "document", description: "3 factures fournisseurs catégorisées", societe: "BPO Services", temps: "Hier à 11:20" },
  { id: "act9", type: "whatsapp", description: "Réponse client reçue : confirmation BRN", societe: "TIBOK", temps: "Avant-hier" },
  { id: "act10", type: "rapport", description: "Bilan trimestriel Q4 2025 finalisé", societe: "BPO Services", temps: "Il y a 3 jours" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMUR(n: number) {
  return n.toLocaleString("fr-MU") + " MUR"
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function clientTypeBadge(type: string, count: number) {
  if (type === "individuel") return "Individuel"
  if (type === "mono") return "Mono-société"
  return `Groupe (${count} sociétés)`
}

function statutBadge(statut: Obligation["statut"]) {
  switch (statut) {
    case "en_retard":
      return <Badge className="bg-red-600 text-white border-red-600">En retard</Badge>
    case "a_faire":
      return <Badge className="bg-orange-500 text-white border-orange-500">À faire</Badge>
    case "declare":
      return <Badge className="bg-green-600 text-white border-green-600">Déclaré / Payé</Badge>
  }
}

function alertDotColor(niveau: Alerte["niveau"]) {
  if (niveau === "critique") return "bg-red-500"
  if (niveau === "important") return "bg-orange-500"
  return "bg-blue-500"
}

function societeLeftBorder(s: Societe) {
  if (s.alertes_critiques > 0) return "border-l-4 border-l-red-500"
  if (s.alertes_importantes > 0) return "border-l-4 border-l-orange-500"
  return "border-l-4 border-l-green-500"
}

function activityIcon(type: Activite["type"]) {
  switch (type) {
    case "document":
      return <Upload className="h-4 w-4 text-blue-500" />
    case "declaration":
      return <FileText className="h-4 w-4 text-green-600" />
    case "whatsapp":
      return <MessageCircle className="h-4 w-4" style={{ color: "#25D366" }} />
    case "alerte":
      return <Bell className="h-4 w-4 text-red-500" />
    case "rapport":
      return <BarChart3 className="h-4 w-4" style={{ color: GOLD }} />
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FicheClientPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  const client = mockClient
  const alertes = mockAlertes
  const societes = mockSocietes
  const obligations = mockObligations
  const consolide = mockConsolide
  const activites = mockActivites

  const totalObligations = obligations.reduce((s, o) => s + o.montant, 0)
  const showConsolide = societes.length >= 2

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-8 pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* BREADCRUMB                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/comptable/clients"
          className="flex items-center gap-1 hover:underline"
          style={{ color: NAVY }}
        >
          <ArrowLeft className="h-4 w-4" />
          Portefeuille
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium" style={{ color: NAVY }}>
          {client.full_name}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1 — HEADER CLIENT                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ backgroundColor: `${NAVY}10` }}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Avatar */}
            <div
              className="flex items-center justify-center h-16 w-16 rounded-full text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: GOLD }}
            >
              {getInitials(client.full_name)}
            </div>

            {/* Info */}
            <div className="flex-1 space-y-2">
              <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
                {client.full_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {client.email} &nbsp;|&nbsp; {client.phone}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className="border text-xs"
                  style={{ borderColor: NAVY, color: NAVY }}
                  variant="outline"
                >
                  {clientTypeBadge(client.type, client.societeCount)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Client depuis{" "}
                  {new Date(client.created_at).toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                style={{ borderColor: GOLD, color: GOLD }}
                asChild
              >
                <a href={`https://wa.me/${client.phone.replace(/\s+/g, "").replace("+", "")}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={`mailto:${client.email}`}>
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2 — ALERTES ACTIVES                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Alertes actives ({alertes.length})
        </h2>

        {alertes.length === 0 ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-3 pt-6">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-green-700 font-medium">
                Aucune alerte active
              </span>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alertes.map((alerte) => (
              <Card key={alerte.id} className="py-3">
                <CardContent className="py-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Dot + title */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span
                        className={`h-3 w-3 rounded-full shrink-0 ${alertDotColor(alerte.niveau)}`}
                      />
                      <span className="font-medium text-sm truncate">
                        {alerte.titre}
                      </span>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {alerte.societe}
                      </Badge>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 shrink-0">
                      {alerte.montant && (
                        <span className="text-sm font-semibold" style={{ color: NAVY }}>
                          {alerte.montant}
                        </span>
                      )}
                      {alerte.echeance && (
                        <span className="text-xs text-muted-foreground">
                          Échéance : {alerte.echeance}
                        </span>
                      )}
                      <Button size="sm" className="text-white text-xs" style={{ backgroundColor: GOLD }}>
                        Traiter
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 3 — SES SOCIÉTÉS                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Sociétés ({societes.length})
          </h2>
          <Button size="sm" variant="outline" className="gap-1" style={{ borderColor: GOLD, color: GOLD }}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {societes.map((soc) => (
            <Card key={soc.id} className={`${societeLeftBorder(soc)} py-4`}>
              <CardContent className="space-y-4 py-0">
                {/* Top row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" style={{ color: NAVY }} />
                    <span className="font-semibold" style={{ color: NAVY }}>
                      {soc.nom}
                    </span>
                  </div>
                  <Badge
                    className={
                      soc.active
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }
                    variant="outline"
                  >
                    {soc.active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {/* BRN + TVA */}
                <div className="text-xs text-muted-foreground">
                  BRN : {soc.brn} &nbsp;·&nbsp; TVA :{" "}
                  {soc.statut_tva ? (
                    <span className="text-green-600 font-medium">Enregistrée</span>
                  ) : (
                    <span className="text-gray-400">Non enregistrée</span>
                  )}
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">CA ce mois</p>
                    <p className="font-semibold" style={{ color: NAVY }}>
                      {formatMUR(soc.ca_mois)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">TVA nette</p>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold" style={{ color: NAVY }}>
                        {formatMUR(soc.tva_nette)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1"
                        style={{ borderColor: GOLD, color: GOLD }}
                      >
                        À payer
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Docs en attente</p>
                    <p className="font-semibold" style={{ color: soc.docs_attente > 0 ? "#EA580C" : NAVY }}>
                      {soc.docs_attente}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Dernière activité</p>
                    <p className="font-semibold" style={{ color: NAVY }}>
                      {soc.derniere_activite}
                    </p>
                  </div>
                </div>

                {/* Alert badges */}
                {(soc.alertes_critiques > 0 || soc.alertes_importantes > 0) && (
                  <div className="flex items-center gap-2">
                    {soc.alertes_critiques > 0 && (
                      <Badge className="bg-red-600 text-white border-red-600 text-xs gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        {soc.alertes_critiques} critique{soc.alertes_critiques > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {soc.alertes_importantes > 0 && (
                      <Badge className="bg-orange-500 text-white border-orange-500 text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {soc.alertes_importantes} important{soc.alertes_importantes > 1 ? "es" : "e"}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Open button */}
                <Link href={`/comptable/clients/${clientId}/${soc.id}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center gap-1 font-medium"
                    style={{ color: GOLD }}
                  >
                    Ouvrir le dossier
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 4 — OBLIGATIONS DU MOIS                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Obligations fiscales — Avril 2026
        </h2>

        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obligations.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{o.echeance}</TableCell>
                    <TableCell>{o.type}</TableCell>
                    <TableCell>{o.societe}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMUR(o.montant)}
                    </TableCell>
                    <TableCell className="text-center">
                      {statutBadge(o.statut)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold" style={{ color: NAVY }}>
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold" style={{ color: NAVY }}>
                    {formatMUR(totalObligations)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 5 — VUE CONSOLIDÉE GROUPE                                  */}
      {/* ------------------------------------------------------------------ */}
      {showConsolide && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Vue consolidée — Avril 2026
          </h2>

          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicateur</TableHead>
                    <TableHead className="text-right">TIBOK</TableHead>
                    <TableHead className="text-right">BPO</TableHead>
                    <TableHead className="text-right font-bold">TOTAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolide.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.indicateur}</TableCell>
                      <TableCell className="text-right">
                        {formatMUR(row.tibok)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMUR(row.bpo)}
                      </TableCell>
                      <TableCell
                        className="text-right font-bold"
                        style={{ color: NAVY }}
                      >
                        {formatMUR(row.tibok + row.bpo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 6 — ACTIVITÉ RÉCENTE                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Activité récente
        </h2>

        <Card>
          <CardContent className="pt-4">
            <div className="divide-y">
              {activites.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                    {activityIcon(act.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {act.description}{" "}
                      <span className="text-muted-foreground">
                        — {act.societe}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {act.temps}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RETOUR                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <Link href="/comptable/clients">
          <Button variant="outline" className="gap-2" style={{ borderColor: NAVY, color: NAVY }}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux clients
          </Button>
        </Link>
      </div>
    </div>
  )
}
