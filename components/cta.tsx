import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="bg-primary py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
            Prêt à simplifier votre comptabilité ?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Contactez-nous pour une démonstration personnalisée
            adaptée aux besoins de votre entreprise.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              asChild
              className="gap-2 bg-background text-foreground hover:bg-background/90"
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
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link href="#features">Voir les fonctionnalités</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
