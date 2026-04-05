import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdmin()
    const { societe_id, periode } = await request.json()

    // 1. Check societe exists
    const { data: soc, error: socErr } = await supabase.from('societes').select('id, nom, brn, ern').eq('id', societe_id).maybeSingle()

    // 2. Check bulletins exist
    const { data: bulletins, error: bulErr } = await supabase.from('bulletins_paie').select('id, employe_id, salaire_net, statut, periode').eq('societe_id', societe_id).ilike('periode', `${periode}%`).limit(5)

    // 3. Check employees
    const { data: emps, error: empErr } = await supabase.from('employes').select('id, nom, prenom, bank_account, bank_name, bank_code').eq('societe_id', societe_id).is('date_depart', null).limit(5)

    // 4. Check comptes_bancaires table exists
    let comptesInfo = null
    try {
      const { data, error } = await supabase.from('comptes_bancaires').select('id, societe_id, numero_compte, banque, usage_paie, actif').eq('societe_id', societe_id).limit(3)
      comptesInfo = { exists: true, data, error: error?.message }
    } catch {
      comptesInfo = { exists: false, error: 'table does not exist' }
    }

    // 5. Try the actual virement export
    let virementResult = null
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/api/rh/exports/virement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
        body: JSON.stringify({ societe_id, periode }),
      })
      virementResult = { status: res.status, body: await res.json().catch(() => 'non-json') }
    } catch (e: any) {
      virementResult = { error: e.message }
    }

    // 6. Try CSG export
    let csgResult = null
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/api/rh/exports/csg-mra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
        body: JSON.stringify({ societe_id, periode }),
      })
      csgResult = { status: res.status, body: await res.json().catch(() => 'non-json') }
    } catch (e: any) {
      csgResult = { error: e.message }
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      societe: { found: !!soc, data: soc, error: socErr?.message },
      bulletins: { count: bulletins?.length || 0, sample: bulletins?.slice(0, 2), error: bulErr?.message },
      employes: { count: emps?.length || 0, sample: emps?.slice(0, 2), error: empErr?.message },
      comptes_bancaires: comptesInfo,
      virement_test: virementResult,
      csg_test: csgResult,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
