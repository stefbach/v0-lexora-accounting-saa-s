"use client"

import { useState } from "react"
import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"
import { t, getLocale, setLocale, type Locale } from "@/lib/i18n"
import {
  SOCIETE_TIERS,
  GBC_TIERS,
  OVERAGE_MUR_PER_TX,
  resolveTierIndex,
  annualMonthlyPrice,
  SETUP_FEE_MUR_PAR_SOCIETE,
} from "@/lib/pricing/packages"
import {
  FileSearch, BookOpen, FileText, Users, Landmark, BellRing,
  HeartPulse, TrendingUp, Zap, ShieldCheck, Check, Minus,
  Camera, Sparkles, Crown, Send,
} from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Reveal,
  StaggerGroup,
  StaggerItem,
  HoverLift,
  PressableWrap,
  FadeSlide,
  ShineSweep,
} from "@/components/ui/motion"
import { NeuralNetworkScene } from "@/components/NeuralNetworkScene"
import { ParticleField } from "@/components/ParticleField"
import { ScrollProgress } from "@/components/ScrollProgress"
import { AnimatedCounter } from "@/components/AnimatedCounter"
import { PricingOrb3DLazy } from "@/components/3d/PricingOrb3DLoader"
import { BRAND } from "@/lib/theme/brand"

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
/**
 * Jeton de couleur local, adossé à la palette de marque claire
 * (lib/theme/brand.ts). Les noms restent proches de l'ancien nuancier pour
 * limiter le bruit dans le diff, mais les valeurs sont désormais celles
 * d'une surface claire : `white` est l'encre foncée des titres, `bg` le
 * canevas blanc.
 */
const C = {
  bg: BRAND.canvas,
  bgAlt: BRAND.canvasAlt,
  navy: BRAND.surfaceAlt,
  navyBorder: BRAND.border,
  gold: BRAND.gold,
  goldLight: BRAND.goldLight,
  goldText: BRAND.goldText,
  goldSoft: BRAND.goldSoft,
  /** Encre principale — anciennement le blanc cassé sur fond nuit. */
  white: BRAND.ink,
  /** Texte posé sur un aplat or ou vert. */
  onAccent: BRAND.onAccent,
  green: BRAND.green,
  blue: BRAND.blue,
  orange: BRAND.orange,
  muted: BRAND.inkMuted,
  mutedAlpha: BRAND.inkFaint,
  cardBg: BRAND.surface,
}

const FONT = "'Poppins', sans-serif"

