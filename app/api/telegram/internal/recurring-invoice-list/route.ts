import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { prochaineDateGeneration, type Frequence } from '@/lib/recurrences/recurrences-factures'

/**
 * GET /api/telegram/internal/recurring-invoice-list
 *
 * Tool agent — liste les modèles de factures récurrentes (table `factures`,
 * statut='modele', recurrent=true) avec leur prochaine date d'émission.
 *
 * Rôle minimum : comptable.
 *
 * Query :
 *   - chat_id        (résolu par l'auth wrapper)
 *   - include_paused : '1' pour inclure les modèles annulés (default: false)
 *   - limit          : 1..50 (default 20)
 *
 * Retour : { recurrents: [{ id, numero, tiers, frequence, montant_ttc, devise,
 *           date_debut, date_fin, jour_emission, derniere_generation,
 *           prochaine_emission, statut }], total }
 */

export async function GET(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'recurring_invoice.list', async (ctx) => {
    if (!hasRole(ctx, 'comptable')) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Lecture des récurrences réservée aux comptables et plus',
      }
    }

    const url = new URL(req.url)
    const includePaused = url.searchParams.get('include_paused') === '1'
    const limitRaw = Number(url.searchParams.get('limit')) || 20
    const limit = Math.max(1, Math.min(50, limitRaw))

    const admin = getAdminClient()
    let query = admin
      .from('factures')
      .select(
        'id, numero_facture, tiers, recurrent_frequence, recurrence_jour_du_mois, recurrence_date_debut, recurrence_date_fin, derniere_generation_date, montant_ttc, devise, statut',
      )
      .eq('societe_id', ctx.societe_id)
      .eq('recurrent', true)

    if (!includePaused) {
      query = query.eq('statut', 'modele')
    } else {
      query = query.in('statut', ['modele', 'annule'])
    }

    const { data, error } = await query
      .order('recurrence_date_debut', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      return { result: null, status: 'error', error_msg: error.message }
    }

    const today = new Date().toISOString().slice(0, 10)
    const recurrents = (data || []).map((m: any) => {
      const freq = (m.recurrent_frequence as Frequence) || 'mensuel'
      let prochaine: string | null = null
      try {
        if (m.recurrence_date_debut) {
          if (m.derniere_generation_date) {
            prochaine = prochaineDateGeneration(
              m.derniere_generation_date,
              freq,
              m.recurrence_jour_du_mois ?? null,
            )
          } else {
            // Première génération : la date_debut elle-même (ou ancrée jour_du_mois)
            const d = new Date(m.recurrence_date_debut + 'T00:00:00Z')
            const j = m.recurrence_jour_du_mois
            if (j && j >= 1 && j <= 28) d.setUTCDate(j)
            prochaine = d.toISOString().slice(0, 10)
            if (prochaine < m.recurrence_date_debut) prochaine = m.recurrence_date_debut
          }
          // Si date_fin dépassée, plus de génération à venir
          if (m.recurrence_date_fin && prochaine && prochaine > m.recurrence_date_fin) {
            prochaine = null
          }
        }
      } catch {
        prochaine = null
      }

      return {
        id: m.id,
        numero: m.numero_facture,
        tiers: m.tiers,
        frequence: freq,
        montant_ttc: Number(m.montant_ttc) || 0,
        devise: m.devise,
        date_debut: m.recurrence_date_debut,
        date_fin: m.recurrence_date_fin,
        jour_emission: m.recurrence_jour_du_mois,
        derniere_generation: m.derniere_generation_date,
        prochaine_emission: prochaine,
        en_retard: prochaine ? prochaine < today : false,
        statut: m.statut, // 'modele' = actif, 'annule' = en pause/supprimé
        actif: m.statut === 'modele',
      }
    })

    return {
      result: {
        recurrents,
        total: recurrents.length,
        today,
      },
    }
  })
}
