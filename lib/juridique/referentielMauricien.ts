/**
 * referentielMauricien.ts — Base de connaissances juridique de la République de Maurice
 * Lexora · Département Juridique
 *
 * Socle de références utilisé par tous les experts IA juridiques (sociétés,
 * contentieux, conformité). Maurice est un système de droit MIXTE :
 *   • Droit civil (Code Civil Mauricien, Code de Commerce, Code de Procédure Civile)
 *     hérité du Code Napoléon ;
 *   • Common law anglaise (procédure, preuve, droit des sociétés, droit du travail) ;
 *   • Appel final devant le Judicial Committee of the Privy Council (Londres).
 *
 * Ce fichier est purement déclaratif (aucune dépendance) : il peut être importé
 * côté serveur comme côté client (UI) sans tirer le SDK Anthropic.
 */

// ============================================================
// TYPES
// ============================================================
export interface LoiMauricienne {
  code: string
  titre: string
  domaine: DomaineJuridique
  resume: string
  /** Articles / sections clés fréquemment cités */
  sections_cles?: string[]
}

export type DomaineJuridique =
  | 'societes'
  | 'commercial'
  | 'travail'
  | 'fiscal'
  | 'civil'
  | 'procedure'
  | 'penal'
  | 'donnees'
  | 'financier'
  | 'immobilier'
  | 'arbitrage'
  | 'insolvabilite'

export interface Juridiction {
  id: string
  nom: string
  nom_en: string
  competence: string
  /** Seuil de compétence monétaire indicatif (MUR), si applicable */
  seuil_mur?: { min?: number; max?: number }
  appel_vers?: string
  base_legale: string
}

export interface TypeContentieux {
  id: string
  label: string
  juridiction_id: string
  base_legale: string[]
  prescription: string
  notes: string
}

export interface DelaiPrescription {
  action: string
  delai: string
  base: string
}

