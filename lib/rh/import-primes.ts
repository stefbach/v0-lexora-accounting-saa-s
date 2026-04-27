/**
 * Import primes commerciales mensuelles depuis un fichier Excel.
 *
 * Format Excel attendu (1ère feuille) :
 *   - Ligne 1 : en-tête. Cellule A1 ignorée. Cellule B1 = "YYYY-MM-DD"
 *     (date utilisée pour déduire la période côté composant — la lib
 *     reçoit `periode` déjà parsée).
 *   - Lignes suivantes : colonne A = "Prénom Nom" (libre, matching
 *     fuzzy par tokens), colonne B = montant MUR.
 *
 * Workflow :
 *   1. UI lit le .xlsx côté client (xlsx lib), construit `LigneExcelBrute[]`.
 *   2. UI appelle `previewMatchingExcel(lignes, employes)` pour résoudre
 *      les correspondances. L'utilisateur corrige via Select shadcn.
 *   3. UI envoie au POST API les lignes confirmées : `LigneFront[]`
 *      (employe_id + montant), la route délègue à `importPrimes`.
 *
 * `importPrimes` :
 *   - Crée à la volée la prime "PRIME_COMMERCIALE" dans catalogue_primes
 *     pour la société si elle n'existe pas.
 *   - Refuse l'écriture pour les employés dont le bulletin de la période
 *     est verrouillé/validé (cohérent avec lib/rh/overtime.ts).
 *   - UPSERT primes_variables_mois ON CONFLICT (employe_id, prime_id,
 *     periode) — ne touche PAS à approuve / approuve_par /
 *     date_approbation / integre_paie / date_integration sur conflit
 *     (préserve une approbation Dr Bach existante si on corrige juste
 *     un montant).
 *   - Insère un audit log non bloquant (warnings si échec).
 */

import { firstDayOfMonth } from '@/lib/rh/period'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

// ─── Types publics ──────────────────────────────────────────────────────────

export interface LigneExcelBrute {
  ligne_excel: number       // numéro 1-indexé pour debug UI
  nom_complet: string       // contenu colonne A
  montant: number           // contenu colonne B
}

export interface EmployeShort {
  id: string
  nom: string
  prenom: string
}

export type MatchingStatus = 'ok' | 'ambigu' | 'non_matche'

export interface PreviewLigne {
  ligne_excel: number
  nom_excel: string
  montant: number
  employe_id_suggere: string | null
  candidats: Array<{ id: string; nom_complet: string }>
  statut: MatchingStatus
}

export interface LigneFront {
  employe_id: string
  montant: number
}

export interface ResultImport {
  success: boolean
  nb_importes: number
  nb_bulletins_bloques: number
  bulletins_bloques: string[]   // employe_id ayant un bulletin verrouillé/validé
  erreurs: string[]
  warnings: string[]
}

// ─── Helpers de normalisation / matching ───────────────────────────────────

/** Tokenize un nom : lowercase, retire les diacritiques, ne garde que les
 *  caractères de lettre, split sur espace, retire les mots vides. */
export function tokeniserNom(s: string): string[] {
  if (!s) return []
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // retire les marques combinantes
    .replace(/[^a-z0-9\s]/g, ' ')          // tout sauf lettres ASCII/digits → espace
    .split(/\s+/)
    .filter(t => t.length > 0)
}

/** Vrai si tous les tokens de `sous` sont présents dans `sur`. */
function tousInclus(sous: string[], sur: Set<string>): boolean {
  if (sous.length === 0) return false
  for (const t of sous) if (!sur.has(t)) return false
  return true
}

