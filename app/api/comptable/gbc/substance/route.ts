import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: tracking }, { data: requirements }, { data: assessment }] = await Promise.all([
      supabase.from('gbc_substance_tracking').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle(),
      supabase.from('gbc_substance_requirements').select('*'),
      supabase.rpc('gbc_assess_substance', { p_societe_id: societe_id, p_exercice: exercice }),
    ])
    return NextResponse.json({
      societe_id, exercice,
      tracking: tracking || null,
      requirements: requirements || [],
      auto_assessment: Array.isArray(assessment) ? assessment[0] : assessment,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const { societe_id, exercice, activity_code, premises_address, premises_verified, ciga_activities, notes } = body
    if (!societe_id || !exercice || !activity_code) {
      return NextResponse.json({ error: 'Champs requis: societe_id, exercice, activity_code' }, { status: 400 })
    }
    const supabase = getAdminClient()
    const { data, error } = await supabase.from('gbc_substance_tracking').upsert({
      societe_id, exercice, activity_code,
      premises_address, premises_verified,
      ciga_activities: ciga_activities || [],
      notes,
      last_assessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'societe_id,exercice' }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, record: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