// ============================================================
// LOIS & RÉFÉRENTIELS MAURICIENS
// ============================================================
export const LOIS_MAURICIENNES: LoiMauricienne[] = [
  // — Droit des sociétés / commercial —
  {
    code: 'CA 2001',
    titre: 'Companies Act 2001',
    domaine: 'societes',
    resume:
      'Constitution, capital, actionnaires, dirigeants, résolutions, comptes annuels, fusions, liquidation. Régime des actions en oppression (s.178) et actions dérivées (s.170).',
    sections_cles: ['s.61', 's.118', 's.163', 's.170', 's.176', 's.178', 's.218'],
  },
  {
    code: 'Code de Commerce',
    titre: 'Code de Commerce (Mauricien)',
    domaine: 'commercial',
    resume:
      'Actes de commerce, fonds de commerce, effets de commerce, sociétés commerciales de droit civil, prescription commerciale.',
  },
  {
    code: 'Insolvency Act 2009',
    titre: 'Insolvency Act 2009',
    domaine: 'insolvabilite',
    resume:
      'Faillite des personnes physiques (bankruptcy), liquidation des sociétés (winding up), administration, receivership, ordre des créanciers.',
    sections_cles: ['winding up', 'statutory demand', 'receivership'],
  },
  {
    code: 'Sale of Goods Act',
    titre: 'Sale of Goods Act',
    domaine: 'commercial',
    resume: 'Vente de marchandises, transfert de propriété, garanties, conformité.',
  },
  // — Droit civil / contrats —
  {
    code: 'Code Civil',
    titre: 'Code Civil Mauricien',
    domaine: 'civil',
    resume:
      'Obligations et contrats (art. 1101+), responsabilité civile (art. 1382-1384), prescription, sûretés, baux. Fondement de la plupart des litiges contractuels.',
    sections_cles: ['art.1134', 'art.1147', 'art.1382', 'art.1384', 'art.2270'],
  },
  {
    code: 'Code de Procédure Civile',
    titre: 'Code de Procédure Civile',
    domaine: 'procedure',
    resume:
      'Procédure devant les juridictions civiles, sommation, saisie, exécution des jugements, voies de recours.',
  },
  {
    code: 'Courts Act',
    titre: 'Courts Act',
    domaine: 'procedure',
    resume:
      'Organisation judiciaire, compétences de la Supreme Court, de l’Intermediate Court et des District Courts, Commercial Division.',
  },
  // — Droit du travail —
  {
    code: 'WRA 2019',
    titre: 'Workers’ Rights Act 2019',
    domaine: 'travail',
    resume:
      'Contrat de travail, salaire, durée du travail, congés, fin de contrat, indemnité de licenciement (severance allowance), Portable Retirement Gratuity Fund (PRGF).',
    sections_cles: ['s.11', 's.12', 's.35', 's.64', 's.69', 's.70'],
  },
  {
    code: 'ERA 2008',
    titre: 'Employment Relations Act 2008',
    domaine: 'travail',
    resume:
      'Relations collectives, syndicats, négociation, conflits du travail, Employment Relations Tribunal, Commission for Conciliation and Mediation (CCM).',
  },
  // — Fiscal —
  {
    code: 'ITA',
    titre: 'Income Tax Act',
    domaine: 'fiscal',
    resume:
      'Impôt sur les sociétés et les personnes, PAYE, TDS, Partial Exemption Regime, objections et appels (ARC).',
    sections_cles: ['s.93', 's.118', 's.131'],
  },
  {
    code: 'VAT Act',
    titre: 'Value Added Tax Act',
    domaine: 'fiscal',
    resume: 'TVA 15 %, enregistrement, déclarations, crédit de TVA, pénalités.',
    sections_cles: ['s.24'],
  },
  {
    code: 'MRA Act',
    titre: 'Mauritius Revenue Authority Act',
    domaine: 'fiscal',
    resume:
      'Pouvoirs de la MRA, recouvrement, objections, Assessment Review Committee (ARC) comme juridiction fiscale de première instance.',
  },
  // — Données / financier —
  {
    code: 'DPA 2017',
    titre: 'Data Protection Act 2017',
    domaine: 'donnees',
    resume:
      'Protection des données personnelles (aligné RGPD), Data Protection Office, droits des personnes, notification de violation.',
  },
  {
    code: 'FSA 2007',
    titre: 'Financial Services Act 2007',
    domaine: 'financier',
    resume: 'Licences FSC, Global Business Licence (GBL), Authorised Company (AC), substance.',
    sections_cles: ['s.20', 's.21'],
  },
  {
    code: 'FIAMLA',
    titre: 'Financial Intelligence and Anti-Money Laundering Act',
    domaine: 'financier',
    resume: 'Obligations AML/CFT, déclarations de soupçon (FIU), KYC, sanctions.',
    sections_cles: ['s.17'],
  },
  {
    code: 'BORA 2020',
    titre: 'Beneficial Ownership Registration Act',
    domaine: 'societes',
    resume: 'Déclaration obligatoire des bénéficiaires effectifs (UBO).',
    sections_cles: ['s.4'],
  },
  {
    code: 'POCA 2002',
    titre: 'Prevention of Corruption Act 2002',
    domaine: 'penal',
    resume: 'Corruption, conflit d’intérêts, ICAC (Independent Commission Against Corruption).',
  },
  // — Procédure / arbitrage / immobilier —
  {
    code: 'IAA 2008',
    titre: 'International Arbitration Act 2008',
    domaine: 'arbitrage',
    resume:
      'Arbitrage international (Maurice est un hub : MARC / MIAC), reconnaissance et exécution des sentences (Convention de New York).',
  },
  {
    code: 'L&T Act',
    titre: 'Landlord and Tenant Act',
    domaine: 'immobilier',
    resume: 'Baux d’habitation et commerciaux, loyers, expulsion, Fair Rent Tribunal.',
  },
  {
    code: 'ETA 2000',
    titre: 'Electronic Transactions Act 2000',
    domaine: 'commercial',
    resume:
      'Valeur juridique de la signature électronique (équivalence avec la signature manuscrite).',
  },
  {
    code: 'Constitution',
    titre: 'Constitution of Mauritius 1968',
    domaine: 'procedure',
    resume:
      'Droits fondamentaux, recours constitutionnels (s.17), indépendance de la justice.',
    sections_cles: ['s.17'],
  },
]

