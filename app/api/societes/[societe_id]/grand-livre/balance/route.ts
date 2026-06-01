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

    // Agrégation manuelle par compte (paginé sur les écritures)
    const acc = new Map<string, { numero: string; nom: string; debit: number; credit: number }>()
    let from = 0
    while (true) {
      let q = admin.from('ecritures_comptables_v2')
        .select('numero_compte, nom_compte, debit_mur, credit_mur')
        .eq('societe_id', societe_id)
      if (dateDebut) q = q.gte('date_ecriture', dateDebut)
      if (dateFin) q = q.lte('date_ecriture', dateFin)
      q = q.range(from, from + 999)
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      for (const e of data) {
        const num = e.numero_compte
        if (!num) continue
        if (classe && num[0] !== classe) continue
        if (!acc.has(num)) acc.set(num, { numero: num, nom: e.nom_compte || '', debit: 0, credit: 0 })
        const a = acc.get(num)!
        a.debit += +e.debit_mur || 0
        a.credit += +e.credit_mur || 0
      }
      if (data.length < 1000) break
      from += 1000
    }

    const balance = [...acc.values()]
      .map(b => ({
        numero: b.numero, nom: b.nom,
        debit: Math.round(b.debit * 100) / 100,
        credit: Math.round(b.credit * 100) / 100,
        solde: Math.round((b.debit - b.credit) * 100) / 100,
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
