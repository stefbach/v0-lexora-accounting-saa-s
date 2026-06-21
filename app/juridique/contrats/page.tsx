"use client"

import React, { useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  FileText, Users, Settings, Download, Copy, CheckCircle, Lock, AlertCircle, Loader2,
  Shield, Scale, Save, FileSignature, ArrowLeft, Briefcase, FileLock2, Cloud, Wrench, Handshake, Building2, Send,
  GraduationCap, ShoppingCart, Truck, Landmark, Banknote, Home, Search,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/* ─────────────────────────  MODÈLES  ───────────────────────── */

type ContractTypeId =
  | 'CDI' | 'CDD' | 'CDD_partiel' | 'stage'
  | 'prestataire' | 'client_saas' | 'client_service' | 'nda' | 'vente' | 'distribution' | 'agence' | 'sous_traitance' | 'cgv' | 'partenariat'
  | 'cession_actions' | 'pacte_actionnaires' | 'pret' | 'reconnaissance_dette'
  | 'bail_commercial' | 'bail_habitation' | 'promesse_vente'

type ContractFamily = 'Emploi' | 'Affaires' | 'Société' | 'Immobilier' | 'Finance'

interface Template {
  id: ContractTypeId
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  desc: string
  law: string
  family: ContractFamily
}

const TEMPLATES: Template[] = [
  // Emploi
  { id: 'CDI', label: 'Contrat de travail — CDI', icon: Briefcase, desc: "Engagement à durée indéterminée. Période d'essai, préavis, congés, cotisations sociales.", law: 'WRA 2019 s.11', family: 'Emploi' },
  { id: 'CDD', label: 'Contrat de travail — CDD', icon: Briefcase, desc: "Durée déterminée avec terme et conditions de renouvellement.", law: 'WRA 2019 s.12', family: 'Emploi' },
  { id: 'CDD_partiel', label: 'Travail à temps partiel', icon: Briefcase, desc: "Emploi à temps partiel : horaires réduits, droits au prorata.", law: 'WRA 2019 s.35', family: 'Emploi' },
  { id: 'stage', label: 'Convention de stage', icon: GraduationCap, desc: "Stage / internship : objet pédagogique, gratification, durée, encadrement.", law: 'WRA 2019', family: 'Emploi' },
  // Affaires
  { id: 'prestataire', label: 'Prestataire / Consultant', icon: Wrench, desc: "Mission indépendante, sans lien de subordination. Facturation, livrables, responsabilité.", law: 'Contract Act', family: 'Affaires' },
  { id: 'client_saas', label: 'Client SaaS / Abonnement', icon: Cloud, desc: "Abonnement logiciel : périmètre, disponibilité, données, résiliation.", law: 'ICT Act · DPA 2017', family: 'Affaires' },
  { id: 'client_service', label: 'Prestation de services', icon: Handshake, desc: "Prestation ponctuelle : objet, prix, délais, garanties.", law: 'Contract Act', family: 'Affaires' },
  { id: 'nda', label: 'NDA / Confidentialité', icon: FileLock2, desc: "Accord de non-divulgation : informations protégées, durée, sanctions.", law: 'DPA 2017', family: 'Affaires' },
  { id: 'vente', label: 'Contrat de vente', icon: ShoppingCart, desc: "Vente de biens : objet, prix, livraison, transfert de propriété, garanties.", law: 'Sale of Goods Act', family: 'Affaires' },
  { id: 'distribution', label: 'Contrat de distribution', icon: Truck, desc: "Distribution / revente : territoire, exclusivité, objectifs, résiliation.", law: 'Code de Commerce', family: 'Affaires' },
  { id: 'agence', label: 'Agence commerciale', icon: Handshake, desc: "Mandat d'agent commercial : commissions, territoire, indemnité de fin.", law: 'Code de Commerce', family: 'Affaires' },
  { id: 'sous_traitance', label: 'Sous-traitance', icon: Wrench, desc: "Sous-traitance : périmètre, qualité, responsabilité, confidentialité.", law: 'Contract Act', family: 'Affaires' },
  { id: 'cgv', label: 'Conditions générales (CGV)', icon: FileText, desc: "Conditions générales de vente / prestation : prix, paiement, responsabilité.", law: 'Code Civil · ETA 2000', family: 'Affaires' },
  { id: 'partenariat', label: 'Accord de partenariat', icon: Handshake, desc: "Partenariat / coentreprise : objet commun, apports, gouvernance, partage.", law: 'Code Civil · CA 2001', family: 'Affaires' },
  // Société
  { id: 'cession_actions', label: 'Cession d’actions / parts', icon: Landmark, desc: "Transfert d'actions ou de parts : prix, garanties, conditions, formalités ROC.", law: 'Companies Act 2001', family: 'Société' },
  { id: 'pacte_actionnaires', label: 'Pacte d’actionnaires', icon: Users, desc: "Relations entre associés : gouvernance, transferts, sortie, préemption.", law: 'Companies Act 2001', family: 'Société' },
  // Finance
  { id: 'pret', label: 'Contrat de prêt', icon: Banknote, desc: "Prêt d'argent : montant, intérêts, échéancier, garanties, remboursement.", law: 'Code Civil', family: 'Finance' },
  { id: 'reconnaissance_dette', label: 'Reconnaissance de dette', icon: Banknote, desc: "Reconnaissance de dette : montant dû, échéance, intérêts éventuels.", law: 'Code Civil art.1326', family: 'Finance' },
  // Immobilier
  { id: 'bail_commercial', label: 'Bail commercial', icon: Building2, desc: "Location de locaux commerciaux : loyer, durée, charges, dépôt, destination.", law: 'Code Civil · L&T Act', family: 'Immobilier' },
  { id: 'bail_habitation', label: 'Bail d’habitation', icon: Home, desc: "Location à usage d'habitation : loyer, durée, dépôt, état des lieux.", law: 'Landlord & Tenant Act', family: 'Immobilier' },
  { id: 'promesse_vente', label: 'Promesse de vente immobilière', icon: Home, desc: "Promesse / compromis : bien, prix, conditions suspensives, acompte, notaire.", law: 'Code Civil · Notaries Act', family: 'Immobilier' },
]

const LANGUAGES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
  { id: 'fr_en', label: 'Bilingue FR/EN' },
]

