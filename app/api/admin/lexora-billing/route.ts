import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// GET — Liste paginée des factures (avec filtre status)
export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('q')
  const admin = getAdminClient()

  let q = admin.from('lexora_invoices').select('*').order('invoice_date', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status)
  if (search) q = q.or(`invoice_number.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcul KPIs
  const all = data || []
  const today = new Date().toISOString().slice(0, 10)
  const stats = {
    total: all.length,
    total_ttc: all.reduce((s, r) => s + Number(r.amount_ttc || 0), 0),
    paid_ttc: all.filter(r => r.status === 'payee').reduce((s, r) => s + Number(r.amount_ttc || 0), 0),
    unpaid_ttc: all.filter(r => r.status !== 'payee' && r.status !== 'annulee').reduce((s, r) => s + Number(r.amount_ttc || 0), 0),
    overdue_count: all.filter(r => r.status !== 'payee' && r.status !== 'annulee' && r.due_date < today).length,
  }

  // Auto-promote en "en_retard" les factures dépassées (lecture-only update)
  const overdueIds = all
    .filter(r => r.status === 'emise' && r.due_date < today)
    .map(r => r.id)
  if (overdueIds.length > 0) {
    await admin.from('lexora_invoices').update({ status: 'en_retard' }).in('id', overdueIds)
  }

  return NextResponse.json({ invoices: all, stats })
}
