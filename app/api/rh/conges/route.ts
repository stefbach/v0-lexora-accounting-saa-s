import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Get the société IDs accessible by this user */
async function getUserSocieteIds(supabase: ReturnType<typeof getAdminClient>, userId: string): Promise<string[]> {
  const { data: profile } = await supabase.from('profiles').select('role, societe_id').eq('id', userId).maybeSingle()
  if (profile?.societe_id) return [profile.societe_id]

  const { data: dossiers } = await supabase.from('dossiers').select('societe_id').eq('client_id', userId)
  const { data: owned } = await supabase.from('societes').select('id').eq('created_by', userId)
  return [...new Set([...(dossiers || []).map(d => d.societe_id), ...(owned || []).map(s => s.id)])]
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const societe_id = searchParams.get('societe_id')
    const statut = searchParams.get('statut')

    // 1) Determine accessible société(s)
    let societeIds: string[]
    if (societe_id) {
      // Verify user has access to this société
      const accessibleIds = await getUserSocieteIds(supabase, user.id)
      if (!accessibleIds.includes(societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé à cette société' }, { status: 403 })
      }
      societeIds = [societe_id]
    } else {
      societeIds = await getUserSocieteIds(supabase, user.id)
    }

    if (societeIds.length === 0) {
      return NextResponse.json({ conges: [], soldes: null })
    }

    // 2) Get employee IDs for those sociétés
    const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste, societe_id').in('societe_id', societeIds)
    const employeeIds = (emps || []).map(e => e.id)

    if (employeeIds.length === 0) {
      return NextResponse.json({ conges: [], soldes: null })
    }

    // 3) Build congés query filtered by those employee IDs
    let query = supabase.from('demandes_conges').select('*').in('employe_id', employeeIds).order('date_debut', { ascending: false })
    if (employe_id) query = query.eq('employe_id', employe_id)
    if (statut) query = query.eq('statut', statut)

    const [congesData, soldesData] = await Promise.all([
      query,
      employe_id
        ? supabase.from('soldes_conges').select('*').eq('employe_id', employe_id).order('annee', { ascending: false }).limit(1)
        : { data: null }
    ])

    if (congesData.error) throw congesData.error

    // 4) Enrich with employee name (separate lookup, not FK join)
    const empMap = new Map((emps || []).map(e => [e.id, e]))
    const congesEnriched = (congesData.data || []).map(c => ({
      ...c,
      employe: empMap.get(c.employe_id) ? {
        nom: empMap.get(c.employe_id)!.nom,
        prenom: empMap.get(c.employe_id)!.prenom,
        poste: empMap.get(c.employe_id)!.poste,
        societe_id: empMap.get(c.employe_id)!.societe_id,
      } : null
    }))

    return NextResponse.json({ conges: congesEnriched, soldes: soldesData.data?.[0] || null })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    if (!body.employe_id || !body.type_conge || !body.date_debut || !body.date_fin)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    // Validate that employe_id belongs to a société the user has access to
    const accessibleIds = await getUserSocieteIds(supabase, user.id)
    const { data: emp } = await supabase.from('employes').select('id, societe_id').eq('id', body.employe_id).maybeSingle()
    if (!emp || !accessibleIds.includes(emp.societe_id)) {
      return NextResponse.json({ error: 'Employé non trouvé ou accès non autorisé' }, { status: 403 })
    }

    const d1 = new Date(body.date_debut), d2 = new Date(body.date_fin)
    const nb_jours = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const { data, error } = await supabase.from('demandes_conges').insert({ ...body, nb_jours }).select().single()
    if (error) throw error
    return NextResponse.json({ conge: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
