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
import { t, getLocale, type Locale } from "@/lib/i18n"

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
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  law: string
  family: ContractFamily
}

// Données structurelles : libellés/descriptions résolus via i18n (clés jurc.tpl.<id>.*).
// Les références juridiques (`law`) restent en dur (noms propres de textes de loi).
const TEMPLATES: Template[] = [
  // Emploi
  { id: 'CDI', icon: Briefcase, law: 'WRA 2019 s.11', family: 'Emploi' },
  { id: 'CDD', icon: Briefcase, law: 'WRA 2019 s.12', family: 'Emploi' },
  { id: 'CDD_partiel', icon: Briefcase, law: 'WRA 2019 s.35', family: 'Emploi' },
  { id: 'stage', icon: GraduationCap, law: 'WRA 2019', family: 'Emploi' },
  // Affaires
  { id: 'prestataire', icon: Wrench, law: 'Contract Act', family: 'Affaires' },
  { id: 'client_saas', icon: Cloud, law: 'ICT Act · DPA 2017', family: 'Affaires' },
  { id: 'client_service', icon: Handshake, law: 'Contract Act', family: 'Affaires' },
  { id: 'nda', icon: FileLock2, law: 'DPA 2017', family: 'Affaires' },
  { id: 'vente', icon: ShoppingCart, law: 'Sale of Goods Act', family: 'Affaires' },
  { id: 'distribution', icon: Truck, law: 'Code de Commerce', family: 'Affaires' },
  { id: 'agence', icon: Handshake, law: 'Code de Commerce', family: 'Affaires' },
  { id: 'sous_traitance', icon: Wrench, law: 'Contract Act', family: 'Affaires' },
  { id: 'cgv', icon: FileText, law: 'Code Civil · ETA 2000', family: 'Affaires' },
  { id: 'partenariat', icon: Handshake, law: 'Code Civil · CA 2001', family: 'Affaires' },
  // Société
  { id: 'cession_actions', icon: Landmark, law: 'Companies Act 2001', family: 'Société' },
  { id: 'pacte_actionnaires', icon: Users, law: 'Companies Act 2001', family: 'Société' },
  // Finance
  { id: 'pret', icon: Banknote, law: 'Code Civil', family: 'Finance' },
  { id: 'reconnaissance_dette', icon: Banknote, law: 'Code Civil art.1326', family: 'Finance' },
  // Immobilier
  { id: 'bail_commercial', icon: Building2, law: 'Code Civil · L&T Act', family: 'Immobilier' },
  { id: 'bail_habitation', icon: Home, law: 'Landlord & Tenant Act', family: 'Immobilier' },
  { id: 'promesse_vente', icon: Home, law: 'Code Civil · Notaries Act', family: 'Immobilier' },
]

const tplLabel = (id: ContractTypeId, locale: Locale) => t(`jurc.tpl.${id}.label`, locale)
const tplDesc = (id: ContractTypeId, locale: Locale) => t(`jurc.tpl.${id}.desc`, locale)

const LANGUAGES = [
  { id: 'fr', labelKey: 'jurc.lang.fr' },
  { id: 'en', labelKey: 'jurc.lang.en' },
  { id: 'fr_en', labelKey: 'jurc.lang.fr_en' },
]

const JURISDICTIONS = [
  { id: 'mu', labelKey: 'jurc.juris.mu' },
  { id: 'mu_fr', labelKey: 'jurc.juris.mu_fr' },
  { id: 'cv', labelKey: 'jurc.juris.cv' },
]

/* Clauses standard incluses automatiquement, par type de contrat.
   `labelKey` → résolu via i18n ; `ref` (références légales) reste en dur. */
