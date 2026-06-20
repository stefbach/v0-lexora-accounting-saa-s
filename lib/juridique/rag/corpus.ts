/**
 * corpus.ts — Corpus juridique mauricien verrouillé (base du RAG).
 * Lexora · Département Juridique
 *
 * Chaque passage est une SYNTHÈSE de référence d'une disposition, rattachée à
 * sa source officielle (loi + section), avec date de revue (`maj`) et URL.
 * Le RAG ne répond QUE sur la base de ces passages : c'est ce qui « verrouille »
 * l'information et permet de justifier chaque décision par une citation —
 * démarche d'un cabinet d'audit/conseil (Big Four).
 *
 * ⚠️ Ce sont des synthèses de travail à confronter au texte officiel à jour
 * avant tout usage contentieux. Pur data (aucune dépendance) → importable
 * côté client comme serveur.
 */
import type { DomaineJuridique } from '../referentielMauricien'

export interface PassageCorpus {
  id: string
  domaine: DomaineJuridique
  source: string // code loi (ex: 'CA 2001')
  reference: string // section/article (ex: 's.178')
  titre: string
  texte: string
  url?: string
  /** Date de dernière revue de la synthèse (YYYY-MM) */
  maj: string
}

const MLII = 'https://mauritiusassembly.govmu.org' // Mauritius National Assembly (lois)
const SC = 'https://supremecourt.govmu.org' // Supreme Court (jugements)

