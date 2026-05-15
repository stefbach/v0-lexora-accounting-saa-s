import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/enroll
 *
 * Génère un code de vérification 6-chars (valide 15 min) pour l'utilisateur
 * authentifié. L'utilisateur tape ensuite "/start CODE" au bot Telegram pour
 * lier son compte.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin.rpc('telegram_generate_verification_code', { p_user_id: user.id })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'LexoraBot'
  const deepLink = `https://t.me/${bot}?start=${data}`

  return NextResponse.json({
    code: data,
    deep_link: deepLink,
    expires_in_minutes: 15,
    instructions: `Ouvre Telegram et tape <code>/start ${data}</code> au bot @${bot} (ou clique sur le lien).`,
  })
}

/**
 * GET /api/telegram/enroll
 * Renvoie le statut de liaison Telegram du user courant.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ linked: false, authenticated: false }, { status: 401 })

  const admin = getAdminClient()
  const { data } = await admin
    .from('telegram_users')
    .select('chat_id, current_societe_id, telegram_username, telegram_firstname, verified, last_seen_at, language_code')
    .eq('user_id', user.id)
    .eq('verified', true)
    .maybeSingle()

  return NextResponse.json({
    authenticated: true,
    linked: !!data,
    telegram: data || null,
  })
}

/**
 * DELETE /api/telegram/enroll
 * Délie le compte Telegram du user courant.
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = getAdminClient()
  const { error } = await admin.from('telegram_users').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
