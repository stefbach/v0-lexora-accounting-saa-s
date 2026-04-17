import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

// GET — List investissements/credits for a société
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data, error } = await supabase
      .from('investissements_previsionnel')
      .select('*')
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({
      investissements: (data || []).filter(d => d.type === 'investissement'),
      credits: (data || []).filter(d => d.type === 'credit'),
    })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Create or update an investissement/credit
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { id, societe_id, type, libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes } = body

    if (!societe_id || !type || !libelle) {
      return NextResponse.json({ error: 'societe_id, type, libelle requis' }, { status: 400 })
    }

    await assertSocieteAccess(supabase, user.id, societe_id)

    if (id) {
      // Update — verify the existing row belongs to the asserted société too
      const { data: existing } = await supabase
        .from('investissements_previsionnel')
        .select('societe_id')
        .eq('id', id)
        .maybeSingle()
      if (!existing) throw new ResourceNotFoundError('Investissement introuvable')
      if (existing.societe_id !== societe_id) {
        await assertSocieteAccess(supabase, user.id, existing.societe_id as string)
      }
      const { data, error } = await supabase
        .from('investissements_previsionnel')
        .update({ libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ item: data })
    } else {
      // Create
      const { data, error } = await supabase
        .from('investissements_previsionnel')
        .insert({ societe_id, type, libelle, montant, date_debut, mensualite, taux_interet, capital_restant, banque, notes })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ item: data }, { status: 201 })
    }
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — Remove an investissement/credit
export async function DELETE(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Fetch to resolve societe_id, then assert access
    const { data: existing } = await supabase
      .from('investissements_previsionnel')
      .select('societe_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) throw new ResourceNotFoundError('Investissement introuvable')
    await assertSocieteAccess(supabase, user.id, existing.societe_id as string)

    const { error } = await supabase.from('investissements_previsionnel').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
