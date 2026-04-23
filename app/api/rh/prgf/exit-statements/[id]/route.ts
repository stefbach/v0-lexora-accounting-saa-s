/**
 * PATCH/DELETE /api/rh/prgf/exit-statements/[id] — sprint G13.
 * PATCH : saisie gratuity + past services + notes + statut.
 * DELETE : soft delete (statut='annule', admin).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { computeGratuityDeadline } from '@/lib/rh/declarations-mra'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) {
      return NextResponse.json({ error: 'Accès réservé RH/admin' }, { status: 403 })
    }

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const update: any = {}
    if (body.gratuity_paid_mur !== undefined) update.gratuity_paid_mur = Number(body.gratuity_paid_mur) || 0
    if (body.gratuity_date_paiement !== undefined) {
      update.gratuity_date_paiement = body.gratuity_date_paiement || null
      if (body.gratuity_date_paiement) {
        update.gratuity_return_deadline = computeGratuityDeadline(String(body.gratuity_date_paiement))
      } else {
        update.gratuity_return_deadline = null
      }
    }
    if (body.gratuity_return_submitted !== undefined) update.gratuity_return_submitted = !!body.gratuity_return_submitted
    if (body.gratuity_return_date !== undefined) update.gratuity_return_date = body.gratuity_return_date || null
    if (body.past_services_due_mur !== undefined) update.past_services_due_mur = Number(body.past_services_due_mur) || 0
    if (body.past_services_settled !== undefined) update.past_services_settled = !!body.past_services_settled
    if (body.past_services_date_paiement !== undefined) update.past_services_date_paiement = body.past_services_date_paiement || null
    if (body.statut !== undefined) update.statut = String(body.statut)
    if (body.notes !== undefined) update.notes = body.notes || null

    const { error } = await supabase.from('prgf_exit_statements').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Annulation réservée admin' }, { status: 403 })
    }

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await supabase.from('prgf_exit_statements')
      .update({ statut: 'annule' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
