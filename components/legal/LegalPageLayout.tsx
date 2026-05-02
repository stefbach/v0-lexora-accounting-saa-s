"use client"

import * as React from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, FileText, ShieldCheck, ScrollText, Building2 } from "lucide-react"

const FONT = "'Poppins', sans-serif"

const LEGAL_PAGES = [
  {
    href: "/legal/mentions-legales",
    label: { fr: "Mentions légales", en: "Legal notice" },
    icon: Building2,
  },
  {
    href: "/legal/cgv",
    label: { fr: "CGV", en: "Terms of Sale" },
    icon: ScrollText,
  },
  {
    href: "/legal/cgu",
    label: { fr: "CGU", en: "Terms of Use" },
    icon: FileText,
  },
  {
    href: "/legal/privacy",
    label: { fr: "Confidentialité", en: "Privacy Policy" },
    icon: ShieldCheck,
  },
] as const

export type Lang = "fr" | "en"

export function LegalPageLayout({
  currentPath,
  title,
  titleEn,
  lastUpdated,
  lang,
  onLangChange,
  children,
}: {
  currentPath: string
  title: string
  titleEn: string
  lastUpdated: string
  lang: Lang
  onLangChange: (l: Lang) => void
  children: ReactNode
}) {
  const t = lang === "fr"
  return (
    <div
      style={{
        backgroundColor: "#F8F9FC",
        minHeight: "100vh",
        fontFamily: FONT,
        color: "#0B0F2E",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          backgroundColor: "#0B0F2E",
          color: "#E8EAFC",
          padding: "16px 24px",
          borderBottom: "1px solid #1E2760",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              color: "#E8EAFC",
              textDecoration: "none",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Lexora
          </Link>
          <nav
            aria-label="Breadcrumb"
            style={{ fontSize: 13, color: "#A8AFC7", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Link href="/" style={{ color: "#A8AFC7", textDecoration: "none" }}>
              {t ? "Accueil" : "Home"}
            </Link>
            <ChevronRight size={14} aria-hidden />
            <span>{t ? "Mentions légales" : "Legal"}</span>
            <ChevronRight size={14} aria-hidden />
            <span style={{ color: "#E8EAFC" }}>{t ? title : titleEn}</span>
          </nav>
          <div role="group" aria-label="Language" style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => onLangChange("fr")}
              aria-pressed={lang === "fr"}
              style={{
                background: lang === "fr" ? "#4191FF" : "transparent",
                color: lang === "fr" ? "#0B0F2E" : "#A8AFC7",
                border: "1px solid #1E2760",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => onLangChange("en")}
              aria-pressed={lang === "en"}
              style={{
                background: lang === "en" ? "#4191FF" : "transparent",
                color: lang === "en" ? "#0B0F2E" : "#A8AFC7",
                border: "1px solid #1E2760",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)",
          gap: 32,
        }}
      >
        {/* Sidebar */}
        <aside aria-label={t ? "Pages légales" : "Legal pages"}>
          <div
            style={{
              position: "sticky",
              top: 24,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E2E5F0",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                margin: "0 0 12px",
              }}
            >
              {t ? "Documents légaux" : "Legal documents"}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
              {LEGAL_PAGES.map((page) => {
                const active = currentPath === page.href
                const Icon = page.icon
                return (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: active ? "#0B0F2E" : "#475569",
                        backgroundColor: active ? "#EEF2FF" : "transparent",
                        fontWeight: active ? 600 : 500,
                        fontSize: 14,
                      }}
                    >
                      <Icon size={16} aria-hidden />
                      {t ? page.label.fr : page.label.en}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #E2E5F0",
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#0B0F2E" }}>
                {t ? "Dernière mise à jour" : "Last updated"}
              </strong>
              <br />
              {lastUpdated}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E5F0",
            borderRadius: 16,
            padding: "40px 48px",
          }}
        >
          <header style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: "clamp(28px, 4vw, 38px)",
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {t ? title : titleEn}
            </h1>
            <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>
              {t ? "Dernière mise à jour" : "Last updated"} : {lastUpdated}
            </p>
          </header>
          <div style={{ fontSize: 15, lineHeight: 1.75, color: "#1E293B" }}>{children}</div>
        </main>
      </div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          margin: "0 0 12px",
          color: "#0B0F2E",
          borderBottom: "1px solid #E2E5F0",
          paddingBottom: 8,
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  )
}
