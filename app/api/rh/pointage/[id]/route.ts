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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await params
    const { data, error } = await supabase.from('pointages').select('*, employe:employes(nom,prenom,poste,salaire_base)').eq('id', id).single()
    if (error) throw error
    return NextResponse.json({ pointage: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { id } = await params
    const body = await request.json()

    // Récupérer le pointage existant
    const { data: existing } = await supabase.from('pointages').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Pointage non trouvé' }, { status: 404 })

    const updates: any = {}

    // Correction heures
    if (body.heure_entree !== undefined) updates.heure_entree = body.heure_entree
    if (body.heure_sortie !== undefined) updates.heure_sortie = body.heure_sortie
    if (body.motif_correction) {
      updates.motif_correction = body.motif_correction
      updates.corrected_by = user.id
      updates.corrected_at = new Date().toISOString()
    }

    // Absence
    if (body.absent_justifie !== undefined) updates.absent_justifie = body.absent_justifie
    if (body.motif_absence !== undefined) updates.motif_absence = body.motif_absence

    // Recalcul durée
    const hEntree = body.heure_entree !== undefined ? body.heure_entree : existing.heure_entree
    const hSortie = body.heure_sortie !== undefined ? body.heure_sortie : existing.heure_sortie
    if (hEntree && hSortie) {
      const duree = Math.round(
        (new Date(`1970-01-01T${hSortie}`).getTime() - new Date(`1970-01-01T${hEntree}`).getTime()) / 60000
      )
      updates.duree_minutes = Math.max(duree, 0)

      // Recalcul OT automatique
      const datePointage = existing.date_pointage || existing.date
      const ot = calcOT(hEntree, hSortie, isFerie(datePointage))
      updates.heures_normales = Math.round(ot.normales * 100) / 100
      updates.heures_ot_1_5x = Math.round(ot.ot15 * 100) / 100
      updates.heures_ot_2x = Math.round(ot.ot2 * 100) / 100
    }

    const { data, error } = await supabase.from('pointages').update(updates).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ pointage: data, message: 'Pointage mis à jour' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
