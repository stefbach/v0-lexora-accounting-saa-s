/**
 * Centre d'aide Lexora — index des articles (bilingue FR/EN).
 *
 * Pour ajouter un article :
 *   1. créer le composant React FR dans content/help/<category>/<slug>.tsx
 *      et sa version EN content/help/<category>/<slug>.en.tsx
 *   2. l'enregistrer ci-dessous (titre/résumé FR + EN + composants)
 *
 * Cette approche évite la dépendance @next/mdx tout en gardant
 * une structure proche d'un système MDX (un fichier par article).
 */

import type { ComponentType } from "react"

// -- Premiers pas
import CreerSociete from "./premiers-pas/creer-societe"
import CreerSocieteEn from "./premiers-pas/creer-societe.en"
// -- Comptabilité
import SaisieFactureClient from "./comptabilite/saisir-facture-client"
import SaisieFactureClientEn from "./comptabilite/saisir-facture-client.en"
import ComprendreBalance from "./comptabilite/comprendre-balance"
import ComprendreBalanceEn from "./comptabilite/comprendre-balance.en"
import LettrageManuel from "./comptabilite/lettrage-manuel"
import LettrageManuelEn from "./comptabilite/lettrage-manuel.en"
// -- TVA
import DeclarationTva from "./tva/declaration-tva"
import DeclarationTvaEn from "./tva/declaration-tva.en"
// -- Paie
import ProvisionsIas19 from "./paie/provisions-ias-19"
import ProvisionsIas19En from "./paie/provisions-ias-19.en"
// -- Rapprochement
import ImporterReleveBancaire from "./rapprochement/importer-releve-bancaire"
import ImporterReleveBancaireEn from "./rapprochement/importer-releve-bancaire.en"
// -- Clôtures
import CloturerExercice from "./clotures/cloturer-exercice"
import CloturerExerciceEn from "./clotures/cloturer-exercice.en"

export type Locale = "fr" | "en"

export type HelpCategory = {
  slug: string
  title: string
  title_en: string
  description: string
  description_en: string
  icon: string
}

