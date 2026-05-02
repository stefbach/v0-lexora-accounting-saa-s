/**
 * Sprint 2 — Anti-doublon BNQ (B).
 *
 * Helper partagé qui filtre une liste d'écritures candidates à l'INSERT
 * pour ne pas créer de doublons d'écritures bancaires (journal='BNQ').
 *
 * Critère de doublon : même (journal, numero_compte, libelle, debit_mur,
 * credit_mur, date_ecriture, dossier_id). Cinq sites d'insertion sont
 * concernés en priorité :
 *   • auto_rapprocher  (rapprochement automatique)
 *   • sync_lettrage    (génération BNQ historique)
 *   • generate_ecritures
 *   • auto_classer
 *   • agent/deterministic
 *
 * Pourquoi ce critère ?
 *   • numero_compte + debit_mur + credit_mur identifie le mouvement comptable
 *   • date_ecriture identifie le jour
 *   • libelle distingue 2 paiements le même jour vers le même compte
 *   • dossier_id scope multi-tenant
 *
 * Les autres journaux (ACH, VTE, OD, SAL, …) ne sont PAS dédupliqués ici :
 *   • ACH/VTE sont créés une fois par facture (mig 133/134 garantissent
 *     l'unicité via facture_id).
 *   • OD est volontairement répétable (régularisations diverses).
 *   • SAL est mensuel par employé (déduplication via UNIQUE
 *     societe_id+periode+employe_id côté bulletins_paie).
 *
 * Si l'appelant veut INSERER un avec et un sans BNQ dans le même call,
 * cette fonction ne touche PAS aux non-BNQ — ils sont insérés tels quels.
 */
type SupabaseClient = any

export interface EcritureCandidate {
  societe_id?: string | null
  dossier_id?: string | null
  date_ecriture: string
  journal: string
  ref_folio?: string | null
  numero_piece?: string | null
  numero_compte: string
  nom_compte?: string | null
  libelle: string
  description?: string | null
  debit_mur: number
  credit_mur: number
  exercice?: string | null
  facture_id?: string | null
  lettre?: string | null
  date_lettrage?: string | null
  // Champs hérités de la vue v1 (compte/debit/credit/piece_justificative)
  // — si l'appelant utilise la vue, on les normalise vers v2.
  compte?: string
  debit?: number
  credit?: number
  piece_justificative?: string | null
  [key: string]: any
}

interface DedupeResult {
  /** Entries effectively inserted (BNQ déduplicated + non-BNQ as-is). */
  toInsert: EcritureCandidate[]
  /** Number of BNQ entries skipped because of duplicates. */
  skipped: number
  /** Diagnostics for logs (e.g. "BNQ 401 1500.00/0 2026-04-15 — déjà présent"). */
  skipReasons: string[]
}

/** Normalise un candidat (vue v1 → v2) pour comparaison. */
function pickKey(e: EcritureCandidate): {
  numero_compte: string
  libelle: string
  debit_mur: number
  credit_mur: number
  date_ecriture: string
  dossier_id: string | null
} {
  return {
    numero_compte: String(e.numero_compte || e.compte || '').trim(),
    libelle: String(e.libelle || '').trim(),
    debit_mur: Number(e.debit_mur ?? e.debit ?? 0),
    credit_mur: Number(e.credit_mur ?? e.credit ?? 0),
    date_ecriture: String(e.date_ecriture).slice(0, 10),
    dossier_id: e.dossier_id ?? null,
  }
}

/**
 * Filtre une liste de candidates : enlève les BNQ qui existent déjà en DB.
 * Les non-BNQ sont retournées telles quelles (pas de dédup).
 *
 * Best-effort : si une lookup échoue (pas de droit, table absente, …) on
 * laisse passer l'entry plutôt que de bloquer la création (préférable de
 * créer un doublon que de bloquer un workflow business).
 */
