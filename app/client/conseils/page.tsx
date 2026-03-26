"use client"

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
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock recommendations
// ---------------------------------------------------------------------------

interface Conseil {
  id: string
  titre: string
  description: string
  montant?: number
  detail: string
  urgence: "haute" | "moyenne" | "basse"
  icon: React.ReactNode
  action: string
}

const mockConseils: Conseil[] = [
  {
    id: "c1",
    titre: "Relancer vos clients",
    description: "Vous avez des factures impayees depuis plus de 30 jours.",
    montant: 87_500,
    detail:
      "3 factures sont en retard de paiement : Client Dupont (32 000 MUR), Client Martin (25 500 MUR) et Client Ramasamy (30 000 MUR). Plus vous attendez, plus il sera difficile de recuperer ces montants.",
    urgence: "haute",
    icon: <Receipt className="h-6 w-6" />,
    action: "Contacter mon comptable",
  },
  {
    id: "c2",
    titre: "Anticiper la TVA d'avril",
    description: "Votre declaration TVA arrive bientot. Mieux vaut preparer le montant a l'avance.",
    montant: 45_230,
    detail:
      "La date limite est le 20 avril. Mettez ce montant de cote des maintenant pour eviter les surprises. Votre comptable peut vous aider a verifier les calculs.",
    urgence: "haute",
    icon: <AlertTriangle className="h-6 w-6" />,
    action: "Contacter mon comptable",
  },
  {
    id: "c3",
    titre: "Preparer le 13eme mois",
    description: "Il est temps de commencer a mettre de l'argent de cote pour le bonus de fin d'annee.",
    detail:
      "Avec 17 employes, le 13eme mois represente une depense importante en decembre. En commencant a provisionner maintenant (environ 30 000 MUR par mois), vous eviterez un gros impact sur votre tresorerie en fin d'annee.",
    urgence: "moyenne",
    icon: <Users className="h-6 w-6" />,
    action: "Voir le detail",
  },
  {
    id: "c4",
    titre: "Revoir vos abonnements",
    description: "Certains abonnements pourraient etre optimises.",
    montant: 8_200,
    detail:
      "Nous avons remarque des abonnements logiciels en double ou peu utilises. En les optimisant, vous pourriez economiser environ 8 200 MUR par mois.",
    urgence: "basse",
    icon: <PiggyBank className="h-6 w-6" />,
    action: "En savoir plus",
  },
  {
    id: "c5",
    titre: "Profiter du credit d'impot formation",
    description: "Vous pouvez deduire certains frais de formation de vos impots.",
    detail:
      "Si vous avez forme des employes cette annee, certaines depenses sont deductibles. Envoyez les justificatifs a votre comptable pour en beneficier lors de la prochaine declaration.",
    urgence: "basse",
    icon: <Lightbulb className="h-6 w-6" />,
    action: "Contacter mon comptable",
  },
]

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
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Conseils de votre comptable
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Des recommandations personnalisees pour votre entreprise ce mois-ci.
        </p>
      </div>

      <div className="space-y-4">
        {mockConseils.map((conseil) => (
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
                    {conseil.icon}
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
                  {conseil.montant && (
                    <span className="text-sm font-bold" style={{ color: "#1E2A4A" }}>
                      {fmtMUR(conseil.montant)}
                    </span>
                  )}
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