/** Compte de tokens en commun entre deux ensembles. */
function nbCommuns(a: string[], b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

/**
 * Résout pour chaque ligne Excel les candidats employés possibles.
 *
 * Règles :
 *   1. Si tous les tokens Excel sont inclus dans les tokens d'1 SEUL
 *      employé → `ok` avec employe_id_suggere = celui-là.
 *   2. Si tous les tokens Excel sont inclus dans plusieurs employés
 *      → `ambigu` avec employe_id_suggere = le premier dans le tri.
 *   3. Sinon, candidats = employés avec ≥ 1 token commun → `ambigu` si
 *      au moins un, suggéré = celui avec le plus de tokens communs.
 *   4. Aucun token commun → `non_matche`.
 *
 * Les noms Excel sont entièrement libres (espaces, accents, casing) ;
 * le matching est insensible à tout cela. Les cas connus type "Cathy"
 * vs "Catty" (typo) restent en `non_matche` — la correction passe par
 * la UI (Select sur la liste complète des employés actifs).
 */
export function previewMatchingExcel(
  lignes: LigneExcelBrute[],
  employes: EmployeShort[],
): PreviewLigne[] {
  // Pré-tokenize tous les employés une fois.
  const empTokens = employes.map(e => ({
    employe: e,
    tokens: new Set(tokeniserNom(`${e.prenom} ${e.nom}`)),
  }))

  const out: PreviewLigne[] = []
  for (const ligne of lignes) {
    const excelTokens = tokeniserNom(ligne.nom_complet)

    // Pass 1 : matches "exacts" (tous les tokens Excel inclus).
    const exacts = empTokens.filter(({ tokens }) => tousInclus(excelTokens, tokens))

    if (exacts.length === 1) {
      out.push({
        ligne_excel: ligne.ligne_excel,
        nom_excel: ligne.nom_complet,
        montant: ligne.montant,
        employe_id_suggere: exacts[0].employe.id,
        candidats: exacts.map(({ employe: e }) => ({
          id: e.id,
          nom_complet: `${e.prenom} ${e.nom}`.trim(),
        })),
        statut: 'ok',
      })
      continue
    }

    if (exacts.length > 1) {
      // Plusieurs employés contiennent tous les tokens Excel
      // → ambigu, on suggère le premier (tri stable sur `employes`).
      out.push({
        ligne_excel: ligne.ligne_excel,
        nom_excel: ligne.nom_complet,
        montant: ligne.montant,
        employe_id_suggere: exacts[0].employe.id,
        candidats: exacts.map(({ employe: e }) => ({
          id: e.id,
          nom_complet: `${e.prenom} ${e.nom}`.trim(),
        })),
        statut: 'ambigu',
      })
      continue
    }

    // Pass 2 : aucun match exact, on cherche les partiels (≥ 1 token
    // commun). Tri descendant par nb tokens communs.
    const partiels = empTokens
      .map(({ employe, tokens }) => ({
        employe,
        score: nbCommuns(excelTokens, tokens),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)

    if (partiels.length === 0) {
      out.push({
        ligne_excel: ligne.ligne_excel,
        nom_excel: ligne.nom_complet,
        montant: ligne.montant,
        employe_id_suggere: null,
        candidats: [],
        statut: 'non_matche',
      })
      continue
    }

    out.push({
      ligne_excel: ligne.ligne_excel,
      nom_excel: ligne.nom_complet,
      montant: ligne.montant,
      employe_id_suggere: partiels[0].employe.id,
      candidats: partiels.map(({ employe: e }) => ({
        id: e.id,
        nom_complet: `${e.prenom} ${e.nom}`.trim(),
      })),
      statut: 'ambigu',
    })
  }

  return out
}

// ─── Helpers DB internes ────────────────────────────────────────────────────

/** Résout l'employe_id du user connecté pour alimenter saisi_par
 *  (FK employes(id), pas auth.users(id)). Retourne null si l'user
 *  n'a pas d'employé lié — la colonne est nullable. */
async function resolveEmployeIdAuthUser(
  supabase: SupabaseLike,
  authUserId: string,
): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('employe_id')
      .eq('id', authUserId)
      .maybeSingle()
    if (profile?.employe_id) return profile.employe_id as string
  } catch { /* ignored, fallback below */ }
  try {
    const { data: emp } = await supabase
      .from('employes')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (emp?.id) return emp.id as string
  } catch { /* ignored */ }
  return null
}

/** Résout (ou crée à la volée) l'UUID de la prime "PRIME_COMMERCIALE"
 *  pour la société. Idempotent — appel répété renvoie la même prime. */
async function resolveOuCreerPrimeCommerciale(
  supabase: SupabaseLike,
  societeId: string,
): Promise<{ id: string | null; erreur?: string }> {
  const code = 'PRIME_COMMERCIALE'

  // 1. Tenter SELECT (cas courant : la prime existe déjà).
  const { data: existing } = await supabase
    .from('catalogue_primes')
    .select('id')
    .eq('societe_id', societeId)
    .eq('code', code)
    .maybeSingle()
  if (existing?.id) return { id: existing.id as string }

  // 2. INSERT — set type ET type_prime à 'commission' (CHECK constraint
  //    sur `type` legacy + colonne moderne `type_prime` sans CHECK).
  const { data: created, error } = await supabase
    .from('catalogue_primes')
    .insert({
      societe_id: societeId,
      code,
      libelle: 'Prime commerciale',
      type: 'commission',
      type_prime: 'commission',
      actif: true,
    })
    .select('id')
    .single()
  if (error) return { id: null, erreur: error.message }
  return { id: (created as { id: string }).id }
}

// ─── Fonction principale d'import ──────────────────────────────────────────

/**
 * Persiste les primes commerciales du mois.
 *
 *   - `periode` : 'YYYY-MM-01' (DATE PostgreSQL accepte la chaîne ISO).
 *   - `lignes`  : couples (employe_id, montant) déjà validés/résolus
 *                 par le composant. Les montants ≤ 0, montants > 1M MUR,
 *                 ou employe_id vides sont filtrés ici (filet de sécurité).
 *
 * Sémantique du retour identique à saveOvertimeMois :
 *   - `success = true` si les écritures métier ont réussi (l'audit log
 *     est non bloquant et remonte dans `warnings`).
 *   - `bulletins_bloques` : employe_id retirés du batch parce que leur
 *     bulletin du mois est verrouillé/validé. Le reste du batch passe
 *     quand même.
 */
export async function importPrimes(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
  lignes: LigneFront[],
  user: { id: string; email?: string | null },
): Promise<ResultImport> {
  const erreurs: string[] = []
  const warnings: string[] = []
  const periodeDb = firstDayOfMonth(periode)

  // 1. Filet de sécurité sur l'input.
  const lignesValides: LigneFront[] = []
  for (const l of lignes) {
    const m = Number(l.montant)
    if (!l.employe_id || typeof l.employe_id !== 'string') continue
    if (!Number.isFinite(m) || m <= 0 || m > 1_000_000) continue
    lignesValides.push({ employe_id: l.employe_id, montant: Math.round(m * 100) / 100 })
  }
  if (lignesValides.length === 0) {
    return {
      success: true,
      nb_importes: 0,
      nb_bulletins_bloques: 0,
      bulletins_bloques: [],
      erreurs,
      warnings,
    }
  }

  // 2. Vérification appartenance société (filet anti-tampering : la
  //    route filtre déjà côté UI, mais le serveur doit valider).
  const employesIds = [...new Set(lignesValides.map(l => l.employe_id))]
  const { data: empsRows } = await supabase
    .from('employes')
    .select('id')
    .eq('societe_id', societeId)
    .in('id', employesIds)
  const employesAutorises = new Set(((empsRows ?? []) as Array<{ id: string }>).map(r => r.id))
  const lignesScopees = lignesValides.filter(l => employesAutorises.has(l.employe_id))
  const refuses = employesIds.filter(id => !employesAutorises.has(id))
  if (refuses.length > 0) {
    erreurs.push(`${refuses.length} employé(s) hors société active — ignoré(s).`)
  }
  if (lignesScopees.length === 0) {
    return {
      success: erreurs.length === 0,
      nb_importes: 0,
      nb_bulletins_bloques: 0,
      bulletins_bloques: [],
      erreurs,
      warnings,
    }
  }

  // 3. Vérification bulletins verrouillés / validés sur la période.
  const empIdsScopees = lignesScopees.map(l => l.employe_id)
  const { data: bulsBloques } = await supabase
    .from('bulletins_paie')
    .select('employe_id, statut, verrouille')
    .eq('societe_id', societeId)
    .eq('periode', periodeDb)
    .in('employe_id', empIdsScopees)
  const bloques = new Set(((bulsBloques ?? []) as Array<{
    employe_id: string
    statut: string | null
    verrouille: boolean | null
  }>)
    .filter(b => b.statut === 'valide' || b.verrouille === true)
    .map(b => b.employe_id))

  const lignesAEcrire = lignesScopees.filter(l => !bloques.has(l.employe_id))

  // 4. Résolution / création de la prime catalogue.
  const { id: primeId, erreur: errPrime } = await resolveOuCreerPrimeCommerciale(
    supabase,
    societeId,
  )
  if (!primeId) {
    return {
      success: false,
      nb_importes: 0,
      nb_bulletins_bloques: bloques.size,
      bulletins_bloques: [...bloques],
      erreurs: [errPrime ?? "Impossible de résoudre la prime 'PRIME_COMMERCIALE' pour cette société.", ...erreurs],
      warnings,
    }
  }

  // 5. Resolve saisi_par (UUID employe lié au user connecté, nullable).
  const saisiParEmpId = await resolveEmployeIdAuthUser(supabase, user.id)

  // 6. UPSERT primes_variables_mois — onConflict sur (employe_id,
  //    prime_id, periode). Sur conflit, on met à jour SEULEMENT
  //    montant + saisi_par + date_saisie. Les flags d'approbation
  //    et d'intégration paie sont préservés.
  let nbImportes = 0
  if (lignesAEcrire.length > 0) {
    const rows = lignesAEcrire.map(l => ({
      employe_id: l.employe_id,
      prime_id: primeId,
      periode: periodeDb,
      montant: l.montant,
      saisi_par: saisiParEmpId,
      date_saisie: new Date().toISOString(),
      // approuve, approuve_par, date_approbation, integre_paie,
      // date_integration : NON SET ici. Sur INSERT, valeurs par défaut
      // (false / null). Sur UPDATE conflict, Postgres préserve les
      // valeurs existantes des colonnes non-listées dans SET.
    }))
    const { error } = await supabase
      .from('primes_variables_mois')
      .upsert(rows, { onConflict: 'employe_id,prime_id,periode' })
    if (error) {
      erreurs.push(`upsert primes: ${error.message}`)
    } else {
      nbImportes = rows.length
    }
  }

  // 7. Audit log (non bloquant — un échec va dans warnings).
  try {
    const totalMontant = lignesAEcrire.reduce((s, l) => s + l.montant, 0)
    const { error: auditErr } = await supabase.from('paie_audit_log').insert({
      societe_id: societeId,
      periode: periodeDb,
      action: 'primes_import_excel',
      user_id: user.id,
      user_email: user.email ?? null,
      details: {
        nb_lignes_input: lignes.length,
        nb_importes: nbImportes,
        nb_bulletins_bloques: bloques.size,
        nb_hors_societe: refuses.length,
        total_montant: Math.round(totalMontant * 100) / 100,
        prime_id: primeId,
      },
    })
    if (auditErr) warnings.push(`audit_log: ${auditErr.message}`)
  } catch (e) {
    warnings.push(`audit_log: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    success: erreurs.length === 0,
    nb_importes: nbImportes,
    nb_bulletins_bloques: bloques.size,
    bulletins_bloques: [...bloques],
    erreurs,
    warnings,
  }
}
