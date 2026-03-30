import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  FileSearch,
  BookOpen,
  FileText,
  Users,
  Landmark,
  BellRing,
  Brain,
  MessageSquare,
  GitCompareArrows,
  Sparkles,
  CalendarClock,
  Bot,
  Shield,
  Scale,
  Building2,
  Globe,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"

const features = [
  {
    icon: FileSearch,
    title: "OCR & Documents IA",
    items: [
      "Upload PDF/Excel : l'IA analyse, classe et genere les ecritures automatiquement",
      "Reconnaissance factures, releves bancaires, fiches paie",
    ],
  },
  {
    icon: BookOpen,
    title: "Comptabilite Automatisee",
    items: [
      "Grand Livre, Balance, Bilan & P&L avec comparatif N/N-1",
      "Rapprochement bancaire auto, lettrage intelligent",
      "Multi-devises avec taux de change en temps reel (IAS 21)",
    ],
  },
  {
    icon: FileText,
    title: "Facturation MRA",
    items: [
      "Factures conformes MRA avec fiscalisation electronique (IRN + QR Code)",
      "Multi-devises EUR/USD/GBP, avoirs et notes de debit",
      "Templates personnalisables avec palette de couleurs",
    ],
  },
  {
    icon: Users,
    title: "RH & Paie Maurice",
    items: [
      "Bulletins de paie conformes (CSG/NSF/PAYE/PRGF)",
      "Pointeuse digitale, planning, conges (Workers' Rights Act 2019)",
      "Exports virements bancaires MCB/SBM + declarations MRA",
    ],
  },
  {
    icon: Landmark,
    title: "Fiscal MRA",
    items: [
      "IT Form 3 (Return of Income) auto-rempli",
      "Annual Return ROC auto-rempli",
      "TVA 9-Box, CSG/NSF/PAYE, APS",
      "Calendrier des echeances fiscales",
    ],
  },
  {
    icon: BellRing,
    title: "Alertes IA & Pilotage",
    items: [
      "Agent IA qui surveille les echeances fiscales",
      "Alertes WhatsApp et email automatiques",
      "Previsionnel intelligent : Budget vs Reel, BFR, Tresorerie",
      "Recommandations strategiques IA",
    ],
  },
]

const aiCapabilities = [
  { icon: Brain, text: "OCR intelligent (Claude) pour l'analyse documentaire" },
  { icon: MessageSquare, text: "Chat CLARA : assistante RH specialisee droit du travail mauricien" },
  { icon: GitCompareArrows, text: "Rapprochement bancaire automatique par matching intelligent" },
  { icon: Sparkles, text: "Primes IA : decrivez en langage naturel, le systeme cree les regles" },
  { icon: CalendarClock, text: "Planning IA : decrivez vos besoins, le planning se construit" },
  { icon: Bot, text: "Alertes proactives pour le comptable et ses clients" },
]

const plans = [
  { name: "Premium", description: "Tout inclus", highlight: true },
  { name: "Comptabilite", description: "Module compta uniquement", highlight: false },
  { name: "RH & Paie", description: "Module RH uniquement", highlight: false },
  { name: "Compta + RH", description: "Modules compta et RH combines", highlight: false },
]

