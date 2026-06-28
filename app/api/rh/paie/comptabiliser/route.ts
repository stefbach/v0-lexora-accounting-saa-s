import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const { bulletin_id, all_periode, societe_id, periode, confirm } = body

    if (bulletin_id) {
      // BUG MAI 2026 — guard défensif : refuser de comptabiliser un bulletin
      // archivé. Sinon on cumule des écritures fantômes (ce bulletin a été
      // remplacé par une version plus récente).
      const { data: bul } = await supabase
        .from('bulletins_paie')
        .select('id, is_archived, comptabilise')
        .eq('id', bulletin_id)
        .maybeSingle()
      if (!bul) return NextResponse.json({ error: 'Bulletin non trouvé' }, { status: 404 })
      if (bul.is_archived === true) {
        return NextResponse.json({
          error: 'Bulletin archivé — ne peut pas être comptabilisé (utiliser la version active)',
          code: 'BULLETIN_ARCHIVE',
        }, { status: 409 })
      }
      if (bul.comptabilise === true) {
        return NextResponse.json({
          error: 'Bulletin déjà comptabilisé',
          code: 'DEJA_COMPTABILISE',
        }, { status: 409 })
      }
      const { data, error } = await supabase.rpc('generer_ecritures_paie', { p_bulletin_id: bulletin_id })
      if (error) throw error
      return NextResponse.json({ nb_ecritures: data, message: `${data} écritures générées` })
    }

    if (all_periode && societe_id && periode) {
      const periodeDate = `${periode}-01`
      // FIX : matcher TOUT le mois, pas seulement le 1er. Les bulletins EOY
      // (13ème mois) ont une période à jour spécifique (YYYY-12-25) et les
      // STC une date de départ quelconque — un .eq('periode', '-01') les
      // excluait de la comptabilisation groupée. On borne sur le mois entier.
      const [yy, mm] = periode.split('-').map(Number)
      const lastDay = `${periode}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`
      // BUG MAI 2026 — filtre is_archived=false ajouté. Sans ça, les
      // bulletins archivés non comptabilisés (cas après décomptabilisation
      // d'un bulletin qui a été archivé entre temps) seraient embarqués.
      const { data: bulletins } = await supabase
        .from('bulletins_paie').select('id')
        .eq('societe_id', societe_id)
        .gte('periode', periodeDate).lte('periode', lastDay)
        .eq('statut', 'valide').eq('comptabilise', false)
        .or('is_archived.is.null,is_archived.eq.false')

      // CONFIRMATION EXPLICITE (anti "valider/dévalider à la légère") :
      // une comptabilisation de masse remonte N bulletins au grand livre. On
      // exige confirm:true ; sinon on renvoie un RÉCAP (dry-run) à confirmer.
      if (confirm !== true) {
        return NextResponse.json({
          requires_confirmation: true,
          nb_bulletins: bulletins?.length || 0,
          periode: periodeDate,
          message: `${bulletins?.length || 0} bulletin(s) seront comptabilisé(s) au grand livre pour ${periode}. Renvoyer avec confirm:true pour valider.`,
        })
      }

      let total = 0
      for (const b of bulletins || []) {
        const { data: nb } = await supabase.rpc('generer_ecritures_paie', { p_bulletin_id: b.id })
        total += Number(nb) || 0
      }
      return NextResponse.json({ nb_ecritures: total, nb_bulletins: bulletins?.length, confirmed: true })
    }

    return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
