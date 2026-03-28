import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculerBulletin, PARAMS_MRA_DEFAUT } from '@/lib/rh/paie'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')
    const societe_id = searchParams.get('societe_id')

    let query = supabase
      .from('bulletins_paie')
      .select('*, employe:employes(code,nom,prenom,poste,pct_refacturation,societe_refacturation_id)')
      .order('periode', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (periode) query = query.ilike('periode', `${periode}%`)  // periode est DATE (2025-07-01)
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data, error } = await query
    if (error) throw error

    const totaux = {
      masse_salariale_brute: data?.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0) || 0,
      masse_salariale_nette: data?.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0) || 0,
      total_charges_patronales: data?.reduce((s, b) => s + (Number(b.total_charges_patronales) || 0), 0) || 0,
      cout_total_employeur: data?.reduce((s, b) => s + (Number(b.salaire_brut) + Number(b.total_charges_patronales) || 0), 0) || 0,
      total_refacture: data?.reduce((s, b) => s + (Number(b.montant_refacture_mur) || 0), 0) || 0,
    }

    return NextResponse.json({ bulletins: data, totaux, nb: data?.length || 0 })
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
    const { action, employe_id, societe_id, periode } = body

    // Récupérer les paramètres MRA de l'exercice en cours
    const { data: paramsDB } = await supabase
      .from('parametres_paie_mra')
      .select('*')
      .order('annee', { ascending: false })
      .limit(1)
      .maybeSingle()

    const params = paramsDB
      ? {
          csg_seuil_taux_reduit: Number(paramsDB.csg_seuil_taux_reduit),
          csg_salarie_taux_reduit: Number(paramsDB.csg_salarie_taux_reduit),
          csg_salarie_taux_plein: Number(paramsDB.csg_salarie_taux_plein),
          csg_patronal: Number(paramsDB.csg_patronal),
          nsf_salarie: Number(paramsDB.nsf_salarie),
          nsf_patronal: Number(paramsDB.nsf_patronal),
          training_levy: Number(paramsDB.training_levy),
          prgf_patronal_par_jour: Number(paramsDB.prgf_patronal_par_jour),
          paye_seuil_exoneration: Number(paramsDB.paye_seuil_exoneration ?? 390000),
          paye_taux_1: Number(paramsDB.paye_taux_1 ?? 0.10),
          paye_seuil_taux_2: Number(paramsDB.paye_seuil_taux_2 ?? 650000),
          paye_taux_2: Number(paramsDB.paye_taux_2 ?? 0.15),
        }
      : PARAMS_MRA_DEFAUT

    if (action === 'calculer') {
      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      const elements = {
        salaire_base: Number(emp.salaire_base),
        transport_allowance: Number(emp.transport_allowance) || 0,
        petrol_allowance: Number(emp.petrol_allowance) || 0,
        increment_salaire: body.increment_salaire || 0,
        heures_sup_montant: body.heures_sup_montant || 0,
        special_allowance_1: body.special_allowance_1 || 0,
        special_allowance_2: body.special_allowance_2 || 0,
        special_allowance_3: body.special_allowance_3 || 0,
        other_refund: body.other_refund || 0,
        eoy_bonus: body.eoy_bonus || 0,
        departure_notice: body.departure_notice || 0,
      }

      const resultat = calculerBulletin(
        elements,
        params,
        body.jours_travailles || 26,
        Number(emp.pct_refacturation) || 0,
        body.airbox_mur || 924.48,
        body.ordinateur_mur || 818.22
      )

      // Période au format DATE (premier du mois)
      const periodeDate = periode ? `${periode}-01` : `${new Date().toISOString().slice(0,7)}-01`

      const bulletin = {
        employe_id,
        societe_id: societe_id || emp.societe_id,
        periode: periodeDate,
        jours_absence: body.jours_absence || 0,
        montant_absence: body.montant_absence || 0,
        ...elements,
        ...resultat,
        pct_refacturation: emp.pct_refacturation || 0,
        societe_refacturation_id: emp.societe_refacturation_id || null,
        airbox_mur: body.airbox_mur || 924.48,
        ordinateur_mur: body.ordinateur_mur || 818.22,
        statut: 'brouillon',
      }

      // Upsert sur (employe_id, periode)
      const { data, error } = await supabase
        .from('bulletins_paie')
        .upsert(bulletin, { onConflict: 'employe_id,periode' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ bulletin: data, simulation: resultat })
    }

    if (action === 'calculer_batch') {
      const { data: employes } = await supabase
        .from('employes')
        .select('*')
        .eq('societe_id', societe_id)
        .is('date_depart', null) // actifs seulement

      const periodeDate = periode ? `${periode}-01` : `${new Date().toISOString().slice(0,7)}-01`
      const bulletins = []

      for (const emp of employes || []) {
        const resultat = calculerBulletin(
          {
            salaire_base: Number(emp.salaire_base),
            transport_allowance: Number(emp.transport_allowance) || 0,
            petrol_allowance: Number(emp.petrol_allowance) || 0,
          },
          params,
          26,
          Number(emp.pct_refacturation) || 0
        )
        bulletins.push({
          employe: { id: emp.id, code: emp.code, nom: emp.nom, prenom: emp.prenom, poste: emp.poste },
          salaire_base: emp.salaire_base,
          ...resultat
        })
      }

      return NextResponse.json({ resultats: bulletins, nb: bulletins.length })
    }

    if (action === 'valider') {
      const periodeDate = periode ? `${periode}-01` : null
      const { data, error } = await supabase
        .from('bulletins_paie')
        .update({ statut: 'valide' })
        .eq('employe_id', employe_id)
        .eq('periode', periodeDate)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ bulletin: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
