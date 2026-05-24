import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"
import { ArrowLeft, Mail, type LucideIcon } from "lucide-react"

const FONT = "'Poppins', sans-serif"

export const LEGAL_COLORS = {
  bg: "#F8F9FC",
  dark: "#0B0F2E",
  darkSoft: "#141C4A",
  white: "#FFFFFF",
  border: "#E2E5F0",
  borderDark: "#1E2760",
  text: "#0B0F2E",
  muted: "#475569",
  mutedLight: "#A8AFC7",
  accent: "#4191FF",
  gold: "#D4AF37",
  green: "#2ECC8A",
}
const C = LEGAL_COLORS

export function LegalSection({
  icon: Icon,
  title,
  children,
  accentColor,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  accentColor?: string
}) {
  const color = accentColor ?? C.accent
  return (
    <section
      style={{
        backgroundColor: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: "16px",
        padding: "32px",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -16px rgba(15,23,42,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${color}1F 0%, ${color}0A 100%)`,
            border: `1px solid ${color}40`,
            color,
            flexShrink: 0,
          }}
        >
          <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2
          style={{
            color: C.text,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: "22px",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <div
        style={{
          color: C.muted,
          fontFamily: FONT,
          fontSize: "15px",
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </section>
  )
}

export function LegalField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 220px) 1fr",
        gap: "16px",
        padding: "10px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <dt style={{ color: C.muted, fontWeight: 500 }}>{label}</dt>
      <dd style={{ color: C.text, fontWeight: 500, margin: 0 }}>{value}</dd>
    </div>
  )
}

export function LegalSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        color: C.text,
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: "16px",
        margin: "16px 0 10px",
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </h3>
  )
}

export function LegalShell({
  eyebrow,
  title,
  subtitle,
  lastUpdated = "Avril 2026",
  children,
}: {
  eyebrow: string
  title: string
  subtitle: React.ReactNode
  lastUpdated?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: FONT }}>
      {/* NAV */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: C.dark,
          borderBottom: `1px solid ${C.borderDark}`,
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "0 24px",
            height: "72px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <LexoraLogo href="/" size="md" showBaseline />
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#A8AFC7",
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: "8px",
              border: `1px solid ${C.borderDark}`,
              transition: "color 0.2s",
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          padding: "56px 24px 32px",
          textAlign: "center",
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 700,
            color: C.accent,
            backgroundColor: `${C.accent}14`,
            border: `1px solid ${C.accent}30`,
            padding: "6px 14px",
            borderRadius: "999px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "18px",
          }}
        >
          {eyebrow}
        </span>
        <h1
          style={{
            color: C.text,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: "clamp(32px, 4.5vw, 48px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: "0 0 14px",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: C.muted,
            fontSize: "17px",
            lineHeight: 1.7,
            margin: "0 auto",
            maxWidth: "720px",
          }}
        >
          {subtitle}
        </p>
      </section>

      {/* CONTENT */}
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "20px 24px 40px",
          display: "grid",
          gap: "20px",
        }}
      >
        {children}

        {/* Contact card */}
        <section
          style={{
            backgroundColor: C.dark,
            border: `1px solid ${C.gold}`,
            borderRadius: "16px",
            padding: "28px",
            boxShadow: "0 20px 40px -20px rgba(212,175,55,0.35)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(212,175,55,0.14) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                fontWeight: 700,
                color: C.gold,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              <Mail size={12} aria-hidden="true" />
              Une question ?
            </div>
            <h2
              style={{
                color: "#E8EAFC",
                fontFamily: FONT,
                fontSize: "22px",
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: "-0.01em",
              }}
            >
              Notre équipe juridique et DPO sont à votre écoute
            </h2>
            <p style={{ color: "#A8AFC7", fontSize: "14px", margin: "0 0 18px" }}>
              Pour toute question relative aux conditions, à la facturation, ou
              à la protection de vos données.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <a
                href="mailto:sbach@digital-data-solutions.net"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: C.gold,
                  color: C.dark,
                  fontWeight: 700,
                  fontSize: "14px",
                  textDecoration: "none",
                  boxShadow: `0 8px 20px -8px ${C.gold}80`,
                }}
              >
                sbach@digital-data-solutions.net
              </a>
              <a
                href="mailto:sbach@digital-data-solutions.net"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(232,234,252,0.06)",
                  color: "#E8EAFC",
                  fontWeight: 600,
                  fontSize: "14px",
                  textDecoration: "none",
                  border: `1px solid ${C.borderDark}`,
                }}
              >
                sbach@digital-data-solutions.net
              </a>
            </div>
          </div>
        </section>

        <p
          style={{
            color: C.mutedLight,
            fontSize: "12px",
            textAlign: "center",
            margin: "8px 0 0",
          }}
        >
          Dernière mise à jour : {lastUpdated}
        </p>
      </main>

      {/* FOOTER */}
      <footer
        style={{
          backgroundColor: C.dark,
          borderTop: `1px solid ${C.borderDark}`,
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <LexoraLogo href="/" size="md" />
          <p style={{ color: "#A8AFC7", fontSize: "13px", margin: 0 }}>
            &copy; {new Date().getFullYear()} Digital Data Solutions Ltd — Tous
            droits réservés — Port-Louis, Maurice
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "20px", fontSize: "13px" }}>
            <Link href="/" style={{ color: "#A8AFC7", textDecoration: "none" }}>Accueil</Link>
            <Link href="/tarifs" style={{ color: "#A8AFC7", textDecoration: "none" }}>Tarifs</Link>
            <Link href="/mentions-legales" style={{ color: "#A8AFC7", textDecoration: "none" }}>Mentions légales</Link>
            <Link href="/cgu" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGU</Link>
            <Link href="/cgv" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGV</Link>
            <a href="mailto:sbach@digital-data-solutions.net" style={{ color: "#A8AFC7", textDecoration: "none" }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
