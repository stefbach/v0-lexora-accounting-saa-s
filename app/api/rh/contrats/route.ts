import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET /api/rh/contrats ─────────────────────────────────────────────────────
// Sprint 5 BUG E — refactor sans FK join pour éviter les 500 dus au
// cache schema PostgREST qui perdait parfois la relation
// contrats_employes → employes (→ societes). On fait 3 queries
// séparées + enrichment côté serveur : pattern identique à /api/rh/paie.
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Service-role client pour éviter toute issue RLS sur la lecture
    const supabase = getAdminClient()

    const url = new URL(request.url)
    const societe_id = url.searchParams.get('societe_id')
    const type_contrat = url.searchParams.get('type_contrat')
    const statut = url.searchParams.get('statut')
    const employe_id = url.searchParams.get('employe_id')

    // 1. Query contrats (no FK join)
    let query = supabase
      .from('contrats_employes')
      .select('*')
      .order('created_at', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (type_contrat) query = query.eq('type_contrat', type_contrat)
    if (statut) query = query.eq('statut', statut)
    // societe_id filter si possible via colonne directe (fallback : filtre en post-enrichment)
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data: contrats, error } = await query
    if (error) {
      console.error('[contrats GET] query error:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      })
      return NextResponse.json({
        error: `Erreur contrats_employes: ${error.message}${error.hint ? ` (${error.hint})` : ''}`,
        code: error.code,
      }, { status: 500 })
    }

    if (!contrats || contrats.length === 0) {
      return NextResponse.json({ contrats: [] })
    }

    // 2. Enrich with employees (separate query, no FK needed)
    const empIds = [...new Set(contrats.map((c: any) => c.employe_id).filter(Boolean))]
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      try {
        const { data: emps } = await supabase
          .from('employes')
          .select('id, prenom, nom, poste, email, societe_id')
          .in('id', empIds)
        for (const e of emps || []) empMap[e.id] = e
      } catch (e: any) {
        console.warn('[contrats GET] employes enrichment failed:', e?.message || e)
      }
    }

    // 3. Enrich with societes (from employe.societe_id)
    const socIds = [...new Set(Object.values(empMap).map((e: any) => e.societe_id).filter(Boolean))]
    let socMap: Record<string, any> = {}
    if (socIds.length > 0) {
      try {
        const { data: socs } = await supabase
          .from('societes')
          .select('id, nom')
          .in('id', socIds)
        for (const s of socs || []) socMap[s.id] = s
      } catch (e: any) {
        console.warn('[contrats GET] societes enrichment failed:', e?.message || e)
      }
    }

    // 4. Build enriched response — shape compatible avec l'ancienne réponse
    // pour éviter de casser les consommateurs (même forme employe: { ..., societe })
    const enriched = contrats.map((c: any) => {
      const emp = empMap[c.employe_id]
      const soc = emp?.societe_id ? socMap[emp.societe_id] : null
      return {
        ...c,
        employe: emp
          ? { id: emp.id, prenom: emp.prenom, nom: emp.nom, poste: emp.poste, email: emp.email, societe_id: emp.societe_id, societe: soc }
          : null,
      }
    })

    return NextResponse.json({ contrats: enriched })
  } catch (e: any) {
    console.error('[contrats GET] exception:', {
      name: e?.name,
      message: e?.message,
      code: e?.code,
      stack: e?.stack?.split('\n').slice(0, 5).join(' | '),
    })
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur',
      code: e?.code,
    }, { status: 500 })
  }
}

// ── POST /api/rh/contrats ────────────────────────────────────────────────────
// Body : { employe_id, type_contrat, secteur, date_debut, date_fin?, salaire_brut?, poste?, html_content?, notes? }
// Sprint 8 — admin client pour contourner RLS "contrats_employe_read" qui
// référence auth.users (mig 028) → "permission denied for table users"
// quand on utilise le client user-auth.
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { employe_id, type_contrat, secteur, date_debut, date_fin, salaire_brut, poste, html_content, notes } = body

    if (!employe_id || !type_contrat || !date_debut) {
      return NextResponse.json({ error: 'Champs obligatoires manquants : employe_id, type_contrat, date_debut' }, { status: 400 })
    }

    // Récupérer societe_id depuis l'employé
    const { data: employe, error: empErr } = await supabase
      .from('employes')
      .select('societe_id')
      .eq('id', employe_id)
      .single()

    if (empErr || !employe) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })

    const { data: contrat, error } = await supabase
      .from('contrats_employes')
      .insert({
        employe_id,
        societe_id: employe.societe_id,
        type_contrat,
        secteur: secteur || 'general',
        date_debut,
        date_fin: date_fin || null,
        salaire_brut: salaire_brut || null,
        poste: poste || null,
        html_content: html_content || null,
        notes: notes || null,
        statut: 'brouillon',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ contrat }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
