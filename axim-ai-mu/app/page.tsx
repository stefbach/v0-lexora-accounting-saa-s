import Nav from "@/components/landing/Nav"
import NeuralHero from "@/components/landing/NeuralHero"
import {
  PromiseSection,
  AgentsSection,
  ProofSection,
  ProcessSection,
  CTASection,
  Footer
} from "@/components/landing/Sections"

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <NeuralHero />
        <PromiseSection />
        <AgentsSection />
        <ProofSection />
        <ProcessSection />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