const JURISDICTIONS = [
  { id: 'mu', label: 'Maurice — droit mauricien' },
  { id: 'mu_fr', label: 'Maurice — droit français applicable' },
  { id: 'cv', label: 'Cabo Verde' },
]

/* Clauses standard incluses automatiquement, par type de contrat. */
const STANDARD_CLAUSES: Record<ContractTypeId, { label: string; ref?: string }[]> = {
  CDI: [
    { label: 'Identification des parties', ref: 'WRA s.11' },
    { label: 'Poste, fonctions et lieu de travail' },
    { label: 'Rémunération et modalités de paiement', ref: 'WRA s.24' },
    { label: 'Durée du travail (45h/sem max)', ref: 'WRA s.36' },
    { label: 'Congés annuels (20 jours min)', ref: 'WRA s.47' },
    { label: 'Congés maladie', ref: 'WRA s.49' },
    { label: 'Cotisations sociales CSG / NSF' },
    { label: 'Retenue PAYE à la source', ref: 'ITA 1995' },
    { label: 'Préavis et conditions de rupture', ref: 'WRA s.38-40' },
  ],
  CDD: [
    { label: 'Identification des parties', ref: 'WRA s.11' },
    { label: 'Terme et renouvellement du CDD', ref: 'WRA s.12' },
    { label: 'Rémunération et paiement', ref: 'WRA s.24' },
    { label: 'Durée du travail', ref: 'WRA s.36' },
    { label: 'Congés (prorata)', ref: 'WRA s.47' },
    { label: 'Cotisations sociales CSG / NSF' },
    { label: 'Retenue PAYE', ref: 'ITA 1995' },
    { label: 'Conditions de rupture anticipée', ref: 'WRA s.38-40' },
  ],
  CDD_partiel: [
    { label: 'Identification des parties', ref: 'WRA s.11' },
    { label: 'Temps partiel et horaires', ref: 'WRA s.35' },
    { label: 'Rémunération au prorata', ref: 'WRA s.24' },
    { label: 'Congés au prorata', ref: 'WRA s.47' },
    { label: 'Cotisations sociales CSG / NSF' },
    { label: 'Préavis et rupture', ref: 'WRA s.38-40' },
  ],
  prestataire: [
    { label: 'Identification des parties' },
    { label: 'Objet de la mission et livrables' },
    { label: 'Rémunération et facturation' },
    { label: 'Indépendance — absence de lien de subordination' },
    { label: 'Durée et résiliation' },
    { label: 'Responsabilité et assurance' },
    { label: 'Loi applicable et juridiction' },
  ],
  client_saas: [
    { label: 'Identification des parties' },
    { label: 'Objet et périmètre du service' },
    { label: 'Abonnement, prix et facturation' },
    { label: 'Disponibilité et maintenance' },
    { label: 'Protection des données', ref: 'DPA 2017' },
    { label: 'Responsabilité et limitation' },
    { label: 'Durée, suspension et résiliation' },
  ],
  client_service: [
    { label: 'Identification des parties' },
    { label: 'Objet de la prestation' },
    { label: 'Prix et modalités de paiement' },
    { label: "Délais d'exécution" },
    { label: 'Responsabilité et garanties' },
    { label: 'Résiliation' },
    { label: 'Loi applicable et juridiction' },
  ],
  nda: [
    { label: 'Identification des parties' },
    { label: 'Définition des informations confidentielles' },
    { label: 'Obligations de confidentialité' },
    { label: "Durée de l'engagement" },
    { label: 'Exclusions' },
    { label: 'Sanctions en cas de violation' },
  ],
  bail_commercial: [
    { label: 'Identification du bailleur et du preneur' },
    { label: 'Désignation et destination des locaux' },
    { label: 'Durée du bail et renouvellement' },
    { label: 'Loyer, révision et modalités de paiement' },
    { label: 'Dépôt de garantie' },
    { label: 'Charges, taxes et entretien' },
    { label: 'Obligations des parties et état des lieux' },
    { label: 'Résiliation et clause résolutoire' },
    { label: 'Loi applicable et juridiction' },
  ],
  stage: [
    { label: 'Identification de l’entreprise et du stagiaire' },
    { label: 'Objet et objectifs pédagogiques du stage' },
    { label: 'Durée, horaires et lieu' },
    { label: 'Gratification / indemnité de stage' },
    { label: 'Encadrement (tuteur) et évaluation' },
    { label: 'Confidentialité et propriété des travaux' },
    { label: 'Conditions de fin et de rupture' },
  ],
  vente: [
    { label: 'Identification du vendeur et de l’acheteur' },
    { label: 'Désignation des biens vendus' },
    { label: 'Prix et modalités de paiement' },
    { label: 'Livraison et transfert de propriété', ref: 'Sale of Goods Act' },
    { label: 'Garanties et conformité' },
    { label: 'Transfert des risques' },
    { label: 'Résolution et loi applicable' },
  ],
  distribution: [
    { label: 'Identification des parties' },
    { label: 'Produits et territoire concédés' },
    { label: 'Exclusivité ou non-exclusivité' },
    { label: 'Objectifs et conditions commerciales' },
    { label: 'Durée, renouvellement et résiliation' },
    { label: 'Responsabilité et propriété de marque' },
    { label: 'Loi applicable et juridiction' },
  ],
  agence: [
    { label: 'Identification du mandant et de l’agent' },
    { label: 'Mission et pouvoirs de l’agent' },
    { label: 'Territoire et clientèle' },
    { label: 'Commissions et modalités de paiement' },
    { label: 'Durée et résiliation' },
    { label: 'Indemnité de fin de contrat' },
    { label: 'Non-concurrence et loi applicable' },
  ],
  sous_traitance: [
    { label: 'Identification du donneur d’ordre et du sous-traitant' },
    { label: 'Périmètre des prestations sous-traitées' },
    { label: 'Cahier des charges et niveau de qualité' },
    { label: 'Prix, facturation et délais' },
    { label: 'Responsabilité et assurance' },
    { label: 'Confidentialité et propriété intellectuelle' },
    { label: 'Résiliation et loi applicable' },
  ],
  cgv: [
    { label: 'Champ d’application et acceptation' },
    { label: 'Description des produits / services' },
    { label: 'Prix, commande et paiement' },
    { label: 'Livraison / exécution et délais' },
    { label: 'Rétractation, retours et garanties' },
    { label: 'Responsabilité et force majeure' },
    { label: 'Données personnelles', ref: 'DPA 2017' },
    { label: 'Loi applicable et règlement des litiges' },
  ],
  partenariat: [
    { label: 'Identification des partenaires' },
    { label: 'Objet et périmètre du partenariat' },
    { label: 'Apports et contributions de chaque partie' },
    { label: 'Gouvernance et prise de décision' },
    { label: 'Partage des résultats / revenus' },
    { label: 'Propriété intellectuelle et confidentialité' },
    { label: 'Durée, sortie et résiliation' },
  ],
  cession_actions: [
    { label: 'Identification du cédant et du cessionnaire' },
    { label: 'Désignation des actions / parts cédées', ref: 'CA 2001' },
    { label: 'Prix et modalités de paiement' },
    { label: 'Déclarations et garanties du cédant' },
    { label: 'Conditions suspensives (agrément, préemption)' },
    { label: 'Transfert et formalités (registre, ROC)' },
    { label: 'Loi applicable et juridiction' },
  ],
  pacte_actionnaires: [
    { label: 'Identification des associés' },
    { label: 'Gouvernance et droits de vote' },
    { label: 'Clauses de transfert (préemption, agrément)' },
    { label: 'Clauses de sortie (tag along / drag along)' },
    { label: 'Information et reporting' },
    { label: 'Non-concurrence et confidentialité' },
    { label: 'Durée et résolution des différends' },
  ],
  pret: [
    { label: 'Identification du prêteur et de l’emprunteur' },
    { label: 'Montant et mise à disposition des fonds' },
    { label: 'Intérêts et taux applicable' },
    { label: 'Échéancier de remboursement' },
    { label: 'Garanties / sûretés' },
    { label: 'Défaut, exigibilité anticipée et pénalités' },
    { label: 'Loi applicable' },
  ],
  reconnaissance_dette: [
    { label: 'Identification du débiteur et du créancier' },
    { label: 'Montant de la dette reconnue', ref: 'Code Civil art.1326' },
    { label: 'Cause de la dette' },
    { label: 'Échéance de remboursement' },
    { label: 'Intérêts éventuels' },
    { label: 'Mention manuscrite du montant en lettres et chiffres' },
  ],
  bail_habitation: [
    { label: 'Identification du bailleur et du locataire' },
    { label: 'Désignation du logement' },
    { label: 'Durée du bail' },
    { label: 'Loyer et modalités de paiement' },
    { label: 'Dépôt de garantie' },
    { label: 'État des lieux d’entrée et de sortie' },
    { label: 'Obligations des parties et réparations' },
    { label: 'Résiliation', ref: 'Landlord & Tenant Act' },
  ],
  promesse_vente: [
    { label: 'Identification du promettant et du bénéficiaire' },
    { label: 'Désignation du bien immobilier' },
    { label: 'Prix de vente convenu' },
    { label: 'Conditions suspensives (financement, titres)' },
    { label: 'Acompte / indemnité d’immobilisation' },
    { label: 'Délai de réalisation et passage chez le notaire', ref: 'Notaries Act' },
    { label: 'Défaillance et loi applicable' },
  ],
}

