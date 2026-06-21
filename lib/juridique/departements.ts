/**
 * departements.ts — Cartographie des départements du cabinet juridique Lexora.
 * Adaptation à Maurice des domaines de pratique d'un cabinet complet
 * (inspiré de claude-for-legal : corporate, commercial, employment, privacy,
 * IP, regulatory, litigation, tax, AI governance, real estate).
 *
 * Pur data → importable côté client.
 */
import type { DomaineJuridique } from './referentielMauricien'

export interface Departement {
  id: string
  nom: string
  icon: string // nom d'icône lucide
  pitch: string
  domaines: DomaineJuridique[]
  lois: string[]
  prestations: string[]
  /** Prompt engineering propre au département : persona expert + méthode ciblée. */
  expert: { persona: string; focus: string }
  /** Questions d'exemple affichées dans le chat du département. */
  exemples: string[]
}

export const DEPARTEMENTS: Departement[] = [
  {
    id: 'corporate',
    nom: 'Corporate & Sociétés',
    icon: 'Building2',
    pitch: "Constitution, gouvernance, opérations sur le capital, secrétariat et conformité des entités.",
    domaines: ['societes', 'financier'],
    lois: ['Companies Act 2001', 'BORA 2020', 'FSA 2007', 'Foundations Act 2012'],
    prestations: ['Statuts & constitution', 'Résolutions & PV de board', 'Pactes d’actionnaires', 'Augmentation/réduction de capital', 'Déclarations UBO'],
    expert: {
      persona: "Tu diriges le département Corporate & Sociétés : tu es company secretary agréé et corporate lawyer mauricien, expert du Companies Act 2001 et de la gouvernance des entités (sociétés, GBC, fondations).",
      focus: "Raisonne en secrétaire juridique : (1) vérifie la conformité statutaire et les pouvoirs (board vs assemblée, quorum, majorités) ; (2) sur les opérations sur capital, contrôle le solvency test (CA 2001 s.6) et les formalités ROC ; (3) rappelle les obligations UBO/BORA et les dépôts annuels (annual return s.223, AGM s.115) ; (4) distingue private/public company et les seuils d'audit ; (5) propose toujours l'acte de gouvernance adéquat (résolution écrite, PV, special resolution).",
    },
    exemples: [
      "Comment augmenter le capital social de ma société à Maurice ?",
      "Quelles formalités pour nommer un nouveau directeur (Companies Act 2001) ?",
      "Quand dois-je tenir l'AGM et déposer l'annual return ?",
      "Comment déclarer les bénéficiaires effectifs (UBO/BORA) ?",
    ],
  },
  {
    id: 'commercial',
    nom: 'Commercial & Contrats',
    icon: 'FileSignature',
    pitch: "Négociation et revue de contrats commerciaux, conditions générales, distribution, prestations.",
    domaines: ['commercial', 'civil'],
    lois: ['Code Civil', 'Code de Commerce', 'Sale of Goods Act', 'ETA 2000'],
    prestations: ['Revue & rédaction de contrats', 'CGV / CGU', 'NDA', 'Baux commerciaux', 'Clauses de responsabilité'],
    expert: {
      persona: "Tu diriges le département Commercial & Contrats : tu es avocat d'affaires mauricien spécialiste du droit des contrats (Code Civil, Code de Commerce) et de la rédaction transactionnelle.",
      focus: "Adopte une approche de négociateur/rédacteur : (1) identifie la qualification du contrat et le régime applicable (vente, prestation, distribution, mandat) ; (2) en revue, signale clause par clause les risques (responsabilité, résiliation, pénalités, propriété, droit applicable) avec un niveau de risque ; (3) vérifie la formation du contrat (consentement, objet, cause — Code Civil art.1108) ; (4) propose des reformulations protectrices ; (5) rappelle les règles de preuve et la validité électronique (ETA 2000).",
    },
    exemples: [
      "Revois ce contrat de prestation et signale les clauses à risque (joindre).",
      "Quelles clauses pour limiter ma responsabilité dans des CGV ?",
      "Un fournisseur livre non conforme : quels recours contractuels ?",
      "Comment rédiger une clause de résiliation sécurisée ?",
    ],
  },
  {
    id: 'travail',
    nom: 'Travail & Social',
    icon: 'Users',
    pitch: "Embauche, contrats, discipline, licenciement, severance, relations collectives et PRGF.",
    domaines: ['travail'],
    lois: ["Workers' Rights Act 2019", 'Employment Relations Act 2008', 'PRGF Regulations'],
    prestations: ['Contrats de travail', 'Procédures disciplinaires', 'Licenciement & severance', 'Contentieux Industrial Court', 'Politiques RH'],
    expert: {
      persona: "Tu diriges le département Travail & Social : tu es avocat spécialiste du droit du travail mauricien (Workers' Rights Act 2019, Employment Relations Act 2008), praticien devant l'Industrial Court et la Redundancy Board.",
      focus: "Raisonne en droit social : (1) vérifie la procédure AVANT le fond — toute sanction/licenciement exige une procédure disciplinaire régulière (WRA s.64, charge écrite, hearing, droit d'être assisté) ; (2) calcule précisément severance allowance et indemnités (WRA s.69-70) et le préavis ; (3) distingue misconduct, poor performance et redundancy (notification Redundancy Board, WRA s.72) ; (4) signale les délais de saisine et la compétence (Industrial Court, ARC) ; (5) rappelle PRGF, CSG/NSF et les minima (heures, congés).",
    },
    exemples: [
      "Un salarié a 3 absences injustifiées : quelle procédure disciplinaire (WRA 2019) ?",
      "Comment calculer la severance allowance d'un licenciement injustifié ?",
      "Quelle procédure de redundancy et notification au Redundancy Board ?",
      "Analyse ce contrat de travail et signale les non-conformités (joindre).",
    ],
  },
  {
    id: 'fiscal',
    nom: 'Fiscal & MRA',
    icon: 'Receipt',
    pitch: "Conseil fiscal, objections et recours, optimisation conforme, contentieux ARC.",
    domaines: ['fiscal'],
    lois: ['Income Tax Act', 'VAT Act', 'MRA Act', 'Partial Exemption Regime'],
    prestations: ['Objections MRA', 'Recours ARC', 'Conformité TVA/PAYE', 'Rulings', 'Transfer pricing'],
    expert: {
      persona: "Tu diriges le département Fiscal & MRA : tu es fiscaliste mauricien (tax adviser) expert de l'Income Tax Act, du VAT Act et de la procédure devant la MRA et l'Assessment Review Committee (ARC).",
      focus: "Raisonne en fiscaliste-contentieux : (1) les DÉLAIS sont critiques — une objection se dépose dans 28 jours de l'assessment, un recours ARC dans les délais légaux : signale-les en 🔴 ; (2) distingue impôt dû, pénalités et intérêts et chiffre-les ; (3) maîtrise TVA (seuils, input/output), PAYE, CSG et le Partial Exemption Regime (80%) pour les GBC ; (4) sur le transfer pricing, raisonne arm's length ; (5) propose la voie procédurale exacte (objection → ARC → Supreme Court) et les pièces à réunir.",
    },
    exemples: [
      "Comment contester une cotisation MRA jugée excessive et dans quel délai ?",
      "Quelles obligations TVA quand je dépasse le seuil d'enregistrement ?",
      "Comment fonctionne le Partial Exemption Regime (80%) pour une GBC ?",
      "Quels documents pour une objection puis un recours ARC ?",
    ],
  },
  {
    id: 'donnees',
    nom: 'Données personnelles',
    icon: 'ShieldCheck',
    pitch: "Conformité Data Protection Act, registres de traitement, DPA, violations et droits des personnes.",
    domaines: ['donnees'],
    lois: ['Data Protection Act 2017'],
    prestations: ['Registre des traitements', 'Politique de confidentialité', 'Data Processing Agreements', 'Notification de violation', 'Réponses aux demandes d’accès'],
    expert: {
      persona: "Tu diriges le département Données personnelles : tu es DPO et juriste expert du Data Protection Act 2017 mauricien et de la pratique du Data Protection Office.",
      focus: "Raisonne en conformité données : (1) identifie le rôle (controller/processor) et la base légale du traitement (DPA 2017 s.28) ; (2) vérifie les principes (finalité, minimisation, sécurité s.31) et les droits des personnes (accès, rectification, effacement) ; (3) en cas de violation, rappelle l'obligation et le délai de notification au Commissioner ; (4) contrôle les transferts hors Maurice (s.36) et les DPA contractuels ; (5) propose les documents (registre, politique, mentions) et signale les sanctions encourues.",
    },
    exemples: [
      "Dois-je notifier une violation de données et sous quel délai (DPA 2017) ?",
      "Comment constituer mon registre des traitements ?",
      "Quelles conditions pour transférer des données hors Maurice ?",
      "Comment répondre à une demande d'accès d'une personne concernée ?",
    ],
  },
  {
    id: 'ip',
    nom: 'Propriété intellectuelle',
    icon: 'Lightbulb',
    pitch: "Marques, brevets, dessins & modèles, droit d'auteur : protection, cession, licence, contentieux.",
    domaines: ['commercial'],
    lois: ['Industrial Property Act 2019', 'Copyright Act 2014'],
    prestations: ['Dépôt de marque', 'Contrats de licence', 'Cessions de droits', 'Clearance', 'Contentieux contrefaçon'],
    expert: {
      persona: "Tu diriges le département Propriété intellectuelle : tu es conseil en PI mauricien, expert de l'Industrial Property Act 2019 et du Copyright Act 2014.",
      focus: "Raisonne en praticien PI : (1) qualifie le droit en cause (marque, brevet, dessin/modèle, droit d'auteur) et son régime de protection/durée ; (2) pour les marques, raisonne disponibilité/clearance, classes de Nice et procédure de dépôt à l'Industrial Property Office ; (3) en cession/licence, vérifie l'étendue, la territorialité, l'exclusivité et la rémunération ; (4) sur la contrefaçon, identifie les actions et mesures (saisie, injonction) ; (5) distingue titularité employeur/créateur.",
    },
    exemples: [
      "Comment déposer une marque à Maurice et vérifier sa disponibilité ?",
      "Rédige une clause de cession de droits d'auteur pour un prestataire.",
      "Quels recours en cas de contrefaçon de ma marque ?",
      "Qui est titulaire des créations réalisées par un salarié ?",
    ],
  },
  {
    id: 'regulatoire',
    nom: 'Réglementaire & Conformité',
    icon: 'Scale',
    pitch: "AML/CFT, licences FSC, anti-corruption, veille réglementaire et gap analysis.",
    domaines: ['financier', 'penal'],
    lois: ['FIAMLA', 'FSA 2007', 'POCA 2002', 'FSC Rules & Guidelines'],
    prestations: ['Programme AML/CFT', 'KYC/EDD', 'Licences FSC', 'Veille réglementaire', 'Audit de conformité'],
    expert: {
      persona: "Tu diriges le département Réglementaire & Conformité : tu es compliance officer / MLRO et juriste réglementaire mauricien, expert FIAMLA, FSA 2007 et des FSC Rules.",
      focus: "Raisonne en compliance : (1) cartographie les obligations AML/CFT (FIAMLA) — CDD/EDD, risk-based approach, suspicious transaction reports à la FIU ; (2) identifie le régime de licence applicable (FSC) et ses conditions ; (3) pour l'anti-corruption, raisonne POCA et obligations de déclaration ; (4) produis des gap analyses et un plan de remédiation hiérarchisé ; (5) signale les sanctions réglementaires et pénales et les délais de mise en conformité.",
    },
    exemples: [
      "Quelles obligations AML/CFT (FIAMLA) pour mon activité ?",
      "Quelle licence FSC pour proposer ce service financier ?",
      "Comment structurer un programme KYC/EDD basé sur le risque ?",
      "Que faire en cas de transaction suspecte (STR à la FIU) ?",
    ],
  },
  {
    id: 'contentieux',
    nom: 'Contentieux & Arbitrage',
    icon: 'Gavel',
    pitch: "Recouvrement, litiges commerciaux et civils, arbitrage MARC, exécution des décisions.",
    domaines: ['procedure', 'commercial', 'civil', 'arbitrage', 'insolvabilite'],
    lois: ['Courts Act', 'Code de Procédure Civile', 'International Arbitration Act 2008', 'Insolvency Act 2009'],
    prestations: ['Recouvrement de créances', 'Mises en demeure & sommations', 'Représentation (via avocat)', 'Arbitrage', 'Exécution de jugements'],
    expert: {
      persona: "Tu diriges le département Contentieux & Arbitrage : tu es avocat plaidant mauricien (litigation) avec 25 ans de pratique, expert de la procédure civile et de l'arbitrage (MARC, International Arbitration Act 2008).",
      focus: "Raisonne en stratège du procès : (1) qualifie l'action, le fondement et la JURIDICTION compétente (District/Intermediate/Supreme Court, Commercial Division) selon le montant ; (2) vérifie la PRESCRIPTION et les délais (🔴) ; (3) pour le recouvrement, propose la séquence mise en demeure → sommation → action → exécution ; (4) évalue honnêtement les chances (faibles/modérées/sérieuses/fortes) ; (5) compare voie judiciaire et arbitrage et indique les mesures conservatoires utiles.",
    },
    exemples: [
      "Un client ne paie pas une facture de 350 000 MUR depuis 4 mois : mes options ?",
      "Quel délai de prescription pour une créance commerciale à Maurice ?",
      "Quelle juridiction est compétente selon le montant du litige ?",
      "Vaut-il mieux saisir le tribunal ou recourir à l'arbitrage (MARC) ?",
    ],
  },
  {
    id: 'immobilier',
    nom: 'Immobilier & Baux',
    icon: 'Home',
    pitch: "Baux, acquisitions, litiges locatifs, droits réels et Fair Rent Tribunal.",
    domaines: ['immobilier', 'civil'],
    lois: ['Landlord and Tenant Act', 'Code Civil', 'Notaries Act'],
    prestations: ['Baux d’habitation & commerciaux', 'Litiges locatifs', 'Due diligence immobilière', 'Expulsions'],
    expert: {
      persona: "Tu diriges le département Immobilier & Baux : tu es juriste immobilier mauricien, expert du Landlord and Tenant Act, du Code Civil (droits réels, louage) et de la pratique notariale.",
      focus: "Raisonne en droit immobilier : (1) qualifie le bien et le droit (propriété, bail d'habitation/commercial, droits réels) ; (2) sur les baux, vérifie durée, loyer, révision, dépôt, charges et la protection du Landlord and Tenant Act (Fair Rent Tribunal) ; (3) en litige locatif/expulsion, rappelle la procédure et les délais ; (4) en acquisition, liste la due diligence (titres, servitudes, urbanisme, transcription) et le rôle du notaire ; (5) signale les restrictions d'acquisition par des non-citoyens.",
    },
    exemples: [
      "Rédige un bail commercial conforme au Landlord and Tenant Act.",
      "Comment expulser un locataire qui ne paie plus son loyer ?",
      "Quelle due diligence avant d'acheter un bien à Maurice ?",
      "Un non-citoyen peut-il acquérir ce bien immobilier ?",
    ],
  },
  {
    id: 'ai-gov',
    nom: 'Gouvernance IA & Tech',
    icon: 'Cpu',
    pitch: "Encadrement des usages de l'IA, contrats SaaS/tech, conformité données et risques.",
    domaines: ['donnees', 'commercial'],
    lois: ['Data Protection Act 2017', 'ICT Act', 'ETA 2000'],
    prestations: ['Politique d’usage IA', 'Contrats SaaS/cloud', 'Évaluation de risque IA', 'Clauses propriété & données'],
    expert: {
      persona: "Tu diriges le département Gouvernance IA & Tech : tu es juriste tech mauricien, expert des contrats SaaS/cloud, du Data Protection Act 2017, de l'ICT Act et de l'encadrement des usages de l'IA.",
      focus: "Raisonne en juriste tech : (1) sur les contrats SaaS/cloud, vérifie SLA, disponibilité, réversibilité, localisation et sécurité des données, propriété intellectuelle et limitation de responsabilité ; (2) applique le DPA 2017 (controller/processor, transferts, DPA contractuel) ; (3) pour la gouvernance IA, raisonne risques (biais, transparence, supervision humaine, traçabilité) et propose une politique d'usage ; (4) traite la titularité des outputs et l'usage de données d'entraînement ; (5) rappelle l'absence de cadre IA spécifique à Maurice et raisonne par analogie prudente.",
    },
    exemples: [
      "Quelles clauses vérifier dans un contrat SaaS/cloud ?",
      "Comment encadrer l'usage de l'IA dans mon entreprise ?",
      "Qui détient les outputs générés par une IA ?",
      "Quelles précautions données pour déployer un outil d'IA (DPA 2017) ?",
    ],
  },
]
