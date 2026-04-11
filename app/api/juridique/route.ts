import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { genererContrat, verifierContrat } from '@/lib/rh/expertRH'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    if (action === 'generer_contrat') {
      // Récupérer infos société
      let societe_info = { nom: 'Société', brn: '______', adresse: 'Mauritius' }
      if (body.societe_id) {
        const { data: soc } = await supabase
          .from('societes')
          .select('nom, brn, adresse')
          .eq('id', body.societe_id)
          .single()
        if (soc) societe_info = { nom: soc.nom || 'Société', brn: soc.brn || '______', adresse: (soc as any).adresse || 'Mauritius' }
      }

      // Récupérer NIC et date de naissance depuis la fiche employé
      let employe_nic = '______'
      let employe_dob = '______'
      if (body.employe_id) {
        const { data: emp } = await supabase
          .from('employes')
          .select('nic_number, date_naissance, prenom, nom')
          .eq('id', body.employe_id)
          .single()
        if (emp) {
          if (emp.nic_number) employe_nic = emp.nic_number
          if (emp.date_naissance) {
            // Format DD/MM/YYYY
            const d = new Date(emp.date_naissance)
            employe_dob = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
          }
          // Utiliser le nom réel si non fourni
          if (!body.employe_nom && emp.prenom && emp.nom) {
            body.employe_nom = `${emp.prenom} ${emp.nom}`
          }
        }
      }

      const html = await genererContrat({
        type: body.type || 'CDI',
        secteur: body.secteur || 'general',
        employe_nom: body.employe_nom,
        poste: body.poste,
        salaire: body.salaire,
        date_debut: body.date_debut,
        societe_nom: societe_info.nom,
        societe_brn: societe_info.brn,
        societe_adresse: societe_info.adresse,
        employe_nic,
        employe_dob,
      })

      // Sauvegarder en base
      const { data: contrat } = await supabase.from('contrats_employes').insert({
        employe_id: body.employe_id,
        societe_id: body.societe_id,
        type_contrat: body.type || 'CDI',
        secteur: body.secteur,
        date_debut: body.date_debut,
        date_fin: body.date_fin || null,
        salaire_brut: body.salaire,
        poste: body.poste,
        html_content: html,
        statut: 'brouillon',
      }).select().single()

      return NextResponse.json({ contrat, html })
    }

    if (action === 'verifier_contrat') {
      const analyse = await verifierContrat(body.html)
      return NextResponse.json({ analyse })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