/* ------------------------------------------------------------------ */
/*  i18n                                                               */
/* ------------------------------------------------------------------ */
const frTexts = {
  // Navbar
  navModules: "Modules",
  navIA: "Intelligence IA",
  navFormules: "Formules",
  navConformite: "Conformit\u00e9",
  navTarifs: "Tarifs",
  login: "Connexion",

  // Hero
  eyebrow: "Tarifs Lexora 2026",
  heroTitle: "L\u2019ERP mauricien complet.",
  heroTitle2: "RH, Paie, Sant\u00e9 & Comptabilit\u00e9.",
  heroSub: "40+ fonctionnalit\u00e9s. Conformit\u00e9 MRA native. TIBOK Corporate sant\u00e9. Intelligence artificielle int\u00e9gr\u00e9e. Tout dans une seule plateforme.",
  monthly: "Mensuel",
  annual: "Annuel",
  annualLabel: "2 mois offerts",
  perMonth: "/mois",

  // Module section
  modulesTitle: "8 modules int\u00e9gr\u00e9s",
  modulesSub: "Chaque module est inclus dans votre formule. Pas de surprises, pas d\u2019options cach\u00e9es.",
  mod1: "OCR & Documents IA",
  mod1f: ["Upload ou photo de tout document (PDF, Excel, image, scan)", "L\u2019IA analyse, classe et g\u00e9n\u00e8re les \u00e9critures automatiquement", "Reconnaissance factures, relev\u00e9s bancaires, contrats, re\u00e7us"],
  mod2: "Comptabilit\u00e9 Automatis\u00e9e",
  mod2f: ["Grand Livre, Balance, Bilan & P&L", "Rapprochement bancaire automatique", "Multi-devises temps r\u00e9el (IAS 21)"],
  mod3: "Facturation MRA Agr\u00e9\u00e9e",
  mod3f: ["Factures conformes MRA (IRN + QR Code)", "Devis, avoirs, notes de d\u00e9bit", "Relances automatiques"],
  mod4: "RH & Paie Maurice",
  mod4f: ["Bulletins conformes (CSG/NSF/PAYE)", "Pointeuse digitale & planning", "Cong\u00e9s Workers\u2019 Rights Act 2019"],
  mod5: "Fiscal MRA",
  mod5f: ["TVA 9-Box, CSG/NSF/PAYE auto", "IT Form 3 & Annual Return ROC", "Export XML e-MRA"],
  mod6: "Alertes IA & Pilotage",
  mod6f: ["Agent IA \u00e9ch\u00e9ances fiscales", "Pr\u00e9visionnel Budget vs R\u00e9el", "Recommandations strat\u00e9giques IA"],
  mod7: "TIBOK Corporate",
  mod7sub: "Sant\u00e9 & Bien-\u00eatre Salari\u00e9s",
  mod7f: ["Bilan sant\u00e9 annuel inclus", "T\u00e9l\u00e9consultation m\u00e9dicale 24/7", "Programme bien-\u00eatre entreprise"],
  mod8: "Chief of Staff IA \u2014 Telegram",
  mod8sub: "Votre assistant de direction 24/7",
  mod8f: ["Agenda, RDV, emails, alertes en langage naturel", "OCR, RH, banque pilot\u00e9s depuis Telegram", "Inclus d\u00e8s le plan Pro / Cabinet Team"],

  // Arguments
  argTitle: "Pourquoi Lexora ?",
  arg1: "ROI imm\u00e9diat",
  arg1d: "\u00c9conomisez d\u00e8s le premier mois vs un comptable externe ou un cabinet RH.",
  arg2: "Z\u00e9ro formation requise",
  arg2d: "Interface intuitive, prise en main en moins de 2 heures. Support inclus.",
  arg3: "Conformit\u00e9 MRA + Duty of care",
  arg3d: "Facturation e-MRA agr\u00e9\u00e9e, d\u00e9clarations fiscales auto, sant\u00e9 salari\u00e9s TIBOK.",

  // Trust band
  trust1: "40+ fonctionnalit\u00e9s",
  trust2: "4 modules fiscaux MRA",
  trust3: "< 2h prise en main",
  trust4: "TIBOK sant\u00e9 incluse",
  trust5: "0 concurrent ERP+Sant\u00e9",

  // Tabs
  tabSociete: "Package Société",
  tabGbc: "Package GBC / IFRS",
  tabMatrix: "Ce qui varie d’un palier à l’autre",

  // ---- Promesse commune aux deux packages -------------------------
  unlimitedTag: "Salariés & utilisateurs illimités",
  tibokPaygTag: "TIBOK : Rs 500 par téléconsultation, à l’acte",
  setupTag: "+ Rs 8 000 de mise en service, par société",
  setupTitle: "Mise en service",
  setupNote: "Rs 8 000 par société, facturés une seule fois à la souscription : paramétrage et 4 heures de formation. Un groupe qui consolide plusieurs entités paie une mise en service par entité. La reprise d’un historique comptable existant est devisée à part.",
  calcSetupLabel: "Mise en service",
  calcSubscriptionLabel: "Première échéance",
  calcFirstPaymentLabel: "À régler à la souscription",
  quoteLabel: "Sur devis",
  allInTitle: "Tout compris — identique sur tous les paliers",
  overageNote: "Au-delà du plafond : Rs 15 par transaction, sans jamais dépasser le prix du palier supérieur.",
  featAllIn: [
    "Comptabilité complète (PCM mauricien / OHADA)",
    "Facturation MRA agréée (IRN + QR Code)",
    "Banque : import relevés & rapprochement automatique",
    "OCR & documents pilotés par l’IA",
    "Fiscal MRA : TVA, CSG/NSF/PAYE, TDS, IT Form 3, ROC",
    "RH & Paie — salariés illimités",
    "Congés, planning, pointage, frais kilométriques",
    "Portail salarié self-service",
    "Juridique : contrats, signature, assistant rédaction",
    "États financiers : bilan, résultat, trésorerie",
    "Alertes IA & pilotage prévisionnel",
    "Chief of Staff IA sur Telegram",
    "TIBOK Corporate — téléconsultation à la demande",
  ],

  // ---- Package Société : un seul axe de prix, le volume de pièces --
  societeNames: ["Essentiel", "Croissance", "PME", "Corporate", "Enterprise"],
  societeDescs: [
    "Freelances, professions libérales et micro-entreprises.",
    "Entreprises en croissance, activité régulière.",
    "PME établies, flux fournisseurs et clients soutenus.",
    "Grandes structures, volumes élevés et support dédié.",
    "Volumes illimités, SLA, API dédiée et accompagnement sur mesure.",
  ],
  societeBadges: ["Démarrage", "Le plus choisi", "PME établie", "Grande structure", "Sur mesure"],
  societeTx: [
    "Jusqu’à 50 transactions/mois",
    "Jusqu’à 200 transactions/mois",
    "Jusqu’à 500 transactions/mois",
    "Jusqu’à 1 500 transactions/mois",
    "Transactions illimitées",
  ],
  societeRois: [
    "Économisez ~Rs 8 000/mois vs comptable externe",
    "Économisez ~Rs 15 000/mois vs comptable externe",
    "Économisez ~Rs 25 000/mois vs comptable externe",
    "Économisez ~Rs 40 000/mois vs cabinet compta + RH",
    "ROI calculé avec vous",
  ],
  societeStorages: ["Stockage 5 Go", "Stockage 20 Go", "Stockage 100 Go", "Stockage illimité", "Stockage illimité"],
  societeCtas: ["Commencer maintenant", "Commencer maintenant", "Commencer maintenant", "Commencer maintenant", "Contacter l’équipe"],

  // ---- Package GBC / IFRS : axe de prix = périmètre consolidé ------
  gbcExtraTitle: "En plus : Global Business & IFRS complet",
  featGbcExtra: [
    "IFRS complet (et non IFRS for SMEs)",
    "Partial Exemption Regime — exonération 80 %",
    "Substance & activités génératrices de revenu (CIGA)",
    "Bénéficiaires effectifs (UBO) & registre FSC",
    "Échanges CRS / FATCA",
    "IFRS 9 — dépréciation ECL par étages",
    "IFRS 16 — contrats de location",
    "IFRS 10 — consolidation multi-entités",
    "Prix de transfert & documentation",
    "BEPS Pillar Two — calcul GloBE",
    "IAS 21 — monnaie fonctionnelle",
  ],
  gbcNames: ["Authorised Company", "Standard", "Groupe consolidé", "Management Company"],
  gbcDescs: [
    "Authorised Company ou GBC simple, une entité.",
    "GBC en régime d’exonération partielle, reporting IFRS étendu.",
    "Groupe multi-entités : consolidation, prix de transfert, Pillar Two.",
    "Portefeuille de GBC administré par une management company.",
  ],
  gbcBadges: ["Entrée GBC", "Le plus choisi", "Groupe", "Sur mesure"],
  gbcTx: [
    "1 entité · jusqu’à 100 transactions/mois",
    "1 entité · jusqu’à 500 transactions/mois",
    "Jusqu’à 5 entités · 1 500 transactions/mois",
    "Entités & transactions illimitées",
  ],
  gbcRois: [
    "Économisez ~Rs 25 000/mois vs prestataire de reporting",
    "Économisez ~Rs 45 000/mois vs cabinet IFRS",
    "Économisez ~Rs 90 000/mois vs consolidation externalisée",
    "ROI calculé avec vous",
  ],
  gbcStorages: ["Stockage 50 Go", "Stockage 200 Go", "Stockage illimité", "Stockage illimité"],
  gbcCtas: ["Commencer maintenant", "Commencer maintenant", "Commencer maintenant", "Contacter l’équipe"],
  gbcEntiteNote: "Entité consolidée supplémentaire : Rs 4 500/mois.",

  // Matrix — ne compare plus des fonctionnalités (tout est inclus partout)
  // mais les seules dimensions qui varient réellement d’un palier à l’autre.
  matrixTitle: "Ce qui varie d’un palier à l’autre",
  matrixDesc: "Toutes les fonctionnalités sont incluses dans chaque palier. Seuls le volume traité et le niveau de service changent.",
  matrixCol: "Dimension",
  tierNamesShort: ["Essentiel", "Croissance", "PME", "Corporate", "Enterprise"],
  matrixCats: [
    {
      category: "Tout compris — dans chaque palier",
      features: [
        "Comptabilité, facturation & banque",
        "Fiscal MRA (TVA, PAYE, TDS, IT Form 3, ROC)",
        "RH & Paie — salariés illimités",
        "Juridique & contrats",
        "OCR & alertes IA",
        "Chief of Staff Telegram",
        "TIBOK Corporate — accès santé",
        "Utilisateurs illimités",
      ],
      isGreen: true,
    },
    {
      category: "Ce qui varie",
      features: [
        "Transactions incluses / mois",
        "Stockage documentaire",
        "Dépassement au-delà du plafond",
        "Support",
        "Engagement de service (SLA)",
        "API & intégrations dédiées",
      ],
    },
  ],

  // Stats row
  stat1v: "40+",
  stat1l: "fonctionnalit\u00e9s",
  stat2v: "ERP + Sant\u00e9",
  stat2l: "unique \u00e0 Maurice",
  stat3v: "MRA",
  stat3l: "conformit\u00e9 native",

  // Calculator — l’unique variable est le volume de transactions
  calcTitle: "Estimez votre palier",
  calcSub: "Le prix ne dépend que d’une chose : le nombre moyen de transactions traitées par mois. L’effectif n’entre pas dans le calcul.",
  calcTabSociete: "Package Société",
  calcTabGbc: "Package GBC / IFRS",
  calcTransactions: "Transactions par mois",
  calcWhatIsTx: "Ce qui compte comme transaction",
  calcTxIncluded: "Pièce comptable, facture émise ou reçue, ligne de relevé bancaire, document passé à l’OCR.",
  calcTxExcluded: "Ne comptent pas : bulletins de paie, salariés, congés, pointages, contrats, utilisateurs — tout cela est illimité.",
  calcEstimator: "Vous ne connaissez pas votre volume ?",
  calcEstimatorHelp: "Comptez environ 10 transactions par salarié et par mois pour une activité de services, 25 pour du négoce.",
  calcEntites: "Entités à consolider",
  calcMonthly: "Mensuel",
  calcAnnual: "Annuel",
  calcResult: "Votre palier",
  calcTibokInfo: "TIBOK Corporate : accès ouvert à tous vos salariés, sans supplément d’abonnement. Chaque téléconsultation effectuée est facturée Rs 500 — vous ne payez que ce qui est consommé.",
  calcCta1: "Démarrer l’essai gratuit",
  calcCta2: "Demander une démo",
  calcVsTitle: "Comparaison de valeur",
  calcVsRH: "vs cabinet RH externe",
  calcVsRHPrice: "~Rs 15 000 – 40 000/mois",
  calcVsCompta: "vs comptable externe",
  calcVsComptaPrice: "~Rs 8 000 – 25 000/mois",
  calcFeatTitle: "Inclus dans votre palier",

  // Bottom CTA
  ctaTitle: "L\u2019ERP mauricien complet. RH, Paie, Sant\u00e9 & Compta.",
  ctaTrust: ["Facturation MRA agr\u00e9\u00e9e", "TIBOK Corporate inclus", "40+ fonctionnalit\u00e9s", "Made in Mauritius", "Sans engagement"],
  ctaBtn1: "D\u00e9marrer l\u2019essai gratuit",
  ctaBtn2: "Demander une d\u00e9mo",

  // Footer
  footerTagline: "Comptabilit\u00e9 intelligente pilot\u00e9e par l\u2019IA \u2014 Con\u00e7ue pour Maurice",
  footerProduit: "Produit",
  footerProduitLinks: ["Modules", "Tarifs", "S\u00e9curit\u00e9", "Changelog"],
  footerTibok: "TIBOK",
  footerTibokLinks: ["Sant\u00e9 salari\u00e9s", "T\u00e9l\u00e9consultation", "Bien-\u00eatre", "Partenaires"],
  footerContact: "Contact",
  footerContactLinks: ["Support", "D\u00e9mo", "Partenariats", "Presse"],
  footerCopy: "\u00a9 2026 Lexora Ltd. Tous droits r\u00e9serv\u00e9s. Port-Louis, Maurice.",
}

