import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/conformite/regles?societe_id=...
// Liste les règles applicables (globales + spécifiques à la société)
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    const supabase = getAdminClient()
    let query = supabase.from('classification_rules').select('*').eq('active', true).order('priority')
    if (societe_id) {
      query = query.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    } else {
      query = query.is('societe_id', null)
    }
    const { data, error } = await query
    if (error) {
      if ((error.message || '').includes('does not exist')) {
        return NextResponse.json({ rules: [], migrated: false })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ rules: data || [], migrated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/comptable/conformite/regles — créer une règle custom
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'create' || !action) {
      const { rule_code, societe_id, priority, pattern_libelle, pattern_tiers, classification, compte_debit, compte_credit, libelle_template, requires_validation, compliance_flag, legal_warning } = body
      if (!rule_code || !classification || !compte_debit) {
        return NextResponse.json({ error: 'rule_code, classification, compte_debit requis' }, { status: 400 })
      }
      const { data, error } = await supabase.from('classification_rules').insert({
        rule_code, societe_id: societe_id || null, priority: priority || 100,
        pattern_libelle, pattern_tiers, classification, compte_debit,
        compte_credit: compte_credit || '512',
        libelle_template, requires_validation: requires_validation || false,
        compliance_flag, legal_warning, created_by: user.id,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rule: data })
    }

    if (action === 'update') {
      const { id, ...updates } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase.from('classification_rules').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const { id } = body
      const { error } = await supabase.from('classification_rules').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
