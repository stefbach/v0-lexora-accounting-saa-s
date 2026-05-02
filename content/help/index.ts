/**
 * Centre d'aide Lexora — index des articles.
 *
 * Pour ajouter un article :
 *   1. créer le composant React dans content/help/<category>/<slug>.tsx
 *   2. l'enregistrer ci-dessous (titre + résumé + slug)
 *
 * Cette approche évite la dépendance @next/mdx tout en gardant
 * une structure proche d'un système MDX (un fichier par article).
 */

import type { ComponentType } from "react"

// -- Premiers pas
import CreerSociete from "./premiers-pas/creer-societe"
// -- Comptabilité
import SaisieFactureClient from "./comptabilite/saisir-facture-client"
import ComprendreBalance from "./comptabilite/comprendre-balance"
import LettrageManuel from "./comptabilite/lettrage-manuel"
// -- TVA
import DeclarationTva from "./tva/declaration-tva"
// -- Paie
import ProvisionsIas19 from "./paie/provisions-ias-19"
// -- Rapprochement
import ImporterReleveBancaire from "./rapprochement/importer-releve-bancaire"
// -- Clôtures
import CloturerExercice from "./clotures/cloturer-exercice"

export type HelpCategory = {
  slug: string
  title: string
  description: string
  icon: string
}

export type HelpArticle = {
  category: string
  slug: string
  title: string
  excerpt: string
  readingTime: string
  Component: ComponentType
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "premiers-pas",
    title: "Premiers pas",
    description: "Configurer votre espace Lexora et créer votre première société.",
    icon: "Rocket",
  },
  {
    slug: "comptabilite",
    title: "Comptabilité",
    description: "Saisie, balance, lettrage et bonnes pratiques courantes.",
    icon: "BookOpen",
  },
  {
    slug: "tva",
    title: "TVA",
    description: "Préparer et déposer vos déclarations TVA mauriciennes.",
    icon: "Receipt",
  },
  {
    slug: "paie",
    title: "Paie",
    description: "Bulletins, charges sociales, provisions IAS 19.",
    icon: "Users",
  },
  {
    slug: "rapprochement",
    title: "Rapprochement",
    description: "Importer un relevé bancaire et rapprocher les écritures.",
    icon: "Landmark",
  },
  {
    slug: "clotures",
    title: "Clôtures",
    description: "Clôturer un exercice et générer les états financiers.",
    icon: "Lock",
  },
]

export const HELP_ARTICLES: HelpArticle[] = [
  {
    category: "premiers-pas",
    slug: "creer-societe",
    title: "Créer une société",
    excerpt: "Pas-à-pas pour créer votre première société dans Lexora et la paramétrer.",
    readingTime: "4 min",
    Component: CreerSociete,
  },
  {
    category: "comptabilite",
    slug: "saisir-facture-client",
    title: "Saisir une facture client",
    excerpt: "Créer une facture de vente, l'imputer comptablement et l'envoyer au client.",
    readingTime: "3 min",
    Component: SaisieFactureClient,
  },
  {
    category: "comptabilite",
    slug: "comprendre-balance",
    title: "Comprendre la balance",
    excerpt: "Lire une balance générale, vérifier l'équilibre et détecter les anomalies.",
    readingTime: "5 min",
    Component: ComprendreBalance,
  },
  {
    category: "comptabilite",
    slug: "lettrage-manuel",
    title: "Lettrage manuel",
    excerpt: "Apparier paiements et factures pour solder les comptes auxiliaires.",
    readingTime: "4 min",
    Component: LettrageManuel,
  },
  {
    category: "tva",
    slug: "declaration-tva",
    title: "Faire une déclaration TVA",
    excerpt: "Préparer la déclaration mensuelle/trimestrielle au MRA depuis Lexora.",
    readingTime: "6 min",
    Component: DeclarationTva,
  },
  {
    category: "paie",
    slug: "provisions-ias-19",
    title: "Provisions IAS 19",
    excerpt: "Comptabiliser les provisions pour engagements postérieurs à l'emploi.",
    readingTime: "7 min",
    Component: ProvisionsIas19,
  },
  {
    category: "rapprochement",
    slug: "importer-releve-bancaire",
    title: "Importer un relevé bancaire",
    excerpt: "Importer un fichier CSV/OFX/MT940 et préparer le rapprochement.",
    readingTime: "4 min",
    Component: ImporterReleveBancaire,
  },
  {
    category: "clotures",
    slug: "cloturer-exercice",
    title: "Clôturer un exercice",
    excerpt: "Étapes de clôture, contrôles et génération des états financiers.",
    readingTime: "8 min",
    Component: CloturerExercice,
  },
]

export function getCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug)
}

export function getArticlesByCategory(slug: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === slug)
}

export function getArticle(category: string, slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.category === category && a.slug === slug)
}
