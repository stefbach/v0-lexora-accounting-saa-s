/**
 * lib/inventaire/mouvements.ts — Validation et prévisualisation d'un
 * mouvement de stock. L'application effective (verrou, écriture de
 * stock_niveaux) est faite par la RPC Postgres `appliquer_mouvement_stock`
 * (migration 482) — jamais côté API sans transaction.
 */

import { money } from '@/lib/money'
import {
  SENS_PAR_TYPE,
  type SensMouvement,
  type TypeMouvement,
} from './types'
import {
  CUMP_DP,
  QTE_DP,
  cumpApresEntree,
  valeurMouvement,
} from './valorisation'
import { roundTo } from '@/lib/money'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface MouvementPayload {
  produit_id: string
  depot_id: string | null
  type_mouvement: TypeMouvement
  sens: SensMouvement
  quantite: number
  /** Coût d'achat réel — requis pour entree_achat, optionnel sinon. */
  cout_unitaire: number | null
  date_mouvement: string
  motif: string | null
}

type Resultat =
  | { ok: true; data: MouvementPayload }
  | { ok: false; error: string }

export function validateMouvementPayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const produit_id = typeof b.produit_id === 'string' ? b.produit_id.trim() : ''
  if (!produit_id) return { ok: false, error: 'produit_id requis' }

  const type_mouvement = String(b.type_mouvement || '') as TypeMouvement
  const sens = SENS_PAR_TYPE[type_mouvement]
  if (!sens) return { ok: false, error: `type_mouvement invalide (${String(b.type_mouvement)})` }
  if (type_mouvement === 'transfert_sortie' || type_mouvement === 'transfert_entree') {
    return { ok: false, error: 'Les transferts inter-dépôts ne sont pas couverts par cette route (phase ultérieure)' }
  }

  const quantite = Number(b.quantite)
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return { ok: false, error: 'quantite doit être strictement positive' }
  }

  let cout_unitaire: number | null = null
  if (b.cout_unitaire !== undefined && b.cout_unitaire !== null && b.cout_unitaire !== '') {
    const c = Number(b.cout_unitaire)
    if (!Number.isFinite(c) || c < 0) return { ok: false, error: 'cout_unitaire invalide' }
    cout_unitaire = c
  }
  if (type_mouvement === 'entree_achat' && cout_unitaire === null) {
    return { ok: false, error: 'cout_unitaire requis pour une entrée d\'achat' }
  }
  if (sens === 'S' && cout_unitaire !== null) {
    // Une sortie est TOUJOURS valorisée au CUMP courant — coût fourni ignoré.
    cout_unitaire = null
  }

  const date_mouvement = typeof b.date_mouvement === 'string' && DATE_RE.test(b.date_mouvement)
    ? b.date_mouvement
    : new Date().toISOString().slice(0, 10)

  return {
    ok: true,
    data: {
      produit_id,
      depot_id: typeof b.depot_id === 'string' && b.depot_id.trim() ? b.depot_id.trim() : null,
      type_mouvement,
      sens,
      quantite: roundTo(quantite, QTE_DP),
      cout_unitaire,
      date_mouvement,
      motif: b.motif ? String(b.motif).trim().slice(0, 500) : null,
    },
  }
}

export interface PreviewMouvement {
  sens: SensMouvement
  cout_unitaire: number
  valeur_mouvement: number
  quantite_apres: number
  cout_unitaire_moyen_apres: number
}

/**
 * Prévisualise l'effet d'un mouvement — mêmes règles que la RPC :
 *  - entrée : coût réel fourni (sinon CUMP), CUMP recalculé en moyenne pondérée
 *  - sortie : valorisée au CUMP courant, CUMP inchangé, stock négatif refusé
 */
export function previewMouvement(
  etat: { quantite_depot: number; quantite_totale: number; cout_unitaire_moyen: number },
  mvt: Pick<MouvementPayload, 'type_mouvement' | 'quantite' | 'cout_unitaire'>,
): { ok: true; data: PreviewMouvement } | { ok: false; error: string } {
  const sens = SENS_PAR_TYPE[mvt.type_mouvement]
  if (!sens) return { ok: false, error: `TYPE_MOUVEMENT_INVALIDE: ${mvt.type_mouvement}` }
  if (!(mvt.quantite > 0)) return { ok: false, error: 'QUANTITE_INVALIDE' }

  const cump = etat.cout_unitaire_moyen || 0
  if (sens === 'E') {
    const cout = mvt.cout_unitaire == null ? cump : mvt.cout_unitaire
    const nouveauCump = cumpApresEntree(etat.quantite_totale, cump, mvt.quantite, cout)
    return {
      ok: true,
      data: {
        sens,
        cout_unitaire: roundTo(cout, CUMP_DP),
        valeur_mouvement: valeurMouvement(mvt.quantite, cout),
        quantite_apres: roundTo(money(etat.quantite_depot).plus(money(mvt.quantite)), QTE_DP),
        cout_unitaire_moyen_apres: nouveauCump,
      },
    }
  }

  if (money(etat.quantite_depot).lt(money(mvt.quantite))) {
    return {
      ok: false,
      error: `STOCK_INSUFFISANT: ${etat.quantite_depot} disponible(s) au dépôt, ${mvt.quantite} demandé(s)`,
    }
  }
  return {
    ok: true,
    data: {
      sens,
      cout_unitaire: roundTo(cump, CUMP_DP),
      valeur_mouvement: valeurMouvement(mvt.quantite, cump),
      quantite_apres: roundTo(money(etat.quantite_depot).minus(money(mvt.quantite)), QTE_DP),
      cout_unitaire_moyen_apres: roundTo(cump, CUMP_DP),
    },
  }
}
