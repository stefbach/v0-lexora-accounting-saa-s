import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TABLE = 'parametres_plateforme'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// ── GET /api/admin/parametres ─────────────────────────────────────────────────
export async function GET() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      // Table may not exist yet — return defaults
      console.error('parametres_plateforme:', error.message)
      return NextResponse.json({ parametres: getDefaults() })
    }

    return NextResponse.json({ parametres: data ?? getDefaults() })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── POST /api/admin/parametres ────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()

    const body = await request.json()

    // Upsert: if a row exists, update it; otherwise insert
    const { data: existing } = await supabase.from(TABLE).select('id').limit(1).maybeSingle()

    let result
    if (existing?.id) {
      result = await supabase.from(TABLE).update({ ...body, updated_at: new Date().toISOString(), updated_by: adminUser.id }).eq('id', existing.id).select().single()
    } else {
      result = await supabase.from(TABLE).insert({ ...body, created_by: adminUser.id }).select().single()
    }

    if (result.error) throw result.error
    return NextResponse.json({ parametres: result.data, success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

function getDefaults() {
  return {
    org_nom: 'Lexora Mauritius',
    org_email: 'admin@lexora.mu',
    org_logo_url: '',
    wati_token: '',
    wati_phone_id: '',
    wati_webhook_url: '',
    email_from: 'noreply@lexora.mu',
    email_reply_to: 'admin@lexora.mu',
    taux_change_usd_mur: '',
    taux_change_eur_mur: '',
    exercice_fiscal_debut: '01-01',
    devise_principale: 'MUR',
    notif_email: true,
    notif_new_users: true,
    notif_uploads: false,
    notif_tva: true,
  }
}
