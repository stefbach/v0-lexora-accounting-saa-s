import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/google-accounts/set-default { id }
 *
 * Définit ce compte Google comme default_for_calendar de l'user. Tous les
 * autres comptes de l'user passent à false (index unique partiel garantit
 * l'unicité côté DB).
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = getAdminClient()
  // Vérifie ownership
  const { data: owned } = await admin
    .from('user_oauth_accounts').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!owned) return NextResponse.json({ error: 'compte introuvable' }, { status: 404 })

  // Désactive tous les defaults, puis active celui-ci
  await admin.from('user_oauth_accounts').update({ is_default_for_calendar: false })
    .eq('user_id', user.id).eq('provider', 'google')
  const { error } = await admin.from('user_oauth_accounts').update({ is_default_for_calendar: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
