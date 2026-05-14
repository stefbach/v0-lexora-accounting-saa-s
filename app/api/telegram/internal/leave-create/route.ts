import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/leave-create
 *
 * Rôle minimum : employe (l'utilisateur crée sa propre demande de congé).
 *
 * Body :
 *   - chat_id     (résolu par l'auth wrapper)
 *   - type        : 'annual' | 'sick' | 'vacation' | 'family' | 'maternity' | 'paternity'
 *   - date_debut  : 'YYYY-MM-DD'
 *   - date_fin    : 'YYYY-MM-DD'
 *   - motif       : string (optionnel)
 *
 * Calcule nb_jours = jours ouvrés Lun-Ven entre date_debut et date_fin (inclusif).
 * INSERT dans `demandes_conges` avec statut='en_attente'.
 *
 * Retour : { id, type_conge, nb_jours, statut, manager_id_to_notify }
 */

// Map du type "Telegram" vers le code interne demandes_conges.type_conge
const TYPE_MAP: Record<string, string> = {
  annual: 'AL',
  sick: 'SL',
  vacation: 'VL',
  family: 'FML',
  maternity: 'ML',
  paternity: 'PL',
}

/** Jours ouvrés Lun-Ven (sans jours fériés). Simple par design. */
function countBusinessDays(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0
  let n = 0
  const cur = new Date(s)
  while (cur <= e) {
    const d = cur.getUTCDay() // 0=Sun, 6=Sat
    if (d !== 0 && d !== 6) n++
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return n
}

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'leave.create', async (ctx, body) => {
    if (!ctx.employe_id) {
      return { result: null, status: 'denied', error_msg: 'Aucun employé lié à votre compte — impossible de créer une demande de congé' }
    }
    const typeIn = String(body?.type || '').toLowerCase()
    const date_debut = String(body?.date_debut || '')
    const date_fin = String(body?.date_fin || '')
    const motif = body?.motif ? String(body.motif) : null

    if (!TYPE_MAP[typeIn]) {
      return { result: null, status: 'error', error_msg: `type invalide (attendu: ${Object.keys(TYPE_MAP).join(', ')})` }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_debut) || !/^\d{4}-\d{2}-\d{2}$/.test(date_fin)) {
      return { result: null, status: 'error', error_msg: 'date_debut et date_fin requis au format YYYY-MM-DD' }
    }
    if (date_fin < date_debut) {
      return { result: null, status: 'error', error_msg: 'date_fin doit être >= date_debut' }
    }

    const type_conge = TYPE_MAP[typeIn]
    const nb_jours = countBusinessDays(date_debut, date_fin)
    if (nb_jours <= 0) {
      return { result: null, status: 'error', error_msg: 'La période ne contient aucun jour ouvré (Lun-Ven)' }
    }

    const admin = getAdminClient()

    // Récupère le manager de l'employé pour la notification
    const { data: emp } = await admin
      .from('employes')
      .select('id, prenom, nom, manager_id, societe_id')
      .eq('id', ctx.employe_id)
      .maybeSingle()
    if (!emp) {
      return { result: null, status: 'error', error_msg: 'Employé introuvable' }
    }
    if (emp.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Employé hors société active' }
    }

    const { data: inserted, error } = await admin
      .from('demandes_conges')
      .insert({
        employe_id: ctx.employe_id,
        type_conge,
        date_debut,
        date_fin,
        nb_jours,
        statut: 'en_attente',
        motif,
      })
      .select('id, statut, nb_jours, type_conge')
      .single()
    if (error) {
      return { result: null, status: 'error', error_msg: `Erreur création demande: ${error.message}` }
    }

    return {
      result: {
        id: inserted.id,
        type_conge: inserted.type_conge,
        nb_jours: inserted.nb_jours,
        statut: inserted.statut,
        date_debut,
        date_fin,
        employe: `${emp.prenom || ''} ${emp.nom || ''}`.trim(),
        manager_id_to_notify: emp.manager_id || null,
      },
    }
  })
}
