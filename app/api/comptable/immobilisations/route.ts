import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { calculerAmortissements, TAUX_PAR_CATEGORIE } from '@/lib/amortissements'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function guard(societe_id: string | null) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: apiError('unauthorized', 401) as any }
  if (!societe_id) return { error: NextResponse.json({ error: 'societe_id requis' }, { status: 400 }) }
  const supabase = getAdminClient()
  try {
    await assertSocieteAccess(supabase, user.id, societe_id)
  } catch (err) {
    if (err instanceof SocieteAccessError) return { error: apiError('access_denied_company', 403) as any }
    throw err
  }
  return { supabase, user }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    const g = await guard(societe_id)
    if (g.error) return g.error
    const supabase = g.supabase!

    const { data, error } = await supabase.from('immobilisations').select(`
      *, amortissements(*)
    `).eq('societe_id', societe_id!).order('date_acquisition', { ascending: false })
    if (error) throw error

    // Calcul valeur nette comptable actuelle pour chaque immo
    const today = new Date().toISOString().split('T')[0]
    const enriched = (data || []).map(immo => {
      const amorts = immo.amortissements || []
      const cumulTotal = amorts.reduce((s: number, a: { dotation: number }) => s + a.dotation, 0)
      return {
        ...immo,
        valeur_nette_actuelle: immo.cout_acquisition - cumulTotal,
        cumul_amortissements: cumulTotal,
      }
    })

    const totaux = {
      cout_total: enriched.reduce((s, i) => s + i.cout_acquisition, 0),
      cumul_total: enriched.reduce((s, i) => s + i.cumul_amortissements, 0),
      vnc_total: enriched.reduce((s, i) => s + i.valeur_nette_actuelle, 0),
    }

    return NextResponse.json({ immobilisations: enriched, totaux })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { societe_id, categorie } = body

    if (!societe_id || !body.date_acquisition || !body.cout_acquisition) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const g = await guard(societe_id)
    if (g.error) return g.error
    const supabase = g.supabase!

    // Taux par défaut selon catégorie si non fourni
    if (!body.taux_amortissement) {
      body.taux_amortissement = TAUX_PAR_CATEGORIE[categorie] || 20
    }

    const cout_mur = body.devise === 'MUR'
      ? body.cout_acquisition
      : body.cout_acquisition * (body.taux_change || 1)

    const { data: immo, error: immoError } = await supabase
      .from('immobilisations')
      .insert({ ...body, cout_mur })
      .select()
      .single()

    if (immoError) throw immoError

    // Calculer et insérer les amortissements automatiquement
    const amorts = calculerAmortissements({
      id: immo.id,
      date_acquisition: immo.date_acquisition,
      cout_acquisition: cout_mur,
      valeur_residuelle: immo.valeur_residuelle || 0,
      taux_amortissement: immo.taux_amortissement,
      methode: immo.methode || 'lineaire',
    })

    if (amorts.length > 0) {
      await supabase.from('amortissements').insert(
        amorts.map(a => ({ ...a, immobilisation_id: immo.id }))
      )
    }

    return NextResponse.json({ immobilisation: immo, amortissements: amorts }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
