import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const type_flux = searchParams.get('type_flux')

    let query = supabase
      .from('flux_interco')
      .select(`
        *,
        societe_emettrice:societes!flux_interco_societe_emettrice_id_fkey(id, nom),
        societe_receptrice:societes!flux_interco_societe_receptrice_id_fkey(id, nom)
      `)
      .order('date_flux', { ascending: false })

    if (societe_id) {
      query = query.or(`societe_emettrice_id.eq.${societe_id},societe_receptrice_id.eq.${societe_id}`)
    }
    if (date_debut) query = query.gte('date_flux', date_debut)
    if (date_fin) query = query.lte('date_flux', date_fin)
    if (type_flux) query = query.eq('type_flux', type_flux)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ flux: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const {
      societe_emettrice_id, societe_receptrice_id, date_flux, description,
      montant_mur, devise, montant_devise, taux_change, type_flux,
      document_id, compte_debit, compte_credit
    } = body

    if (!societe_emettrice_id || !societe_receptrice_id || !date_flux || !description || !montant_mur) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    if (societe_emettrice_id === societe_receptrice_id) {
      return NextResponse.json({ error: 'Les deux sociétés doivent être différentes' }, { status: 400 })
    }

    // Créer le flux interco
    const { data: flux, error: fluxError } = await supabase
      .from('flux_interco')
      .insert({
        societe_emettrice_id, societe_receptrice_id, date_flux, description,
        montant_mur, devise: devise || 'MUR', montant_devise, taux_change: taux_change || 1,
        type_flux, document_id,
        compte_debit: compte_debit || '451',
        compte_credit: compte_credit || '451',
        statut_reconciliation: 'en_attente'
      })
      .select()
      .single()

    if (fluxError) throw fluxError

    // Générer les écritures comptables dans les 2 sociétés
    const ecritures = []

    // Récupérer les dossiers des deux sociétés
    const { data: dossierEmetteur } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', societe_emettrice_id)
      .eq('statut', 'actif')
      .limit(1)
      .single()

    const { data: dossierRecepteur } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', societe_receptrice_id)
      .eq('statut', 'actif')
      .limit(1)
      .single()

    // Écriture dans la société émettrice : 451 (interco) Débit / Banque ou Fournisseur Crédit
    if (dossierEmetteur) {
      ecritures.push({
        dossier_id: dossierEmetteur.id,
        date_ecriture: date_flux,
        libelle: `INTERCO - ${description}`,
        compte: compte_debit || '451',
        compte_contrepartie: '512',
        debit: montant_mur,
        credit: 0,
        devise: devise || 'MUR',
        source: 'interco',
        reference: flux.id
      })
    }

    // Écriture dans la société réceptrice : 512 ou Client Débit / 451 (interco) Crédit
    if (dossierRecepteur) {
      ecritures.push({
        dossier_id: dossierRecepteur.id,
        date_ecriture: date_flux,
        libelle: `INTERCO - ${description}`,
        compte: '512',
        compte_contrepartie: compte_credit || '451',
        debit: montant_mur,
        credit: 0,
        devise: devise || 'MUR',
        source: 'interco',
        reference: flux.id
      })
    }

    // Insérer les écritures si les dossiers existent
    if (ecritures.length > 0) {
      const { error: ecrError } = await supabase
        .from('ecritures_comptables')
        .insert(ecritures)

      if (ecrError) {
        console.error('Erreur insertion écritures interco:', ecrError)
        // Non bloquant - le flux est quand même créé
      }
    }

    return NextResponse.json({ flux, ecritures_generees: ecritures.length }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