/* Options avancées activables (interrupteurs), filtrées par type. */
const ADVANCED_OPTIONS: { id: string; label: string; ref?: string; types: ContractTypeId[]; defaultOn?: boolean }[] = [
  { id: 'propriete_intellectuelle', label: 'Propriété intellectuelle / cession de droits', ref: 'Copyright Act', types: ['CDI', 'CDD', 'prestataire', 'client_saas', 'client_service'], defaultOn: true },
  { id: 'protection_donnees', label: 'Protection des données personnelles', ref: 'DPA 2017', types: ['CDI', 'CDD', 'prestataire', 'client_saas', 'client_service', 'nda'], defaultOn: true },
  { id: 'non_concurrence', label: 'Non-concurrence', ref: 'WRA s.50', types: ['CDI', 'CDD', 'prestataire'] },
  { id: 'teletravail', label: 'Télétravail / travail à distance', types: ['CDI', 'CDD', 'CDD_partiel'] },
  { id: 'mobilite', label: 'Clause de mobilité', types: ['CDI', 'CDD'] },
  { id: 'exclusivite', label: "Exclusivité", types: ['CDI', 'prestataire', 'client_saas'] },
  { id: 'sla', label: 'Niveaux de service (SLA)', types: ['client_saas', 'client_service'] },
  { id: 'penalites', label: 'Pénalités de retard', types: ['prestataire', 'client_service'] },
  { id: 'force_majeure', label: 'Force majeure', types: ['prestataire', 'client_saas', 'client_service', 'nda', 'bail_commercial', 'vente', 'distribution', 'agence', 'sous_traitance', 'cgv', 'partenariat'] },
  { id: 'revision_loyer', label: 'Révision / indexation du loyer', types: ['bail_commercial', 'bail_habitation'], defaultOn: true },
  { id: 'depot_garantie', label: 'Dépôt de garantie', types: ['bail_commercial', 'bail_habitation'], defaultOn: true },
  { id: 'sous_location', label: 'Sous-location autorisée', types: ['bail_commercial', 'bail_habitation'] },
  { id: 'exclusivite_terr', label: 'Exclusivité territoriale', types: ['distribution', 'agence'], defaultOn: true },
  { id: 'non_concurrence_aff', label: 'Non-concurrence', types: ['distribution', 'agence', 'sous_traitance', 'partenariat', 'cession_actions'] },
  { id: 'interets', label: 'Intérêts conventionnels', types: ['pret', 'reconnaissance_dette'], defaultOn: true },
  { id: 'suretes', label: 'Garanties / sûretés', types: ['pret'] },
  { id: 'condition_financement', label: 'Condition suspensive de financement', types: ['promesse_vente'], defaultOn: true },
  { id: 'preemption', label: 'Droit de préemption', types: ['cession_actions', 'pacte_actionnaires'] },
]

