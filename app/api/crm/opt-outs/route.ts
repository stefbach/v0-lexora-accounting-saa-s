// =============================================================================
// GET  /api/crm/opt-outs   — liste du registre
// POST /api/crm/opt-outs   — ajouter une entrée manuelle au registre
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('crm_opt_outs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body?.email && !body?.telephone && !body?.linkedin_url) {
    return NextResponse.json({ error: 'au moins un identifiant requis' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('crm_opt_outs')
    .insert({
      email: body.email ?? null,
      telephone: body.telephone ?? null,
      linkedin_url: body.linkedin_url ?? null,
      raison: body.raison ?? null,
      source: body.source ?? 'manuel',
      created_by: auth.user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Propage l'opt-out sur les contacts matchants
  const filters: string[] = []
  if (body.email) filters.push(`email.eq.${body.email}`)
  if (body.telephone) filters.push(`telephone.eq.${body.telephone}`)
  if (body.linkedin_url) filters.push(`linkedin_url.eq.${body.linkedin_url}`)
  if (filters.length > 0) {
    await admin
      .from('crm_contacts')
      .update({ opt_out: true, opt_out_reason: body.raison ?? 'registre central' })
      .or(filters.join(','))
  }

  return NextResponse.json({ data })
}
