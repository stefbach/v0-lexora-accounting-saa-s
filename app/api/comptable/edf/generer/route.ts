import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, exercice } = body

    if (!societe_id || !exercice) {
      return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
    }

    // Exercice fiscal mauricien: FY2024-2025 = July 2024 → June 2025
    // Extraire les années depuis l'exercice (format FY2024-2025)
    const match = exercice.match(/FY(\d{4})-(\d{4})/)
    if (!match) {
      return NextResponse.json({ error: 'Format exercice invalide (attendu: FY2024-2025)' }, { status: 400 })
    }

    const anneeDebut = parseInt(match[1])
    const anneeFin = parseInt(match[2])
    const dateDebut = `${anneeDebut}-07-01`
    const dateFin = `${anneeFin}-06-30`
    const anneeAssessment = String(anneeFin)

    // Deadline EDF : 31 août de l'année suivante (après la fin de l'exercice)
    const dateLimite = `${anneeFin}-08-31`

    // Récupérer les bulletins de paie de l'exercice
    const { data: bulletins, error: bulletinsError } = await supabase
      .from('bulletins_paie')
      .select('*')
      .eq('societe_id', societe_id)
      .gte('periode', dateDebut.substring(0, 7)) // YYYY-MM format
      .lte('periode', dateFin.substring(0, 7))

    if (bulletinsError) throw bulletinsError

    if (!bulletins || bulletins.length === 0) {
      return NextResponse.json({
        error: 'Aucun bulletin de paie trouvé pour cet exercice',
        periode: { debut: dateDebut, fin: dateFin }
      }, { status: 404 })
    }

    // Agréger les totaux
    const employes = new Set<string>()
    let total_salaires_bruts = 0
    let total_csg_salarie = 0
    let total_csg_patronal = 0
    let total_paye = 0
    let total_nsf = 0
    let total_training_levy = 0
    let total_prgf = 0

    for (const b of bulletins) {
      if (b.employe_id) employes.add(b.employe_id)
      total_salaires_bruts += Number(b.salaire_brut || 0)
      total_csg_salarie += Number(b.csg_salarie || 0)
      total_csg_patronal += Number(b.csg_patronal || 0)
      total_paye += Number(b.paye || 0)
      total_nsf += Number(b.nsf_salarie || 0) + Number(b.nsf_patronal || 0)
      total_training_levy += Number(b.training_levy || 0)
      total_prgf += Number(b.prgf || 0)
    }

    // Créer ou mettre à jour la déclaration EDF
    const { data: declaration, error: upsertError } = await supabase
      .from('declarations_edf')
      .upsert({
        societe_id,
        exercice,
        annee_assessment: anneeAssessment,
        nb_employes: employes.size,
        total_salaires_bruts: Math.round(total_salaires_bruts * 100) / 100,
        total_csg_salarie: Math.round(total_csg_salarie * 100) / 100,
        total_csg_patronal: Math.round(total_csg_patronal * 100) / 100,
        total_paye: Math.round(total_paye * 100) / 100,
        total_nsf: Math.round(total_nsf * 100) / 100,
        total_training_levy: Math.round(total_training_levy * 100) / 100,
        total_prgf: Math.round(total_prgf * 100) / 100,
        date_limite: dateLimite,
        statut: 'en_cours'
      }, { onConflict: 'societe_id,exercice' })
      .select()
      .single()

    if (upsertError) throw upsertError

    return NextResponse.json({
      declaration,
      nb_bulletins: bulletins.length,
      periode: { debut: dateDebut, fin: dateFin }
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
