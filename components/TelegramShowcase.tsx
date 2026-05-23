"use client"

/**
 * TelegramShowcase — premium section presenting Lexora x Telegram as
 * an executive Chief-of-Staff in your pocket. Layered with a 3D orbit
 * scene and a rich capability matrix split by domain.
 */

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Reveal, StaggerGroup, StaggerItem, FadeSlide, HoverLift } from "@/components/ui/motion"
import { TelegramOrbit3DLazy } from "@/components/3d/TelegramOrbit3DLoader"
import {
  Mic,
  Camera,
  Receipt,
  CalendarDays,
  Mail,
  Banknote,
  Users2,
  FileSignature,
  Brain,
  Plane,
  Clock,
  Building2,
  ArrowRight,
  Send,
  Sparkles,
} from "lucide-react"

type Locale = "fr" | "en"

const STORIES_FR = [
  {
    icon: Mic,
    title: "Parle, ne tape plus",
    body: "Envoie un message vocal — Lexora transcrit, comprend et agit. « Crée une facture de 12 500 Rs à Acme Ltd pour la consultation de mai » → facture émise, PDF envoyé.",
    accent: "#4191FF",
  },
  {
    icon: Camera,
    title: "Photo = écriture comptable",
    body: "Photographie un ticket de carburant, une note d'hôtel ou une facture papier. L'OCR Claude Vision extrait fournisseur, montant, TVA, catégorie — la note de frais est créée en 2 secondes.",
    accent: "#D4AF37",
  },
  {
    icon: Banknote,
    title: "Vos soldes, en temps réel",
    body: "« Tréso ? » → soldes MCB, SBM, AfrAsia consolidés en MUR, EUR et USD. Détaille les transactions importantes du jour, alerte si découvert imminent.",
    accent: "#2ECC8A",
  },
  {
    icon: Plane,
    title: "Validation de congés en 1 clic",
    body: "Quand un salarié pose un congé, vous recevez un message avec 2 boutons : ✅ Approuver / ❌ Refuser. La décision est appliquée instantanément dans Lexora et notifiée au salarié.",
    accent: "#4191FF",
  },
  {
    icon: CalendarDays,
    title: "Votre agenda dicté à voix haute",
    body: "« Bloque jeudi 14h-15h pour RDV banque MCB » → événement créé dans Google Calendar avec lien Meet, invitation envoyée. « Quand suis-je libre la semaine prochaine ? » → 5 créneaux suggérés.",
    accent: "#D4AF37",
  },
  {
    icon: Mail,
    title: "Emails rédigés, signés, envoyés",
    body: "« Relance Acme pour la facture FAC-2025-042, montant 45 000 Rs, échéance dépassée de 12 jours » → email rédigé en français professionnel, prêt à envoyer ou auto-envoyé selon votre règle.",
    accent: "#2ECC8A",
  },
]

const TOOLS_FR = [
  { icon: Receipt, title: "Facturation", items: ["Créer facture client", "Envoyer par email + Telegram", "Rechercher par n°/client", "Diagnostic OCR factures"] },
  { icon: Banknote, title: "Banque & Trésorerie", items: ["Soldes multi-banques", "Liste transactions du jour", "Déclencher scrape immédiat", "Génération fichier virement CFONB"] },
  { icon: Users2, title: "Paie & RH", items: ["Calculer bulletins du mois", "Approuver paie (direction)", "Export PAYE/CSG/NSF MRA", "Soumission MRA par robot"] },
  { icon: Plane, title: "Congés & Pointage", items: ["Demande congé + balance", "Manager approve/refuse", "Pointage in/out vocal", "Liste absences en attente"] },
  { icon: CalendarDays, title: "Agenda Google", items: ["Lister événements", "Créer/modifier/supprimer", "Trouver créneau libre", "Multi-comptes Google"] },
  { icon: Mail, title: "Emails multi-compte", items: ["SMTP/Resend/Gmail OAuth", "Envoi depuis email société", "Templates dynamiques", "Tracking ouvertures"] },
  { icon: FileSignature, title: "Documents & contrats", items: ["Upload PDF par Telegram", "OCR automatique", "Génération contrat IA", "Signature électronique"] },
  { icon: Brain, title: "Mémoire & contexte", items: ["Apprend vos préférences", "Souvient des clients fréquents", "RAG embeddings personnalisés", "Multi-société (basculement)"] },
  { icon: Building2, title: "Multi-rôles intelligents", items: ["Direction · vue stratégique", "Comptable · écritures GL", "RH · paie & congés", "Salarié · bulletin/pointage"] },
]

