"use client"

import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import VideoBackground from "@/components/three/VideoBackground"

// three.js uses window — load it client-side only.
const NeuralField3D = dynamic(
  () => import("@/components/three/NeuralField3D"),
  { ssr: false }
)

export default function NeuralHero() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <VideoBackground />

      {/* 3D Neural layer */}
      <div className="absolute inset-0 z-[1] opacity-80">
        <NeuralField3D />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-5 bg-axon-cyan" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-axon-cyan">
              SECTOR.INTELLIGENCE · MAURITIUS
            </span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-axon-green" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-axon-green" />
            </span>
          </div>

          <h1 className="font-display text-[clamp(38px,5.5vw,72px)] font-extrabold leading-[1.04] tracking-tight">
            Votre entreprise
            <br />
            ne dort plus,
            <br />
            <span
              className="bg-axon-grad bg-clip-text text-transparent"
              style={{
                backgroundSize: "200% 100%",
                animation: "gradient-x 6s linear infinite"
              }}
            >
              ne s&apos;arrête jamais.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] font-light leading-[1.7] text-axon-txt2">
            AXON AI déploie des agents intelligents qui répondent au
            téléphone, gèrent vos WhatsApp, envoient vos emails et agissent à
            votre place —{" "}
            <span className="text-axon-txt">24 heures sur 24</span>, sur tous
            vos canaux.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="#contact"
              className="group relative overflow-hidden rounded-xl bg-axon-violet px-7 py-3.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-axon-violetLight"
            >
              <span className="relative z-10">
                Activer mon premier agent →
              </span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </a>
            <a
              href="#voix"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm text-axon-txt2 backdrop-blur-xl transition hover:border-white/25 hover:text-axon-txt"
            >
              Démo vocale
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl sm:grid-cols-4">
            {[
              { n: "−80%", l: "TÂCHES RÉPÉTITIVES" },
              { n: "24/7", l: "DISPONIBILITÉ" },
              { n: "48h", l: "DÉPLOIEMENT" },
              { n: "×10", l: "CAPACITÉ" }
            ].map((s) => (
              <div
                key={s.l}
                className="border border-white/[0.04] bg-axon-ink2/60 px-4 py-3 text-center backdrop-blur-xl"
              >
                <div className="font-display text-2xl font-extrabold text-axon-txt">
                  {s.n}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-axon-txt3">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
          className="relative hidden h-[520px] lg:block"
        >
          <div className="absolute inset-0 rounded-full bg-axon-violet/10 blur-3xl" />
          <div className="absolute inset-6 rounded-full border border-white/[0.06]" />
          <div className="absolute inset-16 rounded-full border border-white/[0.04]" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-axon-violetPale/70">
                // LIVE NEURAL MESH
              </div>
              <div className="font-display text-xl font-extrabold text-axon-violetPale">
                AXON.CORE
              </div>
              <div className="mt-1 font-mono text-[9px] text-axon-txt3">
                9 agents · 6 canaux · 24/7
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-axon-ink" />
    </section>
  )
}