const EMPLOYMENT = new Set<ContractTypeId>(['CDI', 'CDD', 'CDD_partiel', 'stage'])
const LEASE = new Set<ContractTypeId>(['bail_commercial', 'bail_habitation'])

interface ContractForm {
  contractType: ContractTypeId
  language: string
  jurisdiction: string
  // Partie A
  empName: string; empBrn: string; empAddr: string; empRep: string; empTitle: string
  // Partie B
  eeName: string; eeNic: string; eeAddr: string; eeEmail: string; eePhone: string
  // Conditions emploi
  jobTitle: string; jobDept: string; startDate: string; endDate: string
  salary: string; payFrequency: string; probation: string; noticePeriod: string
  weeklyHours: string; workLocation: string; annualLeave: string; benefits: string
  // Conditions affaires
  objet: string; montant: string
  // Options
  options: Record<string, boolean>
  customClause: string
}

interface SourceItem { ref: string; source: string; reference: string; titre: string; maj: string }

/* Libellés des parties selon le type. */
function partyLabels(type: ContractTypeId): { a: string; b: string } {
  switch (type) {
    case 'prestataire': return { a: "Donneur d'ordre / Client", b: 'Prestataire / Consultant' }
    case 'client_saas': return { a: 'Prestataire (Éditeur)', b: 'Client abonné' }
    case 'client_service': return { a: 'Prestataire de services', b: 'Client' }
    case 'nda': return { a: 'Partie divulgatrice', b: 'Partie réceptrice' }
    case 'bail_commercial': case 'bail_habitation': return { a: 'Bailleur', b: 'Preneur / Locataire' }
    case 'stage': return { a: 'Entreprise d’accueil', b: 'Stagiaire' }
    case 'vente': return { a: 'Vendeur', b: 'Acheteur' }
    case 'distribution': return { a: 'Fournisseur / Concédant', b: 'Distributeur' }
    case 'agence': return { a: 'Mandant', b: 'Agent commercial' }
    case 'sous_traitance': return { a: 'Donneur d’ordre', b: 'Sous-traitant' }
    case 'cgv': return { a: 'Vendeur / Prestataire', b: 'Client' }
    case 'partenariat': return { a: 'Partenaire A', b: 'Partenaire B' }
    case 'cession_actions': return { a: 'Cédant', b: 'Cessionnaire' }
    case 'pacte_actionnaires': return { a: 'Associé A', b: 'Associé B' }
    case 'pret': return { a: 'Prêteur', b: 'Emprunteur' }
    case 'reconnaissance_dette': return { a: 'Créancier', b: 'Débiteur' }
    case 'promesse_vente': return { a: 'Promettant (vendeur)', b: 'Bénéficiaire (acquéreur)' }
    default: return { a: 'Employeur', b: 'Employé' }
  }
}

/* ─────────────────────  RENDU STRUCTURÉ DU CONTRAT  ───────────────────── */

function inlineBold(text: string, key: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={`${key}-${i}`} style={{ color: NAVY }}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={`${key}-${i}`}>{p.replace(/\*/g, '')}</React.Fragment>,
  )
}

