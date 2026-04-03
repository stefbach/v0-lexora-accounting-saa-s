"use client"

import { useState } from "react"
import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"
import { getLocale, setLocale, type Locale } from "@/lib/i18n"

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#0F1B2D",
  navy: "#162236",
  navyBorder: "#1E3050",
  gold: "#D4AF37",
  goldLight: "#E8C97A",
  white: "#F8F6F1",
  green: "#2ECC8A",
  blue: "#5B9BD5",
  orange: "#E8A84C",
  muted: "#8A99B4",
  cardBg: "#162236",
}

/* ------------------------------------------------------------------ */
/*  i18n strings                                                       */
/* ------------------------------------------------------------------ */
const i18n = {
  fr: {
    login: "Se connecter",
    eyebrow: "Tarifs Lexora 2026",
    h1_1: "L\u2019ERP mauricien complet.",
    h1_2: "Sans comptable requis.",
    subtitle: "Comptabilité, paie, fiscalité e-MRA et reporting — tout inclus dans une plateforme pensée pour Maurice. Choisissez votre formule.",
    monthly: "Mensuel",
    annual: "Annuel (-17%)",
    perMonth: "/mois",
    annualSaving: "2 mois offerts (facture annuelle)",
    storage: "Stockage",
    tabCompta: "Comptabilité + Facturation",
    tabPaie: "RH & Paie",
    tabBundle: "Pack Complet ERP",
    tabMatrix: "Matrice fonctionnalités",
    matrixTitle: "Matrice complète des fonctionnalités",
    matrixDesc: "Comparez les 40+ fonctionnalités incluses dans chaque formule Lexora.",
    matrixCol: "Fonctionnalité",
    statFeatures: "fonctionnalités",
    statModules: "modules fiscaux mauriciens",
    statCompetitor: "concurrent aussi complet à Maurice",
    ctaTitle: "Prêt à simplifier votre comptabilité ?",
    ctaDesc: "Rejoignez les entreprises mauriciennes qui gèrent leur comptabilité, paie et fiscalité en toute autonomie avec Lexora.",
    ctaTrial: "Démarrer l\u2019essai gratuit",
    ctaDemo: "Demander une démo",
    footer: "\u00a9 2026 Lexora Ltd. Tous droits réservés. Port-Louis, Maurice.",
    names: ["Solo", "Petite entreprise", "PME", "Grande entreprise"],
    descs: [
      "Idéal pour les freelances et auto-entrepreneurs.",
      "Pour les petites équipes en croissance.",
      "La solution complète pour les entreprises établies.",
      "Sur mesure pour les grandes structures.",
    ],
    badges: ["Starter", "Meilleure valeur", "Cœur de cible", "Enterprise"],
    rois: [
      "Économisez ~Rs 8 000/mois vs comptable",
      "Économisez ~Rs 15 000/mois vs comptable",
      "Économisez ~Rs 25 000/mois vs comptable",
      "ROI sur mesure — contactez-nous",
    ],
    emras: [
      "e-MRA : EDF5 basique",
      "e-MRA : EDF5 + VAT auto",
      "e-MRA : toutes déclarations",
      "e-MRA : toutes déclarations + audit trail",
    ],
    storages: ["500 Mo", "2 Go", "10 Go", "Illimité"],
    ctaLabels: ["Commencer maintenant", "Commencer maintenant", "Commencer maintenant", "Contacter l\u2019équipe"],
    criteriaCompta: [
      "Jusqu\u2019à 50 transactions/mois",
      "Jusqu\u2019à 200 transactions/mois",
      "Jusqu\u2019à 500 transactions/mois",
      "Transactions illimitées",
    ],
    criteriaPaie: ["1 à 3 employés", "4 à 15 employés", "16 à 50 employés", "51+ employés"],
    criteriaBundle: [
      "Solo / micro-entreprise",
      "Petite équipe (< 15 pers.)",
      "PME établie (< 50 pers.)",
      "Grande structure (50+)",
    ],
    featCompta: [
      "Plan comptable OHADA / mauricien",
      "Saisie journal & grand livre",
      "Facturation illimitée",
      "Rapprochement bancaire auto",
      "TVA / TPS auto-calcul",
      "Déclarations e-MRA (EDF5, VAT)",
      "Multi-devises (EUR, USD, GBP)",
      "Bilan & compte de résultat",
      "Tableau de bord analytique",
      "API & intégrations tierces",
      "Support prioritaire",
    ],
    featPaie: [
      "Fiches de paie conformes",
      "Calcul NPF / NSF / PAYE",
      "Congés & absences",
      "Virements bancaires auto",
      "Déclarations CSG / TDS",
      "Portail employé self-service",
      "Gestion temps & pointage",
      "Primes & commissions",
      "Multi-sites",
      "Rapports RH avancés",
      "Support prioritaire",
    ],
    featBundle: [
      "Comptabilité complète",
      "Facturation illimitée",
      "Paie (selon taille)",
      "Rapprochement bancaire",
      "Déclarations e-MRA",
      "Multi-devises",
      "Portail employé",
      "Gestion inventaire",
      "API ouverte",
      "Support dédié",
    ],
    matrixCats: [
      {
        category: "Comptabilité générale",
        features: [
          "Plan comptable OHADA / mauricien",
          "Saisie journal",
          "Grand livre",
          "Balance générale",
          "Rapprochement bancaire automatique",
          "Import relevés bancaires (CSV/OFX)",
          "Multi-devises (EUR, USD, GBP)",
          "Écritures automatiques récurrentes",
        ],
      },
      {
        category: "Facturation & Ventes",
        features: [
          "Factures illimitées",
          "Devis & bons de commande",
          "Avoirs & notes de crédit",
          "Relances automatiques",
          "Portail client",
          "Paiement en ligne (MCB Juice, etc.)",
        ],
      },
      {
        category: "Fiscalité mauricienne",
        features: [
          "TVA / TPS auto-calcul",
          "Déclaration EDF5 (e-MRA)",
          "Déclaration VAT automatique",
          "CSG / TDS déclarations",
          "Audit trail fiscal complet",
          "Export XML e-MRA",
        ],
      },
      {
        category: "Paie & Ressources humaines",
        features: [
          "Fiches de paie conformes",
          "Calcul NPF / NSF / PAYE",
          "Gestion congés & absences",
          "Virements bancaires auto",
          "Portail employé self-service",
          "Gestion temps & pointage",
          "Primes, commissions & bonus",
          "Multi-sites",
          "Rapports RH avancés",
        ],
      },
      {
        category: "Reporting & Tableaux de bord",
        features: [
          "Bilan comptable",
          "Compte de résultat",
          "Tableau de flux de trésorerie",
          "Tableau de bord analytique",
          "Rapports personnalisés",
          "Export PDF / Excel",
        ],
      },
      {
        category: "Technique & Support",
        features: [
          "Stockage documents",
          "API ouverte & webhooks",
          "Intégrations tierces",
          "SSO / LDAP",
          "Support email",
          "Support prioritaire",
          "Account manager dédié",
          "SLA garanti",
        ],
      },
    ],
    tierNamesShort: ["Solo", "Petite entr.", "PME", "Grande entr."],
  },
  en: {
    login: "Sign in",
    eyebrow: "Lexora Pricing 2026",
    h1_1: "The complete Mauritian ERP.",
    h1_2: "No accountant required.",
    subtitle: "Accounting, payroll, e-MRA tax compliance and reporting — all included in a platform built for Mauritius. Choose your plan.",
    monthly: "Monthly",
    annual: "Annual (-17%)",
    perMonth: "/month",
    annualSaving: "2 months free (billed annually)",
    storage: "Storage",
    tabCompta: "Accounting + Invoicing",
    tabPaie: "HR & Payroll",
    tabBundle: "Full ERP Pack",
    tabMatrix: "Feature matrix",
    matrixTitle: "Full feature matrix",
    matrixDesc: "Compare 40+ features included in each Lexora plan.",
    matrixCol: "Feature",
    statFeatures: "features",
    statModules: "Mauritian tax modules",
    statCompetitor: "competitor as complete in Mauritius",
    ctaTitle: "Ready to simplify your accounting?",
    ctaDesc: "Join Mauritian businesses that manage their accounting, payroll and taxes independently with Lexora.",
    ctaTrial: "Start free trial",
    ctaDemo: "Request a demo",
    footer: "\u00a9 2026 Lexora Ltd. All rights reserved. Port-Louis, Mauritius.",
    names: ["Solo", "Small business", "Mid-size", "Enterprise"],
    descs: [
      "Ideal for freelancers and sole traders.",
      "For small growing teams.",
      "The complete solution for established businesses.",
      "Tailored for large organisations.",
    ],
    badges: ["Starter", "Best value", "Most popular", "Enterprise"],
    rois: [
      "Save ~Rs 8,000/mo vs accountant",
      "Save ~Rs 15,000/mo vs accountant",
      "Save ~Rs 25,000/mo vs accountant",
      "Custom ROI — contact us",
    ],
    emras: [
      "e-MRA: basic EDF5",
      "e-MRA: EDF5 + auto VAT",
      "e-MRA: all filings",
      "e-MRA: all filings + audit trail",
    ],
    storages: ["500 MB", "2 GB", "10 GB", "Unlimited"],
    ctaLabels: ["Get started", "Get started", "Get started", "Contact sales"],
    criteriaCompta: [
      "Up to 50 transactions/mo",
      "Up to 200 transactions/mo",
      "Up to 500 transactions/mo",
      "Unlimited transactions",
    ],
    criteriaPaie: ["1–3 employees", "4–15 employees", "16–50 employees", "51+ employees"],
    criteriaBundle: [
      "Solo / micro-business",
      "Small team (< 15 people)",
      "Established SME (< 50 people)",
      "Large organisation (50+)",
    ],
    featCompta: [
      "OHADA / Mauritian chart of accounts",
      "Journal entries & general ledger",
      "Unlimited invoicing",
      "Auto bank reconciliation",
      "VAT / TPS auto-calculation",
      "e-MRA filings (EDF5, VAT)",
      "Multi-currency (EUR, USD, GBP)",
      "Balance sheet & P&L",
      "Analytics dashboard",
      "API & third-party integrations",
      "Priority support",
    ],
    featPaie: [
      "Compliant payslips",
      "NPF / NSF / PAYE calculation",
      "Leave & absence management",
      "Auto bank transfers",
      "CSG / TDS filings",
      "Employee self-service portal",
      "Time & attendance tracking",
      "Bonuses & commissions",
      "Multi-site",
      "Advanced HR reports",
      "Priority support",
    ],
    featBundle: [
      "Full accounting",
      "Unlimited invoicing",
      "Payroll (by size)",
      "Bank reconciliation",
      "e-MRA filings",
      "Multi-currency",
      "Employee portal",
      "Inventory management",
      "Open API",
      "Dedicated support",
    ],
    matrixCats: [
      {
        category: "General accounting",
        features: [
          "OHADA / Mauritian chart of accounts",
          "Journal entries",
          "General ledger",
          "Trial balance",
          "Automatic bank reconciliation",
          "Bank statement import (CSV/OFX)",
          "Multi-currency (EUR, USD, GBP)",
          "Recurring automatic entries",
        ],
      },
      {
        category: "Invoicing & Sales",
        features: [
          "Unlimited invoices",
          "Quotes & purchase orders",
          "Credit notes",
          "Automatic reminders",
          "Client portal",
          "Online payment (MCB Juice, etc.)",
        ],
      },
      {
        category: "Mauritian taxation",
        features: [
          "VAT / TPS auto-calculation",
          "EDF5 filing (e-MRA)",
          "Automatic VAT filing",
          "CSG / TDS filings",
          "Full tax audit trail",
          "XML export e-MRA",
        ],
      },
      {
        category: "Payroll & Human resources",
        features: [
          "Compliant payslips",
          "NPF / NSF / PAYE calculation",
          "Leave & absence management",
          "Automatic bank transfers",
          "Employee self-service portal",
          "Time & attendance tracking",
          "Bonuses, commissions & rewards",
          "Multi-site",
          "Advanced HR reports",
        ],
      },
      {
        category: "Reporting & Dashboards",
        features: [
          "Balance sheet",
          "Income statement",
          "Cash flow statement",
          "Analytics dashboard",
          "Custom reports",
          "PDF / Excel export",
        ],
      },
      {
        category: "Technical & Support",
        features: [
          "Document storage",
          "Open API & webhooks",
          "Third-party integrations",
          "SSO / LDAP",
          "Email support",
          "Priority support",
          "Dedicated account manager",
          "Guaranteed SLA",
        ],
      },
    ],
    tierNamesShort: ["Solo", "Small biz", "Mid-size", "Enterprise"],
  },
} as const

