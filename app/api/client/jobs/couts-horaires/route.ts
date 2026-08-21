/**
 * /api/client/jobs/couts-horaires
 *
 * GET  : snapshots de coût horaire chargé d'une société (par employé).
 * POST : calcule et enregistre un snapshot du coût horaire chargé d'un employé
 *        (formule §2.5 : (salaire + primes) × (1 + charges patronales) / heures),
 *        dérivé du salaire de base et du taux de charges patronales de la
 *        société (societes.ias19_charges_patronales_pct). Snapshot immuable :
 *        un nouveau taux crée une nouvelle date_effet, jamais un recalcul.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  coutHoraireCharge,
  type CoutHoraireInput,
} from '@/lib/jobcosting/couts'
import {
  CHARGES_PATRONALES_PCT_DEFAUT,
  HEURES_MENSUELLES_DEFAUT,
} from '@/lib/jobcosting/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('couts_horaires_employes')
      .select('*, employes(nom, prenom, code)')
      .eq('societe_id', societe_id)
      .order('date_effet', { ascending: false })
    const employe = searchParams.get('employe_id')
    if (employe) query = query.eq('employe_id', employe)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    const employe_id = String(body.employe_id || '')
    if (!societe_id || !employe_id) {
      return NextResponse.json({ error: 'societe_id et employe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: employe, error: empErr } = await supabase
      .from('employes')
      .select('id, societe_id, salaire_base, transport_allowance, petrol_allowance')
      .eq('id', employe_id)
      .maybeSingle()
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })
    if (!employe || employe.societe_id !== societe_id) {
      return NextResponse.json({ error: 'Employé introuvable pour cette société' }, { status: 404 })
    }

    const { data: societe } = await supabase
      .from('societes')
      .select('ias19_charges_patronales_pct')
      .eq('id', societe_id)
      .maybeSingle()

    const manuel = body.cout_horaire_charge !== undefined && body.cout_horaire_charge !== null && body.cout_horaire_charge !== ''
    const chargesPct = body.charges_patronales_pct != null
      ? Number(body.charges_patronales_pct)
      : Number(societe?.ias19_charges_patronales_pct ?? CHARGES_PATRONALES_PCT_DEFAUT)
    const heures = body.heures_mensuelles != null ? Number(body.heures_mensuelles) : HEURES_MENSUELLES_DEFAUT
    const primes = body.primes_fixes != null
      ? Number(body.primes_fixes)
      : Number(employe.transport_allowance || 0) + Number(employe.petrol_allowance || 0)

    let cout: number
    if (manuel) {
      cout = Number(body.cout_horaire_charge)
      if (!Number.isFinite(cout) || cout < 0) {
        return NextResponse.json({ error: 'cout_horaire_charge invalide' }, { status: 400 })
      }
    } else {
      const input: CoutHoraireInput = {
        salaire_base: employe.salaire_base,
        primes_fixes: primes,
        charges_patronales_pct: chargesPct,
        heures_mensuelles: heures,
      }
      try {
        cout = coutHoraireCharge(input)
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Calcul impossible' }, { status: 400 })
      }
    }

    const date_effet = typeof body.date_effet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_effet)
      ? body.date_effet
      : new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('couts_horaires_employes')
      .upsert(
        {
          societe_id,
          employe_id,
          date_effet,
          cout_horaire_charge: cout,
          methode_calcul: manuel ? 'manuel' : 'auto_bulletin',
          base_salaire: employe.salaire_base,
          charges_patronales_pct: chargesPct,
          heures_mensuelles: heures,
        },
        { onConflict: 'employe_id,date_effet' },
      )
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
