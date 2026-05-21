/**
 * lib/comptable/inter-societes.ts
 *
 * Détection des virements bancaires inter-sociétés (même groupe / même actionnaire)
 * pour le rapprochement automatique côté `app/api/comptable/rapprochement/route.ts`.
 *
 * Contexte (cf migrations 291/292/293) :
 *   - Bug historique : un virement entre 2 sociétés liées (ex DDS ↔ OCC) était
 *     classé `virement_interne` → DR 5800 / CR 512. La 2ème jambe (CR 5800)
 *     n'était JAMAIS générée car la société destinataire n'apparaissait
 *     pas dans la même session de rapprochement → 5800 (transit) accumulait
 *     un solde fantôme (+6.25M MUR observé en prod).
 *
 * Correctif (ce module) :
 *   1. Détecter si la tx bancaire est un virement vers/depuis une autre
 *      société du MÊME groupe (même `groupe_id` ou même `client_id`).
 *   2. Si oui → utiliser le compte 451 "Comptes courants — Groupe" (IAS 24)
 *      au lieu de 5800, et générer IMMÉDIATEMENT la contre-partie miroir
 *      dans la société destinataire (DR 512 / CR 451).
 *
 * Stratégie de matching libellé :
 *   - normalisation : suppression accents, lowercase, suppression LTD/LTÉE,
 *     compactage espaces, retrait ponctuation.
 *   - exact substring match sur le nom complet OU sur fragment significatif
 *     (>= 6 caractères) extrait du nom.
 *   - fuzzy via Levenshtein normalisé (similarité >= 0.7) sur token de
 *     plus de 4 caractères dans le libellé tx vs nom société.
 *
 * Sécurité : la résolution renvoie `societe_dest_id` mais c'est au caller
 * (route.ts) de vérifier l'accès via `userHasAccessToSociete()` avant de
 * créer le miroir comptable.
 */

// ─────────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────────

export interface SocieteGroupeRow {
  id: string
  nom: string
  groupe_id?: string | null
  client_id?: string | null
}

export interface InterSocieteDetection {
  is_inter: boolean
  societe_dest_id: string | null
  societe_dest_nom: string | null
  match_method: 'exact' | 'fragment' | 'fuzzy' | 'none'
  score: number
}

// Seuils de détection
const FUZZY_THRESHOLD = 0.7
const MIN_TOKEN_LEN = 4
const MIN_FRAGMENT_LEN = 6

// ─────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalise une chaîne pour comparaison :
 *   - lowercase
 *   - suppression accents (NFD)
 *   - suppression des suffixes corporatifs courants (LTD, LTEE, LIMITED, SA, SARL)
 *   - retrait ponctuation
 *   - compactage espaces
 */
export function normalizeForMatch(s: string | null | undefined): string {
  if (!s) return ''
  let n = String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire diacritiques
    .toLowerCase()
  // Suppression suffixes corporatifs (avant compactage espaces)
  n = n.replace(/\b(ltd\.?|ltee\.?|ltée\.?|limited|sa\.?|s\.a\.?|sarl\.?|s\.a\.r\.l\.?|inc\.?|corp\.?|llc\.?)\b/g, ' ')
  // Retrait ponctuation
  n = n.replace(/[^a-z0-9\s]+/g, ' ')
  // Compactage espaces
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

/**
 * Extrait les tokens significatifs (mots de longueur >= MIN_TOKEN_LEN)
 * d'une chaîne normalisée.
 */
function tokens(s: string): string[] {
  if (!s) return []
  return s.split(' ').filter((t) => t.length >= MIN_TOKEN_LEN)
}

// ─────────────────────────────────────────────────────────────────────────
// Levenshtein normalisé
// ─────────────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = a.length
  const n = b.length
  const v0: number[] = new Array(n + 1)
  const v1: number[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) v0[i] = i
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1
    for (let j = 0; j < n; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j]
  }
  return v0[n]
}