// ============================================================
// ORGANISATION JUDICIAIRE MAURICIENNE
// ============================================================
export const JURIDICTIONS_MAURICIENNES: Juridiction[] = [
  {
    id: 'district_court',
    nom: 'District Court',
    nom_en: 'District Court',
    competence:
      'Petits litiges civils et délits mineurs. Recouvrement de créances de faible montant, infractions de simple police.',
    seuil_mur: { max: 250000 },
    appel_vers: 'supreme_court',
    base_legale: 'Courts Act / District and Intermediate Courts (Civil Jurisdiction) Act',
  },
  {
    id: 'intermediate_court',
    nom: 'Intermediate Court (Civil & Criminal Divisions)',
    nom_en: 'Intermediate Court',
    competence:
      'Litiges civils de montant intermédiaire et infractions de gravité moyenne. Recouvrement et litiges contractuels courants.',
    seuil_mur: { min: 250000, max: 2000000 },
    appel_vers: 'supreme_court',
    base_legale: 'District and Intermediate Courts (Civil Jurisdiction) Act',
  },
  {
    id: 'commercial_division',
    nom: 'Commercial Division (Supreme Court)',
    nom_en: 'Commercial Division of the Supreme Court',
    competence:
      'Litiges commerciaux complexes, sociétés, banque, insolvabilité, fortes valeurs. Procédure accélérée.',
    seuil_mur: { min: 2000000 },
    appel_vers: 'court_of_civil_appeal',
    base_legale: 'Supreme Court (Commercial Division) — Practice Directions',
  },
  {
    id: 'supreme_court',
    nom: 'Supreme Court',
    nom_en: 'Supreme Court',
    competence:
      'Juridiction supérieure illimitée, contrôle de légalité (judicial review), recours constitutionnels, plaint with summons de forte valeur.',
    appel_vers: 'court_of_civil_appeal',
    base_legale: 'Constitution s.76 / Courts Act',
  },
  {
    id: 'industrial_court',
    nom: 'Industrial Court',
    nom_en: 'Industrial Court',
    competence:
      'Litiges du travail : salaires, licenciement, severance allowance, accidents du travail, sécurité sociale.',
    appel_vers: 'supreme_court',
    base_legale: 'Industrial Court Act / WRA 2019',
  },
  {
    id: 'ert',
    nom: 'Employment Relations Tribunal',
    nom_en: 'Employment Relations Tribunal',
    competence:
      'Conflits collectifs du travail, reconnaissance syndicale, différends de négociation.',
    appel_vers: 'supreme_court',
    base_legale: 'ERA 2008',
  },
  {
    id: 'arc',
    nom: 'Assessment Review Committee (ARC)',
    nom_en: 'Assessment Review Committee',
    competence:
      'Contestation des cotisations fiscales MRA (impôt, TVA, douanes) après objection rejetée.',
    appel_vers: 'supreme_court',
    base_legale: 'MRA Act / ITA s.131',
  },
  {
    id: 'court_of_civil_appeal',
    nom: 'Court of Civil Appeal / Court of Criminal Appeal',
    nom_en: 'Court of Civil / Criminal Appeal',
    competence: 'Appel des décisions de la Supreme Court et juridictions inférieures.',
    appel_vers: 'privy_council',
    base_legale: 'Courts Act',
  },
  {
    id: 'privy_council',
    nom: 'Judicial Committee of the Privy Council (Londres)',
    nom_en: 'Judicial Committee of the Privy Council',
    competence: 'Juridiction d’appel final de la République de Maurice.',
    base_legale: 'Constitution s.81',
  },
  {
    id: 'marc',
    nom: 'MARC — MCCI Arbitration & Mediation Center',
    nom_en: 'MARC Arbitration Center',
    competence:
      'Arbitrage et médiation commerciaux, alternative aux tribunaux (clause compromissoire).',
    base_legale: 'IAA 2008 / règlement MARC',
  },
  {
    id: 'fair_rent_tribunal',
    nom: 'Fair Rent Tribunal',
    nom_en: 'Fair Rent Tribunal',
    competence: 'Litiges locatifs : loyers, expulsions, conditions de bail.',
    appel_vers: 'supreme_court',
    base_legale: 'Landlord and Tenant Act',
  },
]

// ============================================================
// TYPES DE CONTENTIEUX COUVERTS
// ============================================================
export const TYPES_CONTENTIEUX: TypeContentieux[] = [
  {
    id: 'recouvrement',
    label: 'Recouvrement de créances',
    juridiction_id: 'intermediate_court',
    base_legale: ['Code Civil art.1134', 'Code de Procédure Civile', 'Code de Commerce'],
    prescription: '5 ans (créances commerciales) / 10 ans (titres)',
    notes:
      'Chaîne : mise en demeure → sommation → plaint with summons. Juridiction selon le montant. Possibilité d’injonction.',
  },
  {
    id: 'travail',
    label: 'Contentieux du travail',
    juridiction_id: 'industrial_court',
    base_legale: ['WRA 2019', 'ERA 2008'],
    prescription: 'Réclamation severance : généralement 3 ans',
    notes:
      'Licenciement injustifié, severance allowance, salaires impayés. Conciliation CCM souvent préalable.',
  },
  {
    id: 'commercial',
    label: 'Litige commercial / contractuel',
    juridiction_id: 'commercial_division',
    base_legale: ['Code Civil', 'Code de Commerce', 'Sale of Goods Act'],
    prescription: '5 ans (art. prescription commerciale)',
    notes: 'Inexécution contractuelle, rupture, garanties, responsabilité.',
  },
  {
    id: 'societes',
    label: 'Litige entre associés / sociétaire',
    juridiction_id: 'commercial_division',
    base_legale: ['CA 2001 s.178 (oppression)', 'CA 2001 s.170 (action dérivée)'],
    prescription: 'Selon la nature de l’action',
    notes: 'Oppression d’actionnaire minoritaire, action dérivée, dissolution.',
  },
  {
    id: 'fiscal',
    label: 'Contentieux fiscal (MRA)',
    juridiction_id: 'arc',
    base_legale: ['ITA s.131', 'VAT Act', 'MRA Act'],
    prescription: 'Objection : 28 jours après notice of assessment',
    notes:
      'Objection MRA d’abord, puis recours devant l’ARC, puis Supreme Court. Délais stricts.',
  },
  {
    id: 'immobilier',
    label: 'Litige locatif / immobilier',
    juridiction_id: 'fair_rent_tribunal',
    base_legale: ['Landlord and Tenant Act', 'Code Civil'],
    prescription: 'Selon la nature',
    notes: 'Loyers impayés, expulsion, état des lieux, troubles de jouissance.',
  },
  {
    id: 'responsabilite',
    label: 'Responsabilité civile / délictuelle',
    juridiction_id: 'intermediate_court',
    base_legale: ['Code Civil art.1382-1384'],
    prescription: '5 ans en principe',
    notes: 'Dommages et intérêts, faute, lien de causalité, préjudice.',
  },
  {
    id: 'arbitrage',
    label: 'Arbitrage / médiation',
    juridiction_id: 'marc',
    base_legale: ['IAA 2008', 'Convention de New York'],
    prescription: 'Selon convention',
    notes: 'En présence d’une clause compromissoire. Confidentiel, exécution internationale.',
  },
]

