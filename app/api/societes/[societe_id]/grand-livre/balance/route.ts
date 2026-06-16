/**
 * GET /api/societes/{societe_id}/grand-livre/balance
 *     ?date_debut=&date_fin=&classe=
 *
 * Balance des comptes (débit/crédit/solde) sur une période, optionnellement
 * filtrée par classe. Agrège ecritures_comptables_v2 par numero_compte.
 */

import { NextResponse } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { searchParams } = new URL(request.url)
    const dateDebut = searchParams.get('date_debut')
    const dateFin = searchParams.get('date_fin')
    const classe = searchParams.get('classe')

    // Agrégation côté SQL (RPC gl_balance_par_compte, mig 462) — un seul
    // GROUP BY couvert par idx_ecritures_v2_composite, au lieu de charger
    // toutes les écritures dans Node. Scalable à fort volume.
    const { data: rows, error } = await admin.rpc('gl_balance_par_compte', {
      p_societe_id: societe_id,
      p_date_debut: dateDebut || null,
      p_date_fin: dateFin || null,
      p_classe: classe || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const balance = ((rows || []) as Array<{
      numero_compte: string; nom_compte: string | null
      debit: number; credit: number; solde: number
    }>)
      .map(b => ({
        numero: b.numero_compte,
        nom: b.nom_compte || '',
        debit: +b.debit || 0,
        credit: +b.credit || 0,
        solde: +b.solde || 0,
      }))
      .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))

    const totaux = balance.reduce(
      (acc, b) => ({ debit: acc.debit + b.debit, credit: acc.credit + b.credit }),
      { debit: 0, credit: 0 },
    )

    return NextResponse.json({
      balance,
      totaux: {
        debit: Math.round(totaux.debit * 100) / 100,
        credit: Math.round(totaux.credit * 100) / 100,
        equilibre: Math.abs(totaux.debit - totaux.credit) < 0.01,
      },
      filtres: { date_debut: dateDebut, date_fin: dateFin, classe },
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
