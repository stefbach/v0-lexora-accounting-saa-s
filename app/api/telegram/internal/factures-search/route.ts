import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/factures-search
 *
 * Recherche filtrée dans la table factures.
 * Body :
 *   - type     : 'client' | 'fournisseur' (optionnel — défaut tous)
 *   - statut   : 'brouillon' | 'en_attente' | 'partiel' | 'payee' | 'retard' | 'annulee'
 *   - periode  : 'YYYY-MM' ou 'YYYY' optionnel
 *   - contact  : nom ou entreprise (LIKE)
 *   - limit    : défaut 20, max 50
 *   - sort     : 'date_desc' (défaut) | 'montant_desc' | 'echeance_asc'
 *
 * Rôle min : comptable.
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'factures.search', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable') && !hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Recherche factures réservée aux comptables et plus' }
    }

    const type = body?.type ? String(body.type).toLowerCase() : null
    const statut = body?.statut ? String(body.statut).toLowerCase() : null
    const periode = body?.periode ? String(body.periode).trim() : null
    const contact = body?.contact ? String(body.contact).trim() : null
    const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50)
    const sort = body?.sort || 'date_desc'

    const admin = getAdminClient()
    let q = admin.from('factures')
      .select('id, numero_facture, tiers, type_facture, statut, date_facture, date_echeance, montant_ttc, devise, solde_non_paye')
      .eq('societe_id', ctx.societe_id)

    if (type === 'client' || type === 'fournisseur') q = q.eq('type_facture', type)
    if (statut) q = q.eq('statut', statut)
    if (periode) {
      if (/^\d{4}-\d{2}$/.test(periode)) {
        const [year, month] = periode.split('-').map(Number)
        const start = `${periode}-01`
        const end = `${periode}-${new Date(year, month, 0).getDate()}`
        q = q.gte('date_facture', start).lte('date_facture', end)
      } else if (/^\d{4}$/.test(periode)) {
        q = q.gte('date_facture', `${periode}-01-01`).lte('date_facture', `${periode}-12-31`)
      }
    }
    if (contact) q = q.ilike('tiers', `%${contact}%`)

    if (sort === 'montant_desc') q = q.order('montant_ttc', { ascending: false })
    else if (sort === 'echeance_asc') q = q.order('date_echeance', { ascending: true })
    else q = q.order('date_facture', { ascending: false })

    q = q.limit(limit)

    const { data, error } = await q
    if (error) return { result: null, status: 'error', error_msg: error.message }

    const total_ttc = (data || []).reduce((s: number, f: any) => s + Number(f.montant_ttc || 0), 0)
    const total_du = (data || []).reduce((s: number, f: any) => s + Number(f.solde_non_paye || 0), 0)

    return {
      result: {
        filters: { type, statut, periode, contact, sort },
        count: data?.length || 0,
        total_ttc: Math.round(total_ttc),
        total_du: Math.round(total_du),
        factures: data || [],
      },
    }
  })
}
