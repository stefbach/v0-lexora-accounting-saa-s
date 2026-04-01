import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/conges/entitlements?societe_id=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('regles_conges')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('type_conge')

    if (error) throw error

    return NextResponse.json({ regles: data, total: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/conges/entitlements
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const {
      societe_id,
      type_conge,
      jours_par_an,
      prorata_entree,
      max_report,
      min_anciennete_mois,
      genre_requis,
    } = body

    if (!societe_id || !type_conge || jours_par_an === undefined) {
      return NextResponse.json(
        { error: 'societe_id, type_conge et jours_par_an requis' },
        { status: 400 }
      )
    }

    // Validate type_conge
    const typesValides = [
      'annuel',
      'maladie',
      'maternite',
      'paternite',
      'sans_solde',
      'deces',
      'mariage',
      'exceptionnel',
      'formation',
    ]
    if (!typesValides.includes(type_conge)) {
      return NextResponse.json(
        { error: `type_conge invalide. Types acceptés: ${typesValides.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate genre_requis if provided
    if (genre_requis && !['M', 'F', null].includes(genre_requis)) {
      return NextResponse.json(
        { error: 'genre_requis doit être M, F ou null' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('regles_conges')
      .upsert({
        societe_id,
        type_conge,
        jours_par_an: Number(jours_par_an),
        prorata_entree: prorata_entree !== undefined ? Boolean(prorata_entree) : true,
        max_report: max_report !== undefined ? Number(max_report) : 0,
        min_anciennete_mois: min_anciennete_mois !== undefined ? Number(min_anciennete_mois) : 0,
        genre_requis: genre_requis || null,
        actif: true,
        mis_a_jour_par: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,type_conge' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ regle: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
