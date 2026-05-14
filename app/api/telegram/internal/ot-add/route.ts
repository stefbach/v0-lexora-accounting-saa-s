import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

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
 * UPSERT dans `heures_travaillees` (pointage_id = null, agrégat période) : on
 * agrège manuellement les heures sup hors pointage (saisie Telegram).
 *
 * Retour : { employe_id, employe_nom, periode, heures, taux,
 *            taux_horaire_mur, montant_estime_mur }
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'ot.add', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Saisie heures sup réservée aux RH et plus' }
    }

    const employe_id = String(body?.employe_id || '')
    const periode = String(body?.periode || '')
    const heures = Number(body?.heures)
    const taux = Number(body?.taux)

    if (!employe_id) {
      return { result: null, status: 'error', error_msg: 'employe_id requis' }
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode requise au format YYYY-MM' }
    }
    if (!Number.isFinite(heures) || heures <= 0) {
      return { result: null, status: 'error', error_msg: 'heures doit être > 0' }
    }
    if (taux !== 1.5 && taux !== 2) {
      return { result: null, status: 'error', error_msg: 'taux doit valoir 1.5 ou 2' }
    }

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

    const salaire_base = Number(emp.salaire_base || 0)
    // Taux horaire MU : 45h/sem * 52/12 = ~195h/mois (WRA 2019)
    const taux_horaire = salaire_base > 0 ? salaire_base / ((45 * 52) / 12) : 0
    const heures_arr = Math.round(heures * 100) / 100
    const montant = Math.round(heures_arr * taux_horaire * taux * 100) / 100
    const taux_horaire_r = Math.round(taux_horaire * 100) / 100

    const periodeDate = `${periode}-01`

    // On UPSERT en colonne dédiée (ot_1_5x ou ot_2x) en agrégeant la valeur
    // déjà saisie pour la période (pas de unique key sur (employe, periode)
    // garantie). On lit l'existant 'sans pointage_id' pour ce mois et l'ajoute.
    const colHeures = taux === 1.5 ? 'heures_ot_1_5x' : 'heures_ot_2x'
    const colMontant = taux === 1.5 ? 'montant_ot_1_5x' : 'montant_ot_2x'

    let upsertOk = false
    let upsertError: string | undefined
    try {
      const { data: existing } = await admin
        .from('heures_travaillees')
        .select(`id, ${colHeures}, ${colMontant}`)
        .eq('employe_id', employe_id)
        .eq('periode', periodeDate)
        .is('pointage_id', null)
        .maybeSingle()

      if (existing) {
        const prevH = Number((existing as any)[colHeures] || 0)
        const prevM = Number((existing as any)[colMontant] || 0)
        const { error: upErr } = await admin
          .from('heures_travaillees')
          .update({
            [colHeures]: Math.round((prevH + heures_arr) * 100) / 100,
            [colMontant]: Math.round((prevM + montant) * 100) / 100,
            montant_ot: Math.round((prevM + montant) * 100) / 100,
            taux_horaire: taux_horaire_r,
          })
          .eq('id', (existing as any).id)
        if (upErr) upsertError = upErr.message
        else upsertOk = true
      } else {
        const payload: any = {
          employe_id,
          pointage_id: null,
          date: periodeDate,
          periode: periodeDate,
          taux_horaire: taux_horaire_r,
          montant_ot: montant,
        }
        payload[colHeures] = heures_arr
        payload[colMontant] = montant
        const { error: insErr } = await admin.from('heures_travaillees').insert(payload)
        if (insErr) upsertError = insErr.message
        else upsertOk = true
      }
    } catch (e: any) {
      upsertError = e?.message || String(e)
    }

    if (!upsertOk) {
      return { result: null, status: 'error', error_msg: `Erreur enregistrement OT: ${upsertError || 'inconnue'}` }
    }

    return {
      result: {
        employe_id,
        employe_nom: `${emp.prenom || ''} ${emp.nom || ''}`.trim(),
        periode,
        heures: heures_arr,
        taux,
        taux_horaire_mur: taux_horaire_r,
        montant_estime_mur: montant,
      },
    }
  })
}