export type HelpArticle = {
  category: string
  slug: string
  title: string
  title_en: string
  excerpt: string
  excerpt_en: string
  readingTime: string
  Component: ComponentType
  Component_en: ComponentType
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "premiers-pas",
    title: "Premiers pas",
    title_en: "Getting started",
    description: "Configurer votre espace Lexora et créer votre première société.",
    description_en: "Set up your Lexora workspace and create your first company.",
    icon: "Rocket",
  },
  {
    slug: "comptabilite",
    title: "Comptabilité",
    title_en: "Accounting",
    description: "Saisie, balance, lettrage et bonnes pratiques courantes.",
    description_en: "Entry, trial balance, matching and everyday best practices.",
    icon: "BookOpen",
  },
  {
    slug: "tva",
    title: "TVA",
    title_en: "VAT",
    description: "Préparer et déposer vos déclarations TVA mauriciennes.",
    description_en: "Prepare and file your Mauritian VAT returns.",
    icon: "Receipt",
  },
  {
    slug: "paie",
    title: "Paie",
    title_en: "Payroll",
    description: "Bulletins, charges sociales, provisions IAS 19.",
    description_en: "Payslips, social contributions, IAS 19 provisions.",
    icon: "Users",
  },
  {
    slug: "rapprochement",
    title: "Rapprochement",
    title_en: "Bank reconciliation",
    description: "Importer un relevé bancaire et rapprocher les écritures.",
    description_en: "Import a bank statement and reconcile entries.",
    icon: "Landmark",
  },
  {
    slug: "clotures",
    title: "Clôtures",
    title_en: "Year-end close",
    description: "Clôturer un exercice et générer les états financiers.",
    description_en: "Close a financial year and generate financial statements.",
    icon: "Lock",
  },
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    category: "premiers-pas",
    slug: "creer-societe",
    title: "Créer une société",
    title_en: "Create a company",
    excerpt: "Pas-à-pas pour créer votre première société dans Lexora et la paramétrer.",
    excerpt_en: "Step-by-step to create and configure your first company in Lexora.",
    readingTime: "4 min",
    Component: CreerSociete,
    Component_en: CreerSocieteEn,
  },
  {
    category: "comptabilite",
    slug: "saisir-facture-client",
    title: "Saisir une facture client",
    title_en: "Record a customer invoice",
    excerpt: "Créer une facture de vente, l'imputer comptablement et l'envoyer au client.",
    excerpt_en: "Create a sales invoice, post it to the accounts and send it to the customer.",
    readingTime: "3 min",
    Component: SaisieFactureClient,
    Component_en: SaisieFactureClientEn,
  },
  {
    category: "comptabilite",
    slug: "comprendre-balance",
    title: "Comprendre la balance",
    title_en: "Understand the trial balance",
    excerpt: "Lire une balance générale, vérifier l'équilibre et détecter les anomalies.",
    excerpt_en: "Read a trial balance, check it balances and spot anomalies.",
    readingTime: "5 min",
    Component: ComprendreBalance,
    Component_en: ComprendreBalanceEn,
  },
  {
    category: "comptabilite",
    slug: "lettrage-manuel",
    title: "Lettrage manuel",
    title_en: "Manual matching",
    excerpt: "Apparier paiements et factures pour solder les comptes auxiliaires.",
    excerpt_en: "Match payments and invoices to clear subsidiary accounts.",
    readingTime: "4 min",
    Component: LettrageManuel,
    Component_en: LettrageManuelEn,
  },
  {
    category: "tva",
    slug: "declaration-tva",
    title: "Faire une déclaration TVA",
    title_en: "File a VAT return",
    excerpt: "Préparer la déclaration mensuelle/trimestrielle au MRA depuis Lexora.",
    excerpt_en: "Prepare the monthly/quarterly MRA return from Lexora.",
    readingTime: "6 min",
    Component: DeclarationTva,
    Component_en: DeclarationTvaEn,
  },
  {
    category: "paie",
    slug: "provisions-ias-19",
    title: "Provisions IAS 19",
    title_en: "IAS 19 provisions",
    excerpt: "Comptabiliser les provisions pour engagements postérieurs à l'emploi.",
    excerpt_en: "Account for post-employment benefit provisions.",
    readingTime: "7 min",
    Component: ProvisionsIas19,
    Component_en: ProvisionsIas19En,
  },
  {
    category: "rapprochement",
    slug: "importer-releve-bancaire",
    title: "Importer un relevé bancaire",
    title_en: "Import a bank statement",
    excerpt: "Importer un fichier CSV/OFX/MT940 et préparer le rapprochement.",
    excerpt_en: "Import a CSV/OFX/MT940 file and prepare reconciliation.",
    readingTime: "4 min",
    Component: ImporterReleveBancaire,
    Component_en: ImporterReleveBancaireEn,
  },
  {
    category: "clotures",
    slug: "cloturer-exercice",
    title: "Clôturer un exercice",
    title_en: "Close a financial year",
    excerpt: "Étapes de clôture, contrôles et génération des états financiers.",
    excerpt_en: "Close steps, controls and financial statement generation.",
    readingTime: "8 min",
    Component: CloturerExercice,
    Component_en: CloturerExerciceEn,
  },
]

// -- Helpers localisés --------------------------------------------------------
export const catTitle = (c: HelpCategory, l: Locale) => (l === "en" ? c.title_en : c.title)
export const catDesc = (c: HelpCategory, l: Locale) => (l === "en" ? c.description_en : c.description)
export const artTitle = (a: HelpArticle, l: Locale) => (l === "en" ? a.title_en : a.title)
export const artExcerpt = (a: HelpArticle, l: Locale) => (l === "en" ? a.excerpt_en : a.excerpt)
export const artComponent = (a: HelpArticle, l: Locale) => (l === "en" ? a.Component_en : a.Component)

export function getCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug)
}

export function getArticlesByCategory(slug: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === slug)
}

export function getArticle(category: string, slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.category === category && a.slug === slug)
}
