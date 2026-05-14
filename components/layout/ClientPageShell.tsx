"use client"

/**
 * ClientPageShell — premium wrapper for client app pages.
 *
 * Provides a consistent, futuristic frame that every client page can
 * opt into without touching its business logic:
 *  - Top bar with breadcrumb + date + user + optional right slot.
 *  - Optional hero row (title / kicker / subtitle + actions).
 *  - Subtle particle field + radial glows in the background.
 *  - Max-width content area with rhythm.
 *
 * Respects prefers-reduced-motion via the ParticleField component.
 */

import * as React from "react"
import Link from "next/link"
import { ChevronRight, Sparkles } from "lucide-react"
import { ParticleField } from "@/components/ParticleField"
import { t, getLocale } from "@/lib/i18n"

const FONT = "'Poppins', sans-serif"

export type Breadcrumb = {
  label: string
  href?: string
}

export type ClientPageShellProps = {
  /** Breadcrumb trail — first item is typically "Espace client". */
  breadcrumbs?: Breadcrumb[]
  /** Short label above the H1 (e.g. "Comptabilité", "Fiscal"). */
  kicker?: string
  /** Page title (renders as H1). */
  title?: string
  /** Optional subtitle under the title. */
  subtitle?: React.ReactNode
  /** Right-aligned action slot in the hero (buttons, toggles…). */
  actions?: React.ReactNode
  /** Hide the particle field (e.g. on heavy data pages). */
  disableParticles?: boolean
  /** Hide the hero block entirely. */
  hideHero?: boolean
  /** Extra classes on the outer main wrapper. */
  className?: string
  children: React.ReactNode
}

export function ClientPageShell({
  breadcrumbs,
  kicker,
  title,
  subtitle,
  actions,
  disableParticles = false,
  hideHero = false,
  className,
  children,
}: ClientPageShellProps) {
  const locale = getLocale()
  return (
    <div
      className={className}
      style={{
        position: "relative",
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #F8F9FC 0%, #EEF2FA 40%, #F8F9FC 100%)",
        fontFamily: FONT,
      }}
    >
      {/* Ambient backdrop (top & bottom radial glows). */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(ellipse 60% 30% at 20% 0%, rgba(65,145,255,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 30% at 80% 100%, rgba(212,175,55,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Particle field — extremely subtle; disabled on data-heavy pages. */}
      {!disableParticles && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.18,
          }}
        >
          <ParticleField
            density={0.4}
            color="rgba(65,145,255,0.45)"
            linkColor="rgba(65,145,255,0.14)"
            linkDistance={140}
            speed={0.15}
          />
        </div>
      )}

      {/* Page content */}
      <div style={{ position: "relative", padding: "28px 24px 64px" }}>
        <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
          {/* Breadcrumb */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label={t('comp.page_shell.breadcrumb_aria', locale)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                marginBottom: "18px",
                color: "#475569",
                flexWrap: "wrap",
              }}
            >
              {breadcrumbs.map((b, i) => {
                const last = i === breadcrumbs.length - 1
                const content = b.href && !last ? (
                  <Link
                    href={b.href}
                    style={{
                      color: "#2A6FCC",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span style={{ color: last ? "#0B0F2E" : "#475569", fontWeight: last ? 600 : 500 }}>
                    {b.label}
                  </span>
                )
                return (
                  <React.Fragment key={i}>
                    {content}
                    {!last && (
                      <ChevronRight
                        size={12}
                        style={{ color: "#94A3B8" }}
                        aria-hidden="true"
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </nav>
          )}

          {/* Hero block */}
          {!hideHero && (title || kicker) && (
            <header
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "24px",
                marginBottom: "28px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: "260px" }}>
                {kicker && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "#2A6FCC",
                      backgroundColor: "rgba(65,145,255,0.08)",
                      border: "1px solid rgba(65,145,255,0.22)",
                      padding: "5px 12px",
                      borderRadius: "999px",
                      marginBottom: "12px",
                    }}
                  >
                    <Sparkles size={12} aria-hidden="true" />
                    {kicker}
                  </span>
                )}
                {title && (
                  <h1
                    style={{
                      margin: 0,
                      fontSize: "clamp(26px, 2.6vw, 36px)",
                      fontWeight: 700,
                      color: "#0B0F2E",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.15,
                    }}
                  >
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <div
                    style={{
                      marginTop: "8px",
                      maxWidth: "720px",
                      color: "#475569",
                      fontSize: "14px",
                      lineHeight: 1.65,
                    }}
                  >
                    {subtitle}
                  </div>
                )}
              </div>
              {actions && (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {actions}
                </div>
              )}
            </header>
          )}

          {/* Content */}
          <div>{children}</div>
        </div>
      </div>
    </div>
  )
}