type Txt = (typeof i18n)["fr"]

/* ------------------------------------------------------------------ */
/*  Pricing data                                                       */
/* ------------------------------------------------------------------ */
const ANNUAL_FACTOR = 10 / 12

const commaIncluded = [
  [true,true,true,false,true,false,false,true,false,false,false],
  [true,true,true,true,true,true,false,true,true,false,false],
  [true,true,true,true,true,true,true,true,true,true,false],
  [true,true,true,true,true,true,true,true,true,true,true],
]
const paieIncluded = [
  [true,true,true,false,false,false,false,false,false,false,false],
  [true,true,true,true,true,true,false,false,false,false,false],
  [true,true,true,true,true,true,true,true,true,false,false],
  [true,true,true,true,true,true,true,true,true,true,true],
]
const bundleIncluded = [
  [true,true,true,false,false,false,false,false,false,false],
  [true,true,true,true,true,false,true,false,false,false],
  [true,true,true,true,true,true,true,true,true,false],
  [true,true,true,true,true,true,true,true,true,true],
]

const matrixTiers = [
  // Comptabilite generale
  [[true,true,true,true],[true,true,true,true],[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,true,true,true]],
  // Facturation
  [[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,true,true]],
  // Fiscalite
  [[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,false,true],[false,true,true,true]],
  // Paie
  [[true,true,true,true],[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,true,true],[false,false,true,true],[false,false,false,true]],
  // Reporting
  [[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[true,true,true,true]],
  // Technique (storage is special string)
  [["500 Mo","2 Go","10 Go","Illimité"],[false,false,true,true],[false,false,true,true],[false,false,false,true],[true,true,true,true],[false,false,false,true],[false,false,false,true],[false,false,false,true]],
]

const prices: Record<string, number[]> = {
  compta: [1500, 3500, 6500, 12000],
  paie: [750, 2500, 6000, 13500],
  bundle: [1800, 4800, 10000, 20400],
}
const badgeColors = [C.blue, C.green, C.gold, C.orange]

type Tier = {
  badge: string; badgeColor: string; name: string; desc: string
  criteria: string; monthlyPrice: number; roi: string; emra: string
  storage: string; features: { label: string; included: boolean }[]
  ctaLabel: string; ctaPrimary: boolean
}

function buildTiers(section: "compta" | "paie" | "bundle", txt: Txt): Tier[] {
  const mp = prices[section]
  const criteria = section === "compta" ? txt.criteriaCompta : section === "paie" ? txt.criteriaPaie : txt.criteriaBundle
  const featLabels = section === "compta" ? txt.featCompta : section === "paie" ? txt.featPaie : txt.featBundle
  const included = section === "compta" ? commaIncluded : section === "paie" ? paieIncluded : bundleIncluded

  return txt.names.map((name, i) => ({
    badge: txt.badges[i],
    badgeColor: badgeColors[i],
    name,
    desc: txt.descs[i],
    criteria: criteria[i],
    monthlyPrice: mp[i],
    roi: txt.rois[i],
    emra: txt.emras[i],
    storage: txt.storages[i],
    features: featLabels.map((label, j) => ({ label, included: included[i][j] })),
    ctaLabel: txt.ctaLabels[i],
    ctaPrimary: i === 1,
  }))
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fmt(n: number): string {
  return n.toLocaleString("fr-MU")
}

function annualPrice(monthly: number): number {
  return Math.round(monthly * ANNUAL_FACTOR)
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */
function TierCard({ tier, billing, txt }: { tier: Tier; billing: "monthly" | "annual"; txt: Txt }) {
  const price = billing === "monthly" ? tier.monthlyPrice : annualPrice(tier.monthlyPrice)

  return (
    <div style={{
      backgroundColor: C.cardBg, border: tier.ctaPrimary ? `2px solid ${C.gold}` : `1px solid ${C.navyBorder}`,
      borderRadius: "16px", padding: "28px 24px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
    }}>
      <span style={{ display: "inline-block", fontSize: "11px", fontWeight: 600, color: tier.badgeColor, backgroundColor: `${tier.badgeColor}18`, padding: "4px 12px", borderRadius: "999px", alignSelf: "flex-start", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "16px" }}>
        {tier.badge}
      </span>
      <h3 style={{ color: C.white, fontSize: "20px", fontWeight: 700, margin: "0 0 6px" }}>{tier.name}</h3>
      <p style={{ color: C.muted, fontSize: "13px", lineHeight: 1.5, margin: "0 0 12px" }}>{tier.desc}</p>
      <span style={{ display: "inline-block", fontSize: "12px", color: C.blue, backgroundColor: `${C.blue}15`, padding: "4px 10px", borderRadius: "8px", alignSelf: "flex-start", marginBottom: "20px" }}>{tier.criteria}</span>

      <div style={{ marginBottom: "6px" }}>
        <span style={{ color: C.gold, fontSize: "36px", fontWeight: 800, lineHeight: 1 }}>Rs {fmt(price)}</span>
        <span style={{ color: C.muted, fontSize: "14px", marginLeft: "4px" }}>{txt.perMonth}</span>
      </div>
      {billing === "annual" && <span style={{ color: C.green, fontSize: "12px", fontWeight: 600 }}>{txt.annualSaving}</span>}

      <div style={{ marginTop: "14px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.green}12`, border: `1px solid ${C.green}30` }}>
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 500 }}>{tier.roi}</span>
      </div>
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30` }}>
        <span style={{ color: C.orange, fontSize: "12px", fontWeight: 500 }}>{tier.emra}</span>
      </div>
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30` }}>
        <span style={{ color: C.blue, fontSize: "12px", fontWeight: 500 }}>{txt.storage} : {tier.storage}</span>
      </div>

      <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "20px 0" }} />

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
        {tier.features.map((f, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px", color: f.included ? C.white : C.muted, opacity: f.included ? 1 : 0.5 }}>
            <span style={{ width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0, backgroundColor: f.included ? `${C.green}20` : `${C.muted}15`, color: f.included ? C.green : C.muted }}>
              {f.included ? "\u2713" : "\u2014"}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      <button style={{ width: "100%", padding: "14px", borderRadius: "10px", fontWeight: 700, fontSize: "14px", cursor: "pointer", border: tier.ctaPrimary ? "none" : `1px solid ${C.navyBorder}`, backgroundColor: tier.ctaPrimary ? C.gold : "transparent", color: tier.ctaPrimary ? C.bg : C.white, transition: "all 0.2s" }}>
        {tier.ctaLabel}
      </button>
    </div>
  )
}

function MatrixTable({ txt }: { txt: Txt }) {
  return (
    <div style={{ overflowX: "auto", marginTop: "32px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "700px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "12px 16px", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.navyBorder}`, width: "40%" }}>{txt.matrixCol}</th>
            {txt.tierNamesShort.map((t) => (
              <th key={t} style={{ textAlign: "center", padding: "12px 8px", color: C.gold, fontWeight: 700, borderBottom: `1px solid ${C.navyBorder}`, width: "15%" }}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txt.matrixCats.map((cat, ci) => (
            <tbody key={cat.category}>
              <tr>
                <td colSpan={5} style={{ padding: "14px 16px 8px", color: C.gold, fontWeight: 700, fontSize: "14px", borderBottom: `1px solid ${C.navyBorder}`, backgroundColor: `${C.gold}08` }}>
                  {cat.category}
                </td>
              </tr>
              {cat.features.map((fname, fi) => (
                <tr key={fname}>
                  <td style={{ padding: "10px 16px", color: C.white, borderBottom: `1px solid ${C.navyBorder}20` }}>{fname}</td>
                  {(matrixTiers[ci]?.[fi] || [false,false,false,false]).map((v: boolean | string, ti: number) => (
                    <td key={ti} style={{ textAlign: "center", padding: "10px 8px", borderBottom: `1px solid ${C.navyBorder}20`, color: v === true ? C.green : v === false ? C.muted : C.blue, fontWeight: typeof v === "string" ? 600 : 400 }}>
                      {v === true ? "\u2713" : v === false ? "\u2014" : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function TarifsPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly")
  const [section, setSection] = useState<"compta" | "paie" | "bundle" | "matrix">("compta")
  const [locale, setLoc] = useState<Locale>(getLocale())

  const switchLang = (l: Locale) => { setLoc(l); setLocale(l) }
  const txt = i18n[locale]

  const tabs: { key: typeof section; label: string }[] = [
    { key: "compta", label: txt.tabCompta },
    { key: "paie", label: txt.tabPaie },
    { key: "bundle", label: txt.tabBundle },
    { key: "matrix", label: txt.tabMatrix },
  ]

  const tiers = section !== "matrix" ? buildTiers(section, txt) : []

  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: "'Poppins', sans-serif" }}>
      {/* Navbar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: `${C.bg}EE`, backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.navyBorder}` }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <LexoraLogo href="/" size="md" />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="flex gap-1 rounded-full p-0.5" style={{ border: `1px solid ${C.navyBorder}` }}>
              <button onClick={() => switchLang("fr")} className="px-3 py-1 rounded-full text-xs font-semibold transition-colors" style={locale === "fr" ? { backgroundColor: C.gold, color: C.bg } : { color: C.muted }}>FR</button>
              <button onClick={() => switchLang("en")} className="px-3 py-1 rounded-full text-xs font-semibold transition-colors" style={locale === "en" ? { backgroundColor: C.gold, color: C.bg } : { color: C.muted }}>EN</button>
            </div>
            <Link href="/auth/login" style={{ color: C.white, fontSize: "14px", fontWeight: 600, padding: "8px 20px", borderRadius: "8px", border: `1px solid ${C.navyBorder}`, textDecoration: "none" }}>
              {txt.login}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "64px 24px 40px" }}>
        <span style={{ display: "inline-block", fontSize: "12px", fontWeight: 600, color: C.gold, backgroundColor: `${C.gold}15`, padding: "6px 16px", borderRadius: "999px", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "20px" }}>
          {txt.eyebrow}
        </span>
        <h1 style={{ color: C.white, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, lineHeight: 1.15, margin: "0 auto 16px", maxWidth: "800px" }}>
          {txt.h1_1} <span style={{ color: C.gold }}>{txt.h1_2}</span>
        </h1>
        <p style={{ color: C.muted, fontSize: "16px", lineHeight: 1.6, maxWidth: "600px", margin: "0 auto 32px" }}>
          {txt.subtitle}
        </p>

        {/* Billing toggle */}
        <div style={{ display: "inline-flex", borderRadius: "12px", backgroundColor: C.navy, border: `1px solid ${C.navyBorder}`, padding: "4px" }}>
          {(["monthly", "annual"] as const).map((mode) => (
            <button key={mode} onClick={() => setBilling(mode)} style={{ padding: "10px 24px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", border: "none", backgroundColor: billing === mode ? C.gold : "transparent", color: billing === mode ? C.bg : C.muted, transition: "all 0.2s" }}>
              {mode === "monthly" ? txt.monthly : txt.annual}
            </button>
          ))}
        </div>
      </section>

      {/* Module tabs */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px 8px" }}>
        <div style={{ display: "flex", gap: "4px", overflowX: "auto", borderBottom: `1px solid ${C.navyBorder}`, paddingBottom: "0" }}>
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setSection(tab.key)} style={{ padding: "12px 20px", fontSize: "14px", fontWeight: section === tab.key ? 700 : 500, cursor: "pointer", border: "none", backgroundColor: "transparent", color: section === tab.key ? C.gold : C.muted, borderBottom: section === tab.key ? `2px solid ${C.gold}` : "2px solid transparent", whiteSpace: "nowrap", transition: "all 0.2s" }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tier Cards or Matrix */}
      <section style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px 64px" }}>
        {section !== "matrix" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: "24px" }}>
            {tiers.map((tier, i) => (
              <TierCard key={i} tier={tier} billing={billing} txt={txt} />
            ))}
          </div>
        ) : (
          <div style={{ backgroundColor: C.cardBg, borderRadius: "16px", border: `1px solid ${C.navyBorder}`, padding: "24px" }}>
            <h2 style={{ color: C.white, fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>{txt.matrixTitle}</h2>
            <p style={{ color: C.muted, fontSize: "14px", margin: "0 0 8px" }}>{txt.matrixDesc}</p>
            <MatrixTable txt={txt} />
          </div>
        )}
      </section>

      {/* Stats row */}
      <section style={{ borderTop: `1px solid ${C.navyBorder}`, borderBottom: `1px solid ${C.navyBorder}`, padding: "48px 24px" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3" style={{ maxWidth: "900px", margin: "0 auto", gap: "32px", textAlign: "center" }}>
          {[
            { value: "40+", label: txt.statFeatures, color: C.gold },
            { value: "4", label: txt.statModules, color: C.green },
            { value: "0", label: txt.statCompetitor, color: C.blue },
          ].map((stat, i) => (
            <div key={i}>
              <div style={{ fontSize: "42px", fontWeight: 800, color: stat.color, lineHeight: 1, marginBottom: "8px" }}>{stat.value}</div>
              <div style={{ color: C.muted, fontSize: "14px", fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ textAlign: "center", padding: "80px 24px" }}>
        <h2 style={{ color: C.white, fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, margin: "0 0 16px" }}>{txt.ctaTitle}</h2>
        <p style={{ color: C.muted, fontSize: "16px", maxWidth: "500px", margin: "0 auto 32px", lineHeight: 1.6 }}>{txt.ctaDesc}</p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{ display: "inline-block", padding: "14px 32px", borderRadius: "10px", fontWeight: 700, fontSize: "15px", backgroundColor: C.gold, color: C.bg, textDecoration: "none" }}>
            {txt.ctaTrial}
          </Link>
          <Link href="/auth/login" style={{ display: "inline-block", padding: "14px 32px", borderRadius: "10px", fontWeight: 700, fontSize: "15px", backgroundColor: "transparent", color: C.white, border: `1px solid ${C.navyBorder}`, textDecoration: "none" }}>
            {txt.ctaDemo}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.navyBorder}`, padding: "24px", textAlign: "center" }}>
        <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>{txt.footer}</p>
      </footer>
    </div>
  )
}
