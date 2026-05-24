/**
 * Validation ROC Annual Return — Companies Act 2001 s.223 / s.224
 *
 * Toute annual return déposée au Companies and Business Registration
 * Department (CBRD) doit contenir :
 *  - au moins un directeur (CA 2001 s.223(1)(a))
 *  - la liste des membres / actionnaires (CA 2001 s.223(1)(b))
 *  - une répartition d'actions cohérente (somme des % ≈ 100)
 *
 * Pénalité Rs 600/mois si rejeté (CA 2001 s.226), risque de radiation
 * du registre après 2 ans (s.309).
 */

export type RocDirector = {
  name?: string
  nic?: string
  nationality?: string
  date_appointed?: string
  resigned?: boolean
  address?: string
}

export type RocShareholder = {
  name?: string
  brn_or_nic?: string
  shares?: number
  pct?: number
}

export type RocValidationResult =
  | { ok: true }
  | { ok: false; error: string; field?: 'directors' | 'shareholders' | 'pct_total' }

/** Tolérance arrondi sur la somme des % d'actionnariat (0.5 pt). */
const PCT_TOLERANCE = 0.5

/**
 * Vérifie qu'un annual return est conforme s.223 avant passage en review.
 * Retourne `{ ok: true }` si valide, sinon `{ ok: false, error, field }`.
 */
export function validateRocBoardComposition(
  directors: RocDirector[] | null | undefined,
  shareholders: RocShareholder[] | null | undefined,
): RocValidationResult {
  if (!Array.isArray(directors) || directors.length === 0) {
    return {
      ok: false,
      field: 'directors',
      error: 'Au moins un directeur requis (Companies Act s.223)',
    }
  }

  // Au moins un directeur doit avoir un nom non vide.
  const hasNamedDirector = directors.some(d => (d?.name || '').trim().length > 0)
  if (!hasNamedDirector) {
    return {
      ok: false,
      field: 'directors',
      error: 'Au moins un directeur doit avoir un nom renseigné (Companies Act s.223)',
    }
  }

  if (!Array.isArray(shareholders) || shareholders.length === 0) {
    return {
      ok: false,
      field: 'shareholders',
      error: 'Liste des actionnaires requise (Companies Act s.223)',
    }
  }

  const totalPct = shareholders.reduce(
    (s, sh) => s + (Number(sh?.pct) || 0),
    0,
  )
  if (Math.abs(totalPct - 100) > PCT_TOLERANCE) {
    return {
      ok: false,
      field: 'pct_total',
      error: `Répartition actionnariat = ${totalPct.toFixed(2)}% (doit faire 100%)`,
    }
  }

  return { ok: true }
}
