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

const EDITABLE = [
  'raison_sociale','brn','vat_number','capital_mur','adresse','ville','pays','telephone','email','website',
  'banque_nom','iban','swift_bic','numero_compte',
  'societe_id','dossier_id',
  'tva_rate_default','payment_terms_days',
  'compte_client','compte_produit','compte_tva','journal_vente',
  'dunning_schedule','dunning_channels','invoice_prefix',
]

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  const { data } = await admin.from('lexora_settings').select('*').eq('id', 1).maybeSingle()
  return NextResponse.json({ settings: data || null })
}

export async function PUT(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (k in body) payload[k] = body[k]
  }
  payload.updated_at = new Date().toISOString()

  const admin = getAdminClient()
  const { error } = await admin.from('lexora_settings').update(payload).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