export async function dedupeBnqEntries(
  supabase: SupabaseClient,
  candidates: EcritureCandidate[],
): Promise<DedupeResult> {
  const toInsert: EcritureCandidate[] = []
  const skipReasons: string[] = []
  let skipped = 0

  for (const e of candidates) {
    if (String(e.journal || '').toUpperCase() !== 'BNQ') {
      toInsert.push(e)
      continue
    }
    const k = pickKey(e)
    if (!k.numero_compte || !k.date_ecriture) {
      // Données insuffisantes pour dédupliquer — on insert
      toInsert.push(e)
      continue
    }
    try {
      // Anti-doublon renforcé : quand on a un facture_id, on considère comme
      // doublon toute entrée BNQ existante sur le même facture_id + compte +
      // direction (debit/credit) — sans dépendre du libellé qui varie entre
      // les différents code paths (« Paiement X — Y » vs « Règlement Y — X »).
      const factureId = (e as any).facture_id
      if (factureId) {
        let qf = supabase
          .from('ecritures_comptables_v2')
          .select('id')
          .eq('journal', 'BNQ')
          .eq('facture_id', factureId)
          .eq('numero_compte', k.numero_compte)
          .eq('debit_mur', k.debit_mur)
          .eq('credit_mur', k.credit_mur)
          .limit(1)
        const { data: byFacture } = await qf.maybeSingle()
        if (byFacture) {
          skipped++
          skipReasons.push(
            `BNQ ${k.numero_compte} ${k.debit_mur}/${k.credit_mur} facture_id=${factureId} — déjà présent (id=${(byFacture as any).id})`,
          )
          continue
        }
      }

      let q = supabase
        .from('ecritures_comptables_v2')
        .select('id')
        .eq('journal', 'BNQ')
        .eq('numero_compte', k.numero_compte)
        .eq('libelle', k.libelle)
        .eq('debit_mur', k.debit_mur)
        .eq('credit_mur', k.credit_mur)
        .eq('date_ecriture', k.date_ecriture)
        .limit(1)
      if (k.dossier_id) q = q.eq('dossier_id', k.dossier_id)
      else q = q.is('dossier_id', null)
      const { data, error } = await q.maybeSingle()
      if (error) {
        // Best-effort — on laisse passer
        toInsert.push(e)
        continue
      }
      if (data) {
        skipped++
        skipReasons.push(
          `BNQ ${k.numero_compte} ${k.debit_mur}/${k.credit_mur} ${k.date_ecriture} — déjà présent (id=${(data as any).id})`,
        )
        continue
      }
      toInsert.push(e)
    } catch {
      toInsert.push(e)
    }
  }

  return { toInsert, skipped, skipReasons }
}

/**
 * Wrapper qui DEDUPLIQUE PUIS INSERE en une étape. Retourne le résultat
 * combiné ainsi qu'un résumé de dédup.
 *
 * Si toInsert est vide après dédup → ne fait pas l'INSERT, retourne data: [].
 */
export async function safeInsertBnq(
  supabase: SupabaseClient,
  candidates: EcritureCandidate[],
  table: 'ecritures_comptables_v2' = 'ecritures_comptables_v2',
): Promise<{
  data: any[] | null
  error: any
  skipped: number
  skipReasons: string[]
}> {
  const dedup = await dedupeBnqEntries(supabase, candidates)
  if (dedup.toInsert.length === 0) {
    return { data: [], error: null, skipped: dedup.skipped, skipReasons: dedup.skipReasons }
  }
  // Normalisation V1→V2 avant INSERT : si l'appelant a passé `compte` /
  // `debit` / `credit` / `piece_justificative` (anciens noms V1), on les
  // convertit en `numero_compte` / `debit_mur` / `credit_mur` / `ref_folio`
  // pour que l'INSERT sur ecritures_comptables_v2 accepte le payload.
  // Les colonnes V1 ne sont supprimées que si la version V2 est définie.
  const payload = dedup.toInsert.map((e) => {
    const out: any = { ...e }
    if (out.numero_compte == null && out.compte != null) out.numero_compte = out.compte
    if (out.debit_mur == null && out.debit != null) out.debit_mur = out.debit
    if (out.credit_mur == null && out.credit != null) out.credit_mur = out.credit
    if (out.ref_folio == null && out.piece_justificative != null) out.ref_folio = out.piece_justificative
    delete out.compte
    delete out.debit
    delete out.credit
    delete out.piece_justificative
    return out
  })
  const res = await supabase.from(table).insert(payload).select()
  return {
    data: res.data || null,
    error: res.error,
    skipped: dedup.skipped,
    skipReasons: dedup.skipReasons,
  }
}