export const CORPUS_JURIDIQUE: PassageCorpus[] = [
  // ───────────────────────── SOCIÉTÉS — Companies Act 2001 ─────────────────────────
  {
    id: 'ca-118',
    domaine: 'societes',
    source: 'CA 2001',
    reference: 's.118',
    titre: 'Assemblée générale annuelle',
    texte:
      "Toute société doit tenir son assemblée générale annuelle dans les 6 mois suivant la clôture de son exercice (balance sheet date), et au plus tard 15 mois après la précédente AG. Une société à actionnaire unique peut être dispensée d'AG dans les conditions prévues.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'ca-176',
    domaine: 'societes',
    source: 'CA 2001',
    reference: 's.215 / s.176',
    titre: 'Dépôt des comptes annuels au Registrar',
    texte:
      "La société doit déposer ses états financiers auprès du Registrar of Companies dans les 28 jours de leur signature/AG. Les small private companies bénéficient d'allègements. Le défaut de dépôt expose à des pénalités et au risque de radiation (striking off).",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'ca-178',
    domaine: 'societes',
    source: 'CA 2001',
    reference: 's.178',
    titre: "Recours pour conduite abusive (oppression)",
    texte:
      "Un actionnaire (ou ancien actionnaire) qui estime que les affaires de la société sont, ont été ou risquent d'être conduites de manière opprimante, injustement discriminatoire ou abusive à son égard peut saisir la Cour. Celle-ci dispose de pouvoirs étendus : ordonner le rachat de ses parts, régler la conduite future, modifier les statuts, voire ordonner la liquidation.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'ca-170',
    domaine: 'societes',
    source: 'CA 2001',
    reference: 's.170',
    titre: 'Action dérivée (derivative action)',
    texte:
      "Avec l'autorisation de la Cour, un actionnaire ou administrateur peut intenter une action au nom de la société (derivative action) lorsque celle-ci subit un préjudice et que ses dirigeants n'agissent pas. La Cour apprécie l'intérêt de la société et la bonne foi du demandeur.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'ca-163',
    domaine: 'societes',
    source: 'CA 2001',
    reference: 's.163',
    titre: 'Devoirs des administrateurs',
    texte:
      "L'administrateur doit agir de bonne foi et dans l'intérêt de la société, exercer ses pouvoirs à des fins propres, avec le soin, la diligence et la compétence d'une personne raisonnable. Tout changement d'administrateur doit être notifié au Registrar dans les 28 jours.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── TRAVAIL — Workers' Rights Act 2019 ─────────────────────────
  {
    id: 'wra-64',
    domaine: 'travail',
    source: 'WRA 2019',
    reference: 's.64',
    titre: 'Fin de contrat — motif et procédure',
    texte:
      "Aucun travailleur ne peut être licencié sauf pour une raison valable liée à sa conduite, sa capacité, ou les besoins opérationnels de l'entreprise. Un licenciement pour faute exige une procédure équitable : notification des griefs et possibilité de répondre dans un délai raisonnable. À défaut, le licenciement est injustifié (unjustified).",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'wra-69',
    domaine: 'travail',
    source: 'WRA 2019',
    reference: 's.69',
    titre: 'Severance allowance (indemnité de licenciement)',
    texte:
      "En cas de licenciement injustifié, l'employeur doit verser une severance allowance. Lorsqu'elle est due au taux punitif, elle correspond à 3 mois de rémunération par année de service. L'Industrial Court est compétente pour en connaître.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'wra-prgf',
    domaine: 'travail',
    source: 'WRA 2019',
    reference: 's.86 et s.',
    titre: 'Portable Retirement Gratuity Fund (PRGF)',
    texte:
      "Le PRGF impose des cotisations mensuelles de l'employeur pour financer la gratuité de retraite/fin de service du travailleur, portable d'un emploi à l'autre. À la fin d'emploi, un exit statement et le versement de la gratuité applicable sont requis.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'era-conciliation',
    domaine: 'travail',
    source: 'ERA 2008',
    reference: 'CCM',
    titre: 'Conciliation et médiation des conflits du travail',
    texte:
      "Les conflits du travail peuvent être portés devant la Commission for Conciliation and Mediation (CCM). Les différends collectifs relèvent de l'Employment Relations Tribunal. La conciliation est souvent un préalable utile avant l'Industrial Court.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── CIVIL / CONTRATS — Code Civil ─────────────────────────
  {
    id: 'cc-1134',
    domaine: 'civil',
    source: 'Code Civil',
    reference: 'art.1134',
    titre: 'Force obligatoire des conventions',
    texte:
      "Les conventions légalement formées tiennent lieu de loi à ceux qui les ont faites. Elles ne peuvent être révoquées que de leur consentement mutuel ou pour les causes que la loi autorise, et doivent être exécutées de bonne foi.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'cc-1147',
    domaine: 'civil',
    source: 'Code Civil',
    reference: 'art.1147',
    titre: 'Responsabilité contractuelle — dommages-intérêts',
    texte:
      "Le débiteur est condamné, s'il y a lieu, au paiement de dommages et intérêts à raison de l'inexécution de l'obligation ou du retard, toutes les fois qu'il ne justifie pas que l'inexécution provient d'une cause étrangère qui ne peut lui être imputée.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'cc-1382',
    domaine: 'civil',
    source: 'Code Civil',
    reference: 'art.1382-1383',
    titre: 'Responsabilité délictuelle (faute)',
    texte:
      "Tout fait quelconque de l'homme qui cause à autrui un dommage oblige celui par la faute duquel il est arrivé à le réparer. Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore par sa négligence ou son imprudence.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'cc-1384',
    domaine: 'civil',
    source: 'Code Civil',
    reference: 'art.1384',
    titre: 'Responsabilité du fait d’autrui et des choses',
    texte:
      "On est responsable non seulement du dommage que l'on cause par son propre fait, mais encore de celui causé par le fait des personnes dont on doit répondre (préposés), ou des choses que l'on a sous sa garde. Fondement de la responsabilité de l'employeur pour ses préposés.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'cc-mise-en-demeure',
    domaine: 'civil',
    source: 'Code Civil',
    reference: 'art.1139 / art.1146',
    titre: 'Mise en demeure préalable',
    texte:
      "Le débiteur doit en principe être mis en demeure d'exécuter avant que des dommages-intérêts moratoires ne soient dus. La mise en demeure (sommation ou acte équivalent) constitue le point de départ des intérêts de retard et la première étape d'un recouvrement.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── COMMERCIAL / RECOUVREMENT ─────────────────────────
  {
    id: 'com-prescription',
    domaine: 'commercial',
    source: 'Code de Commerce',
    reference: 'prescription',
    titre: 'Prescription des créances commerciales',
    texte:
      "Les obligations nées à l'occasion du commerce se prescrivent généralement par 5 ans. Le délai court à compter de l'exigibilité. La reconnaissance de dette ou un paiement partiel interrompt la prescription et fait courir un nouveau délai.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'com-juridiction',
    domaine: 'procedure',
    source: 'Courts Act',
    reference: 'compétence',
    titre: 'Compétence selon le montant (recouvrement)',
    texte:
      "La District Court connaît des litiges civils de faible montant (jusqu'à ~250 000 MUR), l'Intermediate Court des montants intermédiaires (jusqu'à ~2 000 000 MUR), et la Supreme Court (Commercial Division) des litiges commerciaux de forte valeur ou complexes. Le choix de la juridiction dépend du quantum réclamé.",
    url: SC,
    maj: '2026-01',
  },
  {
    id: 'insolvency-statutory-demand',
    domaine: 'insolvabilite',
    source: 'Insolvency Act 2009',
    reference: 'statutory demand',
    titre: 'Statutory demand et liquidation pour dette',
    texte:
      "Un créancier d'une société peut, pour une dette certaine non contestée dépassant le seuil légal, signifier une statutory demand. À défaut de paiement dans le délai imparti, la société est présumée insolvable, ouvrant la voie à une demande de winding up (liquidation judiciaire).",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── FISCAL — ITA / VAT / MRA / ARC ─────────────────────────
  {
    id: 'ita-131',
    domaine: 'fiscal',
    source: 'ITA',
    reference: 's.131 / MRA Act',
    titre: 'Objection et recours fiscal (ARC)',
    texte:
      "Un contribuable en désaccord avec une cotisation (notice of assessment) de la MRA doit déposer une objection dans les 28 jours. En cas de rejet (determination), il peut saisir l'Assessment Review Committee (ARC) dans les 28 jours, puis former appel devant la Supreme Court sur point de droit. Les délais sont stricts et de forclusion.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'vat-24',
    domaine: 'fiscal',
    source: 'VAT Act',
    reference: 's.24',
    titre: 'Déclaration et paiement de la TVA',
    texte:
      "La TVA mauricienne est de 15 %. Les assujettis déposent leur déclaration et paient la taxe due au plus tard à la fin du mois (ou 20 du mois pour le dépôt électronique) suivant la période. Les retards entraînent pénalités et intérêts.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'ita-paye',
    domaine: 'fiscal',
    source: 'ITA',
    reference: 's.93 (PAYE)',
    titre: 'PAYE — retenue à la source sur salaires',
    texte:
      "L'employeur retient le PAYE sur les rémunérations et le reverse à la MRA, en principe avant le 20 du mois suivant. Le défaut de versement engage la responsabilité de l'employeur et expose à des pénalités.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── DONNÉES — DPA 2017 ─────────────────────────
  {
    id: 'dpa-breach',
    domaine: 'donnees',
    source: 'DPA 2017',
    reference: 's.25',
    titre: 'Notification de violation de données',
    texte:
      "Le responsable du traitement doit notifier au Data Protection Office toute violation de données personnelles dans les meilleurs délais (within best practice timelines) lorsqu'elle présente un risque pour les droits et libertés des personnes, et informer les personnes concernées le cas échéant.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'dpa-principles',
    domaine: 'donnees',
    source: 'DPA 2017',
    reference: 's.21-23',
    titre: 'Principes et licéité du traitement',
    texte:
      "Le traitement doit être licite, loyal, transparent, limité à des finalités déterminées, minimisé, exact et sécurisé. Le consentement ou une autre base légale est requis. Les droits des personnes (accès, rectification, effacement) doivent être respectés. Aligné sur les principes du RGPD.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── FINANCIER — FSA / FIAMLA / BORA ─────────────────────────
  {
    id: 'fiamla-17',
    domaine: 'financier',
    source: 'FIAMLA',
    reference: 's.17',
    titre: 'Déclaration de transaction suspecte (STR)',
    texte:
      "Toute personne menant des activités relevant des obligations AML/CFT doit déclarer sans délai à la Financial Intelligence Unit (FIU) toute transaction suspecte de blanchiment ou de financement du terrorisme. Le manquement constitue une infraction. Obligations KYC/CDD associées.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'bora-4',
    domaine: 'societes',
    source: 'BORA 2020',
    reference: 's.4',
    titre: 'Déclaration des bénéficiaires effectifs',
    texte:
      "Les sociétés doivent identifier et déclarer leurs bénéficiaires effectifs (ultimate beneficial owners) et tenir le registre à jour, toute modification devant être notifiée dans les délais légaux (14 jours). Le défaut expose à sanctions.",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'fsa-20',
    domaine: 'financier',
    source: 'FSA 2007',
    reference: 's.20-21',
    titre: 'Licences FSC et suspension',
    texte:
      "L'exercice d'une activité de services financiers requiert une licence de la FSC (ex. GBL, Authorised Company). La FSC peut suspendre ou révoquer une licence en cas de manquement. Les licences sont soumises à des exigences de substance et de reporting annuel.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── ARBITRAGE / PROCÉDURE ─────────────────────────
  {
    id: 'iaa-2008',
    domaine: 'arbitrage',
    source: 'IAA 2008',
    reference: 'arbitrage international',
    titre: 'Arbitrage international à Maurice',
    texte:
      "L'International Arbitration Act 2008 fait de Maurice un siège d'arbitrage reconnu (centre MARC). En présence d'une clause compromissoire valable, le litige relève de l'arbitrage et non des tribunaux étatiques. Les sentences sont exécutoires, y compris à l'international (Convention de New York).",
    url: MLII,
    maj: '2026-01',
  },
  {
    id: 'execution-jugement',
    domaine: 'procedure',
    source: 'Code de Procédure Civile',
    reference: 'exécution',
    titre: 'Exécution des jugements',
    texte:
      "Un jugement définitif s'exécute par les voies légales (saisie mobilière, saisie-arrêt sur comptes, saisie immobilière). Le titre exécutoire se prescrit en principe par 10 ans. L'exécution peut nécessiter le concours d'un huissier (usher/bailiff).",
    url: SC,
    maj: '2026-01',
  },

  // ───────────────────────── IMMOBILIER ─────────────────────────
  {
    id: 'lt-act',
    domaine: 'immobilier',
    source: 'L&T Act',
    reference: 'baux',
    titre: 'Baux et litiges locatifs',
    texte:
      "Le Landlord and Tenant Act encadre les baux d'habitation et certains baux commerciaux : fixation/équité du loyer, conditions d'expulsion, droits du locataire. Le Fair Rent Tribunal connaît des litiges relatifs au loyer et à l'occupation.",
    url: MLII,
    maj: '2026-01',
  },

  // ───────────────────────── CONSTITUTIONNEL ─────────────────────────
  {
    id: 'const-17',
    domaine: 'procedure',
    source: 'Constitution',
    reference: 's.17',
    titre: 'Recours constitutionnel',
    texte:
      "Toute personne qui allègue qu'une disposition protégeant les droits fondamentaux a été, est ou risque d'être violée à son égard peut saisir directement la Supreme Court pour redressement. Appel final possible devant le Privy Council.",
    url: SC,
    maj: '2026-01',
  },
]
