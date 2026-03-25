import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileText, BarChart3, Shield, MessageSquare, Cpu } from "lucide-react"

const features = [
  {
    icon: Cpu,
    title: "Traitement IA des documents",
    description: "Classification automatique des factures, relevés bancaires et fiches de paie grâce à Claude AI via n8n.",
  },
  {
    icon: FileText,
    title: "Conformité MRA",
    description: "Calcul automatique de la TVA, génération des formulaires MRA et suivi des deadlines fiscales.",
  },
  {
    icon: MessageSquare,
    title: "Alertes WhatsApp",
    description: "Notifications automatiques par WhatsApp pour les échéances TVA, documents traités et rappels urgents.",
  },
  {
    icon: Users,
    title: "Multi-rôles",
    description: "Tableaux de bord dédiés pour admin, comptables et clients avec permissions par rôle.",
  },
  {
    icon: BarChart3,
    title: "Rapports P&L automatiques",
    description: "Génération mensuelle du compte de résultat, EBITDA et indicateurs financiers par société.",
  },
  {
    icon: Shield,
    title: "Sécurité bancaire",
    description: "Chiffrement de bout en bout, authentification Supabase et stockage sécurisé des documents.",
  },
]

export function Features() {
  return (
    <section id="features" className="bg-secondary/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tout ce qu&apos;il faut pour gérer vos finances
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Conçu pour les professionnels de la comptabilité à Maurice qui exigent efficacité, sécurité et collaboration.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/50 bg-card transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
