"use client"

import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"
import {
  Building2,
  Server,
  ShieldCheck,
  Scale,
  Brain,
  Lock,
  FileText,
  Mail,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"

const FONT = "'Poppins', sans-serif"

const C = {
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
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${C.accent}1F 0%, ${C.accent}0A 100%)`,
            border: `1px solid ${C.accent}40`,
            color: C.accent,
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
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

export default function MentionsLegalesPage() {
  const locale: Locale = getLocale()
  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: FONT }}>
      {/* NAV — minimal, dark */}
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
            {t('pub.ml.back_home', locale)}
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
          {t('pub.ml.eyebrow', locale)}
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
          {t('pub.ml.title', locale)}
        </h1>
        <p
          style={{
            color: C.muted,
            fontSize: "17px",
            lineHeight: 1.7,
            margin: "0 auto",
            maxWidth: "700px",
          }}
          dangerouslySetInnerHTML={{ __html: t('pub.ml.intro_html', locale) }}
        />
      </section>

      {/* CONTENT */}
      <main
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "20px 24px 80px",
          display: "grid",
          gap: "20px",
        }}
      >
        {/* 1. Éditeur */}
        <Section icon={Building2} title={t('pub.ml.s1_title', locale)}>
          <dl style={{ margin: 0 }}>
            <Field label={t('pub.ml.f_brand', locale)} value="Lexora" />
            <Field label={t('pub.ml.f_company', locale)} value="Digital Data Solutions Ltd" />
            <Field label={t('pub.ml.f_form', locale)} value={t('pub.ml.f_form_v', locale)} />
            <Field label={t('pub.ml.f_reg', locale)} value="C20173522" />
            <Field label={t('pub.ml.f_vat', locale)} value="27816949" />
            <Field label={t('pub.ml.f_seat', locale)} value={t('pub.ml.f_seat_v', locale)} />
            <Field label={t('pub.ml.f_phone', locale)} value="+230 5259 1043" />
            <Field
              label={t('pub.ml.f_email', locale)}
              value={
                <a
                  href="mailto:sbach@digital-data-solutions.net"
                  style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
                >
                  sbach@digital-data-solutions.net
                </a>
              }
            />
          </dl>
        </Section>

        {/* 2. Hébergement */}
        <Section icon={Server} title={t('pub.ml.s2_title', locale)}>
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s2_p1', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s2_p2', locale) }} />
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s2_p3', locale) }} />
        </Section>

        {/* 3. Responsabilité éditoriale */}
        <Section icon={FileText} title={t('pub.ml.s3_title', locale)}>
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s3_p1', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s3_p2', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s3_p3', locale) }} />
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s3_p4', locale) }} />
        </Section>

        {/* 4. Protection des données personnelles */}
        <Section icon={ShieldCheck} title={t('pub.ml.s4_title', locale)}>
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s4_p1', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s4_p2', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s4_p3', locale) }} />
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s4_p4', locale) }} />
        </Section>

        {/* 5. Propriété intellectuelle */}
        <Section icon={Lock} title={t('pub.ml.s5_title', locale)}>
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s5_p1', locale) }} />
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s5_p2', locale) }} />
        </Section>

        {/* 6. Loi applicable */}
        <Section icon={Scale} title={t('pub.ml.s6_title', locale)}>
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s6_p1', locale) }} />
        </Section>

        {/* 7. IA — assistance */}
        <Section
          icon={Brain}
          title={t('pub.ml.s7_title', locale)}
        >
          <h3 style={{ color: C.text, fontFamily: FONT, fontWeight: 700, fontSize: "16px", margin: "0 0 10px" }}>
            {t('pub.ml.s7_h1', locale)}
          </h3>
          <p style={{ margin: "0 0 16px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p1', locale) }} />
          <p style={{ margin: "0 0 16px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p2', locale) }} />

          <h3 style={{ color: C.text, fontFamily: FONT, fontWeight: 700, fontSize: "16px", margin: "16px 0 10px" }}>
            {t('pub.ml.s7_h2', locale)}
          </h3>
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p3', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p4', locale) }} />
          <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p5', locale) }} />

          <h3 style={{ color: C.text, fontFamily: FONT, fontWeight: 700, fontSize: "16px", margin: "16px 0 10px" }}>
            {t('pub.ml.s7_h3', locale)}
          </h3>
          <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.ml.s7_p6', locale) }} />
        </Section>

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
              {t('pub.ml.contact_eyebrow', locale)}
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
              {t('pub.ml.contact_title', locale)}
            </h2>
            <p style={{ color: "#A8AFC7", fontSize: "14px", margin: "0 0 18px" }}>
              {t('pub.ml.contact_sub', locale)}
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

        {/* Last updated */}
        <p
          style={{
            color: C.mutedLight,
            fontSize: "12px",
            textAlign: "center",
            margin: "8px 0 0",
          }}
        >
          {t('pub.ml.last_update', locale)}
        </p>
      </main>

      {/* FOOTER — dark + minimal */}
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
            &copy; {new Date().getFullYear()} {t('pub.ml.footer_copy', locale)}
          </p>
          <div style={{ display: "flex", gap: "20px", fontSize: "13px" }}>
            <Link href="/" style={{ color: "#A8AFC7", textDecoration: "none" }}>
              {t('pub.ml.nav_home', locale)}
            </Link>
            <Link href="/tarifs" style={{ color: "#A8AFC7", textDecoration: "none" }}>
              {t('pub.ml.nav_pricing', locale)}
            </Link>
            <a href="mailto:sbach@digital-data-solutions.net" style={{ color: "#A8AFC7", textDecoration: "none" }}>
              {t('pub.ml.nav_contact', locale)}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
