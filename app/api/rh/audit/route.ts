import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)

    // Resolve societe_id from param or user profile
    let societeId = searchParams.get('societe_id')
    if (!societeId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('societe_id')
        .eq('id', user.id)
        .maybeSingle()
      societeId = profile?.societe_id ?? null
    }

    if (!societeId) {
      return NextResponse.json({ logs: [], total: 0, page: 1 })
    }

    // Filters
    const entite = searchParams.get('entite')
    const action = searchParams.get('action')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 50
    const offset = (page - 1) * limit

    // Build count query
    let countQuery = supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)

    // Build data query
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (entite) {
      query = query.eq('entite', entite)
      countQuery = countQuery.eq('entite', entite)
    }
    if (action) {
      query = query.eq('action', action)
      countQuery = countQuery.eq('action', action)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
      countQuery = countQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`)
      countQuery = countQuery.lte('created_at', `${dateTo}T23:59:59`)
    }

    const [{ data: logs, error }, { count }] = await Promise.all([
      query,
      countQuery,
    ])

    if (error) throw error

    // Resolve user names for the logs
    const userIds = [...new Set((logs || []).map((l: any) => l.utilisateur_id).filter(Boolean))]
    let userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      if (profiles) {
        for (const p of profiles) {
          userMap[p.id] = p.full_name || p.email || p.id
        }
      }
    }

    const enrichedLogs = (logs || []).map((l: any) => ({
      ...l,
      utilisateur_nom: userMap[l.utilisateur_id] || l.utilisateur_id || 'Système',
    }))

    return NextResponse.json({
      logs: enrichedLogs,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
