import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Features } from "@/components/features"
import { CTA } from "@/components/cta"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
