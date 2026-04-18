import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { reverseAllocation } from '@/lib/agents/tools/writes'
import { recordLearningPattern } from '@/lib/agents/tools/patterns'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { allocation_id, reason } = await request.json()
    if (!allocation_id) return NextResponse.json({ error: 'allocation_id requis' }, { status: 400 })

    const result = await reverseAllocation(allocation_id, user.id, reason || 'Annulé par utilisateur')
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
