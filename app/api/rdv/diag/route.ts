/**
 * GET /api/rdv/diag
 *   → Diagnostic de la connexion Google Calendar pour la prise de RDV.
 *
 * Renvoie : le compte Google utilisé, les scopes, la liste des calendriers
 * disponibles, et un test freeBusy sur les 7 prochains jours du calendar
 * configuré. Permet de comprendre pourquoi tous les créneaux apparaissent
 * libres alors que l'agenda en contient.
 *
 * Auth : session web owner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { googleCalendarFetch } from '@/lib/google/calendar-client'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('not_authenticated', 401)

  const admin = getAdminClient()
  const { data: settings } = await admin
    .from('booking_settings')
    .select('*')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!settings) {
    return NextResponse.json({
      step: 'no_settings',
      message: 'Aucun paramétrage trouvé. Va sur /client/settings/booking pour configurer.',
    })
  }

  const { data: oauth } = await admin
    .from('user_oauth_accounts')
    .select('account_email, scopes, expires_at, last_error, active')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .eq('account_email', settings.google_account_email)
    .maybeSingle()

  if (!oauth) {
    return NextResponse.json({
      step: 'no_oauth',
      settings_google_account: settings.google_account_email,
      message: `Aucun compte Google « ${settings.google_account_email} » lié dans user_oauth_accounts. Reconnecte-le sur /client/settings/google-accounts.`,
    })
  }

  const result: any = {
    step: 'ok',
    google_account: oauth.account_email,
    scopes: oauth.scopes,
    has_calendar_scope: (oauth.scopes || []).some((s: string) => s.includes('/auth/calendar')),
    expires_at: oauth.expires_at,
    last_error: oauth.last_error,
    calendar_id_configured: settings.calendar_id || 'primary',
  }

  // Liste tous les calendriers visibles côté Google
  try {
    const list = await googleCalendarFetch(
      user.id,
      settings.google_account_email,
      '/users/me/calendarList?fields=items(id,summary,accessRole,primary)',
      { method: 'GET' },
    )
    result.available_calendars = (list?.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      accessRole: c.accessRole,
      primary: c.primary || false,
    }))
  } catch (e: any) {
    result.calendar_list_error = e?.message || 'Erreur'
  }

  // freeBusy sur les 7 prochains jours pour le calendar configuré
  try {
    const targetCal = settings.calendar_id || 'primary'
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400_000)
    const fb = await googleCalendarFetch(
      user.id,
      settings.google_account_email,
      '/freeBusy',
      {
        method: 'POST',
        json: {
          timeMin: now.toISOString(),
          timeMax: in7.toISOString(),
          timeZone: settings.timezone,
          items: [{ id: targetCal }],
        },
      },
    )
    const cal = fb?.calendars?.[targetCal] || {}
    result.freebusy = {
      target_calendar: targetCal,
      errors: cal.errors || null,
      busy_count: (cal.busy || []).length,
      busy_first_10: (cal.busy || []).slice(0, 10),
    }
  } catch (e: any) {
    result.freebusy_error = e?.message || 'Erreur freeBusy'
  }

  return NextResponse.json(result)
}
