import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2 } from "lucide-react"

export function Hero() {
  const highlights = [
    "Traitement automatique des documents",
    "Conformité MRA",
    "Alertes en temps réel",
  ]

  return (
    <section className="relative overflow-hidden py-20 sm:py-28 lg:py-32" style={{ backgroundColor: "#FFFFFF" }}>
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ backgroundColor: "rgba(65,145,255,0.05)" }} />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 rounded-full blur-3xl" style={{ backgroundColor: "rgba(212,175,55,0.05)" }} />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{ backgroundColor: "rgba(65,145,255,0.08)", border: "1px solid rgba(65,145,255,0.15)" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#D4AF37" }} />
            <span className="text-sm font-medium" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
              La plateforme comptable pour Maurice
            </span>
          </div>

          <h1
            className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
          >
            Comptabilité Professionnelle
            <span className="block" style={{ color: "#4191FF" }}>Simplifiée et Automatisée</span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed"
            style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}
          >
            Optimisez votre gestion financière avec Lexora. Connectez comptables,
            entreprises et clients sur une plateforme conçue pour
            la comptabilité moderne à Maurice.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="gap-2"
              style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
            >
              <Link href="/redirect">
                Accéder au tableau de bord
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              style={{ border: "1px solid #4191FF", color: "#4191FF", backgroundColor: "transparent", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
            >
              <Link href="#features">En savoir plus</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {highlights.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm" style={{ color: "#4A5490" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "#D4AF37" }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
