/**
 * GET /api/rdv/slots?slug=rdv&date=YYYY-MM-DD
 *   → liste les créneaux disponibles pour la date donnée.
 *
 * Public — pas d'auth. Utilise les settings du slug, croise avec les
 * busy times Google Calendar du owner + les bookings confirmés.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateCandidateSlots, filterBusySlots, filterByNotice, type BookingSettings } from '@/lib/booking/slots'
import { googleCalendarFetch } from '@/lib/google/calendar-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug') || 'rdv'
    const dateStr = req.nextUrl.searchParams.get('date') || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'date invalide (YYYY-MM-DD requis)' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: settings } = await admin
      .from('booking_settings')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
    if (!settings) return NextResponse.json({ error: 'Page de RDV introuvable' }, { status: 404 })

    const sCfg: BookingSettings = {
      duration_minutes: settings.duration_minutes,
      slot_interval_minutes: settings.slot_interval_minutes,
      buffer_before_minutes: settings.buffer_before_minutes,
      buffer_after_minutes: settings.buffer_after_minutes,
      min_notice_hours: settings.min_notice_hours,
      max_advance_days: settings.max_advance_days,
      working_days: settings.working_days,
      working_hours_start: settings.working_hours_start,
      working_hours_end: settings.working_hours_end,
      lunch_break_start: settings.lunch_break_start,
      lunch_break_end: settings.lunch_break_end,
      timezone: settings.timezone,
    }

    // Génération des candidats
    let candidates = generateCandidateSlots(dateStr, sCfg)
    candidates = filterByNotice(candidates, sCfg.min_notice_hours, sCfg.max_advance_days)
    if (candidates.length === 0) {
      return NextResponse.json({ slots: [], duration_minutes: sCfg.duration_minutes })
    }

    // Range de la journée pour les busy times
    const dayStart = candidates[0].start_iso
    const dayEnd = candidates[candidates.length - 1].end_iso

    // Récupère busy times Google (freeBusy). En cas d'échec, on remonte
    // l'erreur au lieu de continuer à l'aveugle (sinon le prospect voit
    // tous les créneaux libres alors que ton agenda est plein).
    const busy: Array<{ start_iso: string; end_iso: string; source?: string }> = []
    let freebusyError: string | null = null
    try {
      const targetCal = settings.calendar_id || 'primary'
      const fb = await googleCalendarFetch(
        settings.owner_user_id,
        settings.google_account_email,
        '/freeBusy',
        {
          method: 'POST',
          json: {
            timeMin: dayStart,
            timeMax: dayEnd,
            timeZone: settings.timezone,
            items: [{ id: targetCal }],
          },
        },
      )
      const cal = fb?.calendars?.[targetCal]
      if (cal?.errors && cal.errors.length > 0) {
        freebusyError = `Google a refusé d'accéder au calendar « ${targetCal} » : ${JSON.stringify(cal.errors)}`
      }
      for (const b of cal?.busy || []) {
        if (b.start && b.end) busy.push({ start_iso: b.start, end_iso: b.end, source: 'google' })
      }
    } catch (e: any) {
      freebusyError = e?.message || 'Échec freeBusy Google'
      // eslint-disable-next-line no-console
      console.error('[rdv/slots] freeBusy fail:', freebusyError)
    }

    if (freebusyError) {
      // On refuse de servir des créneaux : préférable à un faux « tout libre ».
      return NextResponse.json({
        slots: [],
        duration_minutes: sCfg.duration_minutes,
        timezone: sCfg.timezone,
        error: `Impossible de lire ton agenda Google : ${freebusyError}. Reconnecte le compte Google ou vérifie l'id du calendrier dans /client/settings/booking.`,
      }, { status: 502 })
    }

    // Bookings confirmés sur la journée
    const { data: bookings } = await admin
      .from('bookings')
      .select('start_at, end_at')
      .eq('owner_user_id', settings.owner_user_id)
      .eq('status', 'confirmed')
      .gte('start_at', dayStart)
      .lte('end_at', dayEnd)
    for (const b of (bookings || []) as any[]) {
      busy.push({ start_iso: b.start_at, end_iso: b.end_at })
    }

    const available = filterBusySlots(
      candidates,
      busy,
      sCfg.buffer_before_minutes,
      sCfg.buffer_after_minutes,
    )

    return NextResponse.json({
      slots: available,
      duration_minutes: sCfg.duration_minutes,
      timezone: sCfg.timezone,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