function StructuredContract({ text }: { text: string }) {
  const clean = (text || '').replace(/\r/g, '').replace(/^[═━─*]{3,}$/gm, '')
  const lines = clean.split('\n')
  const blocks: React.ReactNode[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) {
      const joined = para.join(' ').trim()
      if (joined) blocks.push(<p key={`p${blocks.length}`} className="text-[13px] leading-relaxed text-gray-700 text-justify mb-2">{inlineBold(joined, `p${blocks.length}`)}</p>)
      para = []
    }
  }
  const isHeading = (l: string) => {
    const s = l.replace(/\*/g, '').trim()
    if (/^#{1,4}\s/.test(l)) return true
    if (/^article\s+\d+/i.test(s)) return true
    if (/^(entre les soussign|pr[ée]ambule|il a [ée]t[ée] convenu|fait [àa]\b|sources)/i.test(s)) return true
    if (s.length > 0 && s.length < 70 && s === s.toUpperCase() && /[A-ZÉÈÀ]/.test(s) && !/[.;]$/.test(s)) return true
    return false
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushPara(); continue }
    if (isHeading(line)) {
      flushPara()
      const h = line.replace(/^#{1,4}\s/, '').replace(/\*/g, '').trim()
      blocks.push(
        <h3 key={`h${blocks.length}`} className="text-[13px] font-bold mt-4 mb-1.5 pb-1 border-b" style={{ color: NAVY, borderColor: "rgba(212,175,55,0.4)" }}>{h}</h3>,
      )
      continue
    }
    const bullet = line.match(/^[-•]\s+(.+)$/) || line.match(/^(\d+(?:\.\d+)?)[).]\s+(.+)$/)
    if (bullet) {
      flushPara()
      const content = bullet.length === 3 ? bullet[2] : bullet[1]
      const mark = bullet.length === 3 ? `${bullet[1]}.` : '•'
      blocks.push(
        <div key={`li${blocks.length}`} className="flex gap-2 text-[13px] text-gray-700 mb-1 pl-1">
          <span style={{ color: GOLD }} className="font-semibold shrink-0">{mark}</span>
          <span className="flex-1">{inlineBold(content, `li${blocks.length}`)}</span>
        </div>,
      )
      continue
    }
    para.push(line)
  }
  flushPara()
  return <div>{blocks}</div>
}

/* ───────────────────────────  PAGE  ─────────────────────────── */

