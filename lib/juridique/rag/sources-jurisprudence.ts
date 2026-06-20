/**
 * sources-jurisprudence.ts — Registre des sources de JURISPRUDENCE mauricienne
 * à ingérer dans le RAG (juridique_rag_corpus).
 *
 * Deux types d'entrées :
 *   1. LISTINGS  : pages qui listent des jugements récents (le crawler y
 *      découvre dynamiquement les URLs de PDF de jugements à ingérer).
 *   2. JUGEMENTS : arrêts/jugements de référence (landmark) avec URL de PDF
 *      directe, vérifiée HTTP 200 (application/pdf).
 *
 * Source principale retenue : `supremecourt.govmu.org` (site officiel de la
 * Cour suprême). Les PDF y sont servis en direct, sans mur anti-bot, au format
 * `…/system/files/judgment/<id>/<slug>.pdf`. Les pages de recherche
 * (`/judgment-search`, `/most-recent-judgments`) exposent ces PDF via des liens
 * `/view_document/…?file=<url-encodée>`.
 *
 * NB : SAFLII et BAILII hébergent aussi la jurisprudence mauricienne (y compris
 * les arrêts du Privy Council) mais sont protégés par un mur anti-bot
 * (Cloudflare / challenge JS) qui empêche le fetch serveur — non retenus.
 * MauritiusLII (Laws.Africa) expose pour l'instant la législation mais sa base
 * de jugements est vide ; on garde son listing en réserve pour le futur.
 *
 * Pur data → importable serveur (ingestion) et client (affichage).
 */
import type { DomaineJuridique } from '../referentielMauricien'

/** Page de listing depuis laquelle le crawler découvre des URLs de jugements. */
export interface ListingJurisprudence {
  key: string               // identifiant court (préfixe des slugs ingérés)
  cour: string              // libellé de la cour / source affichée
  titre: string             // description du listing
  domaine: DomaineJuridique // domaine par défaut des jugements de ce listing
  listingUrl: string        // page HTML listant des jugements
  maj: string               // libellé d'à-jour
}

/** Jugement individuel de référence (PDF direct vérifié). */
export interface ArretJurisprudence {
  key: string            // identifiant court (préfixe des slugs ingérés)
  cour: string           // cour ayant rendu la décision
  titre: string          // intitulé de l'affaire
  reference: string      // citation neutre si connue (ex: '2026 INT 144')
  domaine: DomaineJuridique
  url: string            // PDF direct (HTTP 200, application/pdf)
  maj: string            // année / libellé
}

/**
 * Pages de listing exploitables par le crawler. La page de recherche de la Cour
 * suprême renvoie par défaut les jugements les plus récents (tous domaines
 * confondus), ce qui en fait une bonne porte d'entrée pour un crawl périodique.
 */
export const LISTINGS_JURISPRUDENCE: ListingJurisprudence[] = [
  {
    key: 'jp-scm-recents',
    cour: 'Cour suprême (Maurice)',
    titre: 'Jugements les plus récents — toutes juridictions (supremecourt.govmu.org)',
    domaine: 'procedure',
    listingUrl: 'https://supremecourt.govmu.org/most-recent-judgments',
    maj: 'flux courant',
  },
  {
    key: 'jp-scm-recherche',
    cour: 'Cour suprême (Maurice)',
    titre: 'Recherche de jugements (supremecourt.govmu.org/judgment-search)',
    domaine: 'procedure',
    listingUrl: 'https://supremecourt.govmu.org/judgment-search',
    maj: 'flux courant',
  },
]

/**
 * Arrêts/jugements de référence avec PDF direct vérifié (HTTP 200,
 * application/pdf — vérifiés le 2026-06-20). Ils servent de base ingérable même
 * sans crawl, et de jeu de test pour l'extraction.
 */
export const ARRETS_JURISPRUDENCE: ArretJurisprudence[] = [
  {
    key: 'jp-iliad-pamplemousses-syndicat',
    cour: 'Intermediate Court (Maurice)',
    titre: 'Iliad Pamplemousses Ltd v Le Syndicat des Copropriétaires de la Résidence Tanzi',
    reference: '2026 INT 144',
    domaine: 'immobilier',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18658654/iliad-pamplemousses-ltd-v-le-syndicat-des-coproprietaires-de-la-residences-tanzi.pdf',
    maj: '2026',
  },
  {
    key: 'jp-oshi-altesse-papers',
    cour: 'Industrial Court (Maurice)',
    titre: 'OSHI v Altesse Papers Ltd — santé et sécurité au travail (OSHA 2005)',
    reference: '2026 IND 24',
    domaine: 'travail',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18635004/oshi-v-altesse-papers-ltd-cn-88-2022_0.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-rajnath',
    cour: 'District Court of Port-Louis (Maurice)',
    titre: 'Police v Rajnath',
    reference: '2026 PL2 20',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18659130/police-v-rajnath.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-bhaukaurally',
    cour: 'Cour suprême (Maurice)',
    titre: 'Police v Bhaukaurally',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18659162/police-v-bhaukaurally.pdf',
    maj: '2026',
  },
  {
    key: 'jp-legallant-police',
    cour: 'Cour suprême (Maurice)',
    titre: 'Legallant v Police',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18646744/legallant-v-police.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-ramkissoon',
    cour: 'Cour suprême (Maurice)',
    titre: 'Police v S. Ramkissoon',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18660182/police-v-s-ramkissoon-judgment_0.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-samynaden',
    cour: 'Cour suprême (Maurice)',
    titre: 'Police v M. Samynaden',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18663254/police-v-m-samynaden-judgment_1.pdf',
    maj: '2026',
  },
  {
    key: 'jp-jeetun-police-bail',
    cour: 'Cour suprême (Maurice)',
    titre: 'M.S.B.Y. Jeetun v Police — décision sur la liberté provisoire (bail)',
    reference: 'extrait',
    domaine: 'procedure',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18663258/m-s-b-y-jeetun-v-police-bail-ruling-final_0.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-bachoo',
    cour: 'Cour suprême (Maurice)',
    titre: 'Police v R. Bachoo',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18656040/police-v-r-bachoo-judgment.pdf',
    maj: '2026',
  },
  {
    key: 'jp-police-ramchelawon',
    cour: 'Cour suprême (Maurice)',
    titre: 'Police v S. Ramchelawon',
    reference: 'extrait',
    domaine: 'penal',
    url: 'https://supremecourt.govmu.org/system/files/judgment/18656068/police-v-s-ramchelawon-judgment.pdf',
    maj: '2026',
  },
]

export function getListingJurisprudence(key: string): ListingJurisprudence | undefined {
  return LISTINGS_JURISPRUDENCE.find((l) => l.key === key)
}

export function getArretJurisprudence(key: string): ArretJurisprudence | undefined {
  return ARRETS_JURISPRUDENCE.find((a) => a.key === key)
}
