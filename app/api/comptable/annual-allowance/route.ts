import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Taux MRA par catégorie (%)
const TAUX_MRA: Record<string, number> = {
  commercial_premises: 5,
  motor_vehicles:      25,
  furniture_fittings:  20,
  computer_equipment:  50,
  other:               20,
}

// Seuil fully-expensed : < 60 000 MUR
const SEUIL_FULLY_EXPENSED = 60000

function calculerAllowance(actif: {
  categorie: string
  taux_mra: number
  cout_01_07: number
  twdv_01_07: number
  additions: number
  disposals_cost: number
  disposals_twdv: number
}): {
  fully_expensed: boolean
  taux_applique: number
  twdv_adjusted: number
  annual_allowance: number
  twdv_30_06: number
  cout_30_06: number
} {
  const cout_30_06   = (actif.cout_01_07 || 0) + (actif.additions || 0) - (actif.disposals_cost || 0)
  const twdv_adjusted = (actif.twdv_01_07 || 0) + (actif.additions || 0) - (actif.disposals_twdv || 0)

  // Fully expensed si coût total < 60k MUR
  const fully_expensed = cout_30_06 < SEUIL_FULLY_EXPENSED && cout_30_06 > 0

  let annual_allowance: number
  let taux_applique: number

  if (fully_expensed) {
    taux_applique    = 100
    annual_allowance = Math.max(0, twdv_adjusted)
  } else {
    taux_applique    = actif.taux_mra || TAUX_MRA[actif.categorie] || 20
    annual_allowance = Math.round(twdv_adjusted * taux_applique / 100 * 100) / 100
  }

  const twdv_30_06 = Math.max(0, twdv_adjusted - annual_allowance)

  return {
    fully_expensed,
    taux_applique,
    twdv_adjusted: Math.round(twdv_adjusted * 100) / 100,
    annual_allowance: Math.round(annual_allowance * 100) / 100,
    twdv_30_06:      Math.round(twdv_30_06 * 100) / 100,
    cout_30_06:      Math.round(cout_30_06 * 100) / 100,
  }
}

// GET — Liste des actifs avec annual allowance
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let query = supabase
      .from('annual_allowance')
      .select('*')
      .eq('societe_id', societe_id)
      .order('categorie')
      .order('actif_description')

    if (exercice) query = query.eq('exercice', exercice)

    const { data: actifs, error } = await query
    if (error) throw error

    // Grouper par catégorie
    const par_categorie: Record<string, typeof actifs> = {}
    let total_annual_allowance = 0
    let total_cout             = 0
    let total_twdv             = 0

    for (const a of actifs || []) {
      if (!par_categorie[a.categorie]) par_categorie[a.categorie] = []
      par_categorie[a.categorie].push(a)
      total_annual_allowance += a.annual_allowance || 0
      total_cout             += a.cout_30_06        || 0
      total_twdv             += a.twdv_30_06        || 0
    }

    return NextResponse.json({
      actifs: actifs || [],
      par_categorie,
      totaux: {
        nb_actifs:            actifs?.length || 0,
        total_cout,
        total_twdv,
        total_annual_allowance: Math.round(total_annual_allowance * 100) / 100,
        taux_mra_reference:   TAUX_MRA,
      },
    })
  } catch (e: unknown) {
    console.error('[annual-allowance GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// POST — Créer un actif
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, exercice, actif_description, categorie,
            fournisseur, date_acquisition, cout_01_07, twdv_01_07,
            additions, disposals_cost, disposals_twdv, notes } = body

    if (!societe_id || !exercice || !actif_description || !categorie) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const taux_mra = TAUX_MRA[categorie] || 20
    const calcul   = calculerAllowance({ categorie, taux_mra, cout_01_07: cout_01_07 || 0,
      twdv_01_07: twdv_01_07 || 0, additions: additions || 0,
      disposals_cost: disposals_cost || 0, disposals_twdv: disposals_twdv || 0 })

    const { data, error } = await supabase
      .from('annual_allowance')
      .insert({
        societe_id, exercice, actif_description, categorie,
        fournisseur, date_acquisition,
        taux_mra: calcul.taux_applique,
        cout_01_07: cout_01_07 || 0,
        twdv_01_07: twdv_01_07 || 0,
        additions:  additions  || 0,
        disposals_cost: disposals_cost || 0,
        disposals_twdv: disposals_twdv || 0,
        twdv_adjusted:  calcul.twdv_adjusted,
        annual_allowance: calcul.annual_allowance,
        twdv_30_06:  calcul.twdv_30_06,
        fully_expensed: calcul.fully_expensed,
        notes,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, actif: data })
  } catch (e: unknown) {
    console.error('[annual-allowance POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// PUT — Mettre à jour et recalculer un actif
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Récupérer l'actif existant
    const { data: existant } = await supabase
      .from('annual_allowance')
      .select('*')
      .eq('id', id)
      .single()

    if (!existant) return NextResponse.json({ error: 'Actif introuvable' }, { status: 404 })

    const merged = { ...existant, ...updates }
    const taux_mra = TAUX_MRA[merged.categorie] || merged.taux_mra || 20
    const calcul   = calculerAllowance({ ...merged, taux_mra })

    const { data, error } = await supabase
      .from('annual_allowance')
      .update({
        ...updates,
        taux_mra:         calcul.taux_applique,
        twdv_adjusted:    calcul.twdv_adjusted,
        annual_allowance: calcul.annual_allowance,
        twdv_30_06:       calcul.twdv_30_06,
        fully_expensed:   calcul.fully_expensed,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, actif: data, calcul })
  } catch (e: unknown) {
    console.error('[annual-allowance PUT]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE — Supprimer un actif
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await supabase.from('annual_allowance').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
