import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/bonus-add
 *
 * Rôle minimum : rh.
 *
 * Body :
 *   - chat_id      (résolu par l'auth wrapper)
 *   - employe_id   : uuid
 *   - periode      : 'YYYY-MM'
 *   - montant_mur  : nombre (>0)
 *   - motif        : string (utilisé pour la colonne notes)
 *
 * Insère/upserte la ligne dans `primes_variables_mois` (statut approuve=false,
 * intégration paie manuelle). On crée à la demande une entrée catalogue_primes
 * "TELEGRAM_BONUS" société-scoped si elle n'existe pas encore — comme ça les
 * bonus saisis via le bot sont traçables et réutilisent l'ensemble de l'engin
 * paie standard (UI primes /rh affichera ces lignes).
 *
 * Retour : { id, employe_id, employe_nom, periode, montant_mur, motif, prime_id }
 */
export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'bonus.add', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Saisie de primes réservée aux RH et plus' }
    }

    const employe_id = String(body?.employe_id || '')
    const periode = String(body?.periode || '')
    const montant = Number(body?.montant_mur)
    const motif = body?.motif ? String(body.motif) : null

    if (!employe_id) {
      return { result: null, status: 'error', error_msg: 'employe_id requis' }
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode requise au format YYYY-MM' }
    }
    if (!Number.isFinite(montant) || montant <= 0) {
      return { result: null, status: 'error', error_msg: 'montant_mur doit être > 0' }
    }

    const admin = getAdminClient()

    // Vérifie l'employé
    const { data: emp } = await admin
      .from('employes')
      .select('id, prenom, nom, societe_id')
      .eq('id', employe_id)
      .maybeSingle()
    if (!emp) {
      return { result: null, status: 'error', error_msg: 'Employé introuvable' }
    }
    if (emp.societe_id !== ctx.societe_id) {
      return { result: null, status: 'denied', error_msg: 'Employé hors société active' }
    }

    // Trouve / crée la prime catalogue "TELEGRAM_BONUS" pour cette société
    let prime_id: string | null
    const { data: existingPrime } = await admin
      .from('catalogue_primes')
      .select('id')
      .eq('societe_id', ctx.societe_id)
      .eq('code', 'TELEGRAM_BONUS')
      .maybeSingle()
    if (existingPrime?.id) {
      prime_id = existingPrime.id
    } else {
      const record: Record<string, unknown> = {
        code: 'TELEGRAM_BONUS',
        libelle: 'Prime saisie via Telegram',
        type_prime: 'fixe',
        type: 'fixe',
        montant_fixe: 0,
        periode_application: 'mensuel',
        periode: 'mensuel',
        societe_id: ctx.societe_id,
        actif: true,
      }
      let { data: created, error: cErr } = await admin
        .from('catalogue_primes').insert(record).select('id').single()
      if (cErr) {
        // Retry en enlevant colonnes refusées (compat schémas anciens)
        const safe: Record<string, unknown> = { ...record }
        for (const col of Object.keys(safe)) {
          if ((cErr.message || '').includes(col)) delete safe[col]
        }
        const retry = await admin.from('catalogue_primes').insert(safe).select('id').single()
        created = retry.data
        cErr = retry.error as any
      }
      if (cErr || !created?.id) {
        return { result: null, status: 'error', error_msg: `Erreur création prime catalogue: ${cErr?.message || 'inconnue'}` }
      }
      prime_id = created.id
    }

    const periodeDate = `${periode}-01`
    const montant_arr = Math.round(montant * 100) / 100

    const { data: inserted, error } = await admin
      .from('primes_variables_mois')
      .upsert(
        {
          employe_id,
          prime_id,
          periode: periodeDate,
          montant: montant_arr,
          notes: motif,
          approuve: false,
          integre_paie: false,
        },
        { onConflict: 'employe_id,prime_id,periode' },
      )
      .select('id')
      .single()
    if (error) {
      return { result: null, status: 'error', error_msg: `Erreur enregistrement prime: ${error.message}` }
    }

    return {
      result: {
        id: inserted.id,
        employe_id,
        employe_nom: `${emp.prenom || ''} ${emp.nom || ''}`.trim(),
        periode,
        montant_mur: montant_arr,
        motif,
        prime_id,
      },
    }
  })
}
