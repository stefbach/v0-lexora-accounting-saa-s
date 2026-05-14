import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/tax-calendar?chat_id=<n>&days_ahead=30
 * Rôle requis : comptable+
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'tax_calendar.get', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Échéances réservées aux managers et plus' }
    }
    const days = Math.min(Number(req.nextUrl.searchParams.get('days_ahead') || 30), 90)
    const today = new Date()
    const end = new Date(today)
    end.setDate(end.getDate() + days)

    const admin = getAdminClient()
    const { data, error } = await admin
      .from('vw_tax_calendar')
      .select('echeance_type, reference, date_echeance, statut, montant_mur')
      .eq('societe_id', ctx.societe_id)
      .lte('date_echeance', end.toISOString().slice(0, 10))
      .gte('date_echeance', new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10))
      .order('date_echeance', { ascending: true })

    if (error) {
      // Fallback if vw_tax_calendar isn't deployed
      return { result: { deadlines: [], note: 'vw_tax_calendar not available' } }
    }

    const enriched = (data || []).map((d: any) => {
      const dd = new Date(d.date_echeance)
      const diff = Math.floor((dd.getTime() - today.getTime()) / 86400000)
      let urgency: 'overdue' | 'urgent' | 'soon' | 'future' = 'future'
      if (diff < 0) urgency = 'overdue'
      else if (diff <= 3) urgency = 'urgent'
      else if (diff <= 14) urgency = 'soon'
      return { ...d, days_until: diff, urgency }
    })

    return { result: { period_days: days, deadlines: enriched } }
  })
}
