/**
 * GET /api/rdv/settings?slug=rdv
 *   → settings publics (page de booking : titre, sous-titre, intro,
 *     options online/présentiel, durée). Pas d'auth.
 *
 * PUT /api/rdv/settings  (auth session — owner) → met à jour
 * POST /api/rdv/settings (auth session — owner) → crée si pas encore
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PUBLIC_FIELDS = [
  'slug', 'page_title', 'page_subtitle', 'page_intro',
  'duration_minutes', 'min_notice_hours', 'max_advance_days',
  'location_online_enabled', 'location_in_person_enabled', 'in_person_address',
  'timezone', 'active',
].join(', ')

const OWNER_FIELDS = [
  'google_account_email', 'calendar_id', 'slot_interval_minutes',
  'buffer_before_minutes', 'buffer_after_minutes',
  'working_days', 'working_hours_start', 'working_hours_end',
  'lunch_break_start', 'lunch_break_end',
  'event_title_template', 'event_description_template',
  'notify_via_email', 'notify_via_telegram', 'notify_email',
].join(', ')

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || 'rdv'
  const adminMode = req.nextUrl.searchParams.get('admin') === '1'

  const admin = getAdminClient()

  if (adminMode) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('not_authenticated', 401)
    const { data } = await admin
      .from('booking_settings')
      .select(`${PUBLIC_FIELDS}, ${OWNER_FIELDS}`)
      .eq('owner_user_id', user.id)
      .maybeSingle()
    return NextResponse.json({ settings: data })
  }

  const { data } = await admin
    .from('booking_settings')
    .select(PUBLIC_FIELDS)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
  return NextResponse.json({ settings: data })
}

const ALLOWED_KEYS = [
  'google_account_email', 'calendar_id', 'slug',
  'page_title', 'page_subtitle', 'page_intro',
  'duration_minutes', 'slot_interval_minutes',
  'buffer_before_minutes', 'buffer_after_minutes',
  'min_notice_hours', 'max_advance_days',
  'working_days', 'working_hours_start', 'working_hours_end',
  'lunch_break_start', 'lunch_break_end', 'timezone',
  'location_online_enabled', 'location_in_person_enabled', 'in_person_address',
  'event_title_template', 'event_description_template',
  'notify_via_email', 'notify_via_telegram', 'notify_email', 'active',
]

function sanitize(body: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of ALLOWED_KEYS) {
    if (k in body) out[k] = body[k]
  }
  if (out.slug) out.slug = String(out.slug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'rdv'
  if (out.lunch_break_start === '') out.lunch_break_start = null
  if (out.lunch_break_end === '') out.lunch_break_end = null
  if (out.in_person_address === '') out.in_person_address = null
  return out
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('not_authenticated', 401)

  const body = await req.json().catch(() => ({}))

  const admin = getAdminClient()

  // Agenda : une boîte Nylas suffit (prioritaire). Le compte Google n'est
  // requis qu'en l'absence de Nylas (mode repli).
  const { hasNylas } = await import('@/lib/nylas/agent-bridge')
  const ownerHasNylas = await hasNylas(user.id).catch(() => false)
  if (!ownerHasNylas && !body?.google_account_email) {
    return NextResponse.json({ error: 'Connecte une boîte (Nylas) via /client/email-accounts, ou choisis un compte Google.' }, { status: 400 })
  }
  // Existe déjà ?
  const { data: existing } = await admin
    .from('booking_settings')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  const payload = { ...sanitize(body), owner_user_id: user.id }
  const op = existing
    ? await admin.from('booking_settings').update(payload).eq('id', existing.id).select('*').single()
    : await admin.from('booking_settings').insert(payload).select('*').single()

  if (op.error) return NextResponse.json({ error: op.error.message }, { status: 500 })
  return NextResponse.json({ settings: op.data })
}

export const PUT = POST
