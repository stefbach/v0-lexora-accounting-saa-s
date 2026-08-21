/**
 * lib/jobcosting/jobs.ts — Validation du payload de création/mise à jour d'un
 * job (projet/mandat facturable). Réf. spec §2.2.
 */

import { roundTo } from '@/lib/money'
import type { TypeFacturation } from './types'

const TYPES_FACTURATION: TypeFacturation[] = ['temps_materiel', 'forfait', 'abonnement']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface JobPayload {
  code: string
  libelle: string
  client_nom: string | null
  dossier_id: string | null
  contrat_id: string | null
  type_facturation: TypeFacturation
  responsable_id: string | null
  date_debut: string | null
  date_fin_prevue: string | null
  budget_heures: number | null
  budget_montant: number | null
  devise: string
}

type Resultat =
  | { ok: true; data: JobPayload }
  | { ok: false; error: string }

function optDate(v: unknown): string | null {
  return typeof v === 'string' && DATE_RE.test(v) ? v : null
}

function optId(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function optNum(v: unknown): number | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 'invalid'
  return n
}

export function validateJobPayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  if (!code) return { ok: false, error: 'code requis' }
  if (code.length > 40) return { ok: false, error: 'code trop long (max 40)' }

  const libelle = typeof b.libelle === 'string' ? b.libelle.trim() : ''
  if (!libelle) return { ok: false, error: 'libelle requis' }
  if (libelle.length > 300) return { ok: false, error: 'libelle trop long (max 300)' }

  const type_facturation = TYPES_FACTURATION.includes(b.type_facturation as TypeFacturation)
    ? (b.type_facturation as TypeFacturation)
    : 'temps_materiel'

  const budget_heures = optNum(b.budget_heures)
  if (budget_heures === 'invalid') return { ok: false, error: 'budget_heures invalide' }
  const budget_montant = optNum(b.budget_montant)
  if (budget_montant === 'invalid') return { ok: false, error: 'budget_montant invalide' }

  return {
    ok: true,
    data: {
      code,
      libelle,
      client_nom: b.client_nom ? String(b.client_nom).trim().slice(0, 200) : null,
      dossier_id: optId(b.dossier_id),
      contrat_id: optId(b.contrat_id),
      type_facturation,
      responsable_id: optId(b.responsable_id),
      date_debut: optDate(b.date_debut),
      date_fin_prevue: optDate(b.date_fin_prevue),
      budget_heures: budget_heures == null ? null : roundTo(budget_heures, 2),
      budget_montant: budget_montant == null ? null : roundTo(budget_montant, 2),
      devise: typeof b.devise === 'string' && b.devise.trim() ? b.devise.trim().toUpperCase().slice(0, 3) : 'MUR',
    },
  }
}
