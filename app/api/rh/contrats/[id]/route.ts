import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/rh/contrats/[id] ────────────────────────────────────────────────
export async function GET(_request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params

    const { data: contrat, error } = await supabase
      .from('contrats_employes')
      .select(`
        *,
        employe:employes (
          id,
          prenom,
          nom,
          poste,
          email,
          salaire_base,
          societe_id,
          societe:societes ( id, nom )
        )
      `)
      .eq('id', id)
      .single()

    if (error || !contrat) return NextResponse.json({ error: 'Contrat non trouvé' }, { status: 404 })
    return NextResponse.json({ contrat })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── PATCH /api/rh/contrats/[id] ──────────────────────────────────────────────
// Body : { statut?, date_signature?, notes? }
export async function PATCH(request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const allowed = ['statut', 'date_signature', 'notes', 'html_content']
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await supabase
      .from('contrats_employes')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ contrat: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