const enTexts = {
  // Navbar
  navModules: "Modules",
  navIA: "AI Intelligence",
  navFormules: "Plans",
  navConformite: "Compliance",
  navTarifs: "Pricing",
  login: "Sign in",

  // Hero
  eyebrow: "Lexora Pricing 2026",
  heroTitle: "The complete Mauritian ERP.",
  heroTitle2: "HR, Payroll, Health & Accounting.",
  heroSub: "40+ features. Native MRA compliance. TIBOK Corporate health. Built-in AI. All in one platform.",
  monthly: "Monthly",
  annual: "Annual",
  annualLabel: "2 months free",
  perMonth: "/month",

  // Module section
  modulesTitle: "8 integrated modules",
  modulesSub: "Every module is included in your plan. No surprises, no hidden add-ons.",
  mod1: "OCR & AI Documents",
  mod1f: ["Upload or photograph any document (PDF, Excel, image, scan)", "AI analyses, classifies and generates entries automatically", "Invoices, bank statements, contracts, receipts recognition"],
  mod2: "Automated Accounting",
  mod2f: ["General Ledger, Trial Balance, Balance Sheet & P&L", "Automatic bank reconciliation", "Real-time multi-currency (IAS 21)"],
  mod3: "MRA-Approved Invoicing",
  mod3f: ["MRA-compliant invoices (IRN + QR Code)", "Quotes, credit & debit notes", "Automatic reminders"],
  mod4: "Mauritius HR & Payroll",
  mod4f: ["Compliant payslips (CSG/NSF/PAYE)", "Digital time clock & planning", "Leave per Workers\u2019 Rights Act 2019"],
  mod5: "MRA Tax",
  mod5f: ["VAT 9-Box, CSG/NSF/PAYE auto", "IT Form 3 & Annual Return ROC", "XML export e-MRA"],
  mod6: "AI Alerts & Monitoring",
  mod6f: ["AI agent for tax deadlines", "Budget vs Actual forecasting", "AI strategic recommendations"],
  mod7: "TIBOK Corporate",
  mod7sub: "Employee Health & Wellbeing",
  mod7f: ["Annual health check-up included", "24/7 medical teleconsultation", "Corporate wellbeing program"],
  mod8: "Chief of Staff AI — Telegram",
  mod8sub: "Your 24/7 executive assistant",
  mod8f: ["Calendar, meetings, emails, alerts in natural language", "OCR, HR, banking driven from Telegram", "Included from Pro / Cabinet Team plan"],

  // Arguments
  argTitle: "Why Lexora?",
  arg1: "Immediate ROI",
  arg1d: "Save from month one vs an external accountant or HR firm.",
  arg2: "Zero training required",
  arg2d: "Intuitive interface, up and running in under 2 hours. Support included.",
  arg3: "MRA compliance + Duty of care",
  arg3d: "e-MRA approved invoicing, auto tax filings, TIBOK employee health.",

  // Trust band
  trust1: "40+ features",
  trust2: "4 MRA tax modules",
  trust3: "< 2h onboarding",
  trust4: "TIBOK health included",
  trust5: "0 ERP+Health competitor",

  // Tabs
  tabSociete: "Company Package",
  tabGbc: "GBC / IFRS Package",
  tabMatrix: "What changes per tier",

  // ---- Shared promise across both packages ------------------------
  unlimitedTag: "Unlimited employees & users",
  tibokPaygTag: "TIBOK: Rs 500 per teleconsultation, pay as you go",
  setupTag: "+ Rs 8,000 setup, per company",
  setupTitle: "Setup",
  setupNote: "Rs 8,000 per company, billed once on subscription: configuration and 4 hours of training. A group consolidating several entities pays one setup per entity. Migrating an existing accounting history is quoted separately.",
  calcSetupLabel: "Setup",
  calcSubscriptionLabel: "First instalment",
  calcFirstPaymentLabel: "Due on subscription",
  quoteLabel: "On quote",
  allInTitle: "All included — identical across every tier",
  overageNote: "Above the cap: Rs 15 per transaction, never more than the price of the next tier.",
  featAllIn: [
    "Full accounting (Mauritian chart of accounts / OHADA)",
    "MRA-approved invoicing (IRN + QR code)",
    "Banking: statement import & automatic reconciliation",
    "AI-driven OCR & document processing",
    "MRA tax: VAT, CSG/NSF/PAYE, TDS, IT Form 3, ROC",
    "HR & Payroll — unlimited employees",
    "Leave, scheduling, time clock, mileage claims",
    "Employee self-service portal",
    "Legal: contracts, signature, drafting assistant",
    "Financial statements: balance sheet, P&L, cash flow",
    "AI alerts & forecasting",
    "AI Chief of Staff on Telegram",
    "TIBOK Corporate — teleconsultation on demand",
  ],

  // ---- Company Package: one pricing axis, transaction volume -------
  societeNames: ["Essential", "Growth", "Mid-size", "Corporate", "Enterprise"],
  societeDescs: [
    "Freelancers, professionals and micro-businesses.",
    "Growing companies with steady activity.",
    "Established SMEs with sustained supplier and client flows.",
    "Large organisations, high volumes and dedicated support.",
    "Unlimited volume, SLA, dedicated API and tailored onboarding.",
  ],
  societeBadges: ["Getting started", "Most chosen", "Established SME", "Large organisation", "Tailored"],
  societeTx: [
    "Up to 50 transactions/mo",
    "Up to 200 transactions/mo",
    "Up to 500 transactions/mo",
    "Up to 1,500 transactions/mo",
    "Unlimited transactions",
  ],
  societeRois: [
    "Save ~Rs 8,000/mo vs external accountant",
    "Save ~Rs 15,000/mo vs external accountant",
    "Save ~Rs 25,000/mo vs external accountant",
    "Save ~Rs 40,000/mo vs accounting + HR firm",
    "ROI worked out with you",
  ],
  societeStorages: ["5 GB storage", "20 GB storage", "100 GB storage", "Unlimited storage", "Unlimited storage"],
  societeCtas: ["Get started", "Get started", "Get started", "Get started", "Contact the team"],

  // ---- GBC / IFRS Package: pricing axis = consolidation scope ------
  gbcExtraTitle: "On top: Global Business & full IFRS",
  featGbcExtra: [
    "Full IFRS (not IFRS for SMEs)",
    "Partial Exemption Regime — 80% exemption",
    "Substance & core income generating activities (CIGA)",
    "Ultimate beneficial owners (UBO) & FSC register",
    "CRS / FATCA reporting",
    "IFRS 9 — staged ECL impairment",
    "IFRS 16 — lease accounting",
    "IFRS 10 — multi-entity consolidation",
    "Transfer pricing & documentation",
    "BEPS Pillar Two — GloBE computation",
    "IAS 21 — functional currency",
  ],
  gbcNames: ["Authorised Company", "Standard", "Consolidated Group", "Management Company"],
  gbcDescs: [
    "Authorised Company or single-entity GBC.",
    "GBC under partial exemption, extended IFRS reporting.",
    "Multi-entity group: consolidation, transfer pricing, Pillar Two.",
    "Portfolio of GBCs administered by a management company.",
  ],
  gbcBadges: ["GBC entry", "Most chosen", "Group", "Tailored"],
  gbcTx: [
    "1 entity · up to 100 transactions/mo",
    "1 entity · up to 500 transactions/mo",
    "Up to 5 entities · 1,500 transactions/mo",
    "Unlimited entities & transactions",
  ],
  gbcRois: [
    "Save ~Rs 25,000/mo vs reporting provider",
    "Save ~Rs 45,000/mo vs IFRS firm",
    "Save ~Rs 90,000/mo vs outsourced consolidation",
    "ROI worked out with you",
  ],
  gbcStorages: ["50 GB storage", "200 GB storage", "Unlimited storage", "Unlimited storage"],
  gbcCtas: ["Get started", "Get started", "Get started", "Contact the team"],
  gbcEntiteNote: "Each additional consolidated entity: Rs 4,500/mo.",

  // Matrix
  matrixTitle: "What changes from one tier to the next",
  matrixDesc: "Every feature is included in every tier. Only the processed volume and the service level change.",
  matrixCol: "Dimension",
  tierNamesShort: ["Essential", "Growth", "Mid-size", "Corporate", "Enterprise"],
  matrixCats: [
    {
      category: "All included — in every tier",
      features: [
        "Accounting, invoicing & banking",
        "MRA tax (VAT, PAYE, TDS, IT Form 3, ROC)",
        "HR & Payroll — unlimited employees",
        "Legal & contracts",
        "OCR & AI alerts",
        "Telegram Chief of Staff",
        "TIBOK Corporate — health access",
        "Unlimited users",
      ],
      isGreen: true,
    },
    {
      category: "What changes",
      features: [
        "Transactions included / month",
        "Document storage",
        "Overage above the cap",
        "Support",
        "Service level agreement (SLA)",
        "Dedicated API & integrations",
      ],
    },
  ],

  stat1v: "40+",
  stat1l: "features",
  stat2v: "ERP + Health",
  stat2l: "unique in Mauritius",
  stat3v: "MRA",
  stat3l: "native compliance",

  calcTitle: "Find your tier",
  calcSub: "Price depends on one thing only: the average number of transactions processed per month. Headcount is not part of the calculation.",
  calcTabSociete: "Company Package",
  calcTabGbc: "GBC / IFRS Package",
  calcTransactions: "Transactions per month",
  calcWhatIsTx: "What counts as a transaction",
  calcTxIncluded: "An accounting entry, an invoice issued or received, a bank statement line, a document sent through OCR.",
  calcTxExcluded: "Not counted: payslips, employees, leave, time entries, contracts, users — all unlimited.",
  calcEstimator: "Don’t know your volume?",
  calcEstimatorHelp: "Count roughly 10 transactions per employee per month for a services business, 25 for trading.",
  calcEntites: "Entities to consolidate",
  calcMonthly: "Monthly",
  calcAnnual: "Annual",
  calcResult: "Your tier",
  calcTibokInfo: "TIBOK Corporate: open to every employee at no subscription surcharge. Each teleconsultation is billed Rs 500 — you only pay for what is used.",
  calcCta1: "Start free trial",
  calcCta2: "Request a demo",
  calcVsTitle: "Value comparison",
  calcVsRH: "vs external HR firm",
  calcVsRHPrice: "~Rs 15,000 – 40,000/mo",
  calcVsCompta: "vs external accountant",
  calcVsComptaPrice: "~Rs 8,000 – 25,000/mo",
  calcFeatTitle: "Included in your tier",

  ctaTitle: "The complete Mauritian ERP. HR, Payroll, Health & Accounting.",
  ctaTrust: ["MRA-approved invoicing", "TIBOK Corporate included", "40+ features", "Made in Mauritius", "No commitment"],
  ctaBtn1: "Start free trial",
  ctaBtn2: "Request a demo",

  footerTagline: "Smart accounting powered by AI \u2014 Made for Mauritius",
  footerProduit: "Product",
  footerProduitLinks: ["Modules", "Pricing", "Security", "Changelog"],
  footerTibok: "TIBOK",
  footerTibokLinks: ["Employee health", "Teleconsultation", "Wellbeing", "Partners"],
  footerContact: "Contact",
  footerContactLinks: ["Support", "Demo", "Partnerships", "Press"],
  footerCopy: "\u00a9 2026 Lexora Ltd. All rights reserved. Port-Louis, Mauritius.",
}

type Txt = typeof frTexts

/* ------------------------------------------------------------------ */
/*  Pricing data                                                       */
/* ------------------------------------------------------------------ */
/**
 * Les grilles vivent dans lib/pricing/packages.ts — testé, et partagé avec
 * le reste de l'application. Cette page n'ajoute que l'habillage : couleur
 * d'accent et palier mis en avant.
 */
const SOCIETE_ACCENTS = [C.blue, C.green, C.orange, C.gold, C.gold]
const GBC_ACCENTS = [C.blue, C.green, C.orange, C.gold]
/** Un seul palier mis en avant par package (index dans la grille). */
const SOCIETE_POPULAIRE = 1
const GBC_POPULAIRE = 1