// ============================================================
// DÉLAIS DE PRESCRIPTION CLÉS
// ============================================================
export const DELAIS_PRESCRIPTION: DelaiPrescription[] = [
  { action: 'Créance commerciale', delai: '5 ans', base: 'Code de Commerce / Code Civil' },
  { action: 'Action contractuelle (droit commun)', delai: '5 ans', base: 'Code Civil' },
  { action: 'Responsabilité délictuelle', delai: '5 ans', base: 'Code Civil art.2270 al.' },
  { action: 'Exécution d’un jugement', delai: '10 ans', base: 'Code Civil' },
  { action: 'Objection fiscale MRA', delai: '28 jours après assessment', base: 'ITA s.131' },
  { action: 'Recours ARC après rejet objection', delai: '28 jours', base: 'MRA Act' },
  { action: 'Réclamation severance (travail)', delai: '≈ 3 ans', base: 'WRA 2019' },
  { action: 'Notification BORA (UBO)', delai: '14 jours', base: 'BORA 2020 s.4' },
]

// ============================================================
// HELPERS
// ============================================================

/** Trouve une juridiction par id. */
export function getJuridiction(id: string): Juridiction | undefined {
  return JURIDICTIONS_MAURICIENNES.find((j) => j.id === id)
}

/** Suggère la juridiction compétente pour un litige de recouvrement selon le montant. */
export function juridictionPourMontant(montantMur: number): Juridiction {
  if (montantMur <= 250000) return getJuridiction('district_court')!
  if (montantMur <= 2000000) return getJuridiction('intermediate_court')!
  return getJuridiction('commercial_division')!
}

/**
 * Construit un digest texte du référentiel à injecter dans les prompts système
 * des experts IA, pour ancrer les réponses sur les bonnes références mauriciennes.
 */
export function construireDigestReferentiel(domaines?: DomaineJuridique[]): string {
  const lois = domaines
    ? LOIS_MAURICIENNES.filter((l) => domaines.includes(l.domaine))
    : LOIS_MAURICIENNES

  const loisTxt = lois
    .map((l) => `- **${l.code}** — ${l.titre} : ${l.resume}${l.sections_cles ? ` (réf. ${l.sections_cles.join(', ')})` : ''}`)
    .join('\n')

  const juridTxt = JURIDICTIONS_MAURICIENNES.map(
    (j) =>
      `- **${j.nom}** : ${j.competence}${j.seuil_mur ? ` [seuil ${j.seuil_mur.min ? `${j.seuil_mur.min.toLocaleString()} MUR – ` : '≤ '}${j.seuil_mur.max ? `${j.seuil_mur.max.toLocaleString()} MUR` : 'illimité'}]` : ''}${j.appel_vers ? ` → appel : ${getJuridiction(j.appel_vers)?.nom || j.appel_vers}` : ''}`,
  ).join('\n')

  return `## RÉFÉRENTIEL JURIDIQUE MAURICIEN

### Lois & réglementations applicables
${loisTxt}

### Organisation judiciaire (juridictions compétentes)
${juridTxt}

### Délais de prescription clés
${DELAIS_PRESCRIPTION.map((d) => `- ${d.action} : ${d.delai} (${d.base})`).join('\n')}`
}
