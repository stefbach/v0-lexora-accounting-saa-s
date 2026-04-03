"use client"

import { useState } from "react"
import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"

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
/*  Pricing data                                                       */
/* ------------------------------------------------------------------ */
const ANNUAL_FACTOR = 10 / 12

type Tier = {
  badge: string
  badgeColor: string
  name: string
  desc: string
  criteria: string
  monthlyPrice: number
  roi: string
  emra: string
  storage: string
  features: { label: string; included: boolean }[]
  ctaLabel: string
  ctaPrimary: boolean
}

function buildTiers(
  section: "compta" | "paie" | "bundle",
): Tier[] {
  const prices: Record<string, number[]> = {
    compta: [1500, 3500, 6500, 12000],
    paie: [750, 2500, 6000, 13500],
    bundle: [1800, 4800, 10000, 20400],
  }

  const mp = prices[section]

  const criteriaCompta = [
    "Jusqu'a 50 transactions/mois",
    "Jusqu'a 200 transactions/mois",
    "Jusqu'a 500 transactions/mois",
    "Transactions illimitees",
  ]
  const criteriaPaie = [
    "1 a 3 employes",
    "4 a 15 employes",
    "16 a 50 employes",
    "51+ employes",
  ]
  const criteriaBundle = [
    "Solo / micro-entreprise",
    "Petite equipe (< 15 pers.)",
    "PME etablie (< 50 pers.)",
    "Grande structure (50+)",
  ]

  const criteria =
    section === "compta"
      ? criteriaCompta
      : section === "paie"
        ? criteriaPaie
        : criteriaBundle

  const featuresCompta: { label: string; included: boolean }[][] = [
    [
      { label: "Plan comptable OHADA / mauricien", included: true },
      { label: "Saisie journal & grand livre", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Rapprochement bancaire auto", included: false },
      { label: "TVA / TPS auto-calcul", included: true },
      { label: "Declarations e-MRA (EDF5, VAT)", included: false },
      { label: "Multi-devises (EUR, USD, GBP)", included: false },
      { label: "Bilan & compte de resultat", included: true },
      { label: "Tableau de bord analytique", included: false },
      { label: "API & integrations tierces", included: false },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Plan comptable OHADA / mauricien", included: true },
      { label: "Saisie journal & grand livre", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Rapprochement bancaire auto", included: true },
      { label: "TVA / TPS auto-calcul", included: true },
      { label: "Declarations e-MRA (EDF5, VAT)", included: true },
      { label: "Multi-devises (EUR, USD, GBP)", included: false },
      { label: "Bilan & compte de resultat", included: true },
      { label: "Tableau de bord analytique", included: true },
      { label: "API & integrations tierces", included: false },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Plan comptable OHADA / mauricien", included: true },
      { label: "Saisie journal & grand livre", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Rapprochement bancaire auto", included: true },
      { label: "TVA / TPS auto-calcul", included: true },
      { label: "Declarations e-MRA (EDF5, VAT)", included: true },
      { label: "Multi-devises (EUR, USD, GBP)", included: true },
      { label: "Bilan & compte de resultat", included: true },
      { label: "Tableau de bord analytique", included: true },
      { label: "API & integrations tierces", included: true },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Plan comptable OHADA / mauricien", included: true },
      { label: "Saisie journal & grand livre", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Rapprochement bancaire auto", included: true },
      { label: "TVA / TPS auto-calcul", included: true },
      { label: "Declarations e-MRA (EDF5, VAT)", included: true },
      { label: "Multi-devises (EUR, USD, GBP)", included: true },
      { label: "Bilan & compte de resultat", included: true },
      { label: "Tableau de bord analytique", included: true },
      { label: "API & integrations tierces", included: true },
      { label: "Support prioritaire", included: true },
    ],
  ]

  const featuresPaie: { label: string; included: boolean }[][] = [
    [
      { label: "Fiches de paie conformes", included: true },
      { label: "Calcul NPF / NSF / PAYE", included: true },
      { label: "Conges & absences", included: true },
      { label: "Virements bancaires auto", included: false },
      { label: "Declarations CSG / TDS", included: false },
      { label: "Portail employe self-service", included: false },
      { label: "Gestion temps & pointage", included: false },
      { label: "Primes & commissions", included: false },
      { label: "Multi-sites", included: false },
      { label: "Rapports RH avances", included: false },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Fiches de paie conformes", included: true },
      { label: "Calcul NPF / NSF / PAYE", included: true },
      { label: "Conges & absences", included: true },
      { label: "Virements bancaires auto", included: true },
      { label: "Declarations CSG / TDS", included: true },
      { label: "Portail employe self-service", included: true },
      { label: "Gestion temps & pointage", included: false },
      { label: "Primes & commissions", included: false },
      { label: "Multi-sites", included: false },
      { label: "Rapports RH avances", included: false },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Fiches de paie conformes", included: true },
      { label: "Calcul NPF / NSF / PAYE", included: true },
      { label: "Conges & absences", included: true },
      { label: "Virements bancaires auto", included: true },
      { label: "Declarations CSG / TDS", included: true },
      { label: "Portail employe self-service", included: true },
      { label: "Gestion temps & pointage", included: true },
      { label: "Primes & commissions", included: true },
      { label: "Multi-sites", included: true },
      { label: "Rapports RH avances", included: false },
      { label: "Support prioritaire", included: false },
    ],
    [
      { label: "Fiches de paie conformes", included: true },
      { label: "Calcul NPF / NSF / PAYE", included: true },
      { label: "Conges & absences", included: true },
      { label: "Virements bancaires auto", included: true },
      { label: "Declarations CSG / TDS", included: true },
      { label: "Portail employe self-service", included: true },
      { label: "Gestion temps & pointage", included: true },
      { label: "Primes & commissions", included: true },
      { label: "Multi-sites", included: true },
      { label: "Rapports RH avances", included: true },
      { label: "Support prioritaire", included: true },
    ],
  ]

  const featuresBundle: { label: string; included: boolean }[][] = [
    [
      { label: "Comptabilite complete", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Paie de base (1-3 empl.)", included: true },
      { label: "Rapprochement bancaire", included: false },
      { label: "Declarations e-MRA", included: false },
      { label: "Multi-devises", included: false },
      { label: "Portail employe", included: false },
      { label: "Gestion inventaire", included: false },
      { label: "API ouverte", included: false },
      { label: "Support dedie", included: false },
    ],
    [
      { label: "Comptabilite complete", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Paie avancee (4-15 empl.)", included: true },
      { label: "Rapprochement bancaire", included: true },
      { label: "Declarations e-MRA", included: true },
      { label: "Multi-devises", included: false },
      { label: "Portail employe", included: true },
      { label: "Gestion inventaire", included: false },
      { label: "API ouverte", included: false },
      { label: "Support dedie", included: false },
    ],
    [
      { label: "Comptabilite complete", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Paie avancee (16-50 empl.)", included: true },
      { label: "Rapprochement bancaire", included: true },
      { label: "Declarations e-MRA", included: true },
      { label: "Multi-devises", included: true },
      { label: "Portail employe", included: true },
      { label: "Gestion inventaire", included: true },
      { label: "API ouverte", included: true },
      { label: "Support dedie", included: false },
    ],
    [
      { label: "Comptabilite complete", included: true },
      { label: "Facturation illimitee", included: true },
      { label: "Paie entreprise (51+ empl.)", included: true },
      { label: "Rapprochement bancaire", included: true },
      { label: "Declarations e-MRA", included: true },
      { label: "Multi-devises", included: true },
      { label: "Portail employe", included: true },
      { label: "Gestion inventaire", included: true },
      { label: "API ouverte", included: true },
      { label: "Support dedie", included: true },
    ],
  ]

  const featuresBySection =
    section === "compta"
      ? featuresCompta
      : section === "paie"
        ? featuresPaie
        : featuresBundle

  const names = ["Solo", "Petite entreprise", "PME", "Grande entreprise"]
  const descs = [
    "Ideal pour les freelances et auto-entrepreneurs.",
    "Pour les petites equipes en croissance.",
    "La solution complete pour les entreprises etablies.",
    "Sur mesure pour les grandes structures.",
  ]
  const badges = ["Starter", "Meilleure valeur", "Coeur de cible", "Enterprise"]
  const badgeColors = [C.blue, C.green, C.gold, C.orange]
  const rois = [
    "Economisez ~Rs 8 000/mois vs comptable",
    "Economisez ~Rs 15 000/mois vs comptable",
    "Economisez ~Rs 25 000/mois vs comptable",
    "ROI sur mesure - contactez-nous",
  ]
  const emras = [
    "e-MRA : EDF5 basique",
    "e-MRA : EDF5 + VAT auto",
    "e-MRA : toutes declarations",
    "e-MRA : toutes declarations + audit trail",
  ]
  const storages = ["500 Mo", "2 Go", "10 Go", "Illimite"]

  return names.map((name, i) => ({
    badge: badges[i],
    badgeColor: badgeColors[i],
    name,
    desc: descs[i],
    criteria: criteria[i],
    monthlyPrice: mp[i],
    roi: rois[i],
    emra: emras[i],
    storage: storages[i],
    features: featuresBySection[i],
    ctaLabel: i === 3 ? "Contacter l'equipe" : "Commencer maintenant",
    ctaPrimary: i === 1,
  }))
}

/* ------------------------------------------------------------------ */
/*  Matrix data                                                        */
/* ------------------------------------------------------------------ */
const matrixCategories = [
  {
    category: "Comptabilite generale",
    features: [
      { name: "Plan comptable OHADA / mauricien", tiers: [true, true, true, true] },
      { name: "Saisie journal", tiers: [true, true, true, true] },
      { name: "Grand livre", tiers: [true, true, true, true] },
      { name: "Balance generale", tiers: [true, true, true, true] },
      { name: "Rapprochement bancaire automatique", tiers: [false, true, true, true] },
      { name: "Import releves bancaires (CSV/OFX)", tiers: [false, true, true, true] },
      { name: "Multi-devises (EUR, USD, GBP)", tiers: [false, false, true, true] },
      { name: "Ecritures automatiques recurrentes", tiers: [false, true, true, true] },
    ],
  },
  {
    category: "Facturation & Ventes",
    features: [
      { name: "Factures illimitees", tiers: [true, true, true, true] },
      { name: "Devis & bons de commande", tiers: [true, true, true, true] },
      { name: "Avoirs & notes de credit", tiers: [false, true, true, true] },
      { name: "Relances automatiques", tiers: [false, true, true, true] },
      { name: "Portail client", tiers: [false, false, true, true] },
      { name: "Paiement en ligne (MCB Juice, etc.)", tiers: [false, false, true, true] },
    ],
  },
  {
    category: "Fiscalite mauricienne",
    features: [
      { name: "TVA / TPS auto-calcul", tiers: [true, true, true, true] },
      { name: "Declaration EDF5 (e-MRA)", tiers: [false, true, true, true] },
      { name: "Declaration VAT automatique", tiers: [false, true, true, true] },
      { name: "CSG / TDS declarations", tiers: [false, false, true, true] },
      { name: "Audit trail fiscal complet", tiers: [false, false, false, true] },
      { name: "Export XML e-MRA", tiers: [false, true, true, true] },
    ],
  },
  {
    category: "Paie & Ressources humaines",
    features: [
      { name: "Fiches de paie conformes", tiers: [true, true, true, true] },
      { name: "Calcul NPF / NSF / PAYE", tiers: [true, true, true, true] },
      { name: "Gestion conges & absences", tiers: [true, true, true, true] },
      { name: "Virements bancaires auto", tiers: [false, true, true, true] },
      { name: "Portail employe self-service", tiers: [false, true, true, true] },
      { name: "Gestion temps & pointage", tiers: [false, false, true, true] },
      { name: "Primes, commissions & bonus", tiers: [false, false, true, true] },
      { name: "Multi-sites", tiers: [false, false, true, true] },
      { name: "Rapports RH avances", tiers: [false, false, false, true] },
    ],
  },
  {
    category: "Reporting & Tableaux de bord",
    features: [
      { name: "Bilan comptable", tiers: [true, true, true, true] },
      { name: "Compte de resultat", tiers: [true, true, true, true] },
      { name: "Tableau de flux de tresorerie", tiers: [false, true, true, true] },
      { name: "Tableau de bord analytique", tiers: [false, true, true, true] },
      { name: "Rapports personnalises", tiers: [false, false, true, true] },
      { name: "Export PDF / Excel", tiers: [true, true, true, true] },
    ],
  },
  {
    category: "Technique & Support",
    features: [
      { name: "Stockage documents", tiers: ["500 Mo", "2 Go", "10 Go", "Illimite"] },
      { name: "API ouverte & webhooks", tiers: [false, false, true, true] },
      { name: "Integrations tierces", tiers: [false, false, true, true] },
      { name: "SSO / LDAP", tiers: [false, false, false, true] },
      { name: "Support email", tiers: [true, true, true, true] },
      { name: "Support prioritaire", tiers: [false, false, false, true] },
      { name: "Account manager dedie", tiers: [false, false, false, true] },
      { name: "SLA garanti", tiers: [false, false, false, true] },
    ],
  },
]

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

function TierCard({
  tier,
  billing,
}: {
  tier: Tier
  billing: "monthly" | "annual"
}) {
  const price =
    billing === "monthly" ? tier.monthlyPrice : annualPrice(tier.monthlyPrice)

  return (
    <div
      style={{
        backgroundColor: C.cardBg,
        border: tier.ctaPrimary ? `2px solid ${C.gold}` : `1px solid ${C.navyBorder}`,
        borderRadius: "16px",
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Badge */}
      <span
        style={{
          display: "inline-block",
          fontSize: "11px",
          fontWeight: 600,
          color: tier.badgeColor,
          backgroundColor: `${tier.badgeColor}18`,
          padding: "4px 12px",
          borderRadius: "999px",
          alignSelf: "flex-start",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          marginBottom: "16px",
        }}
      >
        {tier.badge}
      </span>

      {/* Name */}
      <h3
        style={{
          color: C.white,
          fontSize: "20px",
          fontWeight: 700,
          margin: "0 0 6px",
        }}
      >
        {tier.name}
      </h3>

      {/* Desc */}
      <p
        style={{
          color: C.muted,
          fontSize: "13px",
          lineHeight: 1.5,
          margin: "0 0 12px",
        }}
      >
        {tier.desc}
      </p>

      {/* Criteria */}
      <span
        style={{
          display: "inline-block",
          fontSize: "12px",
          color: C.blue,
          backgroundColor: `${C.blue}15`,
          padding: "4px 10px",
          borderRadius: "8px",
          alignSelf: "flex-start",
          marginBottom: "20px",
        }}
      >
        {tier.criteria}
      </span>

      {/* Price */}
      <div style={{ marginBottom: "6px" }}>
        <span
          style={{
            color: C.gold,
            fontSize: "36px",
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          Rs {fmt(price)}
        </span>
        <span style={{ color: C.muted, fontSize: "14px", marginLeft: "4px" }}>
          /mois
        </span>
      </div>
      {billing === "annual" && (
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 600 }}>
          2 mois offerts (facture annuelle)
        </span>
      )}

      {/* ROI */}
      <div
        style={{
          marginTop: "14px",
          padding: "8px 12px",
          borderRadius: "8px",
          backgroundColor: `${C.green}12`,
          border: `1px solid ${C.green}30`,
        }}
      >
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 500 }}>
          {tier.roi}
        </span>
      </div>

      {/* e-MRA */}
      <div
        style={{
          marginTop: "10px",
          padding: "8px 12px",
          borderRadius: "8px",
          backgroundColor: `${C.orange}12`,
          border: `1px solid ${C.orange}30`,
        }}
      >
        <span style={{ color: C.orange, fontSize: "12px", fontWeight: 500 }}>
          {tier.emra}
        </span>
      </div>

      {/* Storage */}
      <div
        style={{
          marginTop: "10px",
          padding: "8px 12px",
          borderRadius: "8px",
          backgroundColor: `${C.blue}12`,
          border: `1px solid ${C.blue}30`,
        }}
      >
        <span style={{ color: C.blue, fontSize: "12px", fontWeight: 500 }}>
          Stockage : {tier.storage}
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          backgroundColor: C.navyBorder,
          margin: "20px 0",
        }}
      />

      {/* Features */}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1 }}>
        {tier.features.map((f, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "10px",
              fontSize: "13px",
              color: f.included ? C.white : C.muted,
              opacity: f.included ? 1 : 0.5,
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                flexShrink: 0,
                backgroundColor: f.included ? `${C.green}20` : `${C.muted}15`,
                color: f.included ? C.green : C.muted,
              }}
            >
              {f.included ? "\u2713" : "\u2014"}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "10px",
          fontWeight: 700,
          fontSize: "14px",
          cursor: "pointer",
          border: tier.ctaPrimary ? "none" : `1px solid ${C.navyBorder}`,
          backgroundColor: tier.ctaPrimary ? C.gold : "transparent",
          color: tier.ctaPrimary ? C.bg : C.white,
          transition: "all 0.2s",
        }}
      >
        {tier.ctaLabel}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Matrix table                                                       */
/* ------------------------------------------------------------------ */
function MatrixTable() {
  const tierNames = ["Solo", "Petite entr.", "PME", "Grande entr."]

  return (
    <div style={{ overflowX: "auto", marginTop: "32px" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
          minWidth: "700px",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "12px 16px",
                color: C.muted,
                fontWeight: 600,
                borderBottom: `1px solid ${C.navyBorder}`,
                width: "40%",
              }}
            >
              Fonctionnalite
            </th>
            {tierNames.map((t) => (
              <th
                key={t}
                style={{
                  textAlign: "center",
                  padding: "12px 8px",
                  color: C.gold,
                  fontWeight: 700,
                  borderBottom: `1px solid ${C.navyBorder}`,
                  width: "15%",
                }}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrixCategories.map((cat) => (
            <>
              <tr key={cat.category}>
                <td
                  colSpan={5}
                  style={{
                    padding: "14px 16px 8px",
                    color: C.gold,
                    fontWeight: 700,
                    fontSize: "14px",
                    borderBottom: `1px solid ${C.navyBorder}`,
                    backgroundColor: `${C.gold}08`,
                  }}
                >
                  {cat.category}
                </td>
              </tr>
              {cat.features.map((f) => (
                <tr key={f.name}>
                  <td
                    style={{
                      padding: "10px 16px",
                      color: C.white,
                      borderBottom: `1px solid ${C.navyBorder}20`,
                    }}
                  >
                    {f.name}
                  </td>
                  {f.tiers.map((v, i) => (
                    <td
                      key={i}
                      style={{
                        textAlign: "center",
                        padding: "10px 8px",
                        borderBottom: `1px solid ${C.navyBorder}20`,
                        color:
                          v === true
                            ? C.green
                            : v === false
                              ? C.muted
                              : C.blue,
                        fontWeight: typeof v === "string" ? 600 : 400,
                      }}
                    >
                      {v === true ? "\u2713" : v === false ? "\u2014" : v}
                    </td>
                  ))}
                </tr>
              ))}
            </>
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

  const tabs: { key: typeof section; label: string }[] = [
    { key: "compta", label: "Comptabilite + Facturation" },
    { key: "paie", label: "RH & Paie" },
    { key: "bundle", label: "Pack Complet ERP" },
    { key: "matrix", label: "Matrice fonctionnalites" },
  ]

  const tiers =
    section !== "matrix" ? buildTiers(section) : []

  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: "'Poppins', sans-serif" }}>
      {/* ---- Navbar ---- */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: `${C.bg}EE`,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.navyBorder}`,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <LexoraLogo href="/" size="md" />
          <Link
            href="/auth/login"
            style={{
              color: C.white,
              fontSize: "14px",
              fontWeight: 600,
              padding: "8px 20px",
              borderRadius: "8px",
              border: `1px solid ${C.navyBorder}`,
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Se connecter
          </Link>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section style={{ textAlign: "center", padding: "64px 24px 40px" }}>
        {/* Eyebrow */}
        <span
          style={{
            display: "inline-block",
            fontSize: "12px",
            fontWeight: 600,
            color: C.gold,
            backgroundColor: `${C.gold}15`,
            padding: "6px 16px",
            borderRadius: "999px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: "20px",
          }}
        >
          Tarifs Lexora 2026
        </span>

        <h1
          style={{
            color: C.white,
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 800,
            lineHeight: 1.15,
            margin: "0 auto 16px",
            maxWidth: "800px",
          }}
        >
          L&apos;ERP mauricien complet.{" "}
          <span style={{ color: C.gold }}>Sans comptable requis.</span>
        </h1>

        <p
          style={{
            color: C.muted,
            fontSize: "16px",
            lineHeight: 1.6,
            maxWidth: "600px",
            margin: "0 auto 32px",
          }}
        >
          Comptabilite, paie, fiscalite e-MRA et reporting — tout inclus dans
          une plateforme pensee pour Maurice. Choisissez votre formule.
        </p>

        {/* Billing toggle */}
        <div
          style={{
            display: "inline-flex",
            borderRadius: "12px",
            backgroundColor: C.navy,
            border: `1px solid ${C.navyBorder}`,
            padding: "4px",
          }}
        >
          {(["monthly", "annual"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setBilling(mode)}
              style={{
                padding: "10px 24px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                backgroundColor:
                  billing === mode ? C.gold : "transparent",
                color:
                  billing === mode ? C.bg : C.muted,
                transition: "all 0.2s",
              }}
            >
              {mode === "monthly" ? "Mensuel" : "Annuel (-17%)"}
            </button>
          ))}
        </div>
      </section>

      {/* ---- Module tabs ---- */}
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 24px 8px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "4px",
            overflowX: "auto",
            borderBottom: `1px solid ${C.navyBorder}`,
            paddingBottom: "0",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              style={{
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: section === tab.key ? 700 : 500,
                cursor: "pointer",
                border: "none",
                backgroundColor: "transparent",
                color: section === tab.key ? C.gold : C.muted,
                borderBottom:
                  section === tab.key
                    ? `2px solid ${C.gold}`
                    : "2px solid transparent",
                whiteSpace: "nowrap",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Tier Cards or Matrix ---- */}
      <section
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "32px 24px 64px",
        }}
      >
        {section !== "matrix" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: "24px" }}>
            {tiers.map((tier, i) => (
              <TierCard key={i} tier={tier} billing={billing} />
            ))}
          </div>
        ) : (
          <div
            style={{
              backgroundColor: C.cardBg,
              borderRadius: "16px",
              border: `1px solid ${C.navyBorder}`,
              padding: "24px",
            }}
          >
            <h2
              style={{
                color: C.white,
                fontSize: "22px",
                fontWeight: 700,
                margin: "0 0 4px",
              }}
            >
              Matrice complete des fonctionnalites
            </h2>
            <p style={{ color: C.muted, fontSize: "14px", margin: "0 0 8px" }}>
              Comparez les 40+ fonctionnalites incluses dans chaque formule Lexora.
            </p>
            <MatrixTable />
          </div>
        )}
      </section>

      {/* ---- Stats row ---- */}
      <section
        style={{
          borderTop: `1px solid ${C.navyBorder}`,
          borderBottom: `1px solid ${C.navyBorder}`,
          padding: "48px 24px",
        }}
      >
        <div
          className="grid grid-cols-1 sm:grid-cols-3"
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            gap: "32px",
            textAlign: "center",
          }}
        >
          {[
            { value: "40+", label: "fonctionnalites", color: C.gold },
            { value: "4", label: "modules fiscaux mauriciens", color: C.green },
            { value: "0", label: "concurrent aussi complet a Maurice", color: C.blue },
          ].map((stat, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: "42px",
                  fontWeight: 800,
                  color: stat.color,
                  lineHeight: 1,
                  marginBottom: "8px",
                }}
              >
                {stat.value}
              </div>
              <div style={{ color: C.muted, fontSize: "14px", fontWeight: 500 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Bottom CTA ---- */}
      <section style={{ textAlign: "center", padding: "80px 24px" }}>
        <h2
          style={{
            color: C.white,
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 800,
            margin: "0 0 16px",
          }}
        >
          Pret a simplifier votre comptabilite ?
        </h2>
        <p
          style={{
            color: C.muted,
            fontSize: "16px",
            maxWidth: "500px",
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          Rejoignez les entreprises mauriciennes qui gerent leur comptabilite,
          paie et fiscalite en toute autonomie avec Lexora.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/login"
            style={{
              display: "inline-block",
              padding: "14px 32px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "15px",
              backgroundColor: C.gold,
              color: C.bg,
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Demarrer l&apos;essai gratuit
          </Link>
          <Link
            href="/auth/login"
            style={{
              display: "inline-block",
              padding: "14px 32px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "15px",
              backgroundColor: "transparent",
              color: C.white,
              border: `1px solid ${C.navyBorder}`,
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            Demander une demo
          </Link>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer
        style={{
          borderTop: `1px solid ${C.navyBorder}`,
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>
          &copy; 2026 Lexora Ltd. Tous droits reserves. Port-Louis, Maurice.
        </p>
      </footer>
    </div>
  )
}
