import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { bulletin_id, all_periode, societe_id, periode } = body

    if (bulletin_id) {
      const { data, error } = await supabase.rpc('generer_ecritures_paie', { p_bulletin_id: bulletin_id })
      if (error) throw error
      return NextResponse.json({ nb_ecritures: data, message: `${data} écritures générées` })
    }

    if (all_periode && societe_id && periode) {
      const periodeDate = `${periode}-01`
      const { data: bulletins } = await supabase
        .from('bulletins_paie').select('id')
        .eq('societe_id', societe_id).eq('periode', periodeDate)
        .eq('statut', 'valide').eq('comptabilise', false)

      let total = 0
      for (const b of bulletins || []) {
        const { data: nb } = await supabase.rpc('generer_ecritures_paie', { p_bulletin_id: b.id })
        total += Number(nb) || 0
      }
      return NextResponse.json({ nb_ecritures: total, nb_bulletins: bulletins?.length })
    }

    return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