/**
 * Similarité de Levenshtein normalisée sur [0, 1].
 * 1 = identique, 0 = complètement différent.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - dist / maxLen
}

// ─────────────────────────────────────────────────────────────────────────
// Détection inter-sociétés
// ─────────────────────────────────────────────────────────────────────────

/**
 * Détecte si une transaction (libellé + tiers détecté) correspond à un
 * virement vers/depuis une autre société du même groupe.
 *
 * @param libelle Libellé brut de la transaction bancaire
 * @param tiers_detecte (optionnel) tiers extrait par le moteur de classification
 * @param societes_groupe Liste des AUTRES sociétés du même groupe (ne PAS inclure la société source)
 * @returns Le match le plus probable ; `is_inter=false` si rien ne matche.
 */
export function detectInterSociete(
  libelle: string | null | undefined,
  tiers_detecte: string | null | undefined,
  societes_groupe: SocieteGroupeRow[],
): InterSocieteDetection {
  const NONE: InterSocieteDetection = {
    is_inter: false,
    societe_dest_id: null,
    societe_dest_nom: null,
    match_method: 'none',
    score: 0,
  }

  if (!societes_groupe || societes_groupe.length === 0) return NONE

  const searchSpace = normalizeForMatch(
    [libelle || '', tiers_detecte || ''].filter(Boolean).join(' '),
  )
  if (!searchSpace) return NONE

  let best: InterSocieteDetection = NONE

  for (const soc of societes_groupe) {
    if (!soc?.id || !soc?.nom) continue
    const normNom = normalizeForMatch(soc.nom)
    if (!normNom) continue

    // 1) Exact substring (nom complet normalisé présent tel quel)
    if (normNom.length >= MIN_FRAGMENT_LEN && searchSpace.includes(normNom)) {
      // score = 1 (match complet) — on garde le 1er match exact rencontré
      return {
        is_inter: true,
        societe_dest_id: soc.id,
        societe_dest_nom: soc.nom,
        match_method: 'exact',
        score: 1,
      }
    }

    // 2) Fragment match : on tente la moitié initiale du nom (>=6 chars)
    //    Ex: "DIGITAL DATA SOLUTIONS LTD" → "digital data" / "data solutions"
    const nomTokens = tokens(normNom)
    if (nomTokens.length >= 2) {
      // bigrammes successifs
      for (let i = 0; i < nomTokens.length - 1; i++) {
        const bigram = `${nomTokens[i]} ${nomTokens[i + 1]}`
        if (bigram.length >= MIN_FRAGMENT_LEN && searchSpace.includes(bigram)) {
          const score = 0.9
          if (score > best.score) {
            best = {
              is_inter: true,
              societe_dest_id: soc.id,
              societe_dest_nom: soc.nom,
              match_method: 'fragment',
              score,
            }
          }
        }
      }
    }
    // Fragment unique (token long, >= 6 chars, ex "obesity", "digital")
    for (const tok of nomTokens) {
      if (tok.length >= MIN_FRAGMENT_LEN && searchSpace.includes(tok)) {
        const score = 0.85
        if (score > best.score) {
          best = {
            is_inter: true,
            societe_dest_id: soc.id,
            societe_dest_nom: soc.nom,
            match_method: 'fragment',
            score,
          }
        }
      }
    }

    // 3) Fuzzy Levenshtein : on compare chaque token de la chaîne
    //    de recherche au nom complet normalisé OU aux tokens du nom.
    //    Couvre les abréviations type "Digital Data Sol Ltd" → "digital data solutions"
    const searchTokens = tokens(searchSpace)
    // a) comparaison globale nom normalisé entier vs slice du searchSpace
    //    de longueur similaire (sliding window grossier)
    if (normNom.length >= 6) {
      const sim = levenshteinSimilarity(normNom, searchSpace)
      if (sim >= FUZZY_THRESHOLD && sim > best.score) {
        best = {
          is_inter: true,
          societe_dest_id: soc.id,
          societe_dest_nom: soc.nom,
          match_method: 'fuzzy',
          score: sim,
        }
      }
    }
    // b) comparaison par token vs token (couvre "sol" ≈ "solutions" via fragment)
    for (const tok of searchTokens) {
      for (const nTok of nomTokens) {
        // skip pairs où l'un des deux est trop court (bruit)
        if (tok.length < 4 || nTok.length < 4) continue
        // Si un token est strictement préfixe de l'autre (>=4 chars communs),
        // c'est une abréviation type "sol" → "solutions"
        const minLen = Math.min(tok.length, nTok.length)
        if (minLen >= 3 && (nTok.startsWith(tok) || tok.startsWith(nTok))) {
          const score = 0.78
          if (score > best.score) {
            best = {
              is_inter: true,
              societe_dest_id: soc.id,
              societe_dest_nom: soc.nom,
              match_method: 'fuzzy',
              score,
            }
          }
          continue
        }
        const sim = levenshteinSimilarity(tok, nTok)
        if (sim >= FUZZY_THRESHOLD && sim > best.score) {
          best = {
            is_inter: true,
            societe_dest_id: soc.id,
            societe_dest_nom: soc.nom,
            match_method: 'fuzzy',
            score: sim,
          }
        }
      }
    }
  }

  return best
}

