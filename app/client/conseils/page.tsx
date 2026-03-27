"use client"

import { useState, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Lightbulb,
  Phone,
  AlertTriangle,
  PiggyBank,
  Users,
  Receipt,
  Lock,
  TrendingUp,
  Shield,
  FileText,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conseil {
  id: string
  titre: string
  description: string
  montant?: number
  detail: string
  urgence: "haute" | "moyenne" | "basse"
  domaine?: string
  icon: string
  action: string
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function ConseilIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "receipt":
      return <Receipt className="h-6 w-6" />
    case "alert":
      return <AlertTriangle className="h-6 w-6" />
    case "users":
      return <Users className="h-6 w-6" />
    case "piggybank":
      return <PiggyBank className="h-6 w-6" />
    case "lightbulb":
      return <Lightbulb className="h-6 w-6" />
    case "trending":
      return <TrendingUp className="h-6 w-6" />
    case "shield":
      return <Shield className="h-6 w-6" />
    case "file":
      return <FileText className="h-6 w-6" />
    default:
      return <Lightbulb className="h-6 w-6" />
  }
}

// ---------------------------------------------------------------------------
// Urgency badge
// ---------------------------------------------------------------------------

function UrgenceBadge({ urgence }: { urgence: Conseil["urgence"] }) {
  switch (urgence) {
    case "haute":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Urgent
        </Badge>
      )
    case "moyenne":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          A prevoir
        </Badge>
      )
    case "basse":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          Bonne idee
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Domain badge
// ---------------------------------------------------------------------------

function DomaineBadge({ domaine }: { domaine?: string }) {
  if (!domaine) return null
  return (
    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
      {domaine}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Access denied for client_user
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-12 text-center space-y-4">
          <Lock className="h-12 w-12 mx-auto text-orange-400" />
          <h2 className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
            Acces reserve
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cette page est reservee au responsable de l{"'"}entreprise.
            Si vous pensez que c{"'"}est une erreur, contactez votre administrateur.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conseils view (client_admin)
// ---------------------------------------------------------------------------

function ConseilsView() {
  const [conseils, setConseils] = useState<Conseil[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch("/api/client/conseils")
      if (res.ok) {
        const data = await res.json()
        // The API returns { conseils: { recommandations: [...], ... } }
        // Support multiple response shapes from the AI
        const conseilsData = data.conseils || data
        const items = conseilsData.recommandations || conseilsData.recommendations || conseilsData.conseils || []
        if (Array.isArray(items)) {
          setConseils(
            items.map((c: any, idx: number) => ({
              id: c.id || `conseil-${idx + 1}`,
              titre: c.titre || c.title || "",
              description: c.description || "",
              montant: c.montant ?? c.amount ?? undefined,
              detail: c.detail || c.details || c.description || "",
              urgence: c.urgence || c.priority || "basse",
              domaine: c.domaine || c.domain || undefined,
              icon: c.icon || "lightbulb",
              action: c.action || c.action_requise || "Consulter",
            }))
          )
        }
        setGenerated(true)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Conseils de votre comptable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Des recommandations personnalisees pour votre entreprise ce mois-ci.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="text-white"
          style={{ backgroundColor: "#C9A84C" }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generation en cours...
            </>
          ) : (
            <>
              <Lightbulb className="h-4 w-4 mr-2" />
              Generer mes conseils
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <Card className="border-[#C9A84C]/30 bg-[#C9A84C]/5">
          <CardContent className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Analyse de vos donnees financieres en cours...
            </p>
            <p className="text-xs text-muted-foreground">
              Cela peut prendre quelques secondes.
            </p>
          </CardContent>
        </Card>
      ) : !generated && conseils.length === 0 ? (
        <Card className="border-[#C9A84C]/30 bg-[#C9A84C]/5">
          <CardContent className="py-12 text-center space-y-4">
            <Lightbulb className="h-12 w-12 mx-auto" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {error
                ? "Impossible de charger les conseils pour le moment. Reessayez plus tard."
                : "Cliquez sur \"Generer mes conseils\" pour obtenir des recommandations personnalisees basees sur vos donnees financieres."}
            </p>
          </CardContent>
        </Card>
      ) : generated && conseils.length === 0 ? (
        <Card className="border-[#C9A84C]/30 bg-[#C9A84C]/5">
          <CardContent className="py-12 text-center space-y-4">
            <Lightbulb className="h-12 w-12 mx-auto" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {error
                ? "Impossible de charger les conseils pour le moment. Reessayez plus tard."
                : "Aucun conseil disponible pour le moment. Vos donnees n'ont pas encore ete suffisamment traitees."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {conseils.map((conseil) => (
            <Card
              key={conseil.id}
              className={`overflow-hidden ${
                conseil.urgence === "haute"
                  ? "border-red-200"
                  : conseil.urgence === "moyenne"
                  ? "border-orange-200"
                  : "border-gray-200"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 p-2 rounded-lg"
                      style={{ backgroundColor: "#C9A84C20", color: "#C9A84C" }}
                    >
                      <ConseilIcon icon={conseil.icon} />
                    </div>
                    <div>
                      <CardTitle className="text-base" style={{ color: "#1E2A4A" }}>
                        {conseil.titre}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {conseil.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {conseil.montant != null && conseil.montant > 0 && (
                      <span className="text-sm font-bold" style={{ color: "#1E2A4A" }}>
                        {fmtMUR(conseil.montant)}
                      </span>
                    )}
                    <DomaineBadge domaine={conseil.domaine} />
                    <UrgenceBadge urgence={conseil.urgence} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {conseil.detail}
                </p>
                <Button
                  size="sm"
                  className="text-white"
                  style={{ backgroundColor: "#1E2A4A" }}
                >
                  {conseil.action === "Contacter mon comptable" && (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {conseil.action}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ConseilsPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <AccessDenied />
  }

  return <ConseilsView />
}