const STORIES_EN = [
  { icon: Mic, title: "Speak, don't type", body: "Send a voice message — Lexora transcribes, understands and acts. \"Create an invoice for 12,500 Rs to Acme Ltd for May consulting\" → invoice issued, PDF sent.", accent: "#4191FF" },
  { icon: Camera, title: "Photo = journal entry", body: "Snap a fuel receipt, a hotel bill or a paper invoice. Claude Vision OCR extracts vendor, amount, VAT, category — the expense is logged in 2 seconds.", accent: "#D4AF37" },
  { icon: Banknote, title: "Your balances, live", body: "\"Cash position?\" → MCB, SBM, AfrAsia balances consolidated in MUR, EUR, USD. Major transactions of the day, alerts before overdraft.", accent: "#2ECC8A" },
  { icon: Plane, title: "Leave approvals in one tap", body: "When an employee requests leave, you receive a message with 2 buttons: ✅ Approve / ❌ Reject. Decision applied instantly in Lexora and notified to the employee.", accent: "#4191FF" },
  { icon: CalendarDays, title: "Your calendar by voice", body: "\"Block Thursday 2-3pm for MCB bank meeting\" → event in Google Calendar with Meet link, invites sent. \"When am I free next week?\" → 5 slots suggested.", accent: "#D4AF37" },
  { icon: Mail, title: "Emails drafted, signed, sent", body: "\"Chase Acme for invoice INV-2025-042, 45,000 Rs, 12 days overdue\" → professional email drafted, ready to send or auto-sent per your rule.", accent: "#2ECC8A" },
]

const TOOLS_EN = [
  { icon: Receipt, title: "Invoicing", items: ["Create client invoice", "Send via email + Telegram", "Search by number/client", "OCR diagnostics"] },
  { icon: Banknote, title: "Banking & Cash", items: ["Multi-bank balances", "Today's transactions", "Trigger immediate scrape", "CFONB transfer file"] },
  { icon: Users2, title: "Payroll & HR", items: ["Compute monthly slips", "Director payroll approval", "MRA PAYE/CSG/NSF export", "Robot MRA submission"] },
  { icon: Plane, title: "Leave & Attendance", items: ["Request leave + balance", "Manager approve/reject", "Voice clock-in/out", "Pending absences list"] },
  { icon: CalendarDays, title: "Google Calendar", items: ["List events", "Create/edit/delete", "Find free slot", "Multi-Google accounts"] },
  { icon: Mail, title: "Multi-account email", items: ["SMTP/Resend/Gmail OAuth", "Send from company email", "Dynamic templates", "Open tracking"] },
  { icon: FileSignature, title: "Documents & contracts", items: ["Upload PDF via Telegram", "Automatic OCR", "AI contract generation", "E-signature"] },
  { icon: Brain, title: "Memory & context", items: ["Learns your preferences", "Remembers frequent clients", "Custom RAG embeddings", "Multi-company switching"] },
  { icon: Building2, title: "Smart multi-role", items: ["Director · strategic view", "Accountant · GL entries", "HR · payroll & leave", "Employee · payslip/clocking"] },
]

