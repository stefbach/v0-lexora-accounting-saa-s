/**
 * /api/client/analytique/grille
 *
 * GET : grille analytique croisée compte × section (+ non affecté, totaux,
 *       résultat par section) sur une période optionnelle (from/to).
 *
 * Tenant isolation : assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { buildGrille } from '@/lib/analytique/grille'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)
    await assertSocieteAccess(supabase, user.id, societe_id)

    // Sections (colonnes).
    const { data: sections } = await supabase
      .from('sections_analytiques').select('id, code, libelle, type, statut')
      .eq('societe_id', societe_id).order('type').order('code')

    // Écritures de charge/produit (classe 6/7) sur la période.
    let q = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, nom_compte, debit_mur, credit_mur, section_analytique_id')
      .eq('societe_id', societe_id)
      .or('numero_compte.like.6%,numero_compte.like.7%')
      .limit(100000)
    if (from) q = q.gte('date_ecriture', from)
    if (to) q = q.lte('date_ecriture', to)
    const { data: ecritures } = await q

    // Ventilations (avec le compte de l'écriture répartie).
    const { data: vents } = await supabase
      .from('ventilations_analytiques')
      .select('section_analytique_id, montant, ecritures_comptables_v2(numero_compte, nom_compte, date_ecriture)')
      .eq('societe_id', societe_id)
      .limit(100000)

    const ventilations = (vents || [])
      .map((v: any) => ({
        numero_compte: v.ecritures_comptables_v2?.numero_compte || '',
        nom_compte: v.ecritures_comptables_v2?.nom_compte || '',
        section_analytique_id: v.section_analytique_id,
        montant: v.montant,
        date: v.ecritures_comptables_v2?.date_ecriture || null,
      }))
      .filter((v) => (!from || !v.date || v.date >= from) && (!to || !v.date || v.date <= to))

    const grille = buildGrille(ecritures || [], ventilations)

    return NextResponse.json({ sections: sections || [], ...grille })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