const STANDARD_CLAUSES: Record<ContractTypeId, { labelKey: string; ref?: string }[]> = {
  CDI: [
    { labelKey: 'jurc.clause.identification_parties', ref: 'WRA s.11' },
    { labelKey: 'jurc.clause.poste_fonctions_lieu' },
    { labelKey: 'jurc.clause.remuneration_modalites', ref: 'WRA s.24' },
    { labelKey: 'jurc.clause.duree_travail_45h', ref: 'WRA s.36' },
    { labelKey: 'jurc.clause.conges_annuels_20j', ref: 'WRA s.47' },
    { labelKey: 'jurc.clause.conges_maladie', ref: 'WRA s.49' },
    { labelKey: 'jurc.clause.cotisations_csg_nsf' },
    { labelKey: 'jurc.clause.retenue_paye_source', ref: 'ITA 1995' },
    { labelKey: 'jurc.clause.preavis_rupture', ref: 'WRA s.38-40' },
  ],
  CDD: [
    { labelKey: 'jurc.clause.identification_parties', ref: 'WRA s.11' },
    { labelKey: 'jurc.clause.terme_renouvellement_cdd', ref: 'WRA s.12' },
    { labelKey: 'jurc.clause.remuneration_paiement', ref: 'WRA s.24' },
    { labelKey: 'jurc.clause.duree_travail', ref: 'WRA s.36' },
    { labelKey: 'jurc.clause.conges_prorata', ref: 'WRA s.47' },
    { labelKey: 'jurc.clause.cotisations_csg_nsf' },
    { labelKey: 'jurc.clause.retenue_paye', ref: 'ITA 1995' },
    { labelKey: 'jurc.clause.rupture_anticipee', ref: 'WRA s.38-40' },
  ],
  CDD_partiel: [
    { labelKey: 'jurc.clause.identification_parties', ref: 'WRA s.11' },
    { labelKey: 'jurc.clause.temps_partiel_horaires', ref: 'WRA s.35' },
    { labelKey: 'jurc.clause.remuneration_prorata', ref: 'WRA s.24' },
    { labelKey: 'jurc.clause.conges_au_prorata', ref: 'WRA s.47' },
    { labelKey: 'jurc.clause.cotisations_csg_nsf' },
    { labelKey: 'jurc.clause.preavis_rupture2', ref: 'WRA s.38-40' },
  ],
  prestataire: [
    { labelKey: 'jurc.clause.identification_parties' },
    { labelKey: 'jurc.clause.objet_mission_livrables' },
    { labelKey: 'jurc.clause.remuneration_facturation' },
    { labelKey: 'jurc.clause.independance_subordination' },
    { labelKey: 'jurc.clause.duree_resiliation' },
    { labelKey: 'jurc.clause.responsabilite_assurance' },
    { labelKey: 'jurc.clause.loi_juridiction' },
  ],
  client_saas: [
    { labelKey: 'jurc.clause.identification_parties' },
    { labelKey: 'jurc.clause.objet_perimetre_service' },
    { labelKey: 'jurc.clause.abonnement_prix_facturation' },
    { labelKey: 'jurc.clause.disponibilite_maintenance' },
    { labelKey: 'jurc.clause.protection_donnees', ref: 'DPA 2017' },
    { labelKey: 'jurc.clause.responsabilite_limitation' },
    { labelKey: 'jurc.clause.duree_suspension_resiliation' },
  ],
  client_service: [
    { labelKey: 'jurc.clause.identification_parties' },
    { labelKey: 'jurc.clause.objet_prestation' },
    { labelKey: 'jurc.clause.prix_modalites_paiement' },
    { labelKey: 'jurc.clause.delais_execution' },
    { labelKey: 'jurc.clause.responsabilite_garanties' },
    { labelKey: 'jurc.clause.resiliation' },
    { labelKey: 'jurc.clause.loi_juridiction' },
  ],
  nda: [
    { labelKey: 'jurc.clause.identification_parties' },
    { labelKey: 'jurc.clause.definition_infos_confidentielles' },
    { labelKey: 'jurc.clause.obligations_confidentialite' },
    { labelKey: 'jurc.clause.duree_engagement' },
    { labelKey: 'jurc.clause.exclusions' },
    { labelKey: 'jurc.clause.sanctions_violation' },
  ],
  bail_commercial: [
    { labelKey: 'jurc.clause.identification_bailleur_preneur' },
    { labelKey: 'jurc.clause.designation_destination_locaux' },
    { labelKey: 'jurc.clause.duree_bail_renouvellement' },
    { labelKey: 'jurc.clause.loyer_revision_paiement' },
    { labelKey: 'jurc.clause.depot_garantie' },
    { labelKey: 'jurc.clause.charges_taxes_entretien' },
    { labelKey: 'jurc.clause.obligations_etat_lieux' },
    { labelKey: 'jurc.clause.resiliation_resolutoire' },
    { labelKey: 'jurc.clause.loi_juridiction' },
  ],
  stage: [
    { labelKey: 'jurc.clause.identification_entreprise_stagiaire' },
    { labelKey: 'jurc.clause.objet_objectifs_stage' },
    { labelKey: 'jurc.clause.duree_horaires_lieu' },
    { labelKey: 'jurc.clause.gratification_indemnite' },
    { labelKey: 'jurc.clause.encadrement_evaluation' },
    { labelKey: 'jurc.clause.confidentialite_propriete_travaux' },
    { labelKey: 'jurc.clause.fin_rupture' },
  ],
  vente: [
    { labelKey: 'jurc.clause.identification_vendeur_acheteur' },
    { labelKey: 'jurc.clause.designation_biens_vendus' },
    { labelKey: 'jurc.clause.prix_modalites_paiement' },
    { labelKey: 'jurc.clause.livraison_transfert_propriete', ref: 'Sale of Goods Act' },
    { labelKey: 'jurc.clause.garanties_conformite' },
    { labelKey: 'jurc.clause.transfert_risques' },
    { labelKey: 'jurc.clause.resolution_loi' },
  ],
  distribution: [
    { labelKey: 'jurc.clause.identification_parties' },
    { labelKey: 'jurc.clause.produits_territoire' },
    { labelKey: 'jurc.clause.exclusivite_non' },
    { labelKey: 'jurc.clause.objectifs_conditions_com' },
    { labelKey: 'jurc.clause.duree_renouvellement_resiliation' },
    { labelKey: 'jurc.clause.responsabilite_marque' },
    { labelKey: 'jurc.clause.loi_juridiction' },
  ],
  agence: [
    { labelKey: 'jurc.clause.identification_mandant_agent' },
    { labelKey: 'jurc.clause.mission_pouvoirs_agent' },
    { labelKey: 'jurc.clause.territoire_clientele' },
    { labelKey: 'jurc.clause.commissions_paiement' },
    { labelKey: 'jurc.clause.duree_resiliation' },
    { labelKey: 'jurc.clause.indemnite_fin_contrat' },
    { labelKey: 'jurc.clause.non_concurrence_loi' },
  ],
  sous_traitance: [
    { labelKey: 'jurc.clause.identification_donneur_soustraitant' },
    { labelKey: 'jurc.clause.perimetre_prestations_soustraitees' },
    { labelKey: 'jurc.clause.cahier_charges_qualite' },
    { labelKey: 'jurc.clause.prix_facturation_delais' },
    { labelKey: 'jurc.clause.responsabilite_assurance' },
    { labelKey: 'jurc.clause.confidentialite_pi' },
    { labelKey: 'jurc.clause.resiliation_loi' },
  ],
  cgv: [
    { labelKey: 'jurc.clause.champ_application_acceptation' },
    { labelKey: 'jurc.clause.description_produits_services' },
    { labelKey: 'jurc.clause.prix_commande_paiement' },
    { labelKey: 'jurc.clause.livraison_execution_delais' },
    { labelKey: 'jurc.clause.retractation_retours_garanties' },
    { labelKey: 'jurc.clause.responsabilite_force_majeure' },
    { labelKey: 'jurc.clause.donnees_personnelles', ref: 'DPA 2017' },
    { labelKey: 'jurc.clause.loi_litiges' },
  ],
  partenariat: [
    { labelKey: 'jurc.clause.identification_partenaires' },
    { labelKey: 'jurc.clause.objet_perimetre_partenariat' },
    { labelKey: 'jurc.clause.apports_contributions' },
    { labelKey: 'jurc.clause.gouvernance_decision' },
    { labelKey: 'jurc.clause.partage_resultats' },
    { labelKey: 'jurc.clause.pi_confidentialite' },
    { labelKey: 'jurc.clause.duree_sortie_resiliation' },
  ],
  cession_actions: [
    { labelKey: 'jurc.clause.identification_cedant_cessionnaire' },
    { labelKey: 'jurc.clause.designation_actions_cedees', ref: 'CA 2001' },
    { labelKey: 'jurc.clause.prix_modalites_paiement' },
    { labelKey: 'jurc.clause.declarations_garanties_cedant' },
    { labelKey: 'jurc.clause.conditions_suspensives_agrement' },
    { labelKey: 'jurc.clause.transfert_formalites_roc' },
    { labelKey: 'jurc.clause.loi_juridiction' },
  ],
  pacte_actionnaires: [
    { labelKey: 'jurc.clause.identification_associes' },
    { labelKey: 'jurc.clause.gouvernance_vote' },
    { labelKey: 'jurc.clause.transfert_preemption_agrement' },
    { labelKey: 'jurc.clause.sortie_tag_drag' },
    { labelKey: 'jurc.clause.information_reporting' },
    { labelKey: 'jurc.clause.non_concurrence_confidentialite' },
    { labelKey: 'jurc.clause.duree_differends' },
  ],
  pret: [
    { labelKey: 'jurc.clause.identification_preteur_emprunteur' },
    { labelKey: 'jurc.clause.montant_mise_disposition' },
    { labelKey: 'jurc.clause.interets_taux' },
    { labelKey: 'jurc.clause.echeancier_remboursement' },
    { labelKey: 'jurc.clause.garanties_suretes' },
    { labelKey: 'jurc.clause.defaut_exigibilite_penalites' },
    { labelKey: 'jurc.clause.loi_applicable' },
  ],
  reconnaissance_dette: [
    { labelKey: 'jurc.clause.identification_debiteur_creancier' },
    { labelKey: 'jurc.clause.montant_dette_reconnue', ref: 'Code Civil art.1326' },
    { labelKey: 'jurc.clause.cause_dette' },
    { labelKey: 'jurc.clause.echeance_remboursement' },
    { labelKey: 'jurc.clause.interets_eventuels' },
    { labelKey: 'jurc.clause.mention_manuscrite' },
  ],
  bail_habitation: [
    { labelKey: 'jurc.clause.identification_bailleur_locataire' },
    { labelKey: 'jurc.clause.designation_logement' },
    { labelKey: 'jurc.clause.duree_bail' },
    { labelKey: 'jurc.clause.loyer_modalites_paiement' },
    { labelKey: 'jurc.clause.depot_garantie' },
    { labelKey: 'jurc.clause.etat_lieux_entree_sortie' },
    { labelKey: 'jurc.clause.obligations_reparations' },
    { labelKey: 'jurc.clause.resiliation', ref: 'Landlord & Tenant Act' },
  ],
  promesse_vente: [
    { labelKey: 'jurc.clause.identification_promettant_beneficiaire' },
    { labelKey: 'jurc.clause.designation_bien_immobilier' },
    { labelKey: 'jurc.clause.prix_vente_convenu' },
    { labelKey: 'jurc.clause.conditions_suspensives_financement' },
    { labelKey: 'jurc.clause.acompte_immobilisation' },
    { labelKey: 'jurc.clause.delai_realisation_notaire', ref: 'Notaries Act' },
    { labelKey: 'jurc.clause.defaillance_loi' },
  ],
}

