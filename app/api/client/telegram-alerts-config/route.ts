import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  const { data, error } = await supabase
    .from('telegram_alerts_config')
    .select('*')
    .eq('societe_id', societeId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si la config n'existe pas, retourner les defaults
  return NextResponse.json(data || {
    societe_id: societeId,
    enable_mra_deadlines: true,
    mra_deadline_advance_days: 7,
    enable_leave_requests: true,
    enable_leave_approvals: true,
    enable_low_balance: true,
    low_balance_threshold_mur: 50000,
    enable_invoice_overdue: true,
    invoice_overdue_days: 30,
    enable_daily_digest: false,
    daily_digest_time: '08:00',
    enable_weekly_kpis: false,
    weekly_kpis_day: 1,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  const body = await req.json().catch(() => ({}))
  const allowed = [
    'enable_mra_deadlines', 'mra_deadline_advance_days',
    'enable_leave_requests', 'enable_leave_approvals',
    'enable_low_balance', 'low_balance_threshold_mur',
    'enable_invoice_overdue', 'invoice_overdue_days',
    'enable_daily_digest', 'daily_digest_time',
    'enable_weekly_kpis', 'weekly_kpis_day',
  ]
  const patch: any = { societe_id: societeId }
  for (const k of allowed) if (k in body) patch[k] = body[k]

  const { data, error } = await supabase
    .from('telegram_alerts_config')
    .upsert(patch, { onConflict: 'societe_id' })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
