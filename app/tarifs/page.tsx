"use client"

import { useState } from "react"
import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"
import { getLocale, setLocale, type Locale } from "@/lib/i18n"
import {
  FileSearch, BookOpen, FileText, Users, Landmark, BellRing,
  HeartPulse, TrendingUp, Zap, ShieldCheck, Check, Minus,
  Camera, Sparkles, Crown,
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
  mutedAlpha: "rgba(248,246,241,.45)",
  cardBg: "#162236",
}

const FONT = "'Poppins', sans-serif"
const ANNUAL_FACTOR = 10 / 12

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
  modulesTitle: "7 modules int\u00e9gr\u00e9s",
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
  tabCompta: "Comptabilit\u00e9 + Facturation",
  tabPaie: "RH & Paie + TIBOK",
  tabBundle: "Pack Complet ERP",
  tabMatrix: "Matrice fonctionnalit\u00e9s",

  // Tier names & data
  tierNames: ["Solo", "Petite entreprise", "PME", "Grande entreprise"],
  tierDescs: [
    "Id\u00e9al pour freelances et auto-entrepreneurs.",
    "Pour les petites \u00e9quipes en croissance.",
    "La solution compl\u00e8te pour les entreprises \u00e9tablies.",
    "Sur mesure pour les grandes structures.",
  ],
  tierBadges: ["Starter", "Meilleure valeur", "C\u0153ur de cible", "Enterprise"],
  tierRois: [
    "\u00c9conomisez ~Rs 8 000/mois vs comptable",
    "\u00c9conomisez ~Rs 15 000/mois vs comptable",
    "\u00c9conomisez ~Rs 25 000/mois vs comptable",
    "ROI sur mesure \u2014 contactez-nous",
  ],
  tierEmras: [
    "e-MRA : EDF5 basique",
    "e-MRA : EDF5 + VAT auto",
    "e-MRA : toutes d\u00e9clarations",
    "e-MRA : toutes d\u00e9clarations + audit trail",
  ],
  tierStorages: ["500 Mo", "2 Go", "10 Go", "Illimit\u00e9"],
  tierCtas: ["Commencer maintenant", "Commencer maintenant", "Commencer maintenant", "Contacter l\u2019\u00e9quipe"],
  criteriaCompta: [
    "Jusqu\u2019\u00e0 50 transactions/mois",
    "Jusqu\u2019\u00e0 200 transactions/mois",
    "Jusqu\u2019\u00e0 500 transactions/mois",
    "Transactions illimit\u00e9es",
  ],
  criteriaPaie: ["1 \u00e0 3 employ\u00e9s", "4 \u00e0 15 employ\u00e9s", "16 \u00e0 50 employ\u00e9s", "51+ employ\u00e9s"],
  criteriaBundle: [
    "Solo / micro-entreprise",
    "Petite \u00e9quipe (< 15 pers.)",
    "PME \u00e9tablie (< 50 pers.)",
    "Grande structure (50+)",
  ],

  // Feature lists
  featCompta: [
    "Plan comptable OHADA / mauricien",
    "Saisie journal & grand livre",
    "Facturation illimit\u00e9e",
    "Rapprochement bancaire auto",
    "TVA / TPS auto-calcul",
    "D\u00e9clarations e-MRA (EDF5, VAT)",
    "Multi-devises (EUR, USD, GBP)",
    "Bilan & compte de r\u00e9sultat",
    "Tableau de bord analytique",
    "API & int\u00e9grations tierces",
    "Support prioritaire",
  ],
  featPaie: [
    "Fiches de paie conformes",
    "Calcul NPF / NSF / PAYE",
    "Cong\u00e9s & absences",
    "Virements bancaires auto",
    "D\u00e9clarations CSG / TDS",
    "Portail employ\u00e9 self-service",
    "Gestion temps & pointage",
    "Primes & commissions",
    "Multi-sites",
    "Rapports RH avanc\u00e9s",
    "Support prioritaire",
  ],
  featBundle: [
    "Comptabilit\u00e9 compl\u00e8te",
    "Facturation illimit\u00e9e",
    "Paie (selon taille)",
    "Rapprochement bancaire",
    "D\u00e9clarations e-MRA",
    "Multi-devises",
    "Portail employ\u00e9",
    "Gestion inventaire",
    "API ouverte",
    "Support d\u00e9di\u00e9",
  ],

  // TIBOK features for RH tab
  tibokTitle: "TIBOK Corporate inclus",
  tibokFeats: [
    "Bilan sant\u00e9 annuel pour chaque salari\u00e9",
    "T\u00e9l\u00e9consultation m\u00e9dicale 24/7",
    "Programme bien-\u00eatre & pr\u00e9vention",
    "Tableau de bord sant\u00e9 employeur",
  ],

  // Matrix
  matrixTitle: "Matrice compl\u00e8te des fonctionnalit\u00e9s",
  matrixDesc: "Comparez les 40+ fonctionnalit\u00e9s incluses dans chaque formule Lexora.",
  matrixCol: "Fonctionnalit\u00e9",
  tierNamesShort: ["Solo", "Petite entr.", "PME", "Grande entr."],
  matrixCats: [
    {
      category: "Mon espace & Documents",
      features: ["Tableau de bord personnalis\u00e9", "OCR IA documents", "Classement automatique", "Stockage s\u00e9curis\u00e9"],
    },
    {
      category: "Facturation MRA agr\u00e9\u00e9e",
      features: ["Factures illimit\u00e9es", "Devis & bons de commande", "Avoirs & notes de cr\u00e9dit", "Relances automatiques", "Portail client", "Paiement en ligne (MCB Juice)"],
    },
    {
      category: "Comptabilit\u00e9",
      features: ["Plan comptable OHADA / mauricien", "Saisie journal & grand livre", "Balance g\u00e9n\u00e9rale", "Rapprochement bancaire auto", "Import relev\u00e9s (CSV/OFX)", "Multi-devises (EUR, USD, GBP)", "\u00c9critures r\u00e9currentes auto"],
    },
    {
      category: "\u00c9tats financiers",
      features: ["Bilan comptable", "Compte de r\u00e9sultat", "Flux de tr\u00e9sorerie", "Tableau de bord analytique", "Rapports personnalis\u00e9s", "Export PDF / Excel"],
    },
    {
      category: "Fiscal MRA",
      features: ["TVA / TPS auto-calcul", "D\u00e9claration EDF5 (e-MRA)", "D\u00e9claration VAT auto", "CSG / TDS d\u00e9clarations", "Audit trail fiscal", "Export XML e-MRA"],
    },
    {
      category: "RH & Paie",
      features: ["Fiches de paie conformes", "Calcul NPF / NSF / PAYE", "Gestion cong\u00e9s & absences", "Virements bancaires auto", "Portail employ\u00e9 self-service", "Gestion temps & pointage", "Primes, commissions & bonus", "Multi-sites", "Rapports RH avanc\u00e9s"],
    },
    {
      category: "TIBOK Corporate",
      features: ["Bilan sant\u00e9 annuel", "T\u00e9l\u00e9consultation 24/7", "Programme bien-\u00eatre", "Dashboard sant\u00e9 employeur"],
      isGreen: true,
    },
    {
      category: "Support & SLA",
      features: ["Support email", "Support prioritaire", "Account manager d\u00e9di\u00e9", "SLA garanti"],
    },
  ],

  // Stats row
  stat1v: "40+",
  stat1l: "fonctionnalit\u00e9s",
  stat2v: "ERP + Sant\u00e9",
  stat2l: "unique \u00e0 Maurice",
  stat3v: "MRA",
  stat3l: "conformit\u00e9 native",

  // Calculator
  calcTitle: "Estimez votre tarif",
  calcSub: "Ajustez le nombre d\u2019employ\u00e9s pour voir le tarif adapt\u00e9 \u00e0 votre structure.",
  calcTabPaie: "RH & Paie + TIBOK",
  calcTabCompta: "Comptabilit\u00e9 + Facturation",
  calcTabBundle: "Pack Complet ERP \u221220%",
  calcEmployees: "Nombre d\u2019employ\u00e9s",
  calcBase: "Base",
  calcPerEmp: "par employ\u00e9",
  calcMonthly: "Mensuel",
  calcAnnual: "Annuel",
  calcResult: "Votre estimation",
  calcTibokInfo: "TIBOK Corporate sant\u00e9 inclus pour tous vos salari\u00e9s",
  calcCta1: "D\u00e9marrer l\u2019essai gratuit",
  calcCta2: "Demander une d\u00e9mo",
  calcVsTitle: "Comparaison de valeur",
  calcVsRH: "vs cabinet RH externe",
  calcVsRHPrice: "~Rs 15 000 \u2013 40 000/mois",
  calcVsCompta: "vs comptable externe",
  calcVsComptaPrice: "~Rs 8 000 \u2013 25 000/mois",
  calcFeatTitle: "Inclus dans votre formule",
  calcFeatsSmall: ["Fiches de paie conformes", "Calcul NPF/NSF/PAYE", "Cong\u00e9s & absences", "TIBOK sant\u00e9 salari\u00e9s"],
  calcFeatsMed: ["Fiches de paie conformes", "Calcul NPF/NSF/PAYE", "Cong\u00e9s & absences", "Virements bancaires auto", "D\u00e9clarations CSG/TDS", "Portail employ\u00e9", "TIBOK sant\u00e9 salari\u00e9s"],
  calcFeatsLarge: ["Fiches de paie conformes", "Calcul NPF/NSF/PAYE", "Cong\u00e9s & absences", "Virements bancaires auto", "D\u00e9clarations CSG/TDS", "Portail employ\u00e9", "Gestion temps & pointage", "Primes & commissions", "Multi-sites", "Rapports RH avanc\u00e9s", "TIBOK sant\u00e9 salari\u00e9s"],

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
  modulesTitle: "7 integrated modules",
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
  tabCompta: "Accounting + Invoicing",
  tabPaie: "HR & Payroll + TIBOK",
  tabBundle: "Full ERP Pack",
  tabMatrix: "Feature matrix",

  // Tier names & data
  tierNames: ["Solo", "Small business", "Mid-size", "Enterprise"],
  tierDescs: [
    "Ideal for freelancers and sole traders.",
    "For small growing teams.",
    "The complete solution for established businesses.",
    "Tailored for large organisations.",
  ],
  tierBadges: ["Starter", "Best value", "Most popular", "Enterprise"],
  tierRois: [
    "Save ~Rs 8,000/mo vs accountant",
    "Save ~Rs 15,000/mo vs accountant",
    "Save ~Rs 25,000/mo vs accountant",
    "Custom ROI \u2014 contact us",
  ],
  tierEmras: [
    "e-MRA: basic EDF5",
    "e-MRA: EDF5 + auto VAT",
    "e-MRA: all filings",
    "e-MRA: all filings + audit trail",
  ],
  tierStorages: ["500 MB", "2 GB", "10 GB", "Unlimited"],
  tierCtas: ["Get started", "Get started", "Get started", "Contact sales"],
  criteriaCompta: [
    "Up to 50 transactions/mo",
    "Up to 200 transactions/mo",
    "Up to 500 transactions/mo",
    "Unlimited transactions",
  ],
  criteriaPaie: ["1\u20133 employees", "4\u201315 employees", "16\u201350 employees", "51+ employees"],
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

  tibokTitle: "TIBOK Corporate included",
  tibokFeats: [
    "Annual health check-up for every employee",
    "24/7 medical teleconsultation",
    "Wellbeing & prevention program",
    "Employer health dashboard",
  ],

  // Matrix
  matrixTitle: "Full feature matrix",
  matrixDesc: "Compare 40+ features included in each Lexora plan.",
  matrixCol: "Feature",
  tierNamesShort: ["Solo", "Small biz", "Mid-size", "Enterprise"],
  matrixCats: [
    {
      category: "My space & Documents",
      features: ["Personalised dashboard", "AI OCR documents", "Automatic classification", "Secure storage"],
    },
    {
      category: "MRA-approved Invoicing",
      features: ["Unlimited invoices", "Quotes & purchase orders", "Credit & debit notes", "Automatic reminders", "Client portal", "Online payment (MCB Juice)"],
    },
    {
      category: "Accounting",
      features: ["OHADA / Mauritian chart of accounts", "Journal entries & general ledger", "Trial balance", "Auto bank reconciliation", "Statement import (CSV/OFX)", "Multi-currency (EUR, USD, GBP)", "Recurring automatic entries"],
    },
    {
      category: "Financial statements",
      features: ["Balance sheet", "Income statement", "Cash flow statement", "Analytics dashboard", "Custom reports", "PDF / Excel export"],
    },
    {
      category: "MRA Tax",
      features: ["VAT / TPS auto-calculation", "EDF5 filing (e-MRA)", "Automatic VAT filing", "CSG / TDS filings", "Tax audit trail", "XML export e-MRA"],
    },
    {
      category: "HR & Payroll",
      features: ["Compliant payslips", "NPF / NSF / PAYE calculation", "Leave & absence management", "Auto bank transfers", "Employee self-service portal", "Time & attendance tracking", "Bonuses, commissions & rewards", "Multi-site", "Advanced HR reports"],
    },
    {
      category: "TIBOK Corporate",
      features: ["Annual health check-up", "24/7 teleconsultation", "Wellbeing program", "Employer health dashboard"],
      isGreen: true,
    },
    {
      category: "Support & SLA",
      features: ["Email support", "Priority support", "Dedicated account manager", "Guaranteed SLA"],
    },
  ],

  stat1v: "40+",
  stat1l: "features",
  stat2v: "ERP + Health",
  stat2l: "unique in Mauritius",
  stat3v: "MRA",
  stat3l: "native compliance",

  calcTitle: "Estimate your price",
  calcSub: "Adjust employee count to see the plan tailored to your organisation.",
  calcTabPaie: "HR & Payroll + TIBOK",
  calcTabCompta: "Accounting + Invoicing",
  calcTabBundle: "Full ERP Pack \u221220%",
  calcEmployees: "Number of employees",
  calcBase: "Base",
  calcPerEmp: "per employee",
  calcMonthly: "Monthly",
  calcAnnual: "Annual",
  calcResult: "Your estimate",
  calcTibokInfo: "TIBOK Corporate health included for all your employees",
  calcCta1: "Start free trial",
  calcCta2: "Request a demo",
  calcVsTitle: "Value comparison",
  calcVsRH: "vs external HR firm",
  calcVsRHPrice: "~Rs 15,000 \u2013 40,000/mo",
  calcVsCompta: "vs external accountant",
  calcVsComptaPrice: "~Rs 8,000 \u2013 25,000/mo",
  calcFeatTitle: "Included in your plan",
  calcFeatsSmall: ["Compliant payslips", "NPF/NSF/PAYE calculation", "Leave & absences", "TIBOK employee health"],
  calcFeatsMed: ["Compliant payslips", "NPF/NSF/PAYE calculation", "Leave & absences", "Auto bank transfers", "CSG/TDS filings", "Employee portal", "TIBOK employee health"],
  calcFeatsLarge: ["Compliant payslips", "NPF/NSF/PAYE calculation", "Leave & absences", "Auto bank transfers", "CSG/TDS filings", "Employee portal", "Time & attendance tracking", "Bonuses & commissions", "Multi-site", "Advanced HR reports", "TIBOK employee health"],

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
const pricesCompta = [1500, 3500, 6500, 12000]
const pricesPaie = [1700, 2700, 6700, 14500]
const pricesBundle = [2720, 4960, 10560, 21200]

