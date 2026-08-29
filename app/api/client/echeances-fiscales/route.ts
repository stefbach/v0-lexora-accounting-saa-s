/**
 * GET /api/client/echeances-fiscales?societe_id=&tva_frequence=&applique_tds=
 *
 * Calendrier des obligations fiscales & sociales mauriciennes (MRA) pour une
 * société, dérivé de son profil (assujettie TVA ? salariés ? clôture) + statut
 * de chaque échéance (en retard / proche / à venir). Cible « dirigeant
 * autonome » : répondre à « suis-je en règle ? ».
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  genererEcheancesFiscales,
  statutEcheance,
  type ProfilConformite,
} from '@/lib/compliance/echeances-fiscales-maurice'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) return apiError('access_denied_company', 403)
      throw err
    }

    const { data: societe } = await supabase
      .from('societes')
      .select('id, nom, numero_tva_mra, date_fin_exercice')
      .eq('id', societe_id)
      .maybeSingle()

    // Salariés actifs → obligations paie
    const { count: nbEmployes } = await supabase
      .from('employes')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id)
      .eq('actif', true)

    // TDS appliqué : override, sinon détecté par présence d'écritures 4471
    let applique_tds = searchParams.get('applique_tds') === 'true'
    if (!searchParams.has('applique_tds')) {
      const { count: nbTds } = await supabase
        .from('ecritures_comptables_v2')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe_id)
        .eq('numero_compte', '4471')
      applique_tds = (nbTds || 0) > 0
    }

    const tvaFreqParam = searchParams.get('tva_frequence')
    const profil: ProfilConformite = {
      tva_assujetti: !!(societe?.numero_tva_mra && String(societe.numero_tva_mra).trim()),
      tva_frequence: tvaFreqParam === 'mensuelle' ? 'mensuelle' : 'trimestrielle',
      a_salaries: (nbEmployes || 0) > 0,
      applique_tds,
      date_fin_exercice: societe?.date_fin_exercice || null,
    }

    const horizonMois = Math.min(12, Math.max(1, Number(searchParams.get('horizon') || 4)))
    const today = new Date().toISOString().slice(0, 10)
    const echeances = genererEcheancesFiscales(profil, { from: today, horizonMois, lookbackMois: 3 })
      .map(e => ({ ...e, statut: statutEcheance(e.date_echeance, today) }))

    const resume = {
      en_retard: echeances.filter(e => e.statut === 'en_retard').length,
      proche: echeances.filter(e => e.statut === 'proche').length,
      a_venir: echeances.filter(e => e.statut === 'a_venir').length,
    }

    return NextResponse.json({ profil, echeances, resume, today })
  } catch (e: any) {
    console.error('[echeances-fiscales]', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
