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
  Plus,
  Upload,
  Bell,
  BarChart3,
  Clock,
  UserX,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Client {
  id: string
  full_name: string
  email: string
  phone: string
  type: "individuel" | "mono" | "groupe"
  societeCount: number
  created_at: string
}

interface Alerte {
  id: string
  niveau: "critique" | "important" | "info"
  titre: string
  societe: string
  montant?: string
  echeance?: string
}

interface Societe {
  id: string
  nom: string
  brn: string
  statut: string
  dernierDoc: string
  nbDocs: number
  anomalies: number
}

interface Obligation {
  echeance: string
  type: string
  societe: string
  montant: number
  statut: "en_retard" | "a_faire" | "declare"
}

interface ConsolideLine {
  indicateur: string
  values: Record<string, number>
}

interface Activite {
  id: string
  type: "document" | "declaration" | "whatsapp" | "alerte" | "rapport"
  description: string
  societe: string
  temps: string
}

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
  if (s.anomalies > 0) return "border-l-4 border-l-orange-500"
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
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [consolide, setConsolide] = useState<ConsolideLine[]>([])
  const [activites, setActivites] = useState<Activite[]>([])

  useEffect(() => {
    async function fetchClientData() {
      setLoading(true)
      setError(null)
      try {
        const [usersRes, societesRes, dossiersRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/societes"),
          fetch("/api/admin/dossiers"),
        ])
        const [usersData, societesData, dossiersData] = await Promise.all([
          usersRes.json(), societesRes.json(), dossiersRes.json(),
        ])

        // Find the client
        const user = usersData.users?.find((u: any) => u.id === clientId)
        if (!user) throw new Error("Client introuvable")

        // Get client's societes via dossiers
        const clientDossiers = (dossiersData.dossiers || []).filter((d: any) => d.client_id === clientId)
        const societeIds = [...new Set(clientDossiers.map((d: any) => d.societe_id))]
        const clientSocietes = (societesData.societes || [])
          .filter((s: any) => societeIds.includes(s.id))
          .map((s: any) => ({
            id: s.id,
            nom: s.nom,
            brn: s.brn || "",
            statut: "actif" as const,
            dernierDoc: "",
            nbDocs: 0,
            anomalies: 0,
          }))

        const isPersonalOnly = clientSocietes.length === 1 && clientSocietes[0].nom.endsWith("— Personnel")
        const clientType = isPersonalOnly || clientSocietes.length === 0
          ? "individuel"
          : clientSocietes.length > 1 ? "groupe" : "mono"

        setClient({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone || "",
          type: clientType,
          societeCount: isPersonalOnly ? 0 : clientSocietes.length,
          created_at: user.created_at,
        })
        setSocietes(clientSocietes)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
      } finally {
        setLoading(false)
      }
    }
    fetchClientData()
  }, [clientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link
            href="/comptable/clients"
            className="flex items-center gap-1 hover:underline"
            style={{ color: NAVY }}
          >
            <ArrowLeft className="h-4 w-4" />
            Portefeuille
          </Link>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <UserX className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-base">
              {error || "Client introuvable"}
            </p>
            <p className="text-sm">
              Vérifiez le lien ou retournez au portefeuille clients.
            </p>
            <Link href="/comptable/clients">
              <Button variant="outline" className="mt-2 gap-2" style={{ borderColor: NAVY, color: NAVY }}>
                <ArrowLeft className="h-4 w-4" />
                Retour aux clients
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalObligations = obligations.reduce((s, o) => s + o.montant, 0)
  const showConsolide = societes.length >= 2 && consolide.length > 0

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

        {societes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">Aucune société enregistrée</p>
              <p className="text-sm">Créez un dossier personnel pour commencer le suivi comptable.</p>
              <Button
                size="sm"
                className="mt-2 gap-1 text-white"
                style={{ backgroundColor: GOLD }}
                onClick={async () => {
                  try {
                    const socRes = await fetch("/api/admin/societes", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ nom: `${client.full_name} — Personnel`, brn: null, numero_tva_mra: null, statut_tva: false }),
                    })
                    const socData = await socRes.json()
                    if (socRes.ok && socData.societe?.id) {
                      await fetch("/api/admin/dossiers", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ client_id: client.id, societe_id: socData.societe.id, comptable_id: null }),
                      })
                      // Refresh page
                      window.location.reload()
                    }
                  } catch {}
                }}
              >
                <Plus className="h-4 w-4" />
                Créer le dossier personnel
              </Button>
            </CardContent>
          </Card>
        ) : (
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
                        soc.statut === "actif"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }
                      variant="outline"
                    >
                      {soc.statut === "actif" ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {/* BRN */}
                  {soc.brn && (
                    <div className="text-xs text-muted-foreground">
                      BRN : {soc.brn}
                    </div>
                  )}

                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Documents</p>
                      <p className="font-semibold" style={{ color: NAVY }}>
                        {soc.nbDocs}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Anomalies</p>
                      <p className="font-semibold" style={{ color: soc.anomalies > 0 ? "#EA580C" : NAVY }}>
                        {soc.anomalies}
                      </p>
                    </div>
                  </div>

                  {/* Alert badges */}
                  {soc.anomalies > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500 text-white border-orange-500 text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {soc.anomalies} anomalie{soc.anomalies > 1 ? "s" : ""}
                      </Badge>
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
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 4 — OBLIGATIONS DU MOIS                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Obligations fiscales
        </h2>

        <Card>
          <CardContent className="pt-4">
            {obligations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Clock className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium">Aucune obligation fiscale</p>
                <p className="text-sm">Les échéances fiscales apparaîtront ici automatiquement.</p>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 5 — VUE CONSOLIDÉE GROUPE                                  */}
      {/* ------------------------------------------------------------------ */}
      {showConsolide && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Vue consolidée
          </h2>

          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicateur</TableHead>
                    {societes.map((s) => (
                      <TableHead key={s.id} className="text-right">{s.nom}</TableHead>
                    ))}
                    <TableHead className="text-right font-bold">TOTAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolide.map((row, i) => {
                    const total = Object.values(row.values).reduce((s, v) => s + v, 0)
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.indicateur}</TableCell>
                        {societes.map((s) => (
                          <TableCell key={s.id} className="text-right">
                            {formatMUR(row.values[s.id] ?? 0)}
                          </TableCell>
                        ))}
                        <TableCell
                          className="text-right font-bold"
                          style={{ color: NAVY }}
                        >
                          {formatMUR(total)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
            {activites.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Clock className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium">Aucune activité récente</p>
                <p className="text-sm">Les actions sur ce dossier client apparaîtront ici.</p>
              </div>
            ) : (
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
            )}
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
