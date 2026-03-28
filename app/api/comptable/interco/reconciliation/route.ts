import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')

    // Récupérer tous les flux de la période
    let query = supabase
      .from('flux_interco')
      .select(`
        *,
        societe_emettrice:societes!flux_interco_societe_emettrice_id_fkey(id, nom),
        societe_receptrice:societes!flux_interco_societe_receptrice_id_fkey(id, nom)
      `)
      .order('date_flux', { ascending: false })

    if (date_debut) query = query.gte('date_flux', date_debut)
    if (date_fin) query = query.lte('date_flux', date_fin)

    const { data: flux, error } = await query
    if (error) throw error

    // Construire le tableau croisé par paire de sociétés
    const paires: Record<string, {
      societe_a_id: string
      societe_a_nom: string
      societe_b_id: string
      societe_b_nom: string
      receivable_a: number   // Ce que A doit recevoir de B
      payable_a: number      // Ce que A doit payer à B
      ecart: number
      statut: string
      nb_flux: number
    }> = {}

    for (const f of (flux || [])) {
      const keyA = f.societe_emettrice_id < f.societe_receptrice_id
        ? f.societe_emettrice_id : f.societe_receptrice_id
      const keyB = f.societe_emettrice_id < f.societe_receptrice_id
        ? f.societe_receptrice_id : f.societe_emettrice_id
      const key = `${keyA}_${keyB}`

      if (!paires[key]) {
        const sA = f.societe_emettrice_id < f.societe_receptrice_id
          ? f.societe_emettrice : f.societe_receptrice
        const sB = f.societe_emettrice_id < f.societe_receptrice_id
          ? f.societe_receptrice : f.societe_emettrice

        paires[key] = {
          societe_a_id: keyA,
          societe_a_nom: (sA as { id: string; nom: string })?.nom || '',
          societe_b_id: keyB,
          societe_b_nom: (sB as { id: string; nom: string })?.nom || '',
          receivable_a: 0,
          payable_a: 0,
          ecart: 0,
          statut: 'reconcilie',
          nb_flux: 0
        }
      }

      paires[key].nb_flux++

      // Si A émet vers B, B doit recevoir (receivable_b = payable_a)
      if (f.societe_emettrice_id === keyA) {
        paires[key].payable_a += f.montant_mur
      } else {
        paires[key].receivable_a += f.montant_mur
      }

      // Mise à jour statut
      if (f.statut_reconciliation === 'litige') paires[key].statut = 'litige'
      else if (f.statut_reconciliation === 'en_attente' && paires[key].statut !== 'litige') {
        paires[key].statut = 'en_attente'
      }
    }

    // Calculer les écarts
    for (const paire of Object.values(paires)) {
      paire.ecart = paire.receivable_a - paire.payable_a
    }

    return NextResponse.json({
      reconciliation: Object.values(paires),
      nb_litiges: Object.values(paires).filter(p => p.statut === 'litige').length,
      nb_ecarts_importants: Object.values(paires).filter(p => Math.abs(p.ecart) > 1000).length
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
