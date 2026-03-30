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

// GET — List comptes courants associes with balances and recent movements
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Get all comptes courants for this societe
    const { data: comptes, error: comptesErr } = await supabase
      .from('comptes_courants_associes')
      .select('*')
      .eq('societe_id', societe_id)
      .order('nom', { ascending: true })

    if (comptesErr) throw comptesErr

    // Get recent movements (last 50)
    const { data: mouvements, error: mouvErr } = await supabase
      .from('mouvements_compte_courant')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_mouvement', { ascending: false })
      .limit(50)

    if (mouvErr) throw mouvErr

    // Compute total balance (what the company owes all associates/collaborateurs)
    const totalSolde = (comptes || []).reduce((s: number, c: any) => s + (Number(c.solde) || 0), 0)

    return NextResponse.json({
      comptes: comptes || [],
      mouvements: mouvements || [],
      totalSolde,
    })
  } catch (e: unknown) {
    console.error('[compte-courant GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Actions: creer_compte, avance, remboursement, lettrer
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // === CREER COMPTE ===
    if (action === 'creer_compte') {
      const { societe_id, nom, type = 'associe' } = body
      if (!societe_id || !nom) return NextResponse.json({ error: 'societe_id et nom requis' }, { status: 400 })

      const { data, error } = await supabase
        .from('comptes_courants_associes')
        .insert({ societe_id, nom, type, solde: 0 })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ compte: data }, { status: 201 })
    }

    // === AVANCE (associate/employee pays a company expense) ===
    if (action === 'avance') {
      const { societe_id, compte_courant_id, montant, description, facture_id, date_mouvement } = body
      if (!societe_id || !compte_courant_id || !montant) {
        return NextResponse.json({ error: 'societe_id, compte_courant_id et montant requis' }, { status: 400 })
      }

      const dateMvt = date_mouvement || new Date().toISOString().split('T')[0]
      const montantNum = Math.abs(Number(montant))

      // Get compte courant details
      const { data: compte } = await supabase
        .from('comptes_courants_associes')
        .select('*')
        .eq('id', compte_courant_id)
        .single()

      if (!compte) return NextResponse.json({ error: 'Compte courant non trouve' }, { status: 404 })

      // Create movement
      const { data: mouvement, error: mvtErr } = await supabase
        .from('mouvements_compte_courant')
        .insert({
          compte_courant_id, societe_id, date_mouvement: dateMvt,
          type: 'avance', montant: montantNum, description,
          facture_id: facture_id || null,
        })
        .select()
        .single()

      if (mvtErr) throw mvtErr

      // Update balance (positive = company owes associate)
      const newSolde = Number(compte.solde || 0) + montantNum
      await supabase
        .from('comptes_courants_associes')
        .update({ solde: newSolde, updated_at: new Date().toISOString() })
        .eq('id', compte_courant_id)

      // Create ecriture comptable: debit 6xx (expense) / credit 455 or 467
      const creditCompte = compte.type === 'associe' ? '455' : '467'
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

      if (dossiers) {
        await supabase.from('ecritures_comptables').insert([
          {
            dossier_id: dossiers.id, date_ecriture: dateMvt,
            journal: 'OD', compte: '6', libelle: `Avance ${compte.nom} — ${description || ''}`,
            debit: montantNum, credit: 0,
          },
          {
            dossier_id: dossiers.id, date_ecriture: dateMvt,
            journal: 'OD', compte: creditCompte,
            libelle: `Compte courant ${compte.nom} — ${description || ''}`,
            debit: 0, credit: montantNum,
          },
        ])
      }

      // If linked to a facture, update it
      if (facture_id) {
        await supabase.from('factures').update({
          statut: 'paye',
          mode_paiement: compte.type === 'associe' ? 'associe' : 'collaborateur',
          paye_par: compte.nom,
        }).eq('id', facture_id)
      }

      return NextResponse.json({ mouvement, newSolde })
    }

    // === REMBOURSEMENT (company reimburses associate) ===
    if (action === 'remboursement') {
      const { societe_id, compte_courant_id, montant, description, date_mouvement } = body
      if (!societe_id || !compte_courant_id || !montant) {
        return NextResponse.json({ error: 'societe_id, compte_courant_id et montant requis' }, { status: 400 })
      }

      const dateMvt = date_mouvement || new Date().toISOString().split('T')[0]
      const montantNum = Math.abs(Number(montant))

      const { data: compte } = await supabase
        .from('comptes_courants_associes')
        .select('*')
        .eq('id', compte_courant_id)
        .single()

      if (!compte) return NextResponse.json({ error: 'Compte courant non trouve' }, { status: 404 })

      // Create movement (negative = company reimburses)
      const { data: mouvement, error: mvtErr } = await supabase
        .from('mouvements_compte_courant')
        .insert({
          compte_courant_id, societe_id, date_mouvement: dateMvt,
          type: 'remboursement', montant: -montantNum, description,
        })
        .select()
        .single()

      if (mvtErr) throw mvtErr

      // Update balance
      const newSolde = Number(compte.solde || 0) - montantNum
      await supabase
        .from('comptes_courants_associes')
        .update({ solde: newSolde, updated_at: new Date().toISOString() })
        .eq('id', compte_courant_id)

      // Create ecriture: debit 455/467 / credit 512 (bank)
      const debitCompte = compte.type === 'associe' ? '455' : '467'
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

      if (dossiers) {
        await supabase.from('ecritures_comptables').insert([
          {
            dossier_id: dossiers.id, date_ecriture: dateMvt,
            journal: 'BQ', compte: debitCompte,
            libelle: `Remboursement ${compte.nom} — ${description || ''}`,
            debit: montantNum, credit: 0,
          },
          {
            dossier_id: dossiers.id, date_ecriture: dateMvt,
            journal: 'BQ', compte: '512',
            libelle: `Remboursement ${compte.nom} — ${description || ''}`,
            debit: 0, credit: montantNum,
          },
        ])
      }

      return NextResponse.json({ mouvement, newSolde })
    }

    // === LETTRER (match advance with reimbursement) ===
    if (action === 'lettrer') {
      const { avance_id, remboursement_id } = body
      if (!avance_id || !remboursement_id) {
        return NextResponse.json({ error: 'avance_id et remboursement_id requis' }, { status: 400 })
      }

      const lettreCode = `CCA${String(Date.now()).slice(-4)}`

      await supabase.from('mouvements_compte_courant')
        .update({ lettre: lettreCode })
        .eq('id', avance_id)

      await supabase.from('mouvements_compte_courant')
        .update({ lettre: lettreCode })
        .eq('id', remboursement_id)

      return NextResponse.json({ success: true, lettre: lettreCode })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[compte-courant POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
