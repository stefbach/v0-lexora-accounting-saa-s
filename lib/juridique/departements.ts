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
  },
  {
    id: 'commercial',
    nom: 'Commercial & Contrats',
    icon: 'FileSignature',
    pitch: "Négociation et revue de contrats commerciaux, conditions générales, distribution, prestations.",
    domaines: ['commercial', 'civil'],
    lois: ['Code Civil', 'Code de Commerce', 'Sale of Goods Act', 'ETA 2000'],
    prestations: ['Revue & rédaction de contrats', 'CGV / CGU', 'NDA', 'Baux commerciaux', 'Clauses de responsabilité'],
  },
  {
    id: 'travail',
    nom: 'Travail & Social',
    icon: 'Users',
    pitch: "Embauche, contrats, discipline, licenciement, severance, relations collectives et PRGF.",
    domaines: ['travail'],
    lois: ["Workers' Rights Act 2019", 'Employment Relations Act 2008', 'PRGF Regulations'],
    prestations: ['Contrats de travail', 'Procédures disciplinaires', 'Licenciement & severance', 'Contentieux Industrial Court', 'Politiques RH'],
  },
  {
    id: 'fiscal',
    nom: 'Fiscal & MRA',
    icon: 'Receipt',
    pitch: "Conseil fiscal, objections et recours, optimisation conforme, contentieux ARC.",
    domaines: ['fiscal'],
    lois: ['Income Tax Act', 'VAT Act', 'MRA Act', 'Partial Exemption Regime'],
    prestations: ['Objections MRA', 'Recours ARC', 'Conformité TVA/PAYE', 'Rulings', 'Transfer pricing'],
  },
  {
    id: 'donnees',
    nom: 'Données personnelles',
    icon: 'ShieldCheck',
    pitch: "Conformité Data Protection Act, registres de traitement, DPA, violations et droits des personnes.",
    domaines: ['donnees'],
    lois: ['Data Protection Act 2017'],
    prestations: ['Registre des traitements', 'Politique de confidentialité', 'Data Processing Agreements', 'Notification de violation', 'Réponses aux demandes d’accès'],
  },
  {
    id: 'ip',
    nom: 'Propriété intellectuelle',
    icon: 'Lightbulb',
    pitch: "Marques, brevets, dessins & modèles, droit d'auteur : protection, cession, licence, contentieux.",
    domaines: ['commercial'],
    lois: ['Industrial Property Act 2019', 'Copyright Act 2014'],
    prestations: ['Dépôt de marque', 'Contrats de licence', 'Cessions de droits', 'Clearance', 'Contentieux contrefaçon'],
  },
  {
    id: 'regulatoire',
    nom: 'Réglementaire & Conformité',
    icon: 'Scale',
    pitch: "AML/CFT, licences FSC, anti-corruption, veille réglementaire et gap analysis.",
    domaines: ['financier', 'penal'],
    lois: ['FIAMLA', 'FSA 2007', 'POCA 2002', 'FSC Rules & Guidelines'],
    prestations: ['Programme AML/CFT', 'KYC/EDD', 'Licences FSC', 'Veille réglementaire', 'Audit de conformité'],
  },
  {
    id: 'contentieux',
    nom: 'Contentieux & Arbitrage',
    icon: 'Gavel',
    pitch: "Recouvrement, litiges commerciaux et civils, arbitrage MARC, exécution des décisions.",
    domaines: ['procedure', 'commercial', 'civil', 'arbitrage', 'insolvabilite'],
    lois: ['Courts Act', 'Code de Procédure Civile', 'International Arbitration Act 2008', 'Insolvency Act 2009'],
    prestations: ['Recouvrement de créances', 'Mises en demeure & sommations', 'Représentation (via avocat)', 'Arbitrage', 'Exécution de jugements'],
  },
  {
    id: 'immobilier',
    nom: 'Immobilier & Baux',
    icon: 'Home',
    pitch: "Baux, acquisitions, litiges locatifs, droits réels et Fair Rent Tribunal.",
    domaines: ['immobilier', 'civil'],
    lois: ['Landlord and Tenant Act', 'Code Civil', 'Notaries Act'],
    prestations: ['Baux d’habitation & commerciaux', 'Litiges locatifs', 'Due diligence immobilière', 'Expulsions'],
  },
  {
    id: 'ai-gov',
    nom: 'Gouvernance IA & Tech',
    icon: 'Cpu',
    pitch: "Encadrement des usages de l'IA, contrats SaaS/tech, conformité données et risques.",
    domaines: ['donnees', 'commercial'],
    lois: ['Data Protection Act 2017', 'ICT Act', 'ETA 2000'],
    prestations: ['Politique d’usage IA', 'Contrats SaaS/cloud', 'Évaluation de risque IA', 'Clauses propriété & données'],
  },
]
