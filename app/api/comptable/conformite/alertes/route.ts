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

// GET /api/comptable/conformite/alertes?societe_id=...&status=open
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const status = searchParams.get('status') || 'open'
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    let query = supabase
      .from('compliance_alerts')
      .select('*')
      .eq('societe_id', societe_id)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error) {
      if ((error.message || '').includes('does not exist')) {
        return NextResponse.json({ alerts: [], migrated: false })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // KPI: nombre par sévérité
    const counts = {
      critical: (data || []).filter((a: any) => a.severity === 'critical' && a.status === 'open').length,
      high: (data || []).filter((a: any) => a.severity === 'high' && a.status === 'open').length,
      medium: (data || []).filter((a: any) => a.severity === 'medium' && a.status === 'open').length,
      total_open: (data || []).filter((a: any) => a.status === 'open').length,
    }

    return NextResponse.json({ alerts: data || [], counts, migrated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — résoudre/ack une alerte ou créer manuellement
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'resolve') {
      const { id, resolution_note } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase.from('compliance_alerts')
        .update({ status: 'resolved', resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'acknowledge') {
      const { id } = body
      const { error } = await supabase.from('compliance_alerts')
        .update({ status: 'acknowledged' })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'create') {
      const { societe_id, alert_type, severity, title, description, legal_reference, amount, related_entity_type, related_entity_id } = body
      if (!societe_id || !alert_type || !title) {
        return NextResponse.json({ error: 'societe_id, alert_type, title requis' }, { status: 400 })
      }
      const { data, error } = await supabase.from('compliance_alerts').insert({
        societe_id, alert_type, severity: severity || 'medium', title, description,
        legal_reference, amount, related_entity_type, related_entity_id,
        created_by: user.id,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ alert: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
