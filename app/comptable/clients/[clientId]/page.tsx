"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Phone,
  UserX,
  Clock,
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface ClientInfo {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  created_at: string
}

interface SocieteCard {
  id: string
  nom: string
  brn: string | null
  statut_tva: boolean
  nbDocs: number
  derniere_activite: string
}

interface AlerteEntry {
  id: string
  niveau: string
  titre: string
  description: string
}

export default function FicheClientPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.clientId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [societes, setSocietes] = useState<SocieteCard[]>([])
  const [alertes, setAlertes] = useState<AlerteEntry[]>([])

  useEffect(() => {
    async function fetchClientData() {
      setLoading(true)
      setError(null)
      try {
        // Use comptable/clients API which already returns clients + dossiers + societes
        const results = await Promise.allSettled([
          fetch("/api/comptable/clients").then((r) => r.json()),
          fetch("/api/comptable/alertes").then((r) => r.ok ? r.json() : { alertes: [] }),
        ])

        const clientsData = results[0].status === "fulfilled" ? results[0].value : {}
        const alertesData = results[1].status === "fulfilled" ? results[1].value : {}

        // Find client in the list
        const allClients = clientsData.clients || []
        const user = allClients.find((u: Record<string, unknown>) => u.id === clientId)
        if (!user) throw new Error("Client introuvable")

        setClient({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone || "",
          role: user.role,
          created_at: user.created_at,
        })

        // Get client societes from dossiers
        const allDossiers = clientsData.dossiers || []
        const clientDossiers = allDossiers.filter(
          (d: Record<string, unknown>) => d.client_id === clientId
        )

        const clientSocietes: SocieteCard[] = clientDossiers
          .filter((d: any) => d.societe)
          .map((d: any) => ({
            id: d.societe.id || d.societe_id,
            nom: d.societe.nom || "Sans nom",
            brn: d.societe.brn || null,
            statut_tva: d.societe.statut_tva || false,
            nbDocs: 0,
            derniere_activite: d.created_at || "",
          }))

        // Deduplicate by id
        const uniqueSocietes = Array.from(
          new Map(clientSocietes.map(s => [s.id, s])).values()
        )

        // If no societes from dossiers, try to find owned societes
        if (uniqueSocietes.length === 0) {
          const socRes = await fetch("/api/admin/societes").then(r => r.json()).catch(() => ({ societes: [] }))
          const owned = (socRes.societes || []).filter((s: any) => s.created_by === clientId)
          owned.forEach((s: any) => {
            uniqueSocietes.push({
              id: s.id, nom: s.nom, brn: s.brn || null,
              statut_tva: s.statut_tva || false, nbDocs: 0, derniere_activite: s.created_at || "",
            })
          })
        }

        setSocietes(uniqueSocietes)

        // Alertes
        const items = alertesData.alertes || []
        setAlertes(
          items.map((a: Record<string, unknown>) => ({
            id: (a.id as string) || crypto.randomUUID(),
            niveau:
              a.type === "urgent"
                ? "critique"
                : a.type === "attention"
                  ? "important"
                  : "info",
            titre: (a.titre as string) || "",
            description: (a.description as string) || "",
          }))
        )
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
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <UserX className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-base">
              {error || "Client introuvable"}
            </p>
            <Link href="/comptable">
              <Button
                variant="outline"
                className="mt-2 gap-2"
                style={{ borderColor: NAVY, color: NAVY }}
              >
                <ArrowLeft className="h-4 w-4" />
                Retour au dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  function roleBadge(role: string) {
    if (role === "client_admin")
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
          Admin
        </Badge>
      )
    return (
      <Badge className="bg-gray-50 text-gray-600 border-gray-200">
        Utilisateur
      </Badge>
    )
  }

  function alertDotColor(niveau: string) {
    if (niveau === "critique") return "bg-red-500"
    if (niveau === "important") return "bg-orange-500"
    return "bg-blue-500"
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-8 pb-12">
      {/* Breadcrumb + back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/comptable"
            className="flex items-center gap-1 hover:underline"
            style={{ color: NAVY }}
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium" style={{ color: NAVY }}>
            {client.full_name}
          </span>
        </div>
      </div>

      {/* Client header */}
      <Card style={{ backgroundColor: `${NAVY}08` }}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div
              className="flex items-center justify-center h-16 w-16 rounded-full text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: GOLD }}
            >
              {client.full_name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
                  {client.full_name}
                </h1>
                {roleBadge(client.role)}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </span>
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Client depuis{" "}
                  {new Date(client.created_at).toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Societes grid */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Societes ({societes.length})
        </h2>

        {societes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">Aucune societe enregistree</p>
              <p className="text-sm">
                Ce client n&apos;a aucune societe liee.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {societes.map((soc) => (
              <Card
                key={soc.id}
                className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
                style={{ borderLeftColor: GOLD }}
                onClick={() =>
                  router.push(
                    `/comptable/clients/${clientId}/${soc.id}`
                  )
                }
              >
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2
                        className="h-5 w-5"
                        style={{ color: NAVY }}
                      />
                      <span
                        className="font-semibold"
                        style={{ color: NAVY }}
                      >
                        {soc.nom}
                      </span>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 text-muted-foreground"
                    />
                  </div>

                  {soc.brn && (
                    <p className="text-xs text-muted-foreground">
                      BRN : {soc.brn}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={
                        soc.statut_tva
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }
                    >
                      TVA : {soc.statut_tva ? "Assujetti" : "Non assujetti"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Documents
                      </p>
                      <p className="font-semibold" style={{ color: NAVY }}>
                        {soc.nbDocs}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Derniere activite
                      </p>
                      <p className="text-xs">
                        {soc.derniere_activite
                          ? new Date(
                              soc.derniere_activite
                            ).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "--"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Alertes */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          Alertes pour ce client ({alertes.length})
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
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-3 w-3 rounded-full shrink-0 ${alertDotColor(alerte.niveau)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{alerte.titre}</p>
                      {alerte.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alerte.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {alerte.niveau}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Retour */}
      <div>
        <Link href="/comptable">
          <Button
            variant="outline"
            className="gap-2"
            style={{ borderColor: NAVY, color: NAVY }}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}