// ─────────────────────────────────────────────────────────────────────────
// Resolver Supabase (admin client) : charge les sociétés du même groupe
// ─────────────────────────────────────────────────────────────────────────

/**
 * Renvoie la liste des autres sociétés appartenant au même groupe que `societe_id`.
 *
 * Règle :
 *   - si `societes.groupe_id` est renseigné → match par `groupe_id`
 *   - sinon fallback sur `societes.client_id` (sociétés du même client logique)
 *
 * `supabase` doit être un client admin (service role) car la route de
 * rapprochement utilise déjà ce niveau pour bypass RLS sur les écritures.
 */
export async function getSocietesDuMemeGroupe(
  supabase: any,
  societe_id: string,
): Promise<SocieteGroupeRow[]> {
  if (!societe_id) return []

  const { data: src, error } = await supabase
    .from('societes')
    .select('id, nom, groupe_id, client_id')
    .eq('id', societe_id)
    .maybeSingle()
  if (error || !src) return []

  // Priorité 1 : groupe_id (peut être null pour sociétés "isolées")
  if (src.groupe_id) {
    const { data: rows } = await supabase
      .from('societes')
      .select('id, nom, groupe_id, client_id')
      .eq('groupe_id', src.groupe_id)
      .neq('id', societe_id)
    return (rows || []) as SocieteGroupeRow[]
  }

  // Priorité 2 : client_id (fallback)
  if (src.client_id) {
    const { data: rows } = await supabase
      .from('societes')
      .select('id, nom, groupe_id, client_id')
      .eq('client_id', src.client_id)
      .neq('id', societe_id)
    return (rows || []) as SocieteGroupeRow[]
  }

  return []
}

/**
 * Helper de haut niveau : charge les sociétés liées + détecte le match.
 * Renvoie le résultat de détection prêt à être consommé par la route.
 */
export async function resolveInterSocieteForTransaction(
  supabase: any,
  societe_source_id: string,
  libelle: string | null | undefined,
  tiers_detecte: string | null | undefined,
): Promise<InterSocieteDetection> {
  const groupe = await getSocietesDuMemeGroupe(supabase, societe_source_id)
  if (groupe.length === 0) {
    return {
      is_inter: false,
      societe_dest_id: null,
      societe_dest_nom: null,
      match_method: 'none',
      score: 0,
    }
  }
  return detectInterSociete(libelle, tiers_detecte, groupe)
}

// ─────────────────────────────────────────────────────────────────────────
// Plan comptable inter-sociétés (constants)
// ─────────────────────────────────────────────────────────────────────────

/** Compte 451 "Comptes courants — Groupe" (PCM mauricien, IAS 24 related parties). */
export const COMPTE_GROUPE_451 = '451'

/** Compte 512 "Banque" — utilisé par défaut. La route peut surcharger via comptes_bancaires.compte_comptable. */
export const COMPTE_BANQUE_512 = '512'
