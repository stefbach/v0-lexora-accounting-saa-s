import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendDunning } from '@/lib/lexora-billing/dunning'
import type { DunningChannel } from '@/lib/lexora-billing/types'

export const dynamic = 'force-dynamic'

const VALID_CHANNELS: DunningChannel[] = ['email', 'telegram', 'sms', 'whatsapp']

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const channels = Array.isArray(body.channels) ? body.channels.filter((c: any): c is DunningChannel => VALID_CHANNELS.includes(c)) : []
  if (channels.length === 0) return NextResponse.json({ error: 'channels requis' }, { status: 400 })
  const stage = String(body.stage || 'manual')
  const message = body.message ? String(body.message) : undefined

  const admin = getAdminClient()
  const { data: invoice } = await admin.from('lexora_invoices').select('*').eq('id', id).maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

  const results = await sendDunning({
    supabaseAdmin: admin,
    invoice: invoice as any,
    channels,
    stage,
    customMessage: message,
    triggeredBy: user.id,
  })

  return NextResponse.json({ success: true, results })
}
