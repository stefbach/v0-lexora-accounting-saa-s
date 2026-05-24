import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { getGoogleAccessToken, googleCalendarFetch } from '@/lib/google/calendar-client'

/**
 * GET /api/telegram/internal/calendar-diag?chat_id=<n>&account_email=<email>
 *
 * Endpoint de diagnostic Google Calendar — court-circuite le LLM.
 * 1. Résout le user à partir du chat_id
 * 2. Liste les comptes Google connectés de l'user
 * 3. Tente de récupérer un access_token sur le compte demandé (ou default)
 * 4. Fait un GET /calendar/v3/calendars/primary (lecture) + tente une création
 *    d'event de test (qu'il supprime aussitôt après)
 * 5. Retourne le détail BRUT de chaque étape : succès, erreur, payload, statut HTTP.
 *
 * Auth: header X-Internal-Token (ou bien query token=... pour debug navigateur).
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const internalToken = req.headers.get('x-internal-token') || searchParams.get('token')
  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const chat_id = searchParams.get('chat_id')
  const account_email_param = searchParams.get('account_email') || undefined
  if (!chat_id) return NextResponse.json({ error: 'chat_id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: tg } = await admin
    .from('telegram_users')
    .select('user_id, current_societe_id')
    .eq('chat_id', Number(chat_id))
    .maybeSingle()
  if (!tg) return NextResponse.json({ error: 'chat_id introuvable' }, { status: 404 })

  const steps: any[] = []

  // 1. Liste comptes Google
  const { data: accounts, error: accErr } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, scopes, active, is_default_for_calendar, expires_at, refresh_token_enc')
    .eq('user_id', tg.user_id)
    .eq('provider', 'google')
  steps.push({
    step: '1. List Google accounts',
    count: accounts?.length || 0,
    error: accErr?.message,
    accounts: (accounts || []).map(a => ({
      email: a.account_email,
      scopes: a.scopes,
      active: a.active,
      default_for_calendar: a.is_default_for_calendar,
      expires_at: a.expires_at,
      has_refresh_token: !!a.refresh_token_enc,
    })),
  })

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ user_id: tg.user_id, steps, conclusion: 'Aucun compte Google connecté' })
  }

  // 2. Get access token
  let access_token: string | null = null
  let used_account: any
  try {
    const r = await getGoogleAccessToken(tg.user_id, account_email_param)
    access_token = r.access_token
    used_account = { email: r.account.account_email, scopes: r.account.scopes }
    steps.push({ step: '2. Get access token', ok: true, account: used_account })
  } catch (e: any) {
    steps.push({ step: '2. Get access token', ok: false, error: e.message })
    return NextResponse.json({ user_id: tg.user_id, steps, conclusion: 'Échec récupération access_token' })
  }

  // 3. Read primary calendar metadata
  try {
    const cal = await googleCalendarFetch(tg.user_id, account_email_param, '/calendars/primary')
    steps.push({
      step: '3. Read primary calendar',
      ok: true,
      summary: cal?.summary,
      timeZone: cal?.timeZone,
      id: cal?.id,
    })
  } catch (e: any) {
    steps.push({ step: '3. Read primary calendar', ok: false, error: e.message })
    return NextResponse.json({ user_id: tg.user_id, steps, conclusion: 'Lecture calendrier échouée' })
  }

  // 4. Try create a test event tomorrow 10h-11h Mauritius
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(6, 0, 0, 0)  // 10h Mauritius = 6h UTC
  const tomorrowEnd = new Date(tomorrow)
  tomorrowEnd.setUTCHours(7, 0, 0, 0)
  const testEvent = {
    summary: '[LEXORA-TEST] Diagnostic',
    description: 'Event de test généré par /calendar-diag — sera supprimé immédiatement.',
    start: { dateTime: tomorrow.toISOString(), timeZone: 'Indian/Mauritius' },
    end: { dateTime: tomorrowEnd.toISOString(), timeZone: 'Indian/Mauritius' },
  }
  let createdId: string | null | undefined
  try {
    const created = await googleCalendarFetch(tg.user_id, account_email_param, '/calendars/primary/events', {
      method: 'POST', json: testEvent, query: { sendUpdates: 'none' },
    })
    createdId = created?.id
    steps.push({
      step: '4. Create test event',
      ok: true,
      event_id: created?.id,
      html_link: created?.htmlLink,
      payload: testEvent,
    })
  } catch (e: any) {
    steps.push({
      step: '4. Create test event',
      ok: false,
      error: e.message,
      payload: testEvent,
    })
    return NextResponse.json({
      user_id: tg.user_id,
      steps,
      conclusion: `Création échouée : ${e.message}`,
    })
  }

  // 5. Clean up test event
  if (createdId) {
    try {
      await googleCalendarFetch(tg.user_id, account_email_param, `/calendars/primary/events/${createdId}`, {
        method: 'DELETE',
      })
      steps.push({ step: '5. Delete test event', ok: true })
    } catch (e: any) {
      steps.push({ step: '5. Delete test event', ok: false, error: e.message })
    }
  }

  return NextResponse.json({
    user_id: tg.user_id,
    chat_id,
    steps,
    conclusion: 'OK — Google Calendar fonctionne correctement pour ce compte',
  })
}