/**
 * Matrice « ce qui varie » — 2 catégories, 5 colonnes (paliers Société).
 * La première catégorie est volontairement pleine : c'est le message.
 */
const ALL_IN_ROW: boolean[] = [true, true, true, true, true]
const matrixTiers: (boolean | string)[][][] = [
  // Tout compris — 8 lignes, toutes vraies sur les 5 paliers
  Array.from({ length: 8 }, () => ALL_IN_ROW),
  // Ce qui varie — 6 lignes
  [
    ["50", "200", "500", "1 500", "Illimité"],
    ["5 Go", "20 Go", "100 Go", "Illimité", "Illimité"],
    [...Array(4).fill(`Rs ${OVERAGE_MUR_PER_TX}/tx`), "—"],
    ["Email", "Email", "Prioritaire", "Dédié", "Dédié 24/7"],
    [false, false, false, true, true],
    [false, false, true, true, true],
  ],
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fmt(n: number): string {
  return n.toLocaleString("fr-MU")
}

function annualPrice(monthly: number): number {
  return annualMonthlyPrice(monthly)
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function footerLinkHref(label: string): string {
  const map: Record<string, string> = {
    // FR
    "Modules": "/#features",
    "Tarifs": "/tarifs",
    "Sécurité": "/protection-donnees",
    "Changelog": "/#new-2026",
    "Santé salariés": "/#features",
    "Téléconsultation": "/#features",
    "Bien-être": "/#features",
    "Partenaires": "/inscription?role=expert",
    "Support": "mailto:sbach@digital-data-solutions.net?subject=Support",
    "Démo": "/inscription",
    "Partenariats": "/inscription?role=expert",
    "Presse": "mailto:sbach@digital-data-solutions.net?subject=Presse",
    // EN
    "Pricing": "/tarifs",
    "Security": "/protection-donnees",
    "Employee health": "/#features",
    "Teleconsultation": "/#features",
    "Wellbeing": "/#features",
    "Partners": "/inscription?role=expert",
    "Demo": "/inscription",
    "Partnerships": "/inscription?role=expert",
    "Press": "mailto:sbach@digital-data-solutions.net?subject=Press",
  }
  return map[label] || "/#features"
}

/* ---------- Tier Card ---------- */
function TierCard({
  badge, badgeColor, name, desc, txLabel, monthlyPrice, roi, unlimitedLabel,
  storage, features, ctaLabel, ctaHref, ctaPrimary, billing, txt,
  extraTitle, extraFeats,
}: {
  badge: string; badgeColor: string; name: string; desc: string
  txLabel: string; monthlyPrice: number; roi: string; unlimitedLabel: string
  storage: string; features: { label: string; included: boolean }[]
  ctaLabel: string; ctaHref: string; ctaPrimary: boolean; billing: "monthly" | "annual"
  txt: Txt; extraTitle?: string; extraFeats?: string[]
}) {
  // monthlyPrice = 0 → palier négocié, on affiche « Sur devis » au lieu du montant.
  const onQuote = monthlyPrice === 0
  const price = billing === "monthly" ? monthlyPrice : annualPrice(monthlyPrice)

  return (
    <div style={{
      backgroundColor: C.cardBg,
      border: ctaPrimary ? `1px solid ${C.gold}` : `1px solid ${C.navyBorder}`,
      borderRadius: "18px", padding: "28px 24px",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
      boxShadow: ctaPrimary
        ? `${BRAND.shadowLg}, 0 0 0 1px ${C.gold}55`
        : BRAND.shadowSm,
    }}>
      {/* Gradient accent stripe at top */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "3px",
          background: ctaPrimary
            ? `linear-gradient(90deg, ${C.gold} 0%, ${C.goldLight} 50%, ${C.gold} 100%)`
            : `linear-gradient(90deg, ${badgeColor} 0%, ${badgeColor}33 100%)`,
        }}
      />

      {/* Ambient glow for popular tier */}
      {ctaPrimary && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "60%",
            pointerEvents: "none",
            background: `radial-gradient(ellipse 100% 50% at 50% 0%, ${C.gold}1F 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Shine sweep on popular tier — continuous premium feel */}
      {ctaPrimary && <ShineSweep color="rgba(201,162,39,0.20)" duration={4} />}

      {/* Crown on popular tier */}
      {ctaPrimary && (
        <div style={{
          position: "absolute", top: "12px", right: "12px",
          display: "inline-flex", alignItems: "center", gap: "4px",
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase",
          backgroundColor: C.gold, color: C.onAccent,
          padding: "4px 10px", borderRadius: "999px",
          fontFamily: FONT,
        }}>
          <Crown style={{ width: 10, height: 10 }} aria-hidden="true" />
          <span>Top</span>
        </div>
      )}

      {/* Badge */}
      <span style={{
        position: "relative",
        display: "inline-block", fontSize: "11px", fontWeight: 700,
        color: badgeColor, backgroundColor: `${badgeColor}1C`,
        border: `1px solid ${badgeColor}40`,
        padding: "4px 12px", borderRadius: "999px", alignSelf: "flex-start",
        letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "18px",
      }}>{badge}</span>

      {/* Name & desc */}
      <h3 style={{ position: "relative", color: C.white, fontSize: "22px", fontWeight: 700, margin: "0 0 6px", fontFamily: FONT, letterSpacing: "-0.01em" }}>{name}</h3>
      <p style={{ position: "relative", color: C.muted, fontSize: "13px", lineHeight: 1.55, margin: "0 0 14px" }}>{desc}</p>
      <span style={{
        position: "relative",
        display: "inline-block", fontSize: "12px", fontWeight: 500, color: C.blue,
        backgroundColor: `${C.blue}15`, padding: "5px 10px", borderRadius: "8px",
        alignSelf: "flex-start", marginBottom: "22px",
      }}>{txLabel}</span>

      {/* Price — count-up animation when scrolled into view */}
      <div style={{ position: "relative", marginBottom: "6px", display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{
          color: C.white, fontSize: onQuote ? "32px" : "40px", fontWeight: 800, lineHeight: 1,
          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        }}>
          {onQuote ? txt.quoteLabel : (
            <AnimatedCounter
              value={price}
              prefix="MRs "
              duration={1.2}
              format={(n) => fmt(Math.round(n))}
              ariaLabel={`MRs ${fmt(price)} ${txt.perMonth}`}
            />
          )}
        </span>
        {!onQuote && <span style={{ color: C.muted, fontSize: "14px" }}>{txt.perMonth}</span>}
      </div>
      {billing === "annual" && !onQuote && (
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 600 }}>{txt.annualLabel}</span>
      )}
      {/* Mise en service — même montant sur tous les paliers */}
      <span style={{ color: C.mutedAlpha, fontSize: "12px", marginTop: "6px" }}>{txt.setupTag}</span>

      {/* ROI tag */}
      <div style={{ marginTop: "14px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.green}12`, border: `1px solid ${C.green}30` }}>
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 500 }}>{roi}</span>
      </div>
      {/* Salariés & utilisateurs illimités — vrai sur tous les paliers */}
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30` }}>
        <span style={{ color: C.blue, fontSize: "12px", fontWeight: 500 }}>{unlimitedLabel}</span>
      </div>
      {/* Storage tag */}
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30` }}>
        <span style={{ color: C.orange, fontSize: "12px", fontWeight: 500 }}>{storage}</span>
      </div>
      {/* TIBOK — accès inclus, consultations facturées à l'acte */}
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.green}12`, border: `1px solid ${C.green}30` }}>
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 500 }}>{txt.tibokPaygTag}</span>
      </div>

      <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "20px 0" }} />

      {/* Feature checklist */}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{
            display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px",
            fontSize: "13px", color: f.included ? C.white : C.muted,
            opacity: f.included ? 1 : 0.5,
          }}>
            <span style={{
              width: "18px", height: "18px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              backgroundColor: f.included ? `${C.green}20` : `${C.muted}15`,
              color: f.included ? C.green : C.muted,
            }}>
              {f.included ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      {/* Bloc supplémentaire — conformité GBC / IFRS sur les paliers GBC */}
      {extraFeats && extraFeats.length > 0 && (
        <div style={{
          margin: "0 0 16px", padding: "12px",
          borderRadius: "10px", backgroundColor: `${C.green}10`,
          border: `1px solid ${C.green}25`,
        }}>
          <div style={{ color: C.green, fontSize: "12px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {extraTitle}
          </div>
          {extraFeats.map((tf, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", fontSize: "12px", color: C.green }}>
              <Check className="w-4 h-4 inline-block" style={{ color: C.green }} /> {tf}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link href={ctaHref} style={{
        position: "relative",
        display: "block",
        width: "100%", padding: "14px", borderRadius: "12px",
        fontWeight: 700, fontSize: "14px", cursor: "pointer",
        textAlign: "center", textDecoration: "none",
        border: ctaPrimary ? "none" : `1px solid ${C.navyBorder}`,
        backgroundColor: ctaPrimary ? C.gold : "transparent",
        color: ctaPrimary ? C.bg : C.white,
        transition: "transform 0.18s ease-out, box-shadow 0.18s ease-out",
        boxShadow: ctaPrimary ? BRAND.shadowGold : "none",
        fontFamily: FONT,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)" }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)" }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.02)" }}
      >
        {ctaLabel}
      </Link>
    </div>
  )
}

/* ---------- Matrix Table ---------- */
function MatrixTable({ txt }: { txt: Txt }) {
  const tierCount = txt.tierNamesShort.length
  const totalCols = 1 + tierCount
  const featureColWidth = "40%"
  const tierColWidth = `${60 / tierCount}%`

  return (
    <div style={{ overflowX: "auto", marginTop: "32px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "700px", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: featureColWidth }} />
          {txt.tierNamesShort.map((t) => (
            <col key={t} style={{ width: tierColWidth }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "12px 16px", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.navyBorder}` }}>{txt.matrixCol}</th>
            {txt.tierNamesShort.map((t) => (
              <th key={t} style={{ textAlign: "center", padding: "12px 8px", color: C.goldText, fontWeight: 700, borderBottom: `1px solid ${C.navyBorder}` }}>{t}</th>
            ))}
          </tr>
        </thead>
        {txt.matrixCats.map((cat, ci) => (
          <tbody key={cat.category}>
            <tr>
              <td colSpan={totalCols} style={{
                padding: "14px 16px 8px", fontWeight: 700, fontSize: "14px",
                borderBottom: `1px solid ${C.navyBorder}`,
                color: (cat as any).isGreen ? C.green : C.gold,
                backgroundColor: (cat as any).isGreen ? `${C.green}08` : `${C.gold}08`,
              }}>
                {cat.category}
              </td>
            </tr>
            {cat.features.map((fname, fi) => {
              const row = matrixTiers[ci]?.[fi] || Array(tierCount).fill(false)
              return (
                <tr key={fname} style={(cat as any).isGreen ? { backgroundColor: `${C.green}05` } : undefined}>
                  <td style={{ padding: "10px 16px", color: C.white, borderBottom: `1px solid ${C.navyBorder}20`, textAlign: "left" }}>{fname}</td>
                  {row.map((v: boolean | string, ti: number) => (
                    <td key={ti} style={{
                      textAlign: "center", padding: "10px 8px",
                      borderBottom: `1px solid ${C.navyBorder}20`,
                      color: v === true ? C.green : v === false ? C.muted : C.blue,
                      fontWeight: typeof v === "string" ? 600 : 400,
                      verticalAlign: "middle",
                    }}>
                      {v === true ? <Check className="w-4 h-4 inline-block" /> : v === false ? <Minus className="w-4 h-4 inline-block" /> : String(v)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */
export default function TarifsPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly")
  const [activeTab, setActiveTab] = useState<"societe" | "gbc" | "matrix">("societe")
  const [locale, setLoc] = useState<Locale>(getLocale())
  const [calcTab, setCalcTab] = useState<"societe" | "gbc">("societe")
  const [transactions, setTransactions] = useState(200)
  const [entites, setEntites] = useState(1)
  const [calcBilling, setCalcBilling] = useState<"monthly" | "annual">("monthly")

  const switchLang = (l: Locale) => { setLoc(l); setLocale(l) }
  const txt: Txt = locale === "fr" ? frTexts : enTexts

  /* Nav links */
  const navLinks = [
    { label: txt.navModules, href: "#modules" },
    { label: txt.navIA, href: "#ia" },
    { label: txt.navFormules, href: "#formules" },
    { label: txt.navConformite, href: "#conformite" },
    { label: txt.navTarifs, href: "#tarifs", active: true },
  ]

  /* Tabs */
  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "societe", label: txt.tabSociete },
    { key: "gbc", label: txt.tabGbc },
    { key: "matrix", label: txt.tabMatrix },
  ]

  /* Build tier cards — la liste de fonctionnalités est la MÊME partout :
   * c'est la promesse « tout compris ». Seul le package GBC ajoute un bloc. */
  function buildCards() {
    const isGbc = activeTab === "gbc"
    const tiers = isGbc ? GBC_TIERS : SOCIETE_TIERS
    const accents = isGbc ? GBC_ACCENTS : SOCIETE_ACCENTS
    const populaire = isGbc ? GBC_POPULAIRE : SOCIETE_POPULAIRE
    const names = isGbc ? txt.gbcNames : txt.societeNames
    const descs = isGbc ? txt.gbcDescs : txt.societeDescs
    const badges = isGbc ? txt.gbcBadges : txt.societeBadges
    const txLabels = isGbc ? txt.gbcTx : txt.societeTx
    const rois = isGbc ? txt.gbcRois : txt.societeRois
    const storages = isGbc ? txt.gbcStorages : txt.societeStorages
    const ctas = isGbc ? txt.gbcCtas : txt.societeCtas

    return names.map((name, i) => (
      <TierCard
        key={`${isGbc ? "gbc" : "societe"}-${i}`}
        badge={badges[i]}
        badgeColor={accents[i]}
        name={name}
        desc={descs[i]}
        txLabel={txLabels[i]}
        monthlyPrice={tiers[i].monthly}
        roi={rois[i]}
        unlimitedLabel={txt.unlimitedTag}
        storage={storages[i]}
        features={txt.featAllIn.map((label) => ({ label, included: true }))}
        ctaLabel={ctas[i]}
        ctaHref={tiers[i].monthly === 0 ? "/inscription?role=enterprise" : "/inscription"}
        ctaPrimary={i === populaire}
        billing={billing}
        txt={txt}
        extraTitle={isGbc ? txt.gbcExtraTitle : undefined}
        extraFeats={isGbc ? txt.featGbcExtra : undefined}
      />
    ))
  }

  /* ------------------------------------------------------------------
   * Calculator — une seule variable : le volume de transactions.
   * ------------------------------------------------------------------
   * Le palier retenu est le premier dont le plafond couvre le volume
   * saisi (et, pour GBC, le nombre d'entités à consolider). Au-delà du
   * dernier palier chiffré on bascule sur le palier négocié.
   *
   * L'effectif n'intervient nulle part : servir 5 ou 100 bulletins
   * mobilise le même code. Il n'est affiché qu'à titre indicatif, pour
   * aider un prospect qui ne connaît pas son volume à se situer.
   */

  /* Paliers du curseur — resserrés en bas d'échelle, là où se joue
   * l'essentiel des décisions d'achat. */
  const TX_STEPS = [10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1250, 1500, 2000]
  const txIdx = Math.max(0, TX_STEPS.indexOf(transactions))

  const isGbcCalc = calcTab === "gbc"
  const calcTiers = isGbcCalc ? GBC_TIERS : SOCIETE_TIERS
  const calcIndex = resolveTierIndex(calcTiers, transactions, isGbcCalc ? entites : 1)
  const calcTier = calcTiers[calcIndex]
  const calcTierName = (isGbcCalc ? txt.gbcNames : txt.societeNames)[calcIndex]
  const calcTierTx = (isGbcCalc ? txt.gbcTx : txt.societeTx)[calcIndex]
  const calcOnQuote = calcTier.monthly === 0

  const getCalcPrice = (): number =>
    calcBilling === "annual" ? annualPrice(calcTier.monthly) : calcTier.monthly

  /* Mise en service : une par société à paramétrer. Sur le package GBC, le
   * périmètre consolidé donne directement le nombre de sociétés. */
  const calcSocietes = isGbcCalc ? entites : 1
  const calcSetupTotal = SETUP_FEE_MUR_PAR_SOCIETE * calcSocietes

  /** Effectif indicatif — n'entre PAS dans le calcul du prix. */
  const estimatedHeadcount = Math.max(1, Math.round(transactions / 10))

  /* Slider fill % */
  const sliderPercent = (txIdx / (TX_STEPS.length - 1)) * 100

  /* Modules data — Lucide icons */
  const modules: { name: string; feats: string[]; icon: React.ReactNode; color: string }[] = [
    { name: txt.mod1, feats: txt.mod1f, icon: <FileSearch className="w-6 h-6" />, color: C.blue },
    { name: txt.mod2, feats: txt.mod2f, icon: <BookOpen className="w-6 h-6" />, color: C.gold },
    { name: txt.mod3, feats: txt.mod3f, icon: <FileText className="w-6 h-6" />, color: C.orange },
    { name: txt.mod4, feats: txt.mod4f, icon: <Users className="w-6 h-6" />, color: C.blue },
    { name: txt.mod5, feats: txt.mod5f, icon: <Landmark className="w-6 h-6" />, color: C.orange },
    { name: txt.mod6, feats: txt.mod6f, icon: <BellRing className="w-6 h-6" />, color: C.gold },
    { name: txt.mod8, feats: txt.mod8f, icon: <Send className="w-6 h-6" />, color: C.blue },
  ]

  return (
    <div style={{ backgroundColor: C.bg, minHeight: "100vh", fontFamily: FONT }}>
      <ScrollProgress />

      {/* ============================================================= */}
      {/* 1. NAVBAR                                                      */}
      {/* ============================================================= */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: `${C.bg}EE`, backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.navyBorder}`,
      }}>
        <div style={{
          maxWidth: "1280px", margin: "0 auto", padding: "0 24px",
          height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
            <LexoraLogo href="/" size="md" showBaseline tone="light" />
            <div className="hidden md:flex" style={{ gap: "4px" }}>
              {navLinks.map((nl) => (
                <Link key={nl.label} href={nl.href} style={{
                  padding: "8px 14px", fontSize: "13px", fontWeight: nl.active ? 700 : 500,
                  color: nl.active ? C.goldText : C.muted,
                  textDecoration: "none", borderRadius: "6px",
                  transition: "color 0.2s",
                }}>{nl.label}</Link>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* FR/EN toggle */}
            <div style={{
              display: "flex", gap: "2px", borderRadius: "999px",
              padding: "3px", border: `1px solid ${C.navyBorder}`,
            }}>
              {(["fr", "en"] as Locale[]).map((l) => (
                <button key={l} onClick={() => switchLang(l)} style={{
                  padding: "4px 12px", borderRadius: "999px", fontSize: "12px",
                  fontWeight: 600, cursor: "pointer", border: "none",
                  backgroundColor: locale === l ? C.gold : "transparent",
                  color: locale === l ? C.bg : C.muted,
                  transition: "all 0.2s", fontFamily: FONT,
                }}>{l.toUpperCase()}</button>
              ))}
            </div>
            <Link href="/auth/login" style={{
              color: C.white, fontSize: "14px", fontWeight: 600,
              padding: "8px 20px", borderRadius: "8px",
              border: `1px solid ${C.navyBorder}`, textDecoration: "none",
            }}>{txt.login}</Link>
          </div>
        </div>
      </nav>

      {/* ============================================================= */}
      {/* 2. HERO — modern with live particle field + gradient accent     */}
      {/* ============================================================= */}
      <section style={{ position: "relative", textAlign: "center", padding: "72px 24px 48px", overflow: "hidden" }}>
        {/* Live particle field */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.55 }}
        >
          <ParticleField
            density={0.8}
            color="rgba(37,99,235,0.30)"
            linkColor="rgba(11,15,46,0.10)"
            linkDistance={140}
            speed={0.22}
          />
        </div>
        {/* Ambient gradient glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage:
              `radial-gradient(ellipse 55% 45% at 50% 0%, ${C.gold}1A 0%, transparent 70%), radial-gradient(ellipse 45% 35% at 50% 100%, ${C.blue}10 0%, transparent 70%)`,
          }}
        />

        <div style={{ position: "relative", maxWidth: "960px", margin: "0 auto" }}>
          {/* 3D wireframe orb overlay — evokes "3e millénaire" */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-60px 0 0 0",
              height: "360px",
              pointerEvents: "none",
              opacity: 0.55,
              mixBlendMode: "screen",
            }}
          >
            <PricingOrb3DLazy height={360} />
          </div>

          <FadeSlide delay={0} y={14}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              fontSize: "11px", fontWeight: 700,
              color: C.goldText, backgroundColor: C.goldSoft,
              border: `1px solid ${C.gold}35`,
              padding: "6px 16px", borderRadius: "999px",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "24px",
            }}>
              <Sparkles style={{ width: 12, height: 12 }} aria-hidden="true" />
              {txt.eyebrow}
            </span>
          </FadeSlide>
          <FadeSlide delay={0.08} y={18}>
            <h1 style={{
              color: C.white, fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800,
              lineHeight: 1.1, margin: "0 auto 12px", maxWidth: "820px", fontFamily: FONT,
              letterSpacing: "-0.02em",
            }}>
              {txt.heroTitle}
            </h1>
          </FadeSlide>
          <FadeSlide delay={0.16} y={18}>
            <h2 style={{
              fontSize: "clamp(22px, 3.2vw, 38px)", fontWeight: 700,
              lineHeight: 1.2, margin: "0 auto 22px", maxWidth: "820px", fontFamily: FONT,
              letterSpacing: "-0.01em",
              // Le dégradé or clair → bleu ne tenait que sur fond nuit ; sur blanc
              // il descendait sous 3:1. Encres foncées, la lisibilité prime.
              backgroundImage: `linear-gradient(90deg, ${C.goldText} 0%, ${BRAND.ink} 55%, ${C.blue} 100%)`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              {txt.heroTitle2}
            </h2>
          </FadeSlide>
          <FadeSlide delay={0.24} y={14}>
            <p style={{
              color: C.muted, fontSize: "16px", lineHeight: 1.65,
              maxWidth: "680px", margin: "0 auto 32px",
            }}>{txt.heroSub}</p>
          </FadeSlide>
        </div>

        {/* Billing toggle — animated entrance + motion on active pill */}
        <FadeSlide delay={0.32} y={10}>
          <div style={{
            display: "inline-flex", borderRadius: "14px",
            backgroundColor: C.navy, border: `1px solid ${C.navyBorder}`, padding: "5px",
            position: "relative",
            boxShadow: `0 8px 24px -8px rgba(0,0,0,0.30)`,
          }}>
            {(["monthly", "annual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBilling(mode)}
                aria-pressed={billing === mode}
                style={{
                  padding: "11px 28px", borderRadius: "10px", fontSize: "14px",
                  fontWeight: 600, cursor: "pointer", border: "none",
                  backgroundColor: billing === mode ? C.gold : "transparent",
                  color: billing === mode ? C.bg : C.muted,
                  transition: "all 0.25s ease-out", fontFamily: FONT,
                  boxShadow: billing === mode ? BRAND.shadowGold : "none",
                }}
              >
                {mode === "monthly" ? txt.monthly : txt.annual}
              </button>
            ))}
            {billing === "annual" && (
              <motion.span
                initial={{ opacity: 0, y: -4, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{
                  position: "absolute", top: "-11px", right: "-12px",
                  backgroundColor: C.green, color: BRAND.onInk, fontSize: "10px",
                  fontWeight: 700, padding: "3px 10px", borderRadius: "999px",
                  boxShadow: `0 4px 12px -2px ${C.green}60`,
                }}
              >{txt.annualLabel}</motion.span>
            )}
          </div>
        </FadeSlide>
      </section>

      {/* ============================================================= */}
      {/* 3. MODULES SECTION — modern cards with accent stripe + stagger  */}
      {/* ============================================================= */}
      <section id="modules" style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              fontSize: "11px", fontWeight: 700,
              color: C.blue, backgroundColor: `${C.blue}12`,
              border: `1px solid ${C.blue}30`,
              padding: "6px 16px", borderRadius: "999px",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "18px",
              fontFamily: FONT,
            }}>
              <Zap style={{ width: 12, height: 12 }} aria-hidden="true" />
              {t("uimkt.tarifs.all_included", locale)}
            </span>
            <h2 style={{
              color: C.white, fontSize: "clamp(28px, 3.4vw, 40px)", fontWeight: 800,
              margin: "0 0 10px", fontFamily: FONT, letterSpacing: "-0.02em",
            }}>
              {txt.modulesTitle}
            </h2>
            <p style={{ color: C.muted, fontSize: "15px", maxWidth: "640px", margin: "0 auto", lineHeight: 1.65 }}>
              {txt.modulesSub}
            </p>
          </div>
        </Reveal>

        <StaggerGroup
          className=""
          staggerMs={60}
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "20px",
          }}>
            {modules.map((m, idx) => (
              <StaggerItem key={m.name}>
                <HoverLift lift={5} className="h-full">
                  <div style={{
                    position: "relative",
                    backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
                    borderRadius: "16px", padding: "26px 24px",
                    height: "100%",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
                  }}>
                    {/* Accent stripe */}
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute", top: 0, left: 0, right: 0, height: "2px",
                        background: `linear-gradient(90deg, ${m.color} 0%, ${m.color}33 100%)`,
                      }}
                    />
                    {/* Module number */}
                    <div style={{
                      position: "absolute", top: 22, right: 22,
                      fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
                      color: "rgba(248,246,241,0.18)",
                      fontFamily: FONT, fontVariantNumeric: "tabular-nums",
                    }}>
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div style={{
                      position: "relative",
                      width: "48px", height: "48px", borderRadius: "12px",
                      backgroundColor: `${m.color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: "18px", color: m.color,
                      border: `1px solid ${m.color}25`,
                      boxShadow: `0 8px 20px -8px ${m.color}40`,
                    }}>{m.icon}</div>
                    <h3 style={{ color: C.white, fontSize: "17px", fontWeight: 700, margin: "0 0 14px", fontFamily: FONT, letterSpacing: "-0.01em" }}>{m.name}</h3>
                    {m.feats.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px", fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, width: "16px", height: "16px", borderRadius: "50%",
                          backgroundColor: `${m.color}20`, color: m.color, marginTop: "1px",
                        }}>
                          <Check style={{ width: 10, height: 10 }} strokeWidth={3} />
                        </span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </HoverLift>
              </StaggerItem>
            ))}
            {/* TIBOK card - green themed with premium accents */}
            <StaggerItem>
              <HoverLift lift={5} className="h-full">
                <div style={{
                  position: "relative",
                  backgroundColor: `${C.green}0A`, border: `1px solid ${C.green}40`,
                  borderRadius: "16px", padding: "26px 24px",
                  height: "100%",
                  overflow: "hidden",
                  boxShadow: `0 8px 24px -12px ${C.green}30`,
                }}>
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: "2px",
                      background: `linear-gradient(90deg, ${C.green} 0%, ${C.green}33 100%)`,
                    }}
                  />
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "12px",
                    backgroundColor: `${C.green}15`, display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: "18px", color: C.green,
                    border: `1px solid ${C.green}30`,
                    boxShadow: `0 8px 20px -8px ${C.green}50`,
                  }}><HeartPulse className="w-6 h-6" /></div>
                  <h3 style={{ color: C.green, fontSize: "17px", fontWeight: 700, margin: "0 0 4px", fontFamily: FONT, letterSpacing: "-0.01em" }}>{txt.mod7}</h3>
                  <p style={{ color: C.green, fontSize: "12px", fontWeight: 500, margin: "0 0 14px", opacity: 0.8 }}>{txt.mod7sub}</p>
                  {txt.mod7f.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "8px", fontSize: "13px", color: C.green, lineHeight: 1.55 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, width: "16px", height: "16px", borderRadius: "50%",
                        backgroundColor: `${C.green}20`, marginTop: "1px",
                      }}>
                        <Check style={{ width: 10, height: 10 }} strokeWidth={3} />
                      </span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </HoverLift>
            </StaggerItem>
          </div>
        </StaggerGroup>
      </section>

      {/* ============================================================= */}
      {/* 4. ARGUMENTS SECTION                                           */}
      {/* ============================================================= */}
      <section style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
        <h2 style={{ color: C.white, fontSize: "24px", fontWeight: 800, textAlign: "center", margin: "0 0 32px", fontFamily: FONT }}>
          {txt.argTitle}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {[
            { title: txt.arg1, desc: txt.arg1d, icon: <TrendingUp className="w-6 h-6" />, color: C.green },
            { title: txt.arg2, desc: txt.arg2d, icon: <Zap className="w-6 h-6" />, color: C.gold },
            { title: txt.arg3, desc: txt.arg3d, icon: <ShieldCheck className="w-6 h-6" />, color: C.blue },
          ].map((a) => (
            <div key={a.title} style={{
              backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
              borderRadius: "12px", padding: "24px",
            }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "50%",
                backgroundColor: `${a.color}12`, display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "16px", color: a.color,
              }}>{a.icon}</div>
              <h3 style={{ color: a.color, fontSize: "16px", fontWeight: 700, margin: "0 0 8px", fontFamily: FONT }}>{a.title}</h3>
              <p style={{ color: C.muted, fontSize: "13px", lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= */}
      {/* 5. TRUST BAND                                                  */}
      {/* ============================================================= */}
      <section style={{
        borderTop: `1px solid ${C.navyBorder}`, borderBottom: `1px solid ${C.navyBorder}`,
        padding: "32px 24px",
      }}>
        <div style={{
          maxWidth: "1100px", margin: "0 auto",
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "24px 48px",
        }}>
          {[txt.trust1, txt.trust2, txt.trust3, txt.trust4, txt.trust5].map((t, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "8px",
              fontSize: "14px", fontWeight: 600,
              color: i === 3 ? C.green : C.white,
            }}>
              <span style={{ color: C.gold }} aria-hidden="true">{"\u2022"}</span>
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= */}
      {/* 6. MODULE TABS + 7. PRICING CARDS / 8. MATRIX TABLE           */}
      {/* ============================================================= */}
      <section id="tarifs" style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px 64px" }}>
        {/* Tabs */}
        <div style={{
          display: "flex", gap: "4px", overflowX: "auto",
          borderBottom: `1px solid ${C.navyBorder}`, paddingBottom: 0, marginBottom: "32px",
        }}>
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "12px 20px", fontSize: "14px",
              fontWeight: activeTab === tab.key ? 700 : 500,
              cursor: "pointer", border: "none", backgroundColor: "transparent",
              color: activeTab === tab.key ? C.goldText : C.muted,
              borderBottom: activeTab === tab.key ? `2px solid ${C.gold}` : "2px solid transparent",
              whiteSpace: "nowrap", transition: "all 0.2s", fontFamily: FONT,
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Cards or Matrix */}
        {activeTab !== "matrix" ? (
          <StaggerGroup
            staggerMs={80}
            key={activeTab /* re-run stagger when user switches tabs */}
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "24px",
            }}>
              {buildCards().map((card, i) => (
                <StaggerItem key={i}>
                  <HoverLift lift={6} className="h-full">
                    {card}
                  </HoverLift>
                </StaggerItem>
              ))}
            </div>
          </StaggerGroup>
        ) : (
          <div style={{
            backgroundColor: C.cardBg, borderRadius: "16px",
            border: `1px solid ${C.navyBorder}`, padding: "24px",
          }}>
            <h2 style={{ color: C.white, fontSize: "22px", fontWeight: 700, margin: "0 0 4px", fontFamily: FONT }}>
              {txt.matrixTitle}
            </h2>
            <p style={{ color: C.muted, fontSize: "14px", margin: "0 0 8px" }}>{txt.matrixDesc}</p>
            <MatrixTable txt={txt} />
          </div>
        )}
      </section>

      {/* ============================================================= */}
      {/* 9. STATS ROW                                                   */}
      {/* ============================================================= */}
      <section style={{
        borderTop: `1px solid ${C.navyBorder}`, borderBottom: `1px solid ${C.navyBorder}`,
        padding: "48px 24px",
      }}>
        <div style={{
          maxWidth: "900px", margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "24px",
          textAlign: "center",
        }}>
          {[
            { v: txt.stat1v, l: txt.stat1l, c: C.gold },
            { v: txt.stat2v, l: txt.stat2l, c: C.green },
            { v: txt.stat3v, l: txt.stat3l, c: C.blue },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: "36px", fontWeight: 800, color: s.c, lineHeight: 1, marginBottom: "8px", fontFamily: FONT }}>{s.v}</div>
              <div style={{ color: C.muted, fontSize: "14px", fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= */}
      {/* 10. CALCULATOR SECTION — un seul curseur : les transactions     */}
      {/* ============================================================= */}
      <section style={{ maxWidth: "1280px", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ color: C.white, fontSize: "28px", fontWeight: 800, margin: "0 0 8px", fontFamily: FONT }}>
            {txt.calcTitle}
          </h2>
          <p style={{ color: C.muted, fontSize: "15px", maxWidth: "680px", margin: "0 auto" }}>{txt.calcSub}</p>
        </div>

        {/* Calc tabs */}
        <div style={{ display: "flex", gap: "4px", justifyContent: "center", marginBottom: "32px", flexWrap: "wrap" }}>
          {([
            { key: "societe" as const, label: txt.calcTabSociete },
            { key: "gbc" as const, label: txt.calcTabGbc },
          ]).map((ct) => (
            <button key={ct.key} onClick={() => setCalcTab(ct.key)} style={{
              padding: "10px 20px", borderRadius: "8px", fontSize: "13px",
              fontWeight: calcTab === ct.key ? 700 : 500,
              cursor: "pointer", border: `1px solid ${calcTab === ct.key ? C.gold : C.navyBorder}`,
              backgroundColor: calcTab === ct.key ? `${C.gold}15` : "transparent",
              color: calcTab === ct.key ? C.goldText : C.muted,
              transition: "all 0.2s", fontFamily: FONT,
            }}>{ct.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "24px", alignItems: "start" }}>
          {/* Left side: the single input that drives the price */}
          <div style={{
            backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
            borderRadius: "16px", padding: "32px",
          }}>
            <label htmlFor="calc-tx" style={{ display: "block", color: C.white, fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
              {txt.calcTransactions}: <span style={{ color: C.goldText }}>{fmt(transactions)}</span>
            </label>
            <div style={{ position: "relative", marginBottom: "8px" }}>
              <input
                id="calc-tx"
                type="range" min={0} max={TX_STEPS.length - 1} step={1} value={txIdx}
                onChange={(e) => setTransactions(TX_STEPS[Number(e.target.value)])}
                aria-valuetext={`${fmt(transactions)} ${txt.calcTransactions}`}
                style={{
                  width: "100%", height: "6px", borderRadius: "3px",
                  appearance: "none", WebkitAppearance: "none",
                  background: `linear-gradient(to right, ${C.gold} 0%, ${C.gold} ${sliderPercent}%, ${C.navyBorder} ${sliderPercent}%, ${C.navyBorder} 100%)`,
                  outline: "none", cursor: "pointer",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: C.mutedAlpha, fontSize: "11px", marginBottom: "20px" }}>
              <span>{fmt(TX_STEPS[0])}</span>
              <span>{fmt(TX_STEPS[TX_STEPS.length - 1])}+</span>
            </div>

            {/* Entités à consolider — seulement pour le package GBC */}
            {isGbcCalc && (
              <>
                <label htmlFor="calc-ent" style={{ display: "block", color: C.white, fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                  {txt.calcEntites}: <span style={{ color: C.goldText }}>{entites}</span>
                </label>
                <input
                  id="calc-ent"
                  type="range" min={1} max={10} step={1} value={entites}
                  onChange={(e) => setEntites(Number(e.target.value))}
                  style={{
                    width: "100%", height: "6px", borderRadius: "3px", marginBottom: "20px",
                    appearance: "none", WebkitAppearance: "none",
                    background: `linear-gradient(to right, ${C.gold} 0%, ${C.gold} ${((entites - 1) / 9) * 100}%, ${C.navyBorder} ${((entites - 1) / 9) * 100}%, ${C.navyBorder} 100%)`,
                    outline: "none", cursor: "pointer",
                  }}
                />
              </>
            )}

            {/* Palier retenu */}
            <div style={{
              marginBottom: "16px", padding: "10px 14px", borderRadius: "8px",
              backgroundColor: `${C.gold}10`, border: `1px solid ${C.gold}25`,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
            }}>
              <span style={{ color: C.goldText, fontSize: "13px", fontWeight: 700 }}>{calcTierName}</span>
              <span style={{ color: C.muted, fontSize: "12px", textAlign: "right" }}>{calcTierTx}</span>
            </div>

            {/* Ce qui compte — et surtout ce qui ne compte pas */}
            <div style={{
              padding: "14px", borderRadius: "10px",
              backgroundColor: `${C.blue}0C`, border: `1px solid ${C.blue}25`,
              marginBottom: "16px",
            }}>
              <div style={{ color: C.blue, fontSize: "12px", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.calcWhatIsTx}
              </div>
              <p style={{ color: C.white, fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 8px" }}>{txt.calcTxIncluded}</p>
              <p style={{ color: C.green, fontSize: "12.5px", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{txt.calcTxExcluded}</p>
            </div>

            {/* Aide à l'estimation — l'effectif n'est qu'un repère */}
            <div style={{ color: C.muted, fontSize: "12.5px", lineHeight: 1.7, marginBottom: "16px" }}>
              <span style={{ color: C.white, fontWeight: 600 }}>{txt.calcEstimator}</span>{" "}
              {txt.calcEstimatorHelp}
              <div style={{ marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
                ≈ {fmt(estimatedHeadcount)} {estimatedHeadcount > 1
                  ? t("uimkt.tarifs.salaries", locale)
                  : t("uimkt.tarifs.salarie", locale)}
              </div>
            </div>

            {/* Dépassement */}
            {!calcOnQuote && (
              <div style={{ color: C.mutedAlpha, fontSize: "12px", lineHeight: 1.6 }}>
                {txt.overageNote}
                {isGbcCalc && <> {txt.gbcEntiteNote}</>}
              </div>
            )}

            {/* Monthly / Annual toggle */}
            <div style={{ marginTop: "24px", display: "inline-flex", borderRadius: "8px", backgroundColor: C.bg, border: `1px solid ${C.navyBorder}`, padding: "3px" }}>
              {(["monthly", "annual"] as const).map((m) => (
                <button key={m} onClick={() => setCalcBilling(m)} style={{
                  padding: "8px 18px", borderRadius: "6px", fontSize: "13px",
                  fontWeight: 600, cursor: "pointer", border: "none",
                  backgroundColor: calcBilling === m ? C.gold : "transparent",
                  color: calcBilling === m ? C.bg : C.muted,
                  fontFamily: FONT, transition: "all 0.2s",
                }}>
                  {m === "monthly" ? txt.calcMonthly : txt.calcAnnual}
                </button>
              ))}
            </div>
          </div>

          {/* Right side: result */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Result card */}
            <div style={{
              backgroundColor: C.cardBg, border: `2px solid ${C.gold}`,
              borderRadius: "16px", padding: "28px",
            }}>
              <div style={{ color: C.muted, fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>{txt.calcResult}</div>
              <div style={{ color: C.white, fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>{calcTierName}</div>
              <div style={{ color: C.white, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, lineHeight: 1.1, fontFamily: FONT, wordBreak: "break-word" }}>
                {calcOnQuote ? txt.quoteLabel : `MRs ${fmt(getCalcPrice())}`}
              </div>
              {!calcOnQuote && (
                <div style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>
                  {calcBilling === "monthly" ? txt.perMonth : `${txt.perMonth} (${txt.annual.toLowerCase()})`}
                </div>
              )}

              {/* Ce qu'il faut sortir le premier mois : mise en service + 1re échéance */}
              {!calcOnQuote && (
                <div style={{
                  marginTop: "16px", padding: "12px 14px", borderRadius: "10px",
                  backgroundColor: C.bg, border: `1px solid ${C.navyBorder}`,
                }}>
                  <div style={{ color: C.muted, fontSize: "12px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {txt.calcFirstPaymentLabel}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                    <span>
                      {txt.calcSetupLabel}
                      {calcSocietes > 1 && <> · {calcSocietes} × MRs {fmt(SETUP_FEE_MUR_PAR_SOCIETE)}</>}
                    </span>
                    <span style={{ color: C.white, fontVariantNumeric: "tabular-nums" }}>MRs {fmt(calcSetupTotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted }}>
                    <span>{txt.calcSubscriptionLabel}</span>
                    <span style={{ color: C.white, fontVariantNumeric: "tabular-nums" }}>MRs {fmt(getCalcPrice())}</span>
                  </div>
                  <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "8px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700 }}>
                    <span style={{ color: C.white }}>Total</span>
                    <span style={{ color: C.white, fontVariantNumeric: "tabular-nums" }}>
                      MRs {fmt(calcSetupTotal + getCalcPrice())}
                    </span>
                  </div>
                  <p style={{ color: C.mutedAlpha, fontSize: "11.5px", lineHeight: 1.55, margin: "10px 0 0" }}>
                    {txt.setupNote}
                  </p>
                </div>
              )}

              <div style={{
                marginTop: "16px", padding: "8px 12px", borderRadius: "8px",
                backgroundColor: `${C.green}10`, border: `1px solid ${C.green}25`,
                fontSize: "12px", color: C.green, fontWeight: 500,
              }}>
                {txt.calcTibokInfo}
              </div>

              <div className="flex flex-col sm:flex-row" style={{ gap: "12px", marginTop: "20px" }}>
                <Link href="/auth/login" style={{
                  flex: 1, display: "block", textAlign: "center",
                  padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "13px",
                  backgroundColor: C.gold, color: C.onAccent, textDecoration: "none", fontFamily: FONT,
                }}>{txt.calcCta1}</Link>
                <Link href="/auth/login" style={{
                  flex: 1, display: "block", textAlign: "center",
                  padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "13px",
                  backgroundColor: "transparent", color: C.white,
                  border: `1px solid ${C.navyBorder}`, textDecoration: "none", fontFamily: FONT,
                }}>{txt.calcCta2}</Link>
              </div>
            </div>

            {/* Value comparison card */}
            <div style={{
              backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
              borderRadius: "12px", padding: "20px",
            }}>
              <div style={{ color: C.white, fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>{txt.calcVsTitle}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: C.muted, fontSize: "13px" }}>{txt.calcVsRH}</span>
                <span style={{ color: C.orange, fontSize: "13px", fontWeight: 600 }}>{txt.calcVsRHPrice}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted, fontSize: "13px" }}>{txt.calcVsCompta}</span>
                <span style={{ color: C.orange, fontSize: "13px", fontWeight: 600 }}>{txt.calcVsComptaPrice}</span>
              </div>
            </div>

            {/* Feature list card — identique pour tous les paliers */}
            <div style={{
              backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
              borderRadius: "12px", padding: "20px",
            }}>
              <div style={{ color: C.white, fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>{txt.calcFeatTitle}</div>
              {[...txt.featAllIn, ...(isGbcCalc ? txt.featGbcExtra : [])].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", fontSize: "13px", color: C.white }}>
                  <Check className="w-4 h-4 inline-block" style={{ color: C.green, flexShrink: 0 }} /> {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* 11. BOTTOM CTA — live particles + scale press on buttons        */}
      {/* ============================================================= */}
      <section style={{ position: "relative", textAlign: "center", padding: "80px 24px", overflow: "hidden" }}>
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.4 }}
        >
          <ParticleField
            density={0.6}
            color="rgba(37,99,235,0.26)"
            linkColor="rgba(11,15,46,0.09)"
            linkDistance={150}
            speed={0.22}
          />
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `radial-gradient(ellipse 50% 50% at 50% 50%, ${C.gold}16 0%, transparent 70%)`,
          }}
        />
        <div style={{ position: "relative" }}>
          <Reveal>
            <h2 style={{
              color: C.white, fontSize: "clamp(28px, 3.6vw, 44px)", fontWeight: 800,
              margin: "0 auto 28px", maxWidth: "760px", fontFamily: FONT,
              letterSpacing: "-0.02em",
            }}>
              {txt.ctaTitle}
            </h2>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginBottom: "32px" }}>
              <PressableWrap>
                <Link href="/auth/login" style={{
                  display: "inline-block", padding: "15px 34px", borderRadius: "12px",
                  fontWeight: 700, fontSize: "15px", backgroundColor: C.gold, color: C.onAccent,
                  textDecoration: "none", fontFamily: FONT,
                  boxShadow: BRAND.shadowGold,
                }}>{txt.ctaBtn1}</Link>
              </PressableWrap>
              <PressableWrap>
                <Link href="/auth/login" style={{
                  display: "inline-block", padding: "15px 34px", borderRadius: "12px",
                  fontWeight: 700, fontSize: "15px", backgroundColor: "rgba(248,246,241,0.04)",
                  color: C.white, border: `1px solid ${C.navyBorder}`,
                  textDecoration: "none", fontFamily: FONT,
                }}>{txt.ctaBtn2}</Link>
              </PressableWrap>
            </div>
            <div style={{ display: "flex", gap: "16px 32px", justifyContent: "center", flexWrap: "wrap" }}>
              {txt.ctaTrust.map((tx, i) => (
                <span key={i} style={{ color: C.muted, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Check className="w-4 h-4 inline-block" style={{ color: C.green }} /> {tx}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================= */}
      {/* 12. FOOTER                                                     */}
      {/* ============================================================= */}
      <footer style={{ borderTop: `1px solid ${C.navyBorder}`, padding: "48px 24px 24px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: "32px", marginBottom: "40px" }}>
            {/* Logo + tagline */}
            <div>
              <LexoraLogo size="md" tone="light" />
              <p style={{ color: C.muted, fontSize: "13px", marginTop: "12px", lineHeight: 1.6 }}>
                {txt.footerTagline}
              </p>
            </div>
            {/* Produit */}
            <div>
              <h4 style={{ color: C.white, fontSize: "13px", fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.footerProduit}
              </h4>
              {txt.footerProduitLinks.map((l) => (
                <div key={l}><Link href={footerLinkHref(l)} style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
              ))}
            </div>
            {/* TIBOK */}
            <div>
              <h4 style={{ color: C.green, fontSize: "13px", fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.footerTibok}
              </h4>
              {txt.footerTibokLinks.map((l) => (
                <div key={l}><Link href={footerLinkHref(l)} style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
              ))}
            </div>
            {/* Contact */}
            <div>
              <h4 style={{ color: C.white, fontSize: "13px", fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.footerContact}
              </h4>
              {txt.footerContactLinks.map((l) => (
                <div key={l}><Link href={footerLinkHref(l)} style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.navyBorder}`, paddingTop: "20px", textAlign: "center" }}>
            <p style={{ color: C.muted, fontSize: "12px", margin: 0 }}>{txt.footerCopy}</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