const compliance = [
  { icon: Landmark, label: "MRA (Mauritius Revenue Authority)" },
  { icon: Scale, label: "Workers' Rights Act 2019" },
  { icon: Building2, label: "Companies Act (ROC)" },
  { icon: BookOpen, label: "IFRS for SMEs" },
  { icon: Globe, label: "IAS 21 (multi-devises)" },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="text-2xl font-bold tracking-tight" style={{ color: "#1E2A4A" }}>
            LEXORA
          </Link>
          <nav className="hidden gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Modules
            </a>
            <a href="#ai" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Intelligence IA
            </a>
            <a href="#plans" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Formules
            </a>
            <a href="#compliance" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Conformite
            </a>
          </nav>
          <Link href="/auth/login">
            <Button variant="outline" size="sm">
              Connexion
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section
          className="relative overflow-hidden py-24 md:py-32"
          style={{
            background: "linear-gradient(135deg, #1E2A4A 0%, #2a3d6b 50%, #1E2A4A 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle at 25% 25%, #C9A84C 1px, transparent 1px), radial-gradient(circle at 75% 75%, #C9A84C 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <Badge className="mb-6 border-0 px-4 py-1.5 text-sm font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
              <Sparkles className="mr-2 h-4 w-4" />
              Propulse par l&apos;Intelligence Artificielle
            </Badge>
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-white md:text-6xl">
              LEXORA — La comptabilite intelligente pour Maurice
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-300">
              Plateforme SaaS pilotee par IA pour la gestion comptable, RH et fiscale des entreprises mauriciennes
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/login">
                <Button size="lg" className="px-8 text-base font-semibold" style={{ backgroundColor: "#C9A84C", color: "#1E2A4A" }}>
                  Demarrer
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-white/30 px-8 text-base font-semibold text-white hover:bg-white/10">
                Voir la demo
              </Button>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                Modules intelligents
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                Six modules integres pour couvrir l&apos;ensemble de vos besoins comptables, RH et fiscaux
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="group border border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="pb-3">
                    <div
                      className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "rgba(201,168,76,0.1)" }}
                    >
                      <feature.icon className="h-6 w-6" style={{ color: "#C9A84C" }} />
                    </div>
                    <CardTitle className="text-lg" style={{ color: "#1E2A4A" }}>
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {feature.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#C9A84C" }} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* AI SECTION */}
        <section id="ai" className="py-20 md:py-28" style={{ backgroundColor: "#f8f9fb" }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                L&apos;IA au coeur du dispositif
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                Des agents intelligents qui automatisent, analysent et recommandent
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {aiCapabilities.map((cap, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "#1E2A4A" }}
                  >
                    <cap.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700">{cap.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                Formules adaptees
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                Choisissez la formule qui correspond a vos besoins
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    plan.highlight ? "border-2 shadow-md" : "border border-gray-100"
                  }`}
                  style={plan.highlight ? { borderColor: "#C9A84C" } : {}}
                >
                  {plan.highlight && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: "#C9A84C" }}
                    >
                      Populaire
                    </div>
                  )}
                  <CardHeader className="pb-2 pt-8">
                    <CardTitle className="text-xl" style={{ color: "#1E2A4A" }}>
                      {plan.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <p className="mb-6 text-sm text-gray-500">{plan.description}</p>
                    <Link href="/auth/login">
                      <Button
                        variant={plan.highlight ? "default" : "outline"}
                        className="w-full"
                        style={plan.highlight ? { backgroundColor: "#C9A84C", color: "#1E2A4A" } : {}}
                      >
                        Choisir
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* COMPLIANCE */}
        <section id="compliance" className="py-20 md:py-28" style={{ backgroundColor: "#f8f9fb" }}>
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                Conforme a la reglementation mauricienne
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {compliance.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3 shadow-sm"
                >
                  <item.icon className="h-5 w-5" style={{ color: "#C9A84C" }} />
                  <span className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28" style={{ backgroundColor: "#1E2A4A" }}>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              Pret a transformer votre comptabilite ?
            </h2>
            <p className="mb-10 text-gray-400">
              Rejoignez les entreprises mauriciennes qui font confiance a LEXORA
            </p>
            <Link href="/auth/login">
              <Button size="lg" className="px-10 text-base font-semibold" style={{ backgroundColor: "#C9A84C", color: "#1E2A4A" }}>
                Demarrer maintenant
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t bg-white py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <Link href="/" className="text-xl font-bold tracking-tight" style={{ color: "#1E2A4A" }}>
            LEXORA
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
              Connexion
            </Link>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">
              Contact
            </a>
          </div>
          <p className="text-sm text-gray-400">
            Powered by AI — Made in Mauritius
          </p>
        </div>
      </footer>
    </div>
  )
}
