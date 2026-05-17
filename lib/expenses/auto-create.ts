/**
 * Helper canonique pour la création AUTOMATIQUE de notes de frais à partir
 * d'un document OCR (ticket / reçu / photo mobile).
 *
 * Utilisé par :
 *   - app/api/documents/process/route.ts (pipeline OCR universel)
 *   - app/api/telegram/internal/expense-create/route.ts (flow Telegram)
 *
 * On factorise ici uniquement la couche INSERT + résolution employe_id pour
 * éviter la duplication. Le flow Telegram garde sa propre logique d'OCR
 * dédiée (lib/telegram/expense-ocr.ts) + l'audit/auth, mais peut appeler
 * `insertNoteDeFrais` pour la persistance.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const ALLOWED_EXPENSE_CATEGORIES = [
  'repas',
  'taxi',
  'essence',
  'hotel',
  'deplacement',
  'fournitures',
  'telecom',
  'loyer',
  'divers',
] as const

export type ExpenseCategory = (typeof ALLOWED_EXPENSE_CATEGORIES)[number]

export type AutoCreateNoteFraisInput = {
  societe_id: string
  dossier_id?: string | null
  user_id?: string | null
  /**
   * Si on n'a pas d'employe_id à passer en direct (cas pipeline OCR canonique
   * où le `uploaded_by` est l'user web), on tente de résoudre l'employé via
   * la table `employes` (auth_user_id) ou via `user_societes`.
   */
  resolve_employe_from_user?: boolean
  vendor?: string | null
  date_facture?: string | null // YYYY-MM-DD
  montant_ttc?: number | null
  devise?: string | null
  categorie?: string | null
  description?: string | null
  document_id?: string | null
  ocr_raw?: any
  ocr_source?: string | null
  ocr_confidence?: number | null
  statut?: 'brouillon' | 'en_validation'
}

export type AutoCreateNoteFraisResult =
  | { ok: true; id: string; statut: string }
  | { ok: false; error: string; skipped?: boolean }

function clampCategory(value: any): ExpenseCategory {
  const s = String(value || '').toLowerCase().trim()
  return (ALLOWED_EXPENSE_CATEGORIES as readonly string[]).includes(s)
    ? (s as ExpenseCategory)
    : 'divers'
}

function isoDate(value: any): string | null {
  if (!value) return null
  const s = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : s
}

/**
 * Tente de résoudre l'employe_id pour un user donné dans une société.
 * Retourne null si pas d'employé lié (cas dirigeant/admin qui soumet sa
 * propre note → on stocke user_id seul, employe_id reste NULL).
 */
export async function resolveEmployeId(
  supabase: SupabaseClient,
  user_id: string,
  societe_id: string,
): Promise<string | null> {
  if (!user_id || !societe_id) return null
  // Tentative 1 : table `employes` avec colonne auth_user_id
  try {
    const { data } = await supabase
      .from('employes')
      .select('id')
      .eq('auth_user_id', user_id)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (data?.id) return data.id as string
  } catch {
    // colonne auth_user_id absente sur certaines versions → ignore
  }
  return null
}

/**
 * Insère une note de frais (statut brouillon par défaut). Aucun audit
 * (l'appelant est responsable de ses propres logs). Idempotence : si
 * `document_id` est déjà lié à une note existante, on retourne `skipped`.
 */
export async function autoCreateNoteDeFrais(
  supabase: SupabaseClient,
  input: AutoCreateNoteFraisInput,
): Promise<AutoCreateNoteFraisResult> {
  if (!input.societe_id) {
    return { ok: false, error: 'societe_id manquant' }
  }

  // Idempotence : éviter de créer plusieurs notes pour le même document
  if (input.document_id) {
    const { data: existing } = await supabase
      .from('notes_de_frais')
      .select('id, statut')
      .eq('document_id', input.document_id)
      .maybeSingle()
    if (existing) {
      return { ok: true, id: existing.id, statut: existing.statut }
    }
  }

  let employe_id: string | null = null
  if (input.resolve_employe_from_user && input.user_id) {
    employe_id = await resolveEmployeId(supabase, input.user_id, input.societe_id)
  }

  const montant =
    typeof input.montant_ttc === 'number' && Number.isFinite(input.montant_ttc) && input.montant_ttc >= 0
      ? Math.round(input.montant_ttc * 100) / 100
      : null

  const row = {
    societe_id: input.societe_id,
    employe_id,
    user_id: input.user_id || null,
    vendor: input.vendor ? String(input.vendor).slice(0, 200) : null,
    date_facture: isoDate(input.date_facture),
    montant_ttc: montant,
    devise: (input.devise || 'MUR').toUpperCase().slice(0, 5),
    categorie: clampCategory(input.categorie),
    description: input.description ? String(input.description).slice(0, 240) : null,
    statut: input.statut || 'brouillon',
    document_id: input.document_id || null,
    ocr_raw: input.ocr_raw ?? null,
    ocr_source: input.ocr_source || 'documents-process',
    ocr_confidence:
      typeof input.ocr_confidence === 'number' && Number.isFinite(input.ocr_confidence)
        ? Math.max(0, Math.min(1, input.ocr_confidence))
        : null,
  }

  const { data, error } = await supabase
    .from('notes_de_frais')
    .insert(row)
    .select('id, statut')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message || 'INSERT notes_de_frais failed' }
  }

  return { ok: true, id: data.id, statut: data.statut }
}
