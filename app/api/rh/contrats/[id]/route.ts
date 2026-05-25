import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function getAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET /api/rh/contrats/[id] ────────────────────────────────────────────────
// Sprint 5 BUG E — refactor sans FK join (idem liste /api/rh/contrats).
export async function GET(_request: Request, { params }: Params) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { id } = await params

    const { data: contrat, error } = await supabase
      .from('contrats_employes')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('[contrats/[id] GET] error:', { message: error.message, code: error.code })
      return NextResponse.json({ error: `Erreur contrats_employes: ${error.message}`, code: error.code }, { status: 500 })
    }
    if (!contrat) return NextResponse.json({ error: 'Contrat non trouvé' }, { status: 404 })

    // Enrich separately
    let employe: any = null
    if (contrat.employe_id) {
      try {
        const { data: emp } = await supabase
          .from('employes')
          .select('id, prenom, nom, poste, email, salaire_base, societe_id')
          .eq('id', contrat.employe_id)
          .maybeSingle()
        if (emp) {
          let societe: any = null
          if (emp.societe_id) {
            const { data: soc } = await supabase.from('societes').select('id, nom').eq('id', emp.societe_id).maybeSingle()
            societe = soc
          }
          employe = { ...emp, societe }
        }
      } catch (e: any) {
        console.warn('[contrats/[id] GET] enrichment failed:', e?.message || e)
      }
    }

    return NextResponse.json({ contrat: { ...contrat, employe } })
  } catch (e: any) {
    console.error('[contrats/[id] GET] exception:', e?.message || e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── PATCH /api/rh/contrats/[id] ──────────────────────────────────────────────
// Body standard : { statut?, date_signature?, notes?, html_content? }
// Body contresigner : { action: 'contresigner' } → signature dirigeant authentifié
// Sprint 8 — admin client pour contourner RLS qui référence auth.users
// (même cause que POST/INSERT, cf. mig 028 contrats_employe_read).
export async function PATCH(request: Request, { params }: Params) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
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
    // Sprint 5 AMÉLIO F — ajoute les champs édition + signature dirigeant
    // (mig 142) : html_content_modified, signature_nom_complet,
    // signature_image_dirigeant_url.
    const allowed = [
      'statut',
      'date_signature',
      'notes',
      'html_content',
      'html_content_modified',
      'signature_nom_complet',
      'signature_image_dirigeant_url',
    ]
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
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
