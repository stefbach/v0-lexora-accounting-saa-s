import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { ajouterOtAggregate } from '@/lib/rh/ot-aggregate'

/**
 * POST /api/telegram/internal/ot-add
 *
 * Rôle minimum : rh.
 *
 * Body :
 *   - chat_id     (résolu par l'auth wrapper)
 *   - employe_id  : uuid (doit appartenir à la société active)
 *   - periode     : 'YYYY-MM'
 *   - heures      : nombre (>0) d'heures supplémentaires à ajouter
 *   - taux        : 1.5 | 2 (majoration applicable)
 *
 * Saisie agrégat mensuel (hors planning) — utilise `ajouterOtAggregate`
 * depuis lib/rh/ot-aggregate.ts. La saisie détaillée par jour reste sur
 * /api/rh/paie/ot/save (UI web, source planning + jours fériés).
 *
 * Retour : { employe_id, employe_nom, periode, heures, taux,
 *            taux_horaire_mur, montant_estime_mur }
 */
export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'ot.add', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Saisie heures sup réservée aux RH et plus' }
    }

    const employe_id = String(body?.employe_id || '')
    const periode = String(body?.periode || '')
    const heures = Number(body?.heures)
    const tauxRaw = Number(body?.taux)

    if (!employe_id) {
      return { result: null, status: 'error', error_msg: 'employe_id requis' }
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode requise au format YYYY-MM' }
    }
    if (!Number.isFinite(heures) || heures <= 0) {
      return { result: null, status: 'error', error_msg: 'heures doit être > 0' }
    }
    if (tauxRaw !== 1.5 && tauxRaw !== 2) {
      return { result: null, status: 'error', error_msg: 'taux doit valoir 1.5 ou 2' }
    }
    const taux = tauxRaw as 1.5 | 2

    const admin = getAdminClient()

    // Vérifie que l'employe appartient à la société active
    const { data: emp } = await admin
      .from('employes')
      .select('id, prenom, nom, salaire_base, societe_id')
      .eq('id', employe_id)
      .maybeSingle()
    if (!emp) {
      return { result: null, status: 'error', error_msg: 'Employé introuvable' }
    }
    if (emp.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Employé hors société active' }
    }

    const res = await ajouterOtAggregate(admin, {
      employe_id,
      periode,
      heures,
      taux,
      salaire_base: Number(emp.salaire_base || 0),
    })

    if (!res.ok) {
      return { result: null, status: 'error', error_msg: `Erreur enregistrement OT: ${res.error || 'inconnue'}` }
    }

    return {
      result: {
        employe_id,
        employe_nom: `${emp.prenom || ''} ${emp.nom || ''}`.trim(),
        periode,
        heures: res.heures_arrondies,
        taux,
        taux_horaire_mur: res.taux_horaire_mur,
        montant_estime_mur: res.montant_estime_mur,
      },
    }
  })
}
