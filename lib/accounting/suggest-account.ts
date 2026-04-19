import type { SupabaseClient } from '@supabase/supabase-js'

export interface AccountSuggestion {
  compte: string
  libelle?: string
  confidence: number // 0-100
  source: 'affectation_explicite' | 'historique_fournisseur' | 'mot_cle_libelle' | 'default'
  reasoning?: string
  nb_utilisations_historique?: number
}

export interface SuggestAccountInput {
  societe_id: string
  tiers: string
  libelle?: string
  type_facture: 'client' | 'fournisseur'
  montant_ttc?: number
  supabase: SupabaseClient
}

// Dictionnaire mots-clés → compte (charges pour fournisseur)
export const KEYWORD_TO_ACCOUNT_FOURNISSEUR: Record<string, { compte: string; libelle: string }> = {
  electricite: { compte: '606100', libelle: 'Électricité' },
  eec: { compte: '606100', libelle: 'Électricité (CEB)' },
  ceb: { compte: '606100', libelle: 'Électricité (CEB)' },
  eau: { compte: '606120', libelle: 'Eau' },
  cwa: { compte: '606120', libelle: 'Eau (CWA)' },
  carburant: { compte: '606110', libelle: 'Carburant' },
  essence: { compte: '606110', libelle: 'Carburant' },
  diesel: { compte: '606110', libelle: 'Carburant' },
  petrol: { compte: '606110', libelle: 'Carburant' },
  shell: { compte: '606110', libelle: 'Carburant (Shell)' },
  total: { compte: '606110', libelle: 'Carburant (Total)' },
  telephone: { compte: '626000', libelle: 'Téléphone' },
  mobile: { compte: '626000', libelle: 'Téléphone mobile' },
  emtel: { compte: '626000', libelle: 'Téléphone (Emtel)' },
  'mauritius telecom': { compte: '626000', libelle: 'Téléphone (MT)' },
  internet: { compte: '626000', libelle: 'Internet' },
  fibre: { compte: '626000', libelle: 'Internet (fibre)' },
  loyer: { compte: '613200', libelle: 'Loyer' },
  bail: { compte: '613200', libelle: 'Loyer' },
  location: { compte: '613200', libelle: 'Location' },
  fournitures: { compte: '606400', libelle: 'Fournitures de bureau' },
  papeterie: { compte: '606400', libelle: 'Papeterie' },
  assurance: { compte: '616000', libelle: 'Assurance' },
  'mauritius union': { compte: '616000', libelle: 'Assurance (MUA)' },
  comptable: { compte: '622600', libelle: 'Honoraires comptable' },
  honoraires: { compte: '622600', libelle: 'Honoraires' },
  audit: { compte: '622700', libelle: 'Honoraires audit' },
  advisor: { compte: '622600', libelle: 'Honoraires conseil' },
  maintenance: { compte: '615000', libelle: 'Maintenance' },
  nettoyage: { compte: '615500', libelle: 'Nettoyage' },
  entretien: { compte: '615000', libelle: 'Entretien' },
  transport: { compte: '624000', libelle: 'Transport' },
  fret: { compte: '624000', libelle: 'Fret' },
  delivery: { compte: '624000', libelle: 'Livraison' },
  google: { compte: '626200', libelle: 'Services informatiques' },
  aws: { compte: '626200', libelle: 'Services informatiques (AWS)' },
  vercel: { compte: '626200', libelle: 'Services informatiques (Vercel)' },
  openai: { compte: '626200', libelle: 'Services IA (OpenAI)' },
  anthropic: { compte: '626200', libelle: 'Services IA (Anthropic)' },
  microsoft: { compte: '626200', libelle: 'Services informatiques' },
  saas: { compte: '626200', libelle: 'Abonnements SaaS' },
  formation: { compte: '633000', libelle: 'Formation' },
  training: { compte: '633000', libelle: 'Formation' },
  publicite: { compte: '623000', libelle: 'Publicité' },
  marketing: { compte: '623000', libelle: 'Marketing' },
  'facebook ads': { compte: '623000', libelle: 'Publicité Meta' },
  'bank fees': { compte: '627000', libelle: 'Frais bancaires' },
  'frais bancaires': { compte: '627000', libelle: 'Frais bancaires' },
}

