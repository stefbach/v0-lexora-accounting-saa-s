// =============================================================================
// lib/crm/prompts.ts — Prompts Claude pour le module CRM Prospection
// =============================================================================
// Objectif : Lexora vend une plateforme SaaS comptable + paie + conformité MRA
// à des entreprises mauriciennes. L'IA aide l'équipe commerciale à :
//   1. Qualifier une société (taille, secteur, pain points probables)
//   2. Proposer une stratégie de prospection personnalisée
//
// Important : produire une sortie 100% JSON parsable (pas de markdown autour).
// =============================================================================

import type { CrmCompany, CrmContact } from './types'

const LEXORA_VALUE_PROP = `
Lexora est une plateforme SaaS comptable conçue pour l'Île Maurice :
- Comptabilité conforme aux normes mauriciennes (PCM, IFRS, MRA)
- Module paie complet (PAYE, NSF, CSG, exports MRA automatiques)
- Rapprochement bancaire automatique (MCB, SBM, MauBank, ABC, Absa, Afrasia, etc.)
- Déclarations TVA/IT Form 3 automatisées
- Gestion RH (planning, congés, trajets, contrats)
- Workflow Telegram pour les dirigeants en déplacement
- Module juridique IA (contrats, statuts, AGE/AGO)
Public cible : PME mauriciennes 5-200 salariés, cabinets comptables, GBC.
Prix indicatif : Rs 2 500 à Rs 25 000 / mois selon volume.
`.trim()

// -----------------------------------------------------------------------------
// Prompt : analyse d'une société
// -----------------------------------------------------------------------------
export function buildCompanyEnrichmentPrompt(company: CrmCompany): string {
  return `Tu es un analyste B2B expert du marché mauricien et de la vente de SaaS comptable.

${LEXORA_VALUE_PROP}

# Fiche société à analyser
Nom : ${company.nom}
BRN : ${company.brn ?? '—'}
Site : ${company.site_web ?? '—'}
Activité : ${company.activite ?? '—'} (code NIC : ${company.nic_code ?? '—'})
Industrie : ${company.industrie ?? '—'}
Effectif : ${company.taille_effectif ?? '—'}
Année création : ${company.annee_creation ?? '—'}
Ville / région : ${company.ville ?? '—'} / ${company.region ?? '—'}
Description : ${company.description ?? '—'}

Données brutes additionnelles (source : ${company.source}) :
${JSON.stringify(company.raw_data ?? {}, null, 2).slice(0, 4000)}

# Ta mission
Produire une analyse structurée pour aider l'équipe commerciale Lexora à
décider s'il faut prospecter cette société, et comment.

# Format de sortie (JSON STRICT, aucun texte autour)
{
  "resume": "résumé en 2 phrases de l'activité et de la maturité de la société",
  "industrie_normalisee": "ex: Distribution, Services financiers, Hôtellerie, Construction, Textile, ICT, etc.",
  "taille_estimee": "ex: TPE (1-10), PME (11-50), ETI (51-200), Grande (200+)",
  "pain_points": ["3 à 5 pain points comptables/paie/conformité probables vu le profil"],
  "opportunites_lexora": ["3 à 5 modules Lexora qui résoudraient leurs pain points"],
  "niveau_priorite": "haute|moyenne|basse",
  "score_qualification": 0-100,
  "accroches": {
    "email_court": "objet + 2 lignes maximum, ton direct, en français mauricien neutre",
    "email_long": "email complet (200-300 mots) avec hook, value prop, CTA clair",
    "linkedin_dm": "message court (max 300 caractères) personnalisé"
  },
  "canal_recommande": "email|linkedin|whatsapp|phone",
  "timing_recommande": "ex: 'En début de mois (avant clôture)' ou 'Mardi/Mercredi 9h-11h'"
}

Règles strictes :
- Sortir SEULEMENT le JSON, rien avant rien après.
- Pas de fences markdown \`\`\`.
- Les accroches doivent mentionner explicitement la société et un détail concret.
- Si l'info est insuffisante pour scorer, mettre score_qualification entre 30 et 50.`
}

// -----------------------------------------------------------------------------
// Prompt : analyse d'un contact (persona + stratégie d'approche)
// -----------------------------------------------------------------------------
export function buildContactEnrichmentPrompt(
  contact: CrmContact,
  company?: CrmCompany | null,
): string {
  return `Tu es un expert en prospection B2B sur le marché mauricien.

${LEXORA_VALUE_PROP}

# Fiche contact à analyser
Nom : ${contact.prenom ?? ''} ${contact.nom ?? ''}
Titre : ${contact.titre ?? '—'} (séniorité : ${contact.seniorite ?? '—'})
Décideur : ${contact.decision_maker ? 'OUI' : 'à confirmer'}
LinkedIn : ${contact.linkedin_url ?? '—'}
Email : ${contact.email ?? '—'} (vérifié : ${contact.email_verified ? 'oui' : 'non'})
Langue préférée : ${contact.langue_preferee ?? 'fr'}

# Société associée
${company ? `Nom : ${company.nom}
Activité : ${company.activite ?? '—'}
Effectif : ${company.taille_effectif ?? '—'}
Région : ${company.ville ?? '—'} / ${company.region ?? '—'}` : 'Société non liée'}

Données brutes contact :
${JSON.stringify(contact.raw_data ?? {}, null, 2).slice(0, 3000)}

# Ta mission
Définir le persona, les motivations probables, les objections, et 4 variantes
d'accroche personnalisées (email court, email long, LinkedIn DM, WhatsApp).

# Format de sortie (JSON STRICT)
{
  "persona": "1 phrase : qui est ce contact, son rôle dans la décision",
  "motivations": ["3-4 motivations probables (gain de temps, conformité, reporting...)"],
  "objections_probables": ["3 objections probables (prix, changement, intégration...)"],
  "pain_points": ["3 pain points spécifiques à son rôle"],
  "accroches": {
    "email_court": "objet + 2 lignes, ton direct",
    "email_long": "email complet 200-300 mots, hook personnel, value prop, CTA",
    "linkedin_dm": "message court max 300 caractères",
    "whatsapp": "message court max 200 caractères, ton chaleureux mauricien"
  },
  "canal_recommande": "email|linkedin|whatsapp|phone",
  "timing_recommande": "ex: 'Mardi/Jeudi 9h-11h heure Maurice'",
  "score_qualification": 0-100
}

Règles strictes :
- JSON pur, pas de markdown.
- Mentionner le titre/rôle et la société dans les accroches.
- Adapter la langue (fr/en) à langue_preferee.
- Si données insuffisantes : score 30-50 et signale dans persona.`
}
