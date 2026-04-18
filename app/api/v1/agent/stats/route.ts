import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const period = searchParams.get('period') || '7d'

    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1
    const since = new Date(Date.now() - days * 86400000).toISOString()

    let allocQuery = supabase
      .from('transaction_allocations')
      .select('status, agent_name, agent_confidence, allocation_type, created_at')
      .gte('created_at', since)
    if (societeId) allocQuery = allocQuery.eq('societe_id', societeId)
    const { data: allocations } = await allocQuery

    let logQuery = supabase
      .from('agent_execution_logs')
      .select('agent_name, cost_usd, latency_ms, error, created_at')
      .gte('created_at', since)
    if (societeId) logQuery = logQuery.eq('societe_id', societeId)
    const { data: logs } = await logQuery

    const allocs = allocations || []
    const autoValidated = allocs.filter(a => a.status === 'auto_validated').length
    const proposed = allocs.filter(a => a.status === 'proposed').length
    const userValidated = allocs.filter(a => a.status === 'user_validated').length
    const reversed = allocs.filter(a => a.status === 'reversed').length
    const totalCost = (logs || []).reduce((s, l) => s + (Number(l.cost_usd) || 0), 0)
    const errors = (logs || []).filter(l => l.error).length
    const avgLatency = (logs || []).length > 0
      ? Math.round((logs || []).reduce((s, l) => s + (l.latency_ms || 0), 0) / (logs || []).length)
      : 0

    const byAgent: Record<string, number> = {}
    for (const a of allocs) {
      byAgent[a.agent_name] = (byAgent[a.agent_name] || 0) + 1
    }

    const byType: Record<string, number> = {}
    for (const a of allocs) {
      byType[a.allocation_type] = (byType[a.allocation_type] || 0) + 1
    }

    return NextResponse.json({
      period,
      total_allocations: allocs.length,
      auto_validated: autoValidated,
      proposed,
      user_validated: userValidated,
      reversed,
      auto_validation_rate: allocs.length > 0 ? Math.round(autoValidated / allocs.length * 100) : 0,
      total_cost_usd: Math.round(totalCost * 1000) / 1000,
      errors,
      avg_latency_ms: avgLatency,
      by_agent: byAgent,
      by_type: byType,
      time_saved_minutes: Math.round(allocs.length * 2), // ~2 min/tx en saisie manuelle
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
