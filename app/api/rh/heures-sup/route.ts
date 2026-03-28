import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const JOURS_FERIES_MU = [
  "01-01", "02-01", "12-03", "01-05", "09-05", "15-08", "02-11", "25-12"
]

function isFerie(dateStr: string): boolean {
  const mmdd = dateStr.slice(5)
  return JOURS_FERIES_MU.includes(mmdd)
}

function calcOT(hEntree: string, hSortie: string, ferieDay: boolean) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0, total: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1 // -1h pause
  if (totalH <= 0) totalH = 0
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH, total: totalH }
  const normales = Math.min(totalH, 9)
  const reste = Math.max(totalH - 9, 0)
  const ot15 = Math.min(reste, 2)
  const ot2 = Math.max(reste - 2, 0)
  return { normales, ot15, ot2, total: totalH }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { pointage_id, employe_id } = await request.json()
    if (!pointage_id) return NextResponse.json({ error: 'pointage_id requis' }, { status: 400 })

    // Récupérer le pointage
    const { data: pointage } = await supabase
      .from('pointages')
      .select('*, employe:employes(salaire_base, nom, prenom)')
      .eq('id', pointage_id)
      .single()

    if (!pointage) return NextResponse.json({ error: 'Pointage non trouvé' }, { status: 404 })

    const datePointage = pointage.date_pointage || pointage.date
    const ferie = isFerie(datePointage)
    const ot = calcOT(pointage.heure_entree, pointage.heure_sortie, ferie)

    // Calcul taux horaire = salaire_base / (45h × 52sem / 12)
    const salaire_base = Number(pointage.employe?.salaire_base) || 0
    const taux_horaire = salaire_base > 0 ? salaire_base / (45 * 52 / 12) : 0

    const montant_ot_1_5x = Math.round(ot.ot15 * taux_horaire * 1.5 * 100) / 100
    const montant_ot_2x = Math.round(ot.ot2 * taux_horaire * 2 * 100) / 100
    const montant_ot_total = montant_ot_1_5x + montant_ot_2x

    // Mettre à jour le pointage avec les OT validées
    await supabase.from('pointages').update({
      heures_normales: Math.round(ot.normales * 100) / 100,
      heures_ot_1_5x: Math.round(ot.ot15 * 100) / 100,
      heures_ot_2x: Math.round(ot.ot2 * 100) / 100,
      montant_ot: montant_ot_total,
      ot_valide: true,
      ot_valide_by: user.id,
      ot_valide_at: new Date().toISOString(),
    }).eq('id', pointage_id)

    // Créer ou mettre à jour une entrée dans heures_travaillees si la table existe
    try {
      const periode = datePointage.slice(0, 7) + '-01'
      const empId = employe_id || pointage.employe_id

      await supabase.from('heures_travaillees').upsert({
        employe_id: empId,
        pointage_id,
        date: datePointage,
        periode,
        heures_normales: Math.round(ot.normales * 100) / 100,
        heures_ot_1_5x: Math.round(ot.ot15 * 100) / 100,
        heures_ot_2x: Math.round(ot.ot2 * 100) / 100,
        montant_ot_1_5x,
        montant_ot_2x,
        montant_ot: montant_ot_total,
        taux_horaire: Math.round(taux_horaire * 100) / 100,
      }, { onConflict: 'pointage_id' })
    } catch (_) {
      // Table heures_travaillees peut ne pas exister — OT stockées dans pointages
    }

    return NextResponse.json({
      success: true,
      ot: {
        heures_normales: ot.normales,
        ot15_heures: ot.ot15,
        ot2_heures: ot.ot2,
        taux_horaire: Math.round(taux_horaire * 100) / 100,
        montant_ot_1_5x,
        montant_ot_2x,
        montant_ot_total,
      }
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
