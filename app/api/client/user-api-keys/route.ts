/**
 * /api/client/user-api-keys — CRUD pour les clés API personnelles.
 *
 * Session web requise (pas de méta : on ne crée pas une clé via une clé).
 *
 * GET    → liste les clés non-révoquées de l'utilisateur (prefix uniquement)
 * POST   → crée une nouvelle clé, renvoie le token EN CLAIR une seule fois
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateApiToken } from '@/lib/supabase/api-keys'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('user_api_keys')
    .select('id, name, key_prefix, last_used_at, created_at, revoked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keys: data || [] })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name || '').trim().slice(0, 80)
  if (!name) {
    return NextResponse.json({ error: 'Nom (label) requis pour identifier la clé' }, { status: 400 })
  }

  const { token, hash, prefix } = generateApiToken()
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('user_api_keys')
    .insert({
      user_id: user.id,
      name,
      key_prefix: prefix,
      key_hash: hash,
    })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ⚠ Le token en clair est renvoyé UNE SEULE FOIS. Aucune route ne pourra
  // le récupérer ultérieurement — l'utilisateur doit le copier maintenant.
  return NextResponse.json({
    key: data,
    token,
    warning: 'Cette clé ne sera plus jamais visible. Copie-la maintenant.',
  })
}
