/**
 * GET  /api/agent/handoff/[token]?consume=1 → consomme un token de handoff
 *   et renvoie {message, societe_id, context} pour pré-charger l'Expert web.
 * GET sans consume → preview du token sans le brûler.
 *
 * Le token est créé par l'agent Telegram (outil web_handoff_link) ou par
 * l'Expert web (handoff vers Telegram fait directement via notify_telegram).
 * Court (24h), single-use, scoppé société.
 *
 * Auth : session web — on vérifie que l'utilisateur connecté est bien le
 * destinataire (ou rôle admin/direction de la société).
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabase } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { token } = await ctx.params
    if (!token) return NextResponse.json({ error: 'token requis' }, { status: 400 })
    const url = new URL(request.url)
    const consume = url.searchParams.get('consume') === '1'

    const admin = getAdminClient()
    const { data: row, error } = await admin
      .from('agent_handoff_tokens').select('*').eq('token', token).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Token introuvable' }, { status: 404 })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Token expiré' }, { status: 410 })
    }
    if (row.consumed_at) {
      return NextResponse.json({ error: 'Token déjà consommé' }, { status: 410 })
    }

    // Vérif user_id si spécifié sur le token. Sinon, on exige rôle sur la société.
    if (row.user_id && row.user_id !== user.id) {
      return NextResponse.json({ error: 'Ce lien n\'est pas pour vous' }, { status: 403 })
    }
    if (!row.user_id) {
      const { data: us } = await admin
        .from('user_societes').select('role').eq('user_id', user.id).eq('societe_id', row.societe_id).maybeSingle()
      if (!us) {
        const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (!['admin', 'super_admin'].includes(prof?.role || '')) {
          return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
        }
      }
    }

    if (consume) {
      await admin.from('agent_handoff_tokens')
        .update({ consumed_at: new Date().toISOString() }).eq('token', token)
    }

    return NextResponse.json({
      ok: true,
      consumed: consume,
      message: row.message,
      societe_id: row.societe_id,
      source_canal: row.source_canal,
      context: row.context || {},
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