/* Options avancées activables (interrupteurs), filtrées par type.
   `labelKey` → i18n ; `ref` reste en dur. */
const ADVANCED_OPTIONS: { id: string; labelKey: string; ref?: string; types: ContractTypeId[]; defaultOn?: boolean }[] = [
  { id: 'propriete_intellectuelle', labelKey: 'jurc.opt.propriete_intellectuelle', ref: 'Copyright Act', types: ['CDI', 'CDD', 'prestataire', 'client_saas', 'client_service'], defaultOn: true },
  { id: 'protection_donnees', labelKey: 'jurc.opt.protection_donnees', ref: 'DPA 2017', types: ['CDI', 'CDD', 'prestataire', 'client_saas', 'client_service', 'nda'], defaultOn: true },
  { id: 'non_concurrence', labelKey: 'jurc.opt.non_concurrence', ref: 'WRA s.50', types: ['CDI', 'CDD', 'prestataire'] },
  { id: 'teletravail', labelKey: 'jurc.opt.teletravail', types: ['CDI', 'CDD', 'CDD_partiel'] },
  { id: 'mobilite', labelKey: 'jurc.opt.mobilite', types: ['CDI', 'CDD'] },
  { id: 'exclusivite', labelKey: 'jurc.opt.exclusivite', types: ['CDI', 'prestataire', 'client_saas'] },
  { id: 'sla', labelKey: 'jurc.opt.sla', types: ['client_saas', 'client_service'] },
  { id: 'penalites', labelKey: 'jurc.opt.penalites', types: ['prestataire', 'client_service'] },
  { id: 'force_majeure', labelKey: 'jurc.opt.force_majeure', types: ['prestataire', 'client_saas', 'client_service', 'nda', 'bail_commercial', 'vente', 'distribution', 'agence', 'sous_traitance', 'cgv', 'partenariat'] },
  { id: 'revision_loyer', labelKey: 'jurc.opt.revision_loyer', types: ['bail_commercial', 'bail_habitation'], defaultOn: true },
  { id: 'depot_garantie', labelKey: 'jurc.opt.depot_garantie', types: ['bail_commercial', 'bail_habitation'], defaultOn: true },
  { id: 'sous_location', labelKey: 'jurc.opt.sous_location', types: ['bail_commercial', 'bail_habitation'] },
  { id: 'exclusivite_terr', labelKey: 'jurc.opt.exclusivite_terr', types: ['distribution', 'agence'], defaultOn: true },
  { id: 'non_concurrence_aff', labelKey: 'jurc.opt.non_concurrence_aff', types: ['distribution', 'agence', 'sous_traitance', 'partenariat', 'cession_actions'] },
  { id: 'interets', labelKey: 'jurc.opt.interets', types: ['pret', 'reconnaissance_dette'], defaultOn: true },
  { id: 'suretes', labelKey: 'jurc.opt.suretes', types: ['pret'] },
  { id: 'condition_financement', labelKey: 'jurc.opt.condition_financement', types: ['promesse_vente'], defaultOn: true },
  { id: 'preemption', labelKey: 'jurc.opt.preemption', types: ['cession_actions', 'pacte_actionnaires'] },
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
  eeName: string; eeNic: string; eeAddr: string; eeEmail: string; eePhone: string; eeRep: string; eeTitle: string
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

/* Libellés des parties selon le type (résolus via i18n). */
function partyLabels(type: ContractTypeId, locale: Locale): { a: string; b: string } {
  const p = (k: string) => ({ a: t(`jurc.party.${k}.a`, locale), b: t(`jurc.party.${k}.b`, locale) })
  switch (type) {
    case 'prestataire': return p('prestataire')
    case 'client_saas': return p('client_saas')
    case 'client_service': return p('client_service')
    case 'nda': return p('nda')
    case 'bail_commercial': case 'bail_habitation': return p('bail')
    case 'stage': return p('stage')
    case 'vente': return p('vente')
    case 'distribution': return p('distribution')
    case 'agence': return p('agence')
    case 'sous_traitance': return p('sous_traitance')
    case 'cgv': return p('cgv')
    case 'partenariat': return p('partenariat')
    case 'cession_actions': return p('cession_actions')
    case 'pacte_actionnaires': return p('pacte_actionnaires')
    case 'pret': return p('pret')
    case 'reconnaissance_dette': return p('reconnaissance_dette')
    case 'promesse_vente': return p('promesse_vente')
    default: return p('default')
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
  const locale = getLocale()
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
    eeName: '', eeNic: '', eeAddr: '', eeEmail: '', eePhone: '', eeRep: '', eeTitle: '',
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
  const labels = partyLabels(form.contractType, locale)
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
    if (res.status === 504 || /timeout|timed out/i.test(txt)) throw new Error(t('jurc.preview.timeout', locale))
    throw new Error(t('jurc.preview.unexpected', locale))
  }

  function buildPayload(extra: Record<string, unknown> = {}) {
    const activeOptionLabels = advancedOptions.filter(o => form.options[o.id]).map(o => `${t(o.labelKey, locale)}${o.ref ? ` (${o.ref})` : ''}`)
    return {
      form: {
        ...form,
        standardClauses: standardClauses.map(c => `${t(c.labelKey, locale)}${c.ref ? ` (${c.ref})` : ''}`),
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
      if (!res.ok) { setError(data.error || t('jurc.preview.error_generation', locale)); return }
      setResult(data.text || "")
      setSources(Array.isArray(data.sources) ? data.sources : [])
    } catch (e: any) {
      setError(e.message || t('jurc.preview.network_error', locale))
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
      if (!res.ok) { alert(data.error || t('jurc.preview.save_error', locale)); return }
      if (data.contract_id) { setSavedContractId(data.contract_id); }
    } catch (e: any) {
      alert(t('jurc.preview.error_label', locale) + " " + (e.message || ""))
    } finally { setSaving(false) }
  }

  async function handleDownloadPdf() {
    if (!result) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/generate-contract/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tplLabel(template.id, locale),
          corps: result,
          lieu: form.workLocation || undefined,
          date: form.startDate || undefined,
          labelA: labels.a,
          labelB: labels.b,
          employeur: { nom: form.empName, brn: form.empBrn, adresse: form.empAddr, representant: form.empRep, titre: form.empTitle },
          contractant: { nom: form.eeName, nic: form.eeNic, adresse: form.eeAddr, representant: form.eeRep || undefined, titre: form.eeTitle || undefined },
          sources,
        }),
      })
      if (!res.ok) { const d = await readJsonSafe(res).catch(() => ({})); alert(d.error || t('jurc.preview.pdf_error', locale)); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contrat_${form.contractType}_${(form.eeName || 'projet').replace(/\s/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(t('jurc.preview.pdf_error', locale) + (e.message ? ` (${e.message})` : ""))
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
      if (!res.ok) { alert(data.error || t('jurc.preview.refine_failed', locale)); return }
      setResult(data.text || result)
      if (Array.isArray(data.sources) && data.sources.length) setSources(data.sources)
      setRefineLog((l) => [...l, instruction])
      setRefineInput("")
      setSavedContractId(null)
    } catch (e: any) {
      alert(e.message || t('jurc.preview.network_error', locale))
    } finally { setRefining(false) }
  }

  /* ───────────────  VUE GALERIE  ─────────────── */
  if (view === 'gallery') {
    const FAMILY_LABELS: Record<ContractFamily, string> = {
      Emploi: t('jurc.family.Emploi', locale), Affaires: t('jurc.family.Affaires', locale), Société: t('jurc.family.Societe', locale), Immobilier: t('jurc.family.Immobilier', locale), Finance: t('jurc.family.Finance', locale),
    }
    const families: ContractFamily[] = ['Emploi', 'Affaires', 'Société', 'Finance', 'Immobilier']
    const q = gallerySearch.trim().toLowerCase()
    const matches = (tpl: Template) => !q || `${tplLabel(tpl.id, locale)} ${tplDesc(tpl.id, locale)} ${tpl.law}`.toLowerCase().includes(q)
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
                <h1 className="text-xl font-bold" style={{ color: NAVY }}>{t('jurc.gallery.title', locale)}</h1>
                <p className="text-xs text-gray-500">{TEMPLATES.length} {t('jurc.gallery.subtitle_suffix', locale)}</p>
              </div>
            </div>

            {/* Recherche */}
            <div className="relative mb-6">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder={t('jurc.gallery.search_placeholder', locale)}
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center text-sm text-gray-400">{t('jurc.gallery.no_match_prefix', locale)}{gallerySearch}{t('jurc.gallery.no_match_suffix', locale)}</div>
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
                        <p className="font-bold text-[15px]" style={{ color: NAVY }}>{tplLabel(tpl.id, locale)}</p>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{tplDesc(tpl.id, locale)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <p className="text-[11px] text-gray-400 text-center mt-2">
              {t('jurc.gallery.disclaimer', locale)}
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
              <ArrowLeft className="w-4 h-4" /> {t('jurc.form.back_models', locale)}
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <template.icon className="w-5 h-5" style={{ color: NAVY }} />
            <h1 className="text-lg font-bold" style={{ color: NAVY }}>{tplLabel(template.id, locale)}</h1>
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.14)", color: "#8a6d15" }}>{template.law}</span>
          </div>

          <div className="space-y-5">
            {/* ── Formulaire ── */}
            <div className="space-y-4">
              {/* Paramètres */}
              <Card>
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Building2 className="w-3 h-3" /> {t('jurc.form.company', locale)}</Label>
                    <Select value={societeId} onValueChange={selectSociete}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('jurc.form.language', locale)}</Label>
                    <Select value={form.language} onValueChange={v => update('language', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{t(l.labelKey, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('jurc.form.jurisdiction', locale)}</Label>
                    <Select value={form.jurisdiction} onValueChange={v => update('jurisdiction', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{JURISDICTIONS.map(j => <SelectItem key={j.id} value={j.id}>{t(j.labelKey, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Parties */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Users className="w-4 h-4" /> {t('jurc.form.parties', locale)}</h3>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{labels.a}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">{t('jurc.form.company_name', locale)}</Label><Input value={form.empName} onChange={e => update('empName', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.brn', locale)}</Label><Input value={form.empBrn} onChange={e => update('empBrn', e.target.value)} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">{t('jurc.form.address', locale)}</Label><Input value={form.empAddr} onChange={e => update('empAddr', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.representative', locale)}</Label><Input value={form.empRep} onChange={e => update('empRep', e.target.value)} placeholder={t('jurc.form.representative_ph', locale)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.quality', locale)}</Label><Input value={form.empTitle} onChange={e => update('empTitle', e.target.value)} placeholder={t('jurc.form.quality_ph', locale)} /></div>
                    </div>
                  </div>
                  <div className="pt-3 border-t">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{labels.b}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">{t('jurc.form.fullname_company', locale)}</Label><Input value={form.eeName} onChange={e => update('eeName', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.nic_brn_passport', locale)}</Label><Input value={form.eeNic} onChange={e => update('eeNic', e.target.value)} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">{t('jurc.form.address', locale)}</Label><Input value={form.eeAddr} onChange={e => update('eeAddr', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.email', locale)}</Label><Input type="email" value={form.eeEmail} onChange={e => update('eeEmail', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.phone', locale)}</Label><Input value={form.eePhone} onChange={e => update('eePhone', e.target.value)} /></div>
                      {!isEmployment && (
                        <>
                          <div><Label className="text-xs">{t('jurc.form.rep_if_company', locale)}</Label><Input value={form.eeRep} onChange={e => update('eeRep', e.target.value)} placeholder={t('jurc.form.representative_ph', locale)} /></div>
                          <div><Label className="text-xs">{t('jurc.form.rep_quality', locale)}</Label><Input value={form.eeTitle} onChange={e => update('eeTitle', e.target.value)} placeholder={t('jurc.form.quality_ph', locale)} /></div>
                        </>
                      )}
                    </div>
                    {!isEmployment && <p className="text-[11px] text-gray-400 mt-1.5">{t('jurc.form.rep_hint', locale)}</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Conditions */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Settings className="w-4 h-4" /> {t('jurc.form.conditions', locale)}</h3>
                  {isEmployment ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label className="text-xs">{t('jurc.form.job_title', locale)}</Label><Input value={form.jobTitle} onChange={e => update('jobTitle', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.department', locale)}</Label><Input value={form.jobDept} onChange={e => update('jobDept', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.start_date', locale)}</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                      {form.contractType !== 'CDI' && <div><Label className="text-xs">{t('jurc.form.end_date', locale)}</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>}
                      <div><Label className="text-xs">{t('jurc.form.gross_monthly_salary', locale)}</Label><Input value={form.salary} onChange={e => update('salary', e.target.value)} inputMode="decimal" /></div>
                      <div>
                        <Label className="text-xs">{t('jurc.form.frequency', locale)}</Label>
                        <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Mensuel">{t('jurc.form.freq_monthly', locale)}</SelectItem><SelectItem value="Bi-mensuel">{t('jurc.form.freq_bimonthly', locale)}</SelectItem><SelectItem value="Hebdomadaire">{t('jurc.form.freq_weekly', locale)}</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('jurc.form.probation', locale)}</Label>
                        <Select value={form.probation} onValueChange={v => update('probation', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="3 mois">{t('jurc.form.prob_3m', locale)}</SelectItem><SelectItem value="6 mois">{t('jurc.form.prob_6m', locale)}</SelectItem><SelectItem value="1 an">{t('jurc.form.prob_1y', locale)}</SelectItem><SelectItem value="Aucune">{t('jurc.form.prob_none', locale)}</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('jurc.form.notice', locale)}</Label>
                        <Select value={form.noticePeriod} onValueChange={v => update('noticePeriod', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="1 mois">{t('jurc.form.notice_1m', locale)}</SelectItem><SelectItem value="2 mois">{t('jurc.form.notice_2m', locale)}</SelectItem><SelectItem value="3 mois">{t('jurc.form.notice_3m', locale)}</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">{t('jurc.form.weekly_hours', locale)}</Label><Input type="number" value={form.weeklyHours} onChange={e => update('weeklyHours', e.target.value)} /></div>
                      <div><Label className="text-xs">{t('jurc.form.work_location', locale)}</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} /></div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">{t('jurc.form.annual_leave', locale)}</Label>
                        <Select value={form.annualLeave} onValueChange={v => update('annualLeave', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20 jours (minimum légal WRA 2019)">{t('jurc.form.leave_20_legal', locale)}</SelectItem>
                            <SelectItem value="22 jours">{t('jurc.form.leave_22', locale)}</SelectItem>
                            <SelectItem value="25 jours">{t('jurc.form.leave_25', locale)}</SelectItem>
                            <SelectItem value="30 jours">{t('jurc.form.leave_30', locale)}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2"><Label className="text-xs">{t('jurc.form.benefits', locale)}</Label><Textarea className="mt-1 min-h-[64px]" value={form.benefits} onChange={e => update('benefits', e.target.value)} placeholder={t('jurc.form.benefits_ph', locale)} /></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2"><Label className="text-xs">{LEASE.has(form.contractType) ? t('jurc.form.lease_premises', locale) : t('jurc.form.object_mission', locale)}</Label><Textarea className="mt-1 min-h-[72px]" value={form.objet} onChange={e => update('objet', e.target.value)} placeholder={form.contractType === 'nda' ? t('jurc.form.nda_object_ph', locale) : LEASE.has(form.contractType) ? t('jurc.form.lease_premises_ph', locale) : t('jurc.form.object_mission_ph', locale)} /></div>
                      <div><Label className="text-xs">{LEASE.has(form.contractType) ? t('jurc.form.lease_start', locale) : t('jurc.form.start_or_signature', locale)}</Label><Input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
                      <div><Label className="text-xs">{LEASE.has(form.contractType) ? t('jurc.form.lease_end', locale) : t('jurc.form.end_or_term', locale)}</Label><Input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></div>
                      {form.contractType !== 'nda' && <div><Label className="text-xs">{LEASE.has(form.contractType) ? t('jurc.form.monthly_rent', locale) : t('jurc.form.consideration', locale)}</Label><Input value={form.montant} onChange={e => update('montant', e.target.value)} inputMode="decimal" /></div>}
                      {form.contractType !== 'nda' && (
                        <div>
                          <Label className="text-xs">{LEASE.has(form.contractType) ? t('jurc.form.rent_periodicity', locale) : t('jurc.form.billing', locale)}</Label>
                          <Select value={form.payFrequency} onValueChange={v => update('payFrequency', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="À la livraison">{t('jurc.form.bill_on_delivery', locale)}</SelectItem><SelectItem value="Mensuel">{t('jurc.form.freq_monthly', locale)}</SelectItem><SelectItem value="Forfait">{t('jurc.form.bill_flat', locale)}</SelectItem><SelectItem value="Échelonné">{t('jurc.form.bill_staged', locale)}</SelectItem></SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="md:col-span-2"><Label className="text-xs">{t('jurc.form.place', locale)}</Label><Input value={form.workLocation} onChange={e => update('workLocation', e.target.value)} placeholder={t('jurc.form.place_ph', locale)} /></div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Clauses */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: NAVY }}><Shield className="w-4 h-4" /> {t('jurc.form.clauses_options', locale)}</h3>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><Lock className="w-3 h-3" /> {t('jurc.form.auto_included', locale)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {standardClauses.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12.5px] text-gray-600">
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#16a34a" }} />
                          <span className="flex-1">{t(c.labelKey, locale)}</span>
                          {c.ref && <span className="text-[10px] text-gray-400 font-mono shrink-0">{c.ref}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {advancedOptions.length > 0 && (
                    <div className="pt-3 border-t">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{t('jurc.form.options_to_enable', locale)}</p>
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
                              <span className="flex-1 text-gray-700">{t(o.labelKey, locale)}</span>
                              {o.ref && <span className="text-[10px] text-gray-400 font-mono shrink-0">{o.ref}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t">
                    <Label className="text-xs font-semibold">{t('jurc.form.custom_clause', locale)}</Label>
                    <Textarea className="mt-1.5 min-h-[64px]" value={form.customClause} onChange={e => update('customClause', e.target.value)} placeholder={t('jurc.form.custom_clause_ph', locale)} />
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleGenerate} disabled={loading} className="w-full h-11" style={{ backgroundColor: NAVY, color: GOLD }}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSignature className="w-4 h-4 mr-2" />}
                {loading ? t('jurc.form.generating', locale) : t('jurc.form.generate', locale)}
              </Button>
            </div>

            {/* ── Aperçu (pleine largeur, affiché dès qu'il y a du contenu) ── */}
            {(loading || result || error) && (
            <div>
              <Card className="min-h-[300px]">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /> <span className="text-gray-500">{t('jurc.preview.generating', locale)}</span></>
                        : result ? <><CheckCircle className="w-4 h-4 text-green-500" /> <span className="text-gray-600 font-medium">{t('jurc.preview.draft_contract', locale)}</span></>
                        : error ? <><AlertCircle className="w-4 h-4 text-red-500" /> <span className="text-red-600">{t('jurc.preview.error', locale)}</span></>
                        : <><FileText className="w-4 h-4 text-gray-300" /> <span className="text-gray-400">{t('jurc.preview.preview', locale)}</span></>}
                    </div>
                    {result && (
                      <div className="flex gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" onClick={handleCopy}>{copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{copied ? t('jurc.preview.copied', locale) : t('jurc.preview.copy', locale)}</Button>
                        <Button size="sm" onClick={handleDownloadPdf} disabled={pdfLoading} style={{ backgroundColor: GOLD, color: NAVY }}>{pdfLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}PDF</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !societeId} style={{ backgroundColor: NAVY, color: GOLD }}>{saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}{t('jurc.preview.save', locale)}</Button>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3"><strong>{t('jurc.preview.error_label', locale)}</strong> {error}</div>}
                    {savedContractId && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2 mb-3"><CheckCircle className="w-4 h-4" /> {t('jurc.preview.saved_prefix', locale)}<code className="font-mono">{savedContractId.slice(0, 8)}</code>)</div>}

                    {!result && !loading && !error && (
                      <div className="text-center py-20 text-gray-400">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{t('jurc.preview.empty_hint', locale)}</p>
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
                            {form.empRep ? (<>
                              <p className="text-[11px] text-gray-700 font-medium">{form.empRep}{form.empTitle ? `, ${form.empTitle}` : ''}</p>
                              <p className="text-[11px] text-gray-500">{t('jurc.preview.for', locale)} {form.empName || t('jurc.preview.to_complete', locale)}</p>
                            </>) : <p className="text-[11px] text-gray-500">{form.empName || t('jurc.preview.to_complete', locale)}</p>}
                            <div className="mt-7 border-t border-gray-300 pt-1 text-[10px] text-gray-400">{t('jurc.preview.signature', locale)}</div>
                            <p className="text-[10px] text-gray-400 mt-2">{t('jurc.preview.done_at', locale)} {form.workLocation || 'Port-Louis'}, {t('jurc.preview.the', locale)} {new Date(form.startDate || Date.now()).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: NAVY }}>{labels.b}</p>
                            {form.eeRep ? (<>
                              <p className="text-[11px] text-gray-700 font-medium">{form.eeRep}{form.eeTitle ? `, ${form.eeTitle}` : ''}</p>
                              <p className="text-[11px] text-gray-500">{t('jurc.preview.for', locale)} {form.eeName || t('jurc.preview.to_complete', locale)}</p>
                            </>) : <p className="text-[11px] text-gray-500">{form.eeName || t('jurc.preview.to_complete', locale)}</p>}
                            <p className="text-[11px] text-gray-600 mt-1.5">{t('jurc.preview.read_approved', locale)}</p>
                            <div className="mt-3 border-t border-gray-300 pt-1 text-[10px] text-gray-400">{t('jurc.preview.signature', locale)}</div>
                            <p className="text-[10px] text-gray-400 mt-2">{t('jurc.preview.done_at', locale)} {form.workLocation || 'Port-Louis'}, {t('jurc.preview.the', locale)} {new Date(form.startDate || Date.now()).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}</p>
                          </div>
                        </div>

                        {sources.length > 0 && (
                          <div className="mt-5 pt-3 border-t border-gray-100">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" style={{ color: GOLD }} /> {t('jurc.preview.cited_sources', locale)}</p>
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
                  <Settings className="w-4 h-4" style={{ color: GOLD }} /> {t('jurc.refine.title', locale)}
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  {t('jurc.refine.subtitle', locale)}
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
                    placeholder={result ? t('jurc.refine.placeholder_active', locale) : t('jurc.refine.placeholder_inactive', locale)}
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