export default function ContratsPage() {
  const [view, setView] = useState<'gallery' | 'form'>('gallery')
  const [gallerySearch, setGallerySearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const [sources, setSources] = useState<SourceItem[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [savedContractId, setSavedContractId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [refineInput, setRefineInput] = useState("")
  const [refining, setRefining] = useState(false)
  const [refineLog, setRefineLog] = useState<string[]>([])

  const [form, setForm] = useState<ContractForm>({
    contractType: 'CDI', language: 'fr', jurisdiction: 'mu',
    empName: '', empBrn: '', empAddr: '', empRep: '', empTitle: '',
    eeName: '', eeNic: '', eeAddr: '', eeEmail: '', eePhone: '',
    jobTitle: '', jobDept: '', startDate: '', endDate: '',
    salary: '', payFrequency: 'Mensuel', probation: '3 mois',
    noticePeriod: '1 mois', weeklyHours: '45', workLocation: '',
    annualLeave: '20 jours (minimum légal WRA 2019)', benefits: '',
    objet: '', montant: '',
    options: {},
    customClause: '',
  })

  const update = useCallback(<K extends keyof ContractForm>(field: K, value: ContractForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // Sélectionne une société et préremplit automatiquement la partie employeur
  // avec les informations enregistrées (pas de ressaisie).
  const selectSociete = useCallback((id: string) => {
    setSocieteId(id)
    const s: any = societes.find((x: any) => x.id === id)
    if (s) setForm(f => ({ ...f, empName: s.nom || '', empBrn: s.brn || '', empAddr: s.adresse || '' }))
  }, [societes])

  React.useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length > 0) {
        const first: any = unique[0]
        setSocieteId(first.id)
        setForm(f => ({ ...f, empName: first.nom || '', empBrn: first.brn || '', empAddr: first.adresse || '' }))
      }
    })
  }, [])

  const template = TEMPLATES.find(t => t.id === form.contractType)!
  const isEmployment = EMPLOYMENT.has(form.contractType)
  const labels = partyLabels(form.contractType)
  const standardClauses = STANDARD_CLAUSES[form.contractType]
  const advancedOptions = ADVANCED_OPTIONS.filter(o => o.types.includes(form.contractType))

  function selectTemplate(id: ContractTypeId) {
    const defaults: Record<string, boolean> = {}
    ADVANCED_OPTIONS.filter(o => o.types.includes(id)).forEach(o => { defaults[o.id] = !!o.defaultOn })
    setForm(f => ({ ...f, contractType: id, options: defaults }))
    setResult(''); setSources([]); setError(null); setSavedContractId(null)
    setView('form')
  }

  const readJsonSafe = async (res: Response): Promise<any> => {
    const ct = res.headers.get("content-type") || ""
    if (ct.includes("application/json")) return res.json()
    const txt = await res.text().catch(() => "")
    if (res.status === 504 || /timeout|timed out/i.test(txt)) throw new Error("La génération a dépassé le délai. Réessayez ou simplifiez les paramètres.")
    throw new Error("Le serveur a renvoyé une réponse inattendue. Réessayez dans un instant.")
  }

  function buildPayload(extra: Record<string, unknown> = {}) {
    const activeOptionLabels = advancedOptions.filter(o => form.options[o.id]).map(o => `${o.label}${o.ref ? ` (${o.ref})` : ''}`)
    return {
      form: {
        ...form,
        standardClauses: standardClauses.map(c => `${c.label}${c.ref ? ` (${c.ref})` : ''}`),
        clausesRecommended: activeOptionLabels,
        clausesOptional: [],
      },
      ...extra,
    }
  }

  async function handleGenerate() {
    setLoading(true); setError(null); setResult(''); setSources([]); setSavedContractId(null); setRefineLog([])
    try {
      const res = await fetch("/api/generate-contract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) { setError(data.error || "Erreur de génération"); return }
      setResult(data.text || "")
      setSources(Array.isArray(data.sources) ? data.sources : [])
    } catch (e: any) {
      setError(e.message || "Erreur réseau")
    } finally { setLoading(false) }
  }

  async function handleSave() {
    if (!result || !societeId) return
    setSaving(true)
    try {
      const res = await fetch("/api/generate-contract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload({ save_to_db: true, societe_id: societeId })),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) { alert(data.error || "Erreur de sauvegarde"); return }
      if (data.contract_id) { setSavedContractId(data.contract_id); }
    } catch (e: any) {
      alert("Erreur : " + (e.message || ""))
    } finally { setSaving(false) }
  }

  async function handleDownloadPdf() {
    if (!result) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/generate-contract/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: template.label,
          corps: result,
          lieu: form.workLocation || undefined,
          date: form.startDate || undefined,
          labelA: labels.a,
          labelB: labels.b,
          employeur: { nom: form.empName, brn: form.empBrn, adresse: form.empAddr, representant: form.empRep, titre: form.empTitle },
          contractant: { nom: form.eeName, nic: form.eeNic, adresse: form.eeAddr },
          sources,
        }),
      })
      if (!res.ok) { const d = await readJsonSafe(res).catch(() => ({})); alert(d.error || "Erreur PDF"); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contrat_${form.contractType}_${(form.eeName || 'projet').replace(/\s/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert("Erreur PDF" + (e.message ? ` (${e.message})` : ""))
    } finally { setPdfLoading(false) }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  async function handleRefine() {
    const instruction = refineInput.trim()
    if (!instruction || !result || refining) return
    setRefining(true)
    try {
      const res = await fetch("/api/generate-contract/refine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_type: form.contractType, current_text: result, instruction }),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) { alert(data.error || "Échec de la modification"); return }
      setResult(data.text || result)
      if (Array.isArray(data.sources) && data.sources.length) setSources(data.sources)
      setRefineLog((l) => [...l, instruction])
      setRefineInput("")
      setSavedContractId(null)
    } catch (e: any) {
      alert(e.message || "Erreur réseau")
    } finally { setRefining(false) }
  }

  /* ───────────────  VUE GALERIE  ─────────────── */
  if (view === 'gallery') {
    const FAMILY_LABELS: Record<ContractFamily, string> = {
      Emploi: 'Contrats de travail', Affaires: "Contrats d'affaires", Société: 'Droit des sociétés', Immobilier: 'Immobilier & baux', Finance: 'Financier',
    }
    const families: ContractFamily[] = ['Emploi', 'Affaires', 'Société', 'Finance', 'Immobilier']
    const q = gallerySearch.trim().toLowerCase()
    const matches = (t: Template) => !q || `${t.label} ${t.desc} ${t.law}`.toLowerCase().includes(q)
    const filtered = TEMPLATES.filter(matches)
    return (
      <ClientPageShell hideHero disableParticles>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: NAVY }}>
                <FileSignature className="w-5 h-5" style={{ color: GOLD }} />
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: NAVY }}>Générateur de contrats</h1>
                <p className="text-xs text-gray-500">{TEMPLATES.length} modèles conformes au droit mauricien — sourcés (RAG), personnalisables, exportables en PDF signable.</p>
              </div>
            </div>

            {/* Recherche */}
            <div className="relative mb-6">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder="Rechercher un modèle (ex. bail, NDA, cession, prêt, vente…)"
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center text-sm text-gray-400">Aucun modèle ne correspond à « {gallerySearch} ».</div>
            ) : families.filter((fam) => filtered.some((t) => t.family === fam)).map(fam => (
              <div key={fam} className="mb-7">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{FAMILY_LABELS[fam]}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.filter(t => t.family === fam).map(tpl => {
                    const Icon = tpl.icon
                    return (
                      <button key={tpl.id} onClick={() => selectTemplate(tpl.id)}
                        className="group text-left rounded-2xl bg-white border border-gray-100 p-5 shadow-sm transition-all hover:shadow-md hover:border-[#D4AF37]/50 hover:-translate-y-0.5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="rounded-xl p-2.5" style={{ background: "rgba(11,15,46,0.06)" }}>
                            <Icon className="w-5 h-5" style={{ color: NAVY }} />
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.14)", color: "#8a6d15" }}>{tpl.law}</span>
                        </div>
                        <p className="font-bold text-[15px]" style={{ color: NAVY }}>{tpl.label}</p>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{tpl.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <p className="text-[11px] text-gray-400 text-center mt-2">
              Lexora n'exerce pas l'activité réglementée d'avocat. Les documents produits sont des projets de travail à faire valider et signer par un avocat / attorney inscrit.
            </p>
          </div>
        </div>
      </ClientPageShell>
    )
  }

  /* ───────────────  VUE FORMULAIRE  ─────────────── */
  return (
    <ClientPageShell hideHero disableParticles>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto">
          {/* En-tête */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => setView('gallery')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B0F2E]">
              <ArrowLeft className="w-4 h-4" /> Modèles
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <template.icon className="w-5 h-5" style={{ color: NAVY }} />
            <h1 className="text-lg font-bold" style={{ color: NAVY }}>{template.label}</h1>
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.14)", color: "#8a6d15" }}>{template.law}</span>
          </div>

          <div className="space-y-5">
            {/* ── Formulaire ── */}
            <div className="space-y-4">
              {/* Paramètres */}
              <Card>
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Building2 className="w-3 h-3" /> Société</Label>
                    <Select value={societeId} onValueChange={selectSociete}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Langue</Label>
                    <Select value={form.language} onValueChange={v => update('language', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Juridiction</Label>
                    <Select value={form.jurisdiction} onValueChange={v => update('jurisdiction', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{JURISDICTIONS.map(j => <SelectItem key={j.id} value={j.id}>{j.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Users className="w-4 h-4" /> Les parties</h3>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{labels.a}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">Raison sociale / nom</Label><Input value={form.empName} onChange={e => update('empName', e.target.value)} /></div>
                      <div><Label className="text-xs">BRN</Label><Input value={form.empBrn} onChange={e => update('empBrn', e.target.value)} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">Adresse</Label><Input value={form.empAddr} onChange={e => update('empAddr', e.target.value)} /></div>
                      <div><Label className="text-xs">Représentant</Label><Input value={form.empRep} onChange={e => update('empRep', e.target.value)} placeholder="Prénom Nom" /></div>
                      <div><Label className="text-xs">Qualité</Label><Input value={form.empTitle} onChange={e => update('empTitle', e.target.value)} placeholder="Directeur, Gérant…" /></div>
                    </div>
                  </div>
                  <div className="pt-3 border-t">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{labels.b}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">Nom complet / raison sociale</Label><Input value={form.eeName} onChange={e => update('eeName', e.target.value)} /></div>
                      <div><Label className="text-xs">NIC / BRN / Passeport</Label><Input value={form.eeNic} onChange={e => update('eeNic', e.target.value)} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">Adresse</Label><Input value={form.eeAddr} onChange={e => update('eeAddr', e.target.value)} /></div>
                      <div><Label className="text-xs">Email</Label><Input type="email" value={form.eeEmail} onChange={e => update('eeEmail', e.target.value)} /></div>
                      <div><Label className="text-xs">Téléphone</Label><Input value={form.eePhone} onChange={e => update('eePhone', e.target.value)} /></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conditions */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Settings className="w-4 h-4" /> Conditions</h3>
                  {isEmployment ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">Intitulé du poste</Label><Input value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} /></div>
                      <div><Label className="text-xs">Département</Label><Input value={form.jobDept} onChange={e => update('jobDept', e.target.value)} /></div>
                      <div><Label className="text-xs">Date de début</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                      {form.contractType !== 'CDI' && <div><Label className="text-xs">Date de fin</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>}
                      <div><Label className="text-xs">Salaire mensuel brut (MUR)</Label><Input value={form.salary} onChange={e => update('salary', e.target.value)} inputMode="decimal" /></div>
                      <div>
                        <Label className="text-xs">Fréquence</Label>
                        <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Mensuel">Mensuel</SelectItem><SelectItem value="Bi-mensuel">Bi-mensuel</SelectItem><SelectItem value="Hebdomadaire">Hebdomadaire</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Période d'essai</Label>
                        <Select value={form.probation} onValueChange={v => update('probation', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="3 mois">3 mois</SelectItem><SelectItem value="6 mois">6 mois</SelectItem><SelectItem value="1 an">1 an</SelectItem><SelectItem value="Aucune">Aucune</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Préavis</Label>
                        <Select value={form.noticePeriod} onValueChange={v => update('noticePeriod', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="1 mois">1 mois</SelectItem><SelectItem value="2 mois">2 mois</SelectItem><SelectItem value="3 mois">3 mois</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Heures / semaine</Label><Input type="number" value={form.weeklyHours} onChange={e => update('weeklyHours', e.target.value)} /></div>
                      <div><Label className="text-xs">Lieu de travail</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} /></div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Congés annuels</Label>
                        <Select value={form.annualLeave} onValueChange={v => update('annualLeave', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20 jours (minimum légal WRA 2019)">20 jours (minimum légal)</SelectItem>
                            <SelectItem value="22 jours">22 jours</SelectItem>
                            <SelectItem value="25 jours">25 jours</SelectItem>
                            <SelectItem value="30 jours">30 jours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2"><Label className="text-xs">Avantages (optionnel)</Label><Textarea className="mt-1 min-h-[64px]" value={form.benefits} onChange={e => update('benefits', e.target.value)} placeholder="Voiture de fonction, bonus, assurance santé…" /></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2"><Label className="text-xs">{LEASE.has(form.contractType) ? 'Désignation et destination des locaux' : 'Objet / mission'}</Label><Textarea className="mt-1 min-h-[72px]" value={form.objet} onChange={e => update('objet', e.target.value)} placeholder={form.contractType === 'nda' ? "Objet de l'échange d'informations confidentielles…" : LEASE.has(form.contractType) ? "Adresse et description des locaux, surface, usage commercial autorisé…" : "Décrivez la prestation, les livrables, le périmètre…"} /></div>
                      <div><Label className="text-xs">{LEASE.has(form.contractType) ? 'Prise d\'effet du bail' : 'Date de début / signature'}</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                      <div><Label className="text-xs">{LEASE.has(form.contractType) ? 'Échéance du bail' : 'Date de fin / échéance'}</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>
                      {form.contractType !== 'nda' && <div><Label className="text-xs">{LEASE.has(form.contractType) ? 'Loyer mensuel (MUR)' : 'Contrepartie (MUR)'}</Label><Input value={form.montant} onChange={e => update('montant', e.target.value)} inputMode="decimal" /></div>}
                      {form.contractType !== 'nda' && (
                        <div>
                          <Label className="text-xs">{LEASE.has(form.contractType) ? 'Périodicité du loyer' : 'Facturation'}</Label>
                          <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="À la livraison">À la livraison</SelectItem><SelectItem value="Mensuel">Mensuel</SelectItem><SelectItem value="Forfait">Forfait</SelectItem><SelectItem value="Échelonné">Échelonné</SelectItem></SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="md:col-span-2"><Label className="text-xs">Lieu</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} placeholder="Port-Louis, Maurice" /></div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Clauses */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Shield className="w-4 h-4" /> Clauses & options</h3>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><Lock className="w-3 h-3" /> Incluses automatiquement</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {standardClauses.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12.5px] text-gray-600">
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#16a34a" }} />
                          <span className="flex-1">{c.label}</span>
                          {c.ref && <span className="text-[10px] text-gray-400 font-mono shrink-0">{c.ref}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {advancedOptions.length > 0 && (
                    <div className="pt-3 border-t">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Options à activer</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {advancedOptions.map(o => {
                          const on = !!form.options[o.id]
                          return (
                            <button key={o.id} type="button"
                              onClick={() => setForm(f => ({ ...f, options: { ...f.options, [o.id]: !on } }))}
                              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-[12.5px] transition-all ${on ? "border-transparent" : "border-gray-200 hover:border-gray-300"}`}
                              style={on ? { background: "rgba(11,15,46,0.04)" } : {}}>
                              <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "" : "bg-gray-200"}`} style={on ? { background: NAVY } : {}}>
                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                              </span>
                              <span className="flex-1 text-gray-700">{o.label}</span>
                              {o.ref && <span className="text-[10px] text-gray-400 font-mono shrink-0">{o.ref}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t">
                    <Label className="text-xs font-semibold">Clause sur mesure (optionnel)</Label>
                    <Textarea className="mt-1.5 min-h-[64px]" value={form.customClause} onChange={e => update('customClause', e.target.value)} placeholder="Ajoutez une clause spécifique à intégrer au contrat…" />
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleGenerate} disabled={loading} className="w-full h-11" style={{ backgroundColor: NAVY, color: GOLD }}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSignature className="w-4 h-4 mr-2" />}
                {loading ? "Rédaction en cours…" : "Générer le contrat"}
              </Button>
            </div>

            {/* ── Aperçu (pleine largeur, affiché dès qu'il y a du contenu) ── */}
            {(loading || result || error) && (
            <div>
              <Card className="min-h-[300px]">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">Génération…</span></>
                        : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">Projet de contrat</span></>
                        : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">Erreur</span></>
                        : <><FileText className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">Aperçu</span></>}
                    </div>
                    {result && (
                      <div className="flex gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" onClick={handleCopy}>{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? "Copié" : "Copier"}</Button>
                        <Button size="sm" onClick={handleDownloadPdf} disabled={pdfLoading} style={{ backgroundColor: GOLD, color: NAVY }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !societeId} style={{ backgroundColor: NAVY, color: GOLD }}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Sauver</Button>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>Erreur :</strong> {error}</div>}
                    {savedContractId && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2 mb-3"><CheckCircle className="w-4 h-4" /> Contrat sauvegardé (réf. <code className="font-mono">{savedContractId.slice(0, 8)}</code>)</div>}

                    {!result && !loading && !error && (
                      <div className="text-center py-20 text-gray-400">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Complétez le formulaire puis cliquez sur « Générer le contrat ».</p>
                      </div>
                    )}

                    {loading && !result && (
                      <div className="space-y-2 animate-pulse">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-3 rounded bg-gray-100" style={{ width: `${70 + (i % 3) * 10}%` }} />)}
                      </div>
                    )}

                    {result && (
                      <div className="overflow-y-auto pr-1">
                        <StructuredContract text={result} />
                        {/* Bloc signatures (identités à signer) */}
                        <div className="mt-6 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: NAVY }}>{labels.a}</p>
                            <p className="text-[11px] text-gray-500">{form.empName || '[À compléter]'}</p>
                            {form.empRep ? <p className="text-[11px] text-gray-500">{form.empRep}{form.empTitle ? `, ${form.empTitle}` : ''}</p> : null}
                            <div className="mt-7 border-t border-gray-300 pt-1 text-[10px] text-gray-400">Signature</div>
                            <p className="text-[10px] text-gray-400 mt-2">Fait à {form.workLocation || 'Port-Louis'}, le ____________</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: NAVY }}>{labels.b}</p>
                            <p className="text-[11px] text-gray-500">{form.eeName || '[À compléter]'}</p>
                            <p className="text-[11px] text-gray-600 mt-1.5">« Lu et approuvé »</p>
                            <div className="mt-3 border-t border-gray-300 pt-1 text-[10px] text-gray-400">Signature</div>
                            <p className="text-[10px] text-gray-400 mt-2">Fait à {form.workLocation || 'Port-Louis'}, le ____________</p>
                          </div>
                        </div>

                        {sources.length > 0 && (
                          <div className="mt-5 pt-3 border-t border-gray-100">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> Sources juridiques citées</p>
                            <ul className="space-y-1">
                              {sources.map(src => (
                                <li key={src.ref} className="text-[11px] text-gray-500">
                                  <span className="font-mono text-gray-400">[{src.ref}]</span> <span className="font-medium" style={{ color: NAVY }}>{src.source} {src.reference}</span> — {src.titre} <span className="text-gray-400">({src.maj})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            )}

            {/* Chatbot de personnalisation — toujours visible (actif après génération) */}
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ color: NAVY }}>
                  <Settings className="w-4 h-4" style={{ color: GOLD }} /> Affiner le contrat (assistant)
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Décrivez en langage naturel les clauses à ajouter, retirer ou reformuler. Le contrat est régénéré complet et reste sourcé.
                </p>
                {refineLog.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {refineLog.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3 text-green-500" />{r.length > 44 ? r.slice(0, 44) + '…' : r}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine() } }}
                    rows={1}
                    disabled={!result}
                    placeholder={result ? "Ex. Ajoute une clause de télétravail 2 j/sem · Porte le préavis à 2 mois · Ajoute une prime annuelle…" : "Générez d'abord un contrat, puis affinez-le ici…"}
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] max-h-28 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <Button onClick={handleRefine} disabled={refining || !result || !refineInput.trim()} style={{ backgroundColor: NAVY, color: GOLD }}>
                    {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ClientPageShell>
  )
}
