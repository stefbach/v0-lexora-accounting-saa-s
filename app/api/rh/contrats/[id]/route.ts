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
          id, prenom, nom, poste, email, salaire_base, societe_id,
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
// Body standard : { statut?, date_signature?, notes?, html_content? }
// Body contresigner : { action: 'contresigner' } → signature dirigeant authentifié
export async function PATCH(request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    // ── Action : contresignature dirigeant ──────────────────────────────────
    if (body.action === 'contresigner') {
      // Vérifier que l'employé a déjà signé
      const { data: contrat } = await supabase
        .from('contrats_employes')
        .select('statut, date_signature_dirigeant')
        .eq('id', id)
        .single()

      if (!contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
      if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà contresigné' }, { status: 409 })
      if (contrat.statut === 'brouillon') return NextResponse.json({ error: "L'employé n'a pas encore signé" }, { status: 400 })

      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : 'inconnue'

      const { data, error } = await supabase
        .from('contrats_employes')
        .update({
          statut:                   'signe',
          date_signature_dirigeant: new Date().toISOString(),
          ip_signature_dirigeant:   ip,
          signe_par_id:             user.id,
          // Rétrocompatibilité : mettre aussi date_signature globale
          date_signature:           new Date().toISOString(),
          updated_at:               new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ contrat: data, message: 'Contrat contresigné avec succès' })
    }

    // ── Mise à jour standard ─────────────────────────────────────────────────
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