const badgeColorsMap = [C.blue, C.blue, C.orange, C.gold] // Compta tab
const badgeColorsPaie = [C.blue, C.blue, C.orange, C.gold]
const badgeColorsBundle = [C.blue, C.green, C.orange, C.gold]

const comptaIncluded = [
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

const matrixTiers: (boolean | string)[][][] = [
  // Mon espace & Documents (4 features)
  [[true,true,true,true],[true,true,true,true],[false,true,true,true],["500 Mo","2 Go","10 Go","Illimit\u00e9"]],
  // Facturation MRA (6 features)
  [[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,true,true]],
  // Comptabilite (7 features)
  [[true,true,true,true],[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,true,true,true]],
  // Etats financiers (6 features)
  [[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[true,true,true,true]],
  // Fiscal MRA (6 features)
  [[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,false,true],[false,true,true,true]],
  // RH & Paie (9 features)
  [[true,true,true,true],[true,true,true,true],[true,true,true,true],[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,true,true],[false,false,true,true],[false,false,false,true]],
  // TIBOK Corporate (4 features)
  [[false,true,true,true],[false,true,true,true],[false,false,true,true],[false,false,true,true]],
  // Support & SLA (4 features)
  [[true,true,true,true],[false,false,true,true],[false,false,false,true],[false,false,false,true]],
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

/* ---------- Tier Card ---------- */
function TierCard({
  badge, badgeColor, name, desc, criteria, monthlyPrice, roi, emra,
  storage, features, ctaLabel, ctaPrimary, billing, txt, tibokFeats,
}: {
  badge: string; badgeColor: string; name: string; desc: string
  criteria: string; monthlyPrice: number; roi: string; emra: string
  storage: string; features: { label: string; included: boolean }[]
  ctaLabel: string; ctaPrimary: boolean; billing: "monthly" | "annual"
  txt: Txt; tibokFeats?: string[]
}) {
  const price = billing === "monthly" ? monthlyPrice : annualPrice(monthlyPrice)

  return (
    <div style={{
      backgroundColor: C.cardBg,
      border: ctaPrimary ? `1px solid ${C.gold}` : `1px solid ${C.navyBorder}`,
      borderRadius: "18px", padding: "28px 24px",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
      boxShadow: ctaPrimary
        ? `0 24px 60px -24px ${C.gold}66, 0 0 0 1px ${C.gold}40`
        : "0 1px 3px rgba(0,0,0,0.20)",
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
            background: `radial-gradient(ellipse 100% 50% at 50% 0%, ${C.gold}12 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Shine sweep on popular tier — continuous premium feel */}
      {ctaPrimary && <ShineSweep color="rgba(212,175,55,0.14)" duration={4} />}

      {/* Crown on popular tier */}
      {ctaPrimary && (
        <div style={{
          position: "absolute", top: "12px", right: "12px",
          display: "inline-flex", alignItems: "center", gap: "4px",
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase",
          backgroundColor: C.gold, color: C.bg,
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
      }}>{criteria}</span>

      {/* Price — count-up animation when scrolled into view */}
      <div style={{ position: "relative", marginBottom: "6px", display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{
          color: C.gold, fontSize: "40px", fontWeight: 800, lineHeight: 1,
          fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        }}>
          <AnimatedCounter
            value={price}
            prefix="MRs "
            duration={1.2}
            format={(n) => fmt(Math.round(n))}
            ariaLabel={`MRs ${fmt(price)} ${txt.perMonth}`}
          />
        </span>
        <span style={{ color: C.muted, fontSize: "14px" }}>{txt.perMonth}</span>
      </div>
      {billing === "annual" && (
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 600 }}>{txt.annualLabel}</span>
      )}

      {/* ROI tag */}
      <div style={{ marginTop: "14px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.green}12`, border: `1px solid ${C.green}30` }}>
        <span style={{ color: C.green, fontSize: "12px", fontWeight: 500 }}>{roi}</span>
      </div>
      {/* e-MRA tag */}
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30` }}>
        <span style={{ color: C.blue, fontSize: "12px", fontWeight: 500 }}>{emra}</span>
      </div>
      {/* Storage tag */}
      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30` }}>
        <span style={{ color: C.orange, fontSize: "12px", fontWeight: 500 }}>{storage}</span>
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

      {/* TIBOK section (for RH & Paie tab) */}
      {tibokFeats && tibokFeats.length > 0 && (
        <div style={{
          margin: "0 0 16px", padding: "12px",
          borderRadius: "10px", backgroundColor: `${C.green}10`,
          border: `1px solid ${C.green}25`,
        }}>
          <div style={{ color: C.green, fontSize: "12px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {txt.tibokTitle}
          </div>
          {tibokFeats.map((tf, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", fontSize: "12px", color: C.green }}>
              <Check className="w-4 h-4 inline-block" style={{ color: C.green }} /> {tf}
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button style={{
        position: "relative",
        width: "100%", padding: "14px", borderRadius: "12px",
        fontWeight: 700, fontSize: "14px", cursor: "pointer",
        border: ctaPrimary ? "none" : `1px solid ${C.navyBorder}`,
        backgroundColor: ctaPrimary ? C.gold : "transparent",
        color: ctaPrimary ? C.bg : C.white,
        transition: "transform 0.18s ease-out, box-shadow 0.18s ease-out",
        boxShadow: ctaPrimary ? `0 8px 20px -8px ${C.gold}80` : "none",
        fontFamily: FONT,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)" }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)" }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.02)" }}
      >
        {ctaLabel}
      </button>
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
              <th key={t} style={{ textAlign: "center", padding: "12px 8px", color: C.gold, fontWeight: 700, borderBottom: `1px solid ${C.navyBorder}` }}>{t}</th>
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
              const row = matrixTiers[ci]?.[fi] || [false, false, false, false]
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
  const [activeTab, setActiveTab] = useState<"compta" | "paie" | "bundle" | "matrix">("compta")
  const [locale, setLoc] = useState<Locale>(getLocale())
  const [calcTab, setCalcTab] = useState<"paie" | "compta" | "bundle">("paie")
  const [employees, setEmployees] = useState(10)
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
    { key: "compta", label: txt.tabCompta },
    { key: "paie", label: txt.tabPaie },
    { key: "bundle", label: txt.tabBundle },
    { key: "matrix", label: txt.tabMatrix },
  ]

  /* Build tier cards */
  function buildCards() {
    const section = activeTab as "compta" | "paie" | "bundle"
    const mp = section === "compta" ? pricesCompta : section === "paie" ? pricesPaie : pricesBundle
    const criteria = section === "compta" ? txt.criteriaCompta : section === "paie" ? txt.criteriaPaie : txt.criteriaBundle
    const featLabels = section === "compta" ? txt.featCompta : section === "paie" ? txt.featPaie : txt.featBundle
    const included = section === "compta" ? comptaIncluded : section === "paie" ? paieIncluded : bundleIncluded
    const bColors = section === "compta" ? badgeColorsMap : section === "paie" ? badgeColorsPaie : badgeColorsBundle

    return txt.tierNames.map((name, i) => (
      <TierCard
        key={i}
        badge={txt.tierBadges[i]}
        badgeColor={bColors[i]}
        name={name}
        desc={txt.tierDescs[i]}
        criteria={criteria[i]}
        monthlyPrice={mp[i]}
        roi={txt.tierRois[i]}
        emra={txt.tierEmras[i]}
        storage={txt.tierStorages[i]}
        features={featLabels.map((label, j) => ({ label, included: included[i][j] }))}
        ctaLabel={txt.tierCtas[i]}
        ctaPrimary={i === 1}
        billing={billing}
        txt={txt}
        tibokFeats={section === "paie" ? txt.tibokFeats : undefined}
      />
    ))
  }

  /* ------------------------------------------------------------------
   * Calculator logic — per-employee for Paie, transaction-based for Compta
   * ------------------------------------------------------------------
   * Paie pricing is PURE per-employee (no flat platform fee). The rate
   * is tiered so larger companies benefit from a volume discount, but
   * the total always equals the sum of the marginal rate paid for each
   * headcount. Adding 1 employee changes the total by exactly the rate
   * in the current tier — no bracket jumps.
   *
   * Floor price: Rs 250/mois — even a solo setup (1 employee) pays
   * at least Rs 250. This is the "prix plancher RH".
   *
   * Compta is transaction-based (we estimate ~10 tx per employee per
   * month) and maps to one of four plans (50/200/500/unlimited tx).
   * Bundle = Paie + Compta with a 20 % discount. */

  const PAIE_FLOOR = 250 // minimum monthly Paie price
  const PAIE_TIERS: { upTo: number; rate: number }[] = [
    { upTo: 5,        rate: 250 }, // entry rate — 1 emp = Rs 250 (floor)
    { upTo: 15,       rate: 180 },
    { upTo: 50,       rate: 120 },
    { upTo: 100,      rate: 90  },
    { upTo: Infinity, rate: 70  },
  ]

  function computePaiePrice(emp: number): number {
    if (emp <= 0) return PAIE_FLOOR
    let price = 0
    let remaining = emp
    let from = 1
    for (const tier of PAIE_TIERS) {
      if (remaining <= 0) break
      const tierSize = tier.upTo - from + 1
      const count = Math.min(remaining, tierSize)
      price += count * tier.rate
      remaining -= count
      from = tier.upTo + 1
    }
    return Math.max(PAIE_FLOOR, Math.round(price))
  }

  function paieTierLabel(emp: number): { tier: string; range: string } {
    if (emp <= 3)  return { tier: "Solo",              range: "1–3 sal." }
    if (emp <= 15) return { tier: txt.tierNames[1],    range: "4–15 sal." }
    if (emp <= 50) return { tier: "PME",               range: "16–50 sal." }
    return            { tier: txt.tierNames[3],        range: "51+ sal." }
  }

  function computeComptaPrice(emp: number): { price: number; tier: string; tx: string } {
    // ~10 transactions per employee per month as a working estimate.
    const estTx = Math.max(20, emp * 10)
    if (estTx <= 50)  return { price: 1500,  tier: "Solo",           tx: "≤ 50 txn/mois" }
    if (estTx <= 200) return { price: 3500,  tier: txt.tierNames[1], tx: "≤ 200 txn/mois" }
    if (estTx <= 500) return { price: 6500,  tier: "PME",            tx: "≤ 500 txn/mois" }
    return            { price: 12000, tier: txt.tierNames[3], tx: locale === "fr" ? "Transactions illimitées" : "Unlimited transactions" }
  }

  const BUNDLE_DISCOUNT = 0.20 // 20%

  function computeBundlePrice(emp: number): { price: number; saving: number } {
    const paie = computePaiePrice(emp)
    const compta = computeComptaPrice(emp).price
    const raw = paie + compta
    const price = Math.round(raw * (1 - BUNDLE_DISCOUNT))
    return { price, saving: raw - price }
  }

  const calcPaiePrice   = (): number => computePaiePrice(employees)
  const calcComptaPrice = (): number => computeComptaPrice(employees).price
  const calcBundlePrice = (): number => computeBundlePrice(employees).price

  const calcPaieTier    = (): { price: number; tier: string; range: string } => ({
    price: computePaiePrice(employees),
    ...paieTierLabel(employees),
  })
  const calcComptaTier  = (): { price: number; tier: string } => {
    const c = computeComptaPrice(employees)
    return { price: c.price, tier: c.tier }
  }
  const calcBundleTier  = (): { price: number; saving: number } => computeBundlePrice(employees)

  const getCalcPrice = (): number => {
    const mp = calcTab === "paie" ? calcPaiePrice() : calcTab === "compta" ? calcComptaPrice() : calcBundlePrice()
    return calcBilling === "annual" ? annualPrice(mp) : mp
  }
  const getCalcFeats = (): string[] => {
    if (employees <= 15) return txt.calcFeatsSmall
    if (employees <= 50) return txt.calcFeatsMed
    return txt.calcFeatsLarge
  }

  /* Build a breakdown of the Paie price by volume tier, so the UI can
   * show exactly how the total is composed (e.g.: 5 × Rs 250 + 10 × Rs 180). */
  function paieBreakdown(emp: number): { label: string; count: number; rate: number; subtotal: number }[] {
    if (emp <= 0) return []
    const rows: { label: string; count: number; rate: number; subtotal: number }[] = []
    let remaining = emp
    let from = 1
    for (const tier of PAIE_TIERS) {
      if (remaining <= 0) break
      const upToDisplay = tier.upTo === Infinity ? "+" : `${tier.upTo}`
      const tierSize = tier.upTo - from + 1
      const count = Math.min(remaining, tierSize)
      const label = tier.upTo === Infinity ? `${from}${upToDisplay}` : `${from}–${upToDisplay}`
      rows.push({ label, count, rate: tier.rate, subtotal: count * tier.rate })
      remaining -= count
      from = tier.upTo + 1
    }
    return rows
  }

  // Per-employee average (only meaningful for Paie/Bundle).
  const perEmpPaie = employees > 0 ? Math.round(calcPaiePrice() / employees) : 0
  const perEmpBundle = employees > 0 ? Math.round(calcBundlePrice() / employees) : 0

  /* Slider fill % */
  const sliderPercent = ((employees - 1) / 199) * 100

  /* Modules data — Lucide icons */
  const modules: { name: string; feats: string[]; icon: React.ReactNode; color: string }[] = [
    { name: txt.mod1, feats: txt.mod1f, icon: <FileSearch className="w-6 h-6" />, color: C.blue },
    { name: txt.mod2, feats: txt.mod2f, icon: <BookOpen className="w-6 h-6" />, color: C.gold },
    { name: txt.mod3, feats: txt.mod3f, icon: <FileText className="w-6 h-6" />, color: C.orange },
    { name: txt.mod4, feats: txt.mod4f, icon: <Users className="w-6 h-6" />, color: C.blue },
    { name: txt.mod5, feats: txt.mod5f, icon: <Landmark className="w-6 h-6" />, color: C.orange },
    { name: txt.mod6, feats: txt.mod6f, icon: <BellRing className="w-6 h-6" />, color: C.gold },
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
            <LexoraLogo href="/" size="md" showBaseline />
            <div className="hidden md:flex" style={{ gap: "4px" }}>
              {navLinks.map((nl) => (
                <Link key={nl.label} href={nl.href} style={{
                  padding: "8px 14px", fontSize: "13px", fontWeight: nl.active ? 700 : 500,
                  color: nl.active ? C.gold : C.muted,
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
            color="rgba(212,175,55,0.55)"
            linkColor="rgba(212,175,55,0.18)"
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
              `radial-gradient(ellipse 50% 40% at 50% 0%, ${C.gold}18 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 50% 100%, ${C.blue}14 0%, transparent 70%)`,
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
              color: C.gold, backgroundColor: `${C.gold}14`,
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
              backgroundImage: `linear-gradient(90deg, ${C.gold} 0%, ${C.goldLight} 50%, ${C.blue} 100%)`,
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
                  boxShadow: billing === mode ? `0 4px 12px -4px ${C.gold}60` : "none",
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
                  backgroundColor: C.green, color: C.bg, fontSize: "10px",
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
              {locale === "fr" ? "Tout inclus" : "All included"}
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
              <span style={{ color: C.gold }}>{"\u2022"}</span>
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
              color: activeTab === tab.key ? C.gold : C.muted,
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
      {/* 10. CALCULATOR SECTION                                         */}
      {/* ============================================================= */}
      <section style={{ maxWidth: "1280px", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h2 style={{ color: C.white, fontSize: "28px", fontWeight: 800, margin: "0 0 8px", fontFamily: FONT }}>
            {txt.calcTitle}
          </h2>
          <p style={{ color: C.muted, fontSize: "15px" }}>{txt.calcSub}</p>
        </div>

        {/* Calc tabs */}
        <div style={{ display: "flex", gap: "4px", justifyContent: "center", marginBottom: "32px", flexWrap: "wrap" }}>
          {([
            { key: "paie" as const, label: txt.calcTabPaie },
            { key: "compta" as const, label: txt.calcTabCompta },
            { key: "bundle" as const, label: txt.calcTabBundle },
          ]).map((ct) => (
            <button key={ct.key} onClick={() => setCalcTab(ct.key)} style={{
              padding: "10px 20px", borderRadius: "8px", fontSize: "13px",
              fontWeight: calcTab === ct.key ? 700 : 500,
              cursor: "pointer", border: `1px solid ${calcTab === ct.key ? C.gold : C.navyBorder}`,
              backgroundColor: calcTab === ct.key ? `${C.gold}15` : "transparent",
              color: calcTab === ct.key ? C.gold : C.muted,
              transition: "all 0.2s", fontFamily: FONT,
            }}>{ct.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "24px", alignItems: "start" }}>
          {/* Left side: slider */}
          <div style={{
            backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
            borderRadius: "16px", padding: "32px",
          }}>
            <label style={{ display: "block", color: C.white, fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
              {txt.calcEmployees}: <span style={{ color: C.gold }}>{employees}</span>
            </label>
            <div style={{ position: "relative", marginBottom: "24px" }}>
              <input
                type="range" min={1} max={200} value={employees}
                onChange={(e) => setEmployees(Number(e.target.value))}
                style={{
                  width: "100%", height: "6px", borderRadius: "3px",
                  appearance: "none", WebkitAppearance: "none",
                  background: `linear-gradient(to right, ${C.gold} 0%, ${C.gold} ${sliderPercent}%, ${C.navyBorder} ${sliderPercent}%, ${C.navyBorder} 100%)`,
                  outline: "none", cursor: "pointer",
                }}
              />
            </div>

            {/* Tier indicator */}
            <div style={{
              marginBottom: "16px", padding: "10px 14px", borderRadius: "8px",
              backgroundColor: `${C.gold}10`, border: `1px solid ${C.gold}25`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: C.gold, fontSize: "13px", fontWeight: 700 }}>
                {calcTab === "paie" ? calcPaieTier().tier : calcTab === "compta" ? calcComptaTier().tier : "Pack ERP"}
              </span>
              <span style={{ color: C.muted, fontSize: "12px" }}>
                {calcTab === "paie"
                  ? `${employees} ${locale === "fr" ? (employees > 1 ? "salariés" : "salarié") : (employees > 1 ? "employees" : "employee")}`
                  : calcTab === "compta"
                    ? computeComptaPrice(employees).tx
                    : (locale === "fr" ? "Compta + RH + TIBOK" : "Accounting + HR + TIBOK")}
              </span>
            </div>

            {/* Formula display */}
            {calcTab === "paie" && (
              <div style={{ color: C.muted, fontSize: "13px", lineHeight: 1.9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>
                    {locale === "fr"
                      ? <>Calcul <span style={{ color: C.white, fontWeight: 600 }}>par salarié</span> — tarif dégressif au volume</>
                      : <>Priced <span style={{ color: C.white, fontWeight: 600 }}>per employee</span> — volume discount</>}
                  </span>
                </div>
                {paieBreakdown(employees).map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {row.count} × {locale === "fr" ? "sal." : "emp."} <span style={{ opacity: 0.7 }}>({row.label})</span> @ MRs {row.rate}
                    </span>
                    <span style={{ color: C.white, fontVariantNumeric: "tabular-nums" }}>
                      MRs {fmt(row.subtotal)}
                    </span>
                  </div>
                ))}
                <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, color: C.white }}>Total</span>
                  <span style={{ color: C.gold, fontWeight: 700, fontSize: "18px", fontVariantNumeric: "tabular-nums" }}>
                    MRs {fmt(calcPaiePrice())} <span style={{ fontSize: "13px", fontWeight: 400, color: C.muted }}>{txt.perMonth}</span>
                  </span>
                </div>
                {employees > 0 && (
                  <div style={{ fontSize: "12px", color: C.muted, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
                    ≈ MRs {fmt(perEmpPaie)} {locale === "fr" ? "/ salarié / mois" : "/ employee / month"} · {locale === "fr" ? "plancher MRs 250 · TIBOK inclus" : "floor MRs 250 · TIBOK included"}
                  </div>
                )}
              </div>
            )}
            {calcTab === "compta" && (
              <div style={{ color: C.muted, fontSize: "13px", lineHeight: 1.9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>
                    {locale === "fr"
                      ? <>Estimation <span style={{ color: C.white, fontWeight: 600 }}>par volume de transactions</span></>
                      : <>Based on <span style={{ color: C.white, fontWeight: 600 }}>transaction volume</span></>}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2px" }}>
                  <span>{locale === "fr" ? "Estimation (≈10 txn / salarié)" : "Estimate (~10 tx / emp)"}</span>
                  <span style={{ color: C.white, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(Math.max(20, employees * 10))} {locale === "fr" ? "txn/mois" : "tx/mo"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>{locale === "fr" ? "Formule" : "Plan"}</span>
                  <span style={{ color: C.white, fontWeight: 600 }}>{calcComptaTier().tier}</span>
                </div>
                <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, color: C.white }}>Total</span>
                  <span style={{ color: C.gold, fontWeight: 700, fontSize: "18px", fontVariantNumeric: "tabular-nums" }}>
                    MRs {fmt(calcComptaPrice())} <span style={{ fontSize: "13px", fontWeight: 400, color: C.muted }}>{txt.perMonth}</span>
                  </span>
                </div>
              </div>
            )}
            {calcTab === "bundle" && (
              <div style={{ color: C.muted, fontSize: "13px", lineHeight: 1.9 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    RH & Paie ({employees} {locale === "fr" ? "sal." : "emp."})
                  </span>
                  <span style={{ color: C.white, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>MRs {fmt(calcPaiePrice())}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{locale === "fr" ? "Comptabilité" : "Accounting"}</span>
                  <span style={{ color: C.white, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>MRs {fmt(calcComptaPrice())}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: C.green, fontWeight: 600, marginTop: "4px" }}>
                  <span>{locale === "fr" ? "Remise Pack −20%" : "Bundle discount −20%"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>− MRs {fmt(calcPaiePrice() + calcComptaPrice() - calcBundlePrice())}</span>
                </div>
                <div style={{ height: "1px", backgroundColor: C.navyBorder, margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, color: C.white }}>Total</span>
                  <span style={{ color: C.gold, fontWeight: 700, fontSize: "18px", fontVariantNumeric: "tabular-nums" }}>MRs {fmt(calcBundlePrice())} <span style={{ fontSize: "13px", fontWeight: 400, color: C.muted }}>{txt.perMonth}</span></span>
                </div>
                {employees > 0 && (
                  <div style={{ fontSize: "12px", color: C.muted, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>
                    ≈ MRs {fmt(perEmpBundle)} {locale === "fr" ? "/ salarié / mois" : "/ employee / month"}
                  </div>
                )}
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
              <div style={{ color: C.gold, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, lineHeight: 1.1, fontFamily: FONT, wordBreak: "break-word" }}>
                MRs {fmt(getCalcPrice())}
              </div>
              <div style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>
                {calcBilling === "monthly" ? txt.perMonth : `${txt.perMonth} (${txt.annual.toLowerCase()})`}
              </div>

              {calcTab !== "compta" && (
                <div style={{
                  marginTop: "16px", padding: "8px 12px", borderRadius: "8px",
                  backgroundColor: `${C.green}10`, border: `1px solid ${C.green}25`,
                  fontSize: "12px", color: C.green, fontWeight: 500,
                }}>
                  {txt.calcTibokInfo}
                </div>
              )}

              <div className="flex flex-col sm:flex-row" style={{ gap: "12px", marginTop: "20px" }}>
                <Link href="/auth/login" style={{
                  flex: 1, display: "block", textAlign: "center",
                  padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "13px",
                  backgroundColor: C.gold, color: C.bg, textDecoration: "none", fontFamily: FONT,
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

            {/* Feature list card */}
            <div style={{
              backgroundColor: C.cardBg, border: `1px solid ${C.navyBorder}`,
              borderRadius: "12px", padding: "20px",
            }}>
              <div style={{ color: C.white, fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>{txt.calcFeatTitle}</div>
              {getCalcFeats().map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", fontSize: "13px", color: C.white }}>
                  <Check className="w-4 h-4 inline-block" style={{ color: C.green }} /> {f}
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
            color="rgba(65,145,255,0.55)"
            linkColor="rgba(65,145,255,0.18)"
            linkDistance={150}
            speed={0.22}
          />
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `radial-gradient(ellipse 50% 50% at 50% 50%, ${C.gold}12 0%, transparent 70%)`,
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
                  fontWeight: 700, fontSize: "15px", backgroundColor: C.gold, color: C.bg,
                  textDecoration: "none", fontFamily: FONT,
                  boxShadow: `0 12px 28px -10px ${C.gold}80`,
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
              <LexoraLogo size="md" />
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
                <div key={l}><Link href="#" style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
              ))}
            </div>
            {/* TIBOK */}
            <div>
              <h4 style={{ color: C.green, fontSize: "13px", fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.footerTibok}
              </h4>
              {txt.footerTibokLinks.map((l) => (
                <div key={l}><Link href="#" style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
              ))}
            </div>
            {/* Contact */}
            <div>
              <h4 style={{ color: C.white, fontSize: "13px", fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {txt.footerContact}
              </h4>
              {txt.footerContactLinks.map((l) => (
                <div key={l}><Link href="#" style={{ color: C.muted, fontSize: "13px", textDecoration: "none", lineHeight: 2 }}>{l}</Link></div>
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
