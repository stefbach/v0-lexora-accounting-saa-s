/**
 * POST /api/rdv/book
 *   body : { slug, start_iso, end_iso, prospect_name, prospect_email,
 *            prospect_phone?, prospect_company?, notes?, location_type }
 *
 * Crée le booking + l'event Google Calendar + (best-effort) notifications
 * email/Telegram au owner. Public — pas d'auth.
 *
 * Vérifie atomiquement qu'aucun autre booking confirmé ne chevauche, et
 * que le créneau respecte les paramètres (jours/heures, min_notice).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function applyTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const slug = String(body?.slug || 'rdv').trim()
    const start_iso = String(body?.start_iso || '')
    const end_iso = String(body?.end_iso || '')
    const prospect_name = String(body?.prospect_name || '').trim().slice(0, 120)
    const prospect_email = String(body?.prospect_email || '').trim().toLowerCase().slice(0, 200)
    const prospect_phone = body?.prospect_phone ? String(body.prospect_phone).trim().slice(0, 40) : null
    const prospect_company = body?.prospect_company ? String(body.prospect_company).trim().slice(0, 200) : null
    const notes = body?.notes ? String(body.notes).slice(0, 2000) : null
    const location_type = String(body?.location_type || 'online')

    if (!prospect_name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    if (!EMAIL_RE.test(prospect_email)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    if (!start_iso || !end_iso) return NextResponse.json({ error: 'Créneau requis' }, { status: 400 })
    if (!['online', 'in_person'].includes(location_type)) {
      return NextResponse.json({ error: 'location_type invalide' }, { status: 400 })
    }
    const startMs = Date.parse(start_iso)
    const endMs = Date.parse(end_iso)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return NextResponse.json({ error: 'Dates invalides' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: settings } = await admin
      .from('booking_settings')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
    if (!settings) return NextResponse.json({ error: 'Page de RDV introuvable' }, { status: 404 })

    // Vérifie cohérence durée
    const durationMs = settings.duration_minutes * 60_000
    if (Math.abs(endMs - startMs - durationMs) > 60_000) {
      return NextResponse.json({ error: 'Durée du créneau incorrecte' }, { status: 400 })
    }

    // Min notice
    const minNoticeMs = settings.min_notice_hours * 3600_000
    if (startMs < Date.now() + minNoticeMs) {
      return NextResponse.json({ error: 'Créneau trop proche — choisis un horaire plus tard' }, { status: 400 })
    }

    // Lieu accepté ?
    if (location_type === 'online' && !settings.location_online_enabled) {
      return NextResponse.json({ error: 'Mode en ligne non disponible' }, { status: 400 })
    }
    if (location_type === 'in_person' && !settings.location_in_person_enabled) {
      return NextResponse.json({ error: 'Mode présentiel non disponible' }, { status: 400 })
    }

    // Anti-double-booking : un booking confirmé qui chevauche
    const { data: conflict } = await admin
      .from('bookings')
      .select('id')
      .eq('owner_user_id', settings.owner_user_id)
      .eq('status', 'confirmed')
      .lt('start_at', end_iso)
      .gt('end_at', start_iso)
      .limit(1)
      .maybeSingle()
    if (conflict) {
      return NextResponse.json({ error: 'Ce créneau vient d\'être pris — rafraîchis et choisis-en un autre' }, { status: 409 })
    }

    // Vars template
    const vars = {
      prospect_name,
      prospect_email,
      prospect_company: prospect_company || '—',
      prospect_phone: prospect_phone || '—',
      notes: notes || '—',
    }
    const eventTitle = applyTemplate(settings.event_title_template, vars).slice(0, 200)
    const eventDescription = applyTemplate(settings.event_description_template, vars).slice(0, 4000)

    // Crée l'event Google Calendar
    let google_event_id: string | null = null
    let meet_url: string | null = null
    try {
      const isOnline = location_type === 'online'
      const calId = settings.calendar_id || 'primary'
      const eventBody: any = {
        summary: eventTitle,
        description: eventDescription,
        start: { dateTime: start_iso, timeZone: settings.timezone },
        end: { dateTime: end_iso, timeZone: settings.timezone },
        attendees: [{ email: prospect_email, displayName: prospect_name }],
        reminders: { useDefault: true },
      }
      if (isOnline) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: `lexora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      } else if (settings.in_person_address) {
        eventBody.location = settings.in_person_address
      }

      const created = await googleCalendarFetch(
        settings.owner_user_id,
        settings.google_account_email,
        `/calendars/${encodeURIComponent(calId)}/events?conferenceDataVersion=1&sendUpdates=all`,
        { method: 'POST', json: eventBody },
      )
      google_event_id = created?.id || null
      meet_url = isOnline ? extractMeetUrl(created) : null
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[rdv/book] Google event creation failed:', e?.message || e)
      return NextResponse.json({
        error: 'Impossible de créer l\'événement dans l\'agenda Google. Réessaie ou contacte-nous.',
        detail: e?.message?.slice(0, 200),
      }, { status: 502 })
    }

    // Insère le booking
    const { data: booking, error: insErr } = await admin
      .from('bookings')
      .insert({
        owner_user_id: settings.owner_user_id,
        settings_id: settings.id,
        prospect_name, prospect_email, prospect_phone, prospect_company, notes,
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(endMs).toISOString(),
        location_type,
        in_person_address: location_type === 'in_person' ? settings.in_person_address : null,
        meet_url,
        google_event_id,
        google_calendar_id: settings.calendar_id || 'primary',
      })
      .select('id, cancellation_token')
      .single()

    if (insErr) {
      // Rollback : supprime l'event Google créé
      if (google_event_id) {
        await googleCalendarFetch(
          settings.owner_user_id,
          settings.google_account_email,
          `/calendars/${encodeURIComponent(settings.google_calendar_id || 'primary')}/events/${google_event_id}?sendUpdates=all`,
          { method: 'DELETE' },
        ).catch(() => {})
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // Notifications best-effort
    try {
      const { buildConfirmationEmail, buildOwnerNotificationEmail } = await import('@/lib/booking/emails')
      const { sendGmail } = await import('@/lib/google/gmail-client')
      const base_url = req.nextUrl.origin

      // 1. Email de CONFIRMATION au prospect (HTML pro avec logo Lexora)
      try {
        const conf = buildConfirmationEmail({
          prospect_name, prospect_email,
          start_iso, end_iso, timezone: settings.timezone,
          location_type: location_type as 'online' | 'in_person',
          in_person_address: settings.in_person_address,
          meet_url,
          cancel_token: booking.cancellation_token,
          base_url,
        })
        await sendGmail(settings.owner_user_id, {
          from_email: settings.google_account_email,
          from_name: 'Lexora',
          to: [prospect_email],
          subject: conf.subject, html: conf.html, text: conf.text,
        })
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('[rdv/book] confirmation email fail:', e?.message || e)
      }

      // 2. Email de NOTIFICATION au owner (toi)
      const notifEmail = settings.notify_email || null
      if (settings.notify_via_email && notifEmail) {
        try {
          const ownerMail = buildOwnerNotificationEmail({
            prospect_name, prospect_email, prospect_company, prospect_phone, notes,
            start_iso, end_iso, timezone: settings.timezone,
            location_type: location_type as 'online' | 'in_person',
            in_person_address: settings.in_person_address,
            meet_url,
            cancel_token: booking.cancellation_token,
            base_url,
          })
          await sendGmail(settings.owner_user_id, {
            from_email: settings.google_account_email,
            from_name: 'Lexora',
            to: [notifEmail],
            subject: ownerMail.subject, html: ownerMail.html, text: ownerMail.text,
          })
        } catch { /* noop */ }
      }

      // 3. Notification Telegram interne (sobre, sans emoji)
      if (settings.notify_via_telegram) {
        await admin.from('notifications').insert({
          destinataire_id: settings.owner_user_id, destinataire_type: 'client',
          societe_id: null, type: 'booking_new',
          titre: `Nouveau RDV — ${prospect_name}`,
          message: `${prospect_name} (${prospect_email}) — ${new Date(start_iso).toLocaleString('fr-FR', { timeZone: settings.timezone })} — ${location_type === 'online' ? 'En ligne' : 'Présentiel'}`,
          niveau: 'info', envoye_email: false, cron_name: null,
        }).then(() => {}, () => {})
      }
    } catch { /* notif best-effort */ }

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      cancel_token: booking.cancellation_token,
      meet_url,
      start_iso, end_iso,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