export function TelegramShowcase({ locale = "fr" }: { locale?: Locale }) {
  const stories = locale === "fr" ? STORIES_FR : STORIES_EN
  const tools = locale === "fr" ? TOOLS_FR : TOOLS_EN

  return (
    <section
      id="telegram"
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, #0B0F2E 0%, #101847 50%, #0B0F2E 100%)",
      }}
    >
      {/* Soft cinematic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 20% 20%, rgba(65,145,255,0.18) 0%, transparent 65%), radial-gradient(ellipse 55% 50% at 80% 80%, rgba(212,175,55,0.14) 0%, transparent 70%)",
        }}
      />
      {/* Faint grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(232,234,252,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(232,234,252,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* TOP — header + 3D orbit */}
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal>
            <span
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{
                backgroundColor: "rgba(212,175,55,0.10)",
                color: "#D4AF37",
                borderColor: "rgba(212,175,55,0.30)",
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {locale === "fr" ? "Lexora × Telegram" : "Lexora × Telegram"}
            </span>
            <h2
              className="mb-5 text-4xl font-bold tracking-tight md:text-6xl"
              style={{
                color: "#E8EAFC",
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              {locale === "fr" ? (
                <>
                  Pilotez votre entreprise{" "}
                  <span
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    depuis Telegram
                  </span>
                </>
              ) : (
                <>
                  Run your business{" "}
                  <span
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    from Telegram
                  </span>
                </>
              )}
            </h2>
            <p
              className="mb-7 text-base md:text-lg"
              style={{
                color: "#A8AFC7",
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 400,
                lineHeight: 1.7,
                maxWidth: "640px",
              }}
            >
              {locale === "fr"
                ? "Pas une appli. Pas un chatbot. Un véritable Chief of Staff IA qui comprend votre métier. Plus de 50 outils experts, accessibles en langage naturel, voix ou photo — 24h/24, depuis le téléphone que vous avez déjà."
                : "Not an app. Not a chatbot. A true AI Chief of Staff that understands your business. 50+ expert tools, accessible in natural language, voice or photo — 24/7, from the phone you already have."}
            </p>

            <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4" staggerMs={60}>
              {[
                { v: "50+", l: locale === "fr" ? "outils IA" : "AI tools" },
                { v: "12", l: locale === "fr" ? "domaines" : "domains" },
                { v: "24/7", l: locale === "fr" ? "disponible" : "available" },
                { v: "FR · EN", l: locale === "fr" ? "voix & texte" : "voice & text" },
              ].map((s) => (
                <StaggerItem key={s.l}>
                  <div
                    className="rounded-xl px-4 py-3 text-center"
                    style={{
                      backgroundColor: "rgba(232,234,252,0.04)",
                      border: "1px solid rgba(212,175,55,0.22)",
                      fontFamily: "'Poppins', sans-serif",
                    }}
                  >
                    <div
                      className="text-xl font-bold md:text-2xl"
                      style={{ color: "#D4AF37", letterSpacing: "-0.01em" }}
                    >
                      {s.v}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest" style={{ color: "#A8AFC7" }}>
                      {s.l}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/pilotage-telegram">
                <Button
                  size="lg"
                  className="w-full px-7 text-base font-semibold sm:w-auto"
                  style={{
                    backgroundColor: "#D4AF37",
                    color: "#0B0F2E",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 700,
                    borderRadius: "8px",
                  }}
                >
                  {locale === "fr" ? "Voir la démo complète" : "See the full demo"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#telegram-tools">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full px-7 text-base font-semibold sm:w-auto"
                  style={{
                    border: "1px solid rgba(65,145,255,0.45)",
                    color: "#E8EAFC",
                    backgroundColor: "rgba(232,234,252,0.04)",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 500,
                    borderRadius: "8px",
                  }}
                >
                  {locale === "fr" ? "Explorer les 50+ outils" : "Explore the 50+ tools"}
                </Button>
              </a>
            </div>
          </Reveal>

          {/* 3D scene */}
          <FadeSlide delay={0.2} y={24}>
            <div
              className="relative mx-auto w-full"
              style={{
                borderRadius: "28px",
                padding: "16px",
                background:
                  "linear-gradient(135deg, rgba(65,145,255,0.10) 0%, rgba(212,175,55,0.08) 100%)",
                border: "1px solid rgba(212,175,55,0.22)",
                boxShadow:
                  "0 40px 100px -40px rgba(65,145,255,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <TelegramOrbit3DLazy height={520} />
              <div
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: "rgba(11,15,46,0.75)",
                  color: "#D4AF37",
                  border: "1px solid rgba(212,175,55,0.35)",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                <Sparkles className="inline h-3 w-3 mr-1" />
                {locale === "fr" ? "Cœur de commande Telegram" : "Telegram command core"}
              </div>
            </div>
          </FadeSlide>
        </div>

        {/* STORIES — 6 immersive use cases */}
        <Reveal className="mt-20 mb-10 text-center">
          <span
            className="mb-4 inline-block text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
          >
            {locale === "fr" ? "6 moments de vérité" : "6 moments of truth"}
          </span>
          <h3
            className="text-3xl font-bold md:text-4xl"
            style={{
              color: "#E8EAFC",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {locale === "fr" ? "Ce que vos doigts vont oublier de faire" : "What your fingers will forget to do"}
          </h3>
        </Reveal>

        <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={70}>
          {stories.map((s) => (
            <StaggerItem key={s.title}>
              <HoverLift lift={6} className="h-full">
                <article
                  className="group relative h-full overflow-hidden rounded-2xl p-7"
                  style={{
                    backgroundColor: "rgba(16,24,71,0.65)",
                    border: `1px solid ${s.accent}40`,
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle, ${s.accent}35 0%, transparent 70%)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[2px]"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${s.accent} 50%, transparent)`,
                    }}
                  />
                  <div
                    className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `${s.accent}1A`,
                      border: `1px solid ${s.accent}55`,
                      boxShadow: `0 0 24px ${s.accent}35`,
                    }}
                  >
                    <s.icon className="h-6 w-6" style={{ color: s.accent }} strokeWidth={1.8} />
                  </div>
                  <h4
                    className="mb-3 text-xl font-bold"
                    style={{
                      color: "#E8EAFC",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {s.title}
                  </h4>
                  <p
                    className="text-sm"
                    style={{
                      color: "#A8AFC7",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                      lineHeight: 1.7,
                    }}
                  >
                    {s.body}
                  </p>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* TOOLS — 9 capability tiles */}
        <div id="telegram-tools" />
        <Reveal className="mt-20 mb-10 text-center">
          <h3
            className="mb-3 text-3xl font-bold md:text-4xl"
            style={{
              color: "#E8EAFC",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {locale === "fr" ? "9 domaines, 50+ outils, 1 conversation" : "9 domains, 50+ tools, 1 conversation"}
          </h3>
          <p
            className="mx-auto max-w-2xl text-base"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            {locale === "fr"
              ? "Chaque outil est un endpoint sécurisé branché à votre Lexora. L'agent choisit le bon outil au bon moment — vous n'avez qu'à demander."
              : "Each tool is a secure endpoint wired into your Lexora. The agent picks the right tool at the right time — you just ask."}
          </p>
        </Reveal>

        <StaggerGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" staggerMs={50}>
          {tools.map((t, i) => {
            const accent = ["#4191FF", "#D4AF37", "#2ECC8A"][i % 3]
            return (
              <StaggerItem key={t.title}>
                <HoverLift lift={4} className="h-full">
                  <article
                    className="h-full rounded-2xl p-6"
                    style={{
                      backgroundColor: "rgba(11,15,46,0.55)",
                      border: `1px solid ${accent}33`,
                    }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: `${accent}1A`,
                          border: `1px solid ${accent}55`,
                        }}
                      >
                        <t.icon className="h-5 w-5" style={{ color: accent }} strokeWidth={1.8} />
                      </div>
                      <h4
                        className="text-base font-bold"
                        style={{
                          color: "#E8EAFC",
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        {t.title}
                      </h4>
                    </div>
                    <ul className="space-y-2">
                      {t.items.map((it) => (
                        <li
                          key={it}
                          className="flex items-start gap-2 text-sm"
                          style={{
                            color: "#A8AFC7",
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 400,
                            lineHeight: 1.55,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1.5 inline-block h-1 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </article>
                </HoverLift>
              </StaggerItem>
            )
          })}
        </StaggerGroup>

        {/* INNER CTA */}
        <Reveal className="mt-16 text-center">
          <div
            className="inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm"
            style={{
              backgroundColor: "rgba(46,204,138,0.10)",
              border: "1px solid rgba(46,204,138,0.30)",
              color: "#7CE5B5",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75" style={{ backgroundColor: "#2ECC8A" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#2ECC8A" }} />
            </span>
            <Clock className="h-4 w-4" />
            {locale === "fr"
              ? "Mise en service en moins de 5 minutes. Compatible iOS · Android · Desktop."
              : "Live in under 5 minutes. Works on iOS · Android · Desktop."}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
