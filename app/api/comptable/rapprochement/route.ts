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

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('rapprochements_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode_debut', { ascending: false })
    if (error) throw error

    return NextResponse.json({ rapprochements: data })
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
    const { action } = body

    if (action === 'creer') {
      const societe_id = body.societe_id

      // Get dossiers for this société
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let solde_comptable = 0

      // Try v2 first (ecritures_comptables_v2 by societe_id)
      const { data: ecrituresV2 } = await supabase
        .from('ecritures_comptables_v2')
        .select('debit_mur, credit_mur')
        .eq('societe_id', societe_id)
        .like('numero_compte', '51%')
        .gte('date_ecriture', body.periode_debut)
        .lte('date_ecriture', body.periode_fin)

      if (ecrituresV2 && ecrituresV2.length > 0) {
        const totD = ecrituresV2.reduce((s: number, e: any) => s + Number(e.debit_mur || 0), 0)
        const totC = ecrituresV2.reduce((s: number, e: any) => s + Number(e.credit_mur || 0), 0)
        solde_comptable = totD - totC
      } else if (dossierIds.length > 0) {
        // Fallback to v1
        const { data: ecrituresV1 } = await supabase
          .from('ecritures_comptables')
          .select('debit, credit')
          .in('dossier_id', dossierIds)
          .like('compte', '51%')
          .gte('date_ecriture', body.periode_debut)
          .lte('date_ecriture', body.periode_fin)

        const totD = (ecrituresV1 || []).reduce((s: number, e: any) => s + Number(e.debit || 0), 0)
        const totC = (ecrituresV1 || []).reduce((s: number, e: any) => s + Number(e.credit || 0), 0)
        solde_comptable = totD - totC
      }

      // If still 0, try to pull from releves_bancaires (solde_cloture)
      if (solde_comptable === 0) {
        const { data: releveBanque } = await supabase
          .from('releves_bancaires')
          .select('solde_cloture')
          .eq('societe_id', societe_id)
          .lte('date_debut', body.periode_fin)
          .gte('date_fin', body.periode_debut)
          .order('date_fin', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (releveBanque) {
          solde_comptable = Number(releveBanque.solde_cloture) || 0
        }
      }

      const ecart = Number(body.solde_releve) - solde_comptable

      const { data, error } = await supabase.from('rapprochements_bancaires').insert({
        societe_id,
        compte_bancaire: body.compte_bancaire || '512',
        banque: body.banque,
        periode_debut: body.periode_debut,
        periode_fin: body.periode_fin,
        solde_releve: body.solde_releve,
        solde_comptable,
        ecart,
        created_by: user.id,
      }).select().single()
      if (error) throw error

      return NextResponse.json({ rapprochement: data, solde_comptable })
    }

    if (action === 'valider') {
      const { data, error } = await supabase
        .from('rapprochements_bancaires')
        .update({ statut: 'valide', valide_par: user.id, valide_le: new Date().toISOString() })
        .eq('id', body.rapprochement_id)
        .select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
