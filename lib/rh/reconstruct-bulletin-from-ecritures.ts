/**
 * AGENT FIX-ALICIA — Reconstruction d'un bulletin perdu à partir du grand livre.
 *
 * Contexte : suite à plusieurs régénérations, le bulletin visible côté RH
 * a perdu des retenues manuelles saisies via UI. MAIS les écritures
 * comptables (`ecritures_comptables_v2`, journal SAL, numero_piece =
 * `BP-<bulletin_id>` — voir mig 029 / 018 / 216 / 427) contiennent encore
 * les bons montants. La source de vérité est donc le grand livre.
 *
 * Ce module fournit la logique pure (sans I/O coté UI) de reverse-engineering :
 *   1. Récupère les lignes du grand livre liées au bulletin.
 *   2. Mappe chaque compte → champ bulletin via ACCOUNT_MAPPING.
 *   3. Agrège (credit - debit) par champ.
 *   4. Retourne un bulletin reconstitué + la trace des écritures sources.
 *
 * Schéma observé (mig 007 + 120) :
 *   ecritures_comptables_v2.numero_compte  TEXT
 *   ecritures_comptables_v2.libelle        TEXT
 *   ecritures_comptables_v2.debit_mur      NUMERIC
 *   ecritures_comptables_v2.credit_mur     NUMERIC
 *   ecritures_comptables_v2.numero_piece   TEXT  ('BP-<bulletin_id>')
 *   ecritures_comptables_v2.date_ecriture  DATE
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EcritureSource {
  compte: string
  libelle: string
  debit: number
  credit: number
}

export interface ReconstructedBulletin {
  employe_id: string
  societe_id: string
  periode: string
  salaire_brut: number
  paye_total: number
  nsf_total: number
  csg_total: number
  retenues_manuelles: number
  autres_deductions: number
  salaire_net: number
  ecritures_sources: EcritureSource[]
  notes: string
}

/**
 * Mapping préfixe compte (4 caractères) → champ du bulletin reconstitué.
 *
 * Convention : on cumule `credit - debit` pour les comptes de passif/produit
 * (PAYE, NSF, CSG, retenues 425/429, net 421) et `debit - credit` pour les
 * comptes de charge (6411 etc.). La fonction d'agrégation gère ce signe
 * en fonction du préfixe.
 */
const ACCOUNT_MAPPING = {
  '6411': 'salaire_brut',        // salaires bruts (charge)
  '6412': 'salaire_brut',        // appointments (charge)
  '6413': 'salaire_brut',        // congés payés (charge)
  '6414': 'primes',              // primes (charge)
  '6420': 'allocations',         // allocations (charge)
  '4310': 'paye_total',          // PAYE retenu (passif)
  '4311': 'nsf_total',           // NSF salarié (passif)
  '4312': 'csg_total',           // CSG salarié (passif)
  '4250': 'retenues_manuelles',  // retenues sur salaires (passif)
  '4290': 'retenues_manuelles',  // autres retenues (passif)
  '4210': 'net_credit',          // crédit net au salarié (passif)
} as const

type MappedField = (typeof ACCOUNT_MAPPING)[keyof typeof ACCOUNT_MAPPING]

/** Comptes de charge — on lit `debit - credit`. */
const CHARGE_PREFIXES = new Set(['6411', '6412', '6413', '6414', '6420'])

export interface ReconstructOptions {
  bulletin_id?: string
  employe_id?: string
  periode?: string // 'YYYY-MM-01' ou 'YYYY-MM-DD'
  societe_id?: string
}

/**
 * Reconstitue un bulletin de paie à partir des écritures comptables.
 * Retourne `null` si aucune écriture trouvée.
 */
