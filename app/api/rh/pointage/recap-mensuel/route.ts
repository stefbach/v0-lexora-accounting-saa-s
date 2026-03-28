import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const JOURS_FERIES_MU = [
  "01-01", "02-01", "12-03", "01-05", "09-05", "15-08", "02-11", "25-12"
]

function isFerie(dateStr: string): boolean {
  return JOURS_FERIES_MU.includes(dateStr.slice(5))
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00")
  return d.getDay() === 0 || d.getDay() === 6
}

function calcOT(hEntree: string, hSortie: string, ferieDay: boolean) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1
  if (totalH <= 0) totalH = 0
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH }
  const normales = Math.min(totalH, 9)
  const reste = Math.max(totalH - 9, 0)
  const ot15 = Math.min(reste, 2)
  const ot2 = Math.max(reste - 2, 0)
  return { normales, ot15, ot2 }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode') // YYYY-MM
    const employe_id = searchParams.get('employe_id')

    if (!periode) return NextResponse.json({ error: 'periode requis (YYYY-MM)' }, { status: 400 })

    const [annee, mois] = periode.split('-').map(Number)
    const nbJours = new Date(annee, mois, 0).getDate()
    const dates = Array.from({ length: nbJours }, (_, i) => {
      const d = new Date(annee, mois - 1, i + 1)
      return d.toISOString().split('T')[0]
    })

    // Récupérer les employés actifs
    let empQuery = supabase.from('employes').select('id, nom, prenom, poste, salaire_base, societe_id').is('date_depart', null)
    if (societe_id) empQuery = empQuery.eq('societe_id', societe_id)
    if (employe_id) empQuery = empQuery.eq('id', employe_id)
    const { data: employes } = await empQuery

    // Récupérer tous les pointages de la période
    const dateDebut = `${periode}-01`
    const dateFin = `${periode}-${String(nbJours).padStart(2, '0')}`
    let ptQuery = supabase.from('pointages').select('*').gte('date_pointage', dateDebut).lte('date_pointage', dateFin)
    if (employe_id) ptQuery = ptQuery.eq('employe_id', employe_id)
    const { data: pointages } = await ptQuery

    // Récupérer les congés approuvés
    let congesQuery = supabase.from('demandes_conges').select('*').eq('statut', 'approuve').gte('date_debut', dateDebut).lte('date_fin', dateFin)
    const { data: conges } = await congesQuery

    const recap = []

    for (const emp of employes || []) {
      const ptEmp = (pointages || []).filter(p => p.employe_id === emp.id)
      const congesEmp = (conges || []).filter(c => c.employe_id === emp.id)

      const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)

      let total_jours_travailles = 0
      let total_heures_normales = 0
      let total_ot_1_5x = 0
      let total_ot_2x = 0
      let nb_absences_injustifiees = 0
      let nb_absences_justifiees = 0
      let nb_conges_pris = 0

      for (const date of dates) {
        if (isWeekend(date)) continue
        const pt = ptEmp.find(p => p.date_pointage === date)
        const enConge = congesEmp.some(c => date >= c.date_debut && date <= c.date_fin)

        if (enConge) {
          nb_conges_pris++
          continue
        }

        if (!pt || (!pt.heure_entree && !pt.heure_sortie)) {
          if (pt?.absent_justifie) nb_absences_justifiees++
          else nb_absences_injustifiees++
          continue
        }

        if (pt.heure_entree) {
          total_jours_travailles++
          const ferie = isFerie(date)
          const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie)
          total_heures_normales += ot.normales
          total_ot_1_5x += ot.ot15
          total_ot_2x += ot.ot2
        }
      }

      const montant_ot_1_5x = Math.round(total_ot_1_5x * taux_horaire * 1.5 * 100) / 100
      const montant_ot_2x = Math.round(total_ot_2x * taux_horaire * 2 * 100) / 100
      const total_montant_ot = montant_ot_1_5x + montant_ot_2x

      recap.push({
        employe_id: emp.id,
        nom: emp.nom,
        prenom: emp.prenom,
        poste: emp.poste,
        salaire_base: emp.salaire_base,
        taux_horaire: Math.round(taux_horaire * 100) / 100,
        total_jours_travailles,
        total_heures_normales: Math.round(total_heures_normales * 100) / 100,
        total_ot_1_5x: Math.round(total_ot_1_5x * 100) / 100,
        total_ot_2x: Math.round(total_ot_2x * 100) / 100,
        montant_ot_1_5x,
        montant_ot_2x,
        total_montant_ot,
        nb_absences_injustifiees,
        nb_absences_justifiees,
        nb_conges_pris,
        montant_absence_injustifiee: Math.round(nb_absences_injustifiees * (Number(emp.salaire_base) / 26) * 100) / 100,
      })
    }

    return NextResponse.json({ recap, periode, nb_employes: recap.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
