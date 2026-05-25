import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Garantit que toutes les clés modules attendues par la sidebar sont
// présentes (les clés manquantes sont mises à false). Évite que la sidebar
// "tombe sur du undefined" et affiche la section par défaut.
const MODULE_KEYS = [
  // Modules visibles sur /tarifs
  'documents', 'comptabilite', 'facturation', 'rh', 'fiscal',
  'alertes_ia', 'tibok', 'telegram',
  // Sous-modules avancés internes
  'juridique', 'etats_financiers', 'employe_portal',
] as const

function normalizeModules(input: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const out: Record<string, boolean> = {}
  for (const k of MODULE_KEYS) out[k] = src[k] === true
  return out
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// GET — List all plans + all societes with their current plan
export async function GET() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()

    const [plansRes, societesRes] = await Promise.all([
      supabase.from('service_plans').select('*').order('created_at', { ascending: true }),
      supabase.from('societes').select('*').order('nom', { ascending: true }),
    ])

    if (plansRes.error) return NextResponse.json({ error: plansRes.error.message }, { status: 500 })
    if (societesRes.error) return NextResponse.json({ error: societesRes.error.message }, { status: 500 })

    const societes = societesRes.data || []

    // Enrich societes with client info via dossiers
    const societeIds = societes.map(s => s.id)
    let dossierClients: Record<string, { id: string; full_name: string; email: string }[]> = {}

    if (societeIds.length > 0) {
      const { data: dossiers } = await supabase
        .from('dossiers')
        .select('societe_id, client_id')
        .in('societe_id', societeIds)

      if (dossiers && dossiers.length > 0) {
        const clientIds = [...new Set(dossiers.map(d => d.client_id).filter(Boolean))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', clientIds)

        const profileMap: Record<string, { id: string; full_name: string; email: string }> = {}
        ;(profiles || []).forEach(p => { profileMap[p.id] = p })

        for (const d of dossiers) {
          if (!dossierClients[d.societe_id]) dossierClients[d.societe_id] = []
          if (d.client_id && profileMap[d.client_id]) {
            const already = dossierClients[d.societe_id].some(c => c.id === d.client_id)
            if (!already) dossierClients[d.societe_id].push(profileMap[d.client_id])
          }
        }
      }
    }

    const enrichedSocietes = societes.map(s => ({
      ...s,
      clients: dossierClients[s.id] || [],
    }))

    return NextResponse.json({
      plans: plansRes.data || [],
      societes: enrichedSocietes,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Various actions for service plans
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { action } = body
    const supabase = getAdminClient()

    switch (action) {
      case 'assign_plan': {
        const { societe_id, plan_code } = body
        if (!societe_id || !plan_code) {
          return NextResponse.json({ error: 'societe_id et plan_code requis' }, { status: 400 })
        }

        // Get the plan
        const { data: plan } = await supabase
          .from('service_plans')
          .select('*')
          .eq('code', plan_code)
          .single()

        if (!plan) {
          return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
        }

        const { error } = await supabase
          .from('societes')
          .update({
            plan_id: plan.id,
            plan_code: plan.code,
            modules_actifs: normalizeModules(plan.modules),
          })
          .eq('id', societe_id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, message: `Plan ${plan.nom} attribue` })
      }

      case 'custom_modules': {
        const { societe_id, modules } = body
        if (!societe_id || !modules) {
          return NextResponse.json({ error: 'societe_id et modules requis' }, { status: 400 })
        }

        const { error } = await supabase
          .from('societes')
          .update({
            plan_code: 'custom',
            modules_actifs: normalizeModules(modules),
          })
          .eq('id', societe_id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, message: 'Modules personnalises mis a jour' })
      }

      case 'create_plan': {
        const { code, nom, description, modules, prix_mensuel } = body
        if (!code || !nom || !modules) {
          return NextResponse.json({ error: 'code, nom et modules requis' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('service_plans')
          .insert({
            code,
            nom,
            description: description || null,
            modules,
            prix_mensuel: prix_mensuel || 0,
          })
          .select()
          .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, plan: data })
      }

      case 'update_plan': {
        const { plan_id, nom, description, modules, prix_mensuel } = body
        if (!plan_id) {
          return NextResponse.json({ error: 'plan_id requis' }, { status: 400 })
        }

        const updateData: Record<string, unknown> = {}
        if (nom !== undefined) updateData.nom = nom
        if (description !== undefined) updateData.description = description
        if (modules !== undefined) updateData.modules = modules
        if (prix_mensuel !== undefined) updateData.prix_mensuel = prix_mensuel

        const { data, error } = await supabase
          .from('service_plans')
          .update(updateData)
          .eq('id', plan_id)
          .select()
          .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, plan: data })
      }

      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