// Dictionnaire clients (produits classe 7)
export const KEYWORD_TO_ACCOUNT_CLIENT: Record<string, { compte: string; libelle: string }> = {
  prestation: { compte: '706000', libelle: 'Prestations de services' },
  service: { compte: '706000', libelle: 'Services' },
  consulting: { compte: '706000', libelle: 'Conseil' },
  licence: { compte: '706100', libelle: 'Licences' },
  abonnement: { compte: '706100', libelle: 'Abonnements' },
  saas: { compte: '706100', libelle: 'Abonnements SaaS' },
  formation: { compte: '706200', libelle: 'Formations dispensées' },
  marchandise: { compte: '707000', libelle: 'Ventes marchandises' },
  produit: { compte: '707000', libelle: 'Ventes produits' },
  vente: { compte: '707000', libelle: 'Ventes' },
  location: { compte: '708000', libelle: 'Locations reçues' },
  remboursement: { compte: '708100', libelle: 'Remboursements' },
}

/** Normalise un nom de tiers pour matching */
export function normalizeTiersName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|sarl|sa|inc|corp|co|pvt|plc)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textContainsKeyword(text: string, keyword: string): boolean {
  return text.includes(keyword.toLowerCase())
}

/** Trouve le compte le plus utilisé dans l'historique d'un tiers donné */
export async function getMostUsedAccountForTiers(
  supabase: SupabaseClient,
  societe_id: string,
  tiers_normalized: string,
  type_facture: 'client' | 'fournisseur',
): Promise<{ compte: string; count: number } | null> {
  try {
    // Stratégie simple : regarder dans factures + ecritures_comptables_v2
    // Joindre via facture_id si présente, sinon via libellé
    const { data: factures, error } = await supabase
      .from('factures')
      .select('id, tiers')
      .eq('societe_id', societe_id)
      .eq('type_facture', type_facture)
      .limit(500)

    if (error || !factures) return null

    const factureIdsMatching = factures
      .filter((f: { id: string; tiers: string | null }) => f.tiers && normalizeTiersName(f.tiers).includes(tiers_normalized))
      .map((f: { id: string }) => f.id)

    if (factureIdsMatching.length === 0) return null

    // Chercher les écritures de charges (6xx pour fournisseur, 7xx pour client)
    const comptePrefix = type_facture === 'fournisseur' ? '6' : '7'
    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte')
      .in('facture_id', factureIdsMatching)
      .like('numero_compte', `${comptePrefix}%`)
      .limit(500)

    if (!ecritures || ecritures.length === 0) return null

    // Compter occurrences
    const counts = new Map<string, number>()
    for (const e of ecritures as Array<{ numero_compte: string | null }>) {
      if (e.numero_compte) {
        counts.set(e.numero_compte, (counts.get(e.numero_compte) ?? 0) + 1)
      }
    }

    let topCompte = ''
    let topCount = 0
    for (const [compte, count] of counts) {
      if (count > topCount) {
        topCount = count
        topCompte = compte
      }
    }

    return topCount > 0 ? { compte: topCompte, count: topCount } : null
  } catch {
    return null
  }
}

/**
 * Cherche une affectation explicite dans la table `affectations_comptables`.
 * Schéma réel (migration 050): colonnes `fournisseur`, `compte`, `nb_utilisations`.
 * Pour les factures clients, cette source n'est pas utilisée (table orientée fournisseurs).
 */
