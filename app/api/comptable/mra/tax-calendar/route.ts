import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** GET — Tax Calendar agrégé (TVA, TDS, CIT, ROC) */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase.from('vw_tax_calendar').select('*').eq('societe_id', societe_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const grouped = { overdue: [] as any[], urgent: [] as any[], soon: [] as any[], future: [] as any[], done: [] as any[] }
    for (const row of (data || []) as any[]) {
      if (grouped[row.priority as keyof typeof grouped]) grouped[row.priority as keyof typeof grouped].push(row)
    }
    return NextResponse.json({
      summary: {
        overdue: grouped.overdue.length,
        urgent: grouped.urgent.length,
        soon: grouped.soon.length,
        future: grouped.future.length,
        done: grouped.done.length,
      },
      calendar: grouped,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