export async function reconstructBulletinFromEcritures(
  sb: SupabaseClient,
  options: ReconstructOptions,
): Promise<ReconstructedBulletin | null> {
  let ecritures: Array<{
    numero_compte: string | null
    libelle: string | null
    debit_mur: number | string | null
    credit_mur: number | string | null
    date_ecriture: string | null
    numero_piece: string | null
  }> | null = null

  // 1. Cherche par numero_piece = 'BP-<bulletin_id>' (mig 427 — c'est la
  //    convention stable depuis mig 018/029 pour relier bulletin → écritures).
  if (options.bulletin_id) {
    const { data } = await sb
      .from('ecritures_comptables_v2')
      .select('numero_compte, libelle, debit_mur, credit_mur, date_ecriture, numero_piece')
      .like('numero_piece', `BP-${options.bulletin_id}%`)
      .order('numero_compte', { ascending: true })
    ecritures = data ?? null
  }

  // 2. Fallback : cherche par employé + période dans le libellé. Couvre les
  //    cas où le bulletin n'a jamais reçu d'ecriture_id (anciens bulletins
  //    pré-mig 427) ou si numero_piece a été altéré manuellement.
  if (!ecritures?.length && options.employe_id && options.periode) {
    const periodeMonth = options.periode.slice(0, 7) // YYYY-MM
    const debutMois = `${periodeMonth}-01`
    const debutMoisSuivant = incrementMonth(debutMois)

    let q = sb
      .from('ecritures_comptables_v2')
      .select('numero_compte, libelle, debit_mur, credit_mur, date_ecriture, numero_piece')
      .gte('date_ecriture', debutMois)
      .lt('date_ecriture', debutMoisSuivant)
      .or(
        `libelle.ilike.%${options.employe_id}%,libelle.ilike.%paie ${periodeMonth}%,libelle.ilike.%paie_${periodeMonth}%`,
      )

    if (options.societe_id) q = q.eq('societe_id', options.societe_id)

    const { data } = await q.order('numero_compte', { ascending: true })
    ecritures = data ?? null
  }

  if (!ecritures?.length) return null

  // 3. Agréger par champ — signe correct par nature de compte.
  const aggregated: Partial<Record<MappedField, number>> = {}
  const sources: EcritureSource[] = []

  for (const e of ecritures) {
    const compteCode = (e.numero_compte ?? '').toString()
    const prefix = compteCode.slice(0, 4)
    const debit = Number(e.debit_mur ?? 0)
    const credit = Number(e.credit_mur ?? 0)

    sources.push({
      compte: compteCode,
      libelle: e.libelle ?? '',
      debit,
      credit,
    })

    const field = ACCOUNT_MAPPING[prefix as keyof typeof ACCOUNT_MAPPING]
    if (!field) continue

    // Comptes 6xxx (charge) → débit - crédit ; passifs/4xxx → crédit - débit
    const value = CHARGE_PREFIXES.has(prefix) ? debit - credit : credit - debit
    aggregated[field] = (aggregated[field] ?? 0) + value
  }

  // Fusion primes/allocations dans salaire_brut (champ bulletin canonique).
  // Le type MappedField inclut 'primes' et 'allocations' qui sont valides
  // mais on les agrège dans le total brut au lieu de les exposer séparément.
  const aggRec = aggregated as Record<string, number | undefined>
  const brut =
    (aggregated.salaire_brut ?? 0) +
    (aggRec.primes ?? 0) +
    (aggRec.allocations ?? 0)

  // 4. Construire le bulletin reconstitué
  return {
    employe_id: options.employe_id ?? '',
    societe_id: options.societe_id ?? '',
    periode: options.periode ?? '',
    salaire_brut: Number(brut.toFixed(2)),
    paye_total: Number((aggregated.paye_total ?? 0).toFixed(2)),
    nsf_total: Number((aggregated.nsf_total ?? 0).toFixed(2)),
    csg_total: Number((aggregated.csg_total ?? 0).toFixed(2)),
    retenues_manuelles: Number((aggregated.retenues_manuelles ?? 0).toFixed(2)),
    autres_deductions: 0,
    salaire_net: Number((aggregated.net_credit ?? 0).toFixed(2)),
    ecritures_sources: sources,
    notes: `[RECONSTITUÉ depuis grand livre le ${new Date().toLocaleDateString('fr-FR')}] ${sources.length} écritures sources`,
  }
}

/** Incrémente une date 'YYYY-MM-DD' d'un mois (sans muter l'entrée). */
function incrementMonth(yyyy_mm_dd: string): string {
  const d = new Date(yyyy_mm_dd + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Mapping exposé pour les tests et l'UI (afficher quel compte alimente
 * quel champ dans le dialog de reconstruction).
 */
export const RECONSTRUCT_ACCOUNT_MAPPING = ACCOUNT_MAPPING