async function findExplicitAffectation(
  supabase: SupabaseClient,
  societe_id: string,
  tiers_normalized: string,
  type_facture: 'client' | 'fournisseur',
): Promise<{ compte: string; nb_utilisations: number } | null> {
  if (type_facture !== 'fournisseur') return null
  try {
    const { data, error } = await supabase
      .from('affectations_comptables')
      .select('fournisseur, compte, nb_utilisations')
      .eq('societe_id', societe_id)
      .limit(200)

    if (error || !data) return null

    const rows = data as Array<{ fournisseur: string | null; compte: string; nb_utilisations: number | null }>

    // Match exact normalisé en priorité
    for (const row of rows) {
      if (row.fournisseur && normalizeTiersName(row.fournisseur) === tiers_normalized) {
        return { compte: row.compte, nb_utilisations: row.nb_utilisations ?? 0 }
      }
    }

    // Match contains
    for (const row of rows) {
      if (row.fournisseur && normalizeTiersName(row.fournisseur).includes(tiers_normalized)) {
        return { compte: row.compte, nb_utilisations: row.nb_utilisations ?? 0 }
      }
    }

    return null
  } catch {
    return null
  }
}

function suggestFromKeywords(
  libelle: string,
  type_facture: 'client' | 'fournisseur',
): AccountSuggestion | null {
  const dict = type_facture === 'fournisseur' ? KEYWORD_TO_ACCOUNT_FOURNISSEUR : KEYWORD_TO_ACCOUNT_CLIENT
  const normalized = libelle.toLowerCase()
  for (const [keyword, account] of Object.entries(dict)) {
    if (textContainsKeyword(normalized, keyword)) {
      return {
        compte: account.compte,
        libelle: account.libelle,
        confidence: 60,
        source: 'mot_cle_libelle',
        reasoning: `Mot-clé "${keyword}" détecté dans le libellé`,
      }
    }
  }
  return null
}

/** Propose jusqu'à 3 suggestions de compte comptable, triées par confidence DESC */
export async function suggestAccounts(input: SuggestAccountInput): Promise<AccountSuggestion[]> {
  const { societe_id, tiers, libelle, type_facture, supabase } = input
  const tiersNormalized = normalizeTiersName(tiers)
  const suggestions: AccountSuggestion[] = []

  // Étape 1: affectation explicite
  const explicit = await findExplicitAffectation(supabase, societe_id, tiersNormalized, type_facture)
  if (explicit) {
    suggestions.push({
      compte: explicit.compte,
      confidence: 92,
      source: 'affectation_explicite',
      reasoning: `Affectation configurée pour ce tiers (${explicit.nb_utilisations} utilisations)`,
      nb_utilisations_historique: explicit.nb_utilisations,
    })
  }

  // Étape 2: historique
  const historique = await getMostUsedAccountForTiers(supabase, societe_id, tiersNormalized, type_facture)
  if (historique && historique.count >= 3) {
    const confidence = Math.min(80, 40 + historique.count * 10)
    // Ne pas dupliquer si même compte que explicit
    if (!suggestions.some((s) => s.compte === historique.compte)) {
      suggestions.push({
        compte: historique.compte,
        confidence,
        source: 'historique_fournisseur',
        reasoning: `Compte utilisé ${historique.count} fois pour ce tiers`,
        nb_utilisations_historique: historique.count,
      })
    }
  }

  // Étape 3: mots-clés
  const keywordText = `${tiers} ${libelle ?? ''}`
  const keywordSuggestion = suggestFromKeywords(keywordText, type_facture)
  if (keywordSuggestion && !suggestions.some((s) => s.compte === keywordSuggestion.compte)) {
    suggestions.push(keywordSuggestion)
  }

  // Fallback
  if (suggestions.length === 0) {
    suggestions.push({
      compte: type_facture === 'fournisseur' ? '606800' : '706800',
      libelle: type_facture === 'fournisseur' ? 'Autres charges externes' : 'Autres produits',
      confidence: 20,
      source: 'default',
      reasoning: 'Aucune règle spécifique — compte générique',
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}
