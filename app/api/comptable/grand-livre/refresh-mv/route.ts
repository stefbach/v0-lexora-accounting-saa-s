import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error } = await supabaseAuth.auth.getUser()
  if (!user || error) return null
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

/**
 * POST /api/comptable/grand-livre/refresh-mv
 * Admin-only : rafraîchit la vue matérialisée mv_soldes_comptes_exercice.
 * Utilise la fonction SQL fn_refresh_mv_soldes (migration 157). Fallback : warning.
 */
export async function POST() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const startedAt = Date.now()
    const { error } = await supabase.rpc('fn_refresh_mv_soldes')

    if (error) {
      console.warn('[grand-livre/refresh-mv] fn_refresh_mv_soldes failed:', error.message)
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          hint:
            "La fonction fn_refresh_mv_soldes() n'est peut-être pas disponible. " +
            'Assurez-vous que les migrations 152 et 157 sont appliquées.',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      refreshed: 'mv_soldes_comptes_exercice',
      duration_ms: Date.now() - startedAt,
    })
  } catch (e: unknown) {
    console.error('[grand-livre/refresh-mv]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur serveur' },
      { status: 500 },
    )
  }
}
