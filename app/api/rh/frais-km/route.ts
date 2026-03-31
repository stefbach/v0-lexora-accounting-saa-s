import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/frais-km?societe_id=...&employe_id=...&periode=YYYY-MM
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode') // YYYY-MM

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Fetch km rule for the société
    const { data: rule, error: ruleErr } = await supabase
      .from('frais_km_regles')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ruleErr) throw ruleErr

    // Fetch monthly entries
    let entryQuery = supabase
      .from('frais_km_mois')
      .select('*, employe:employes(nom, prenom, poste)')
      .order('periode', { ascending: false })

    // Filter by employees of this société
    if (employe_id) {
      entryQuery = entryQuery.eq('employe_id', employe_id)
    } else {
      const { data: emps } = await supabase
        .from('employes')
        .select('id')
        .eq('societe_id', societe_id)
      const ids = emps?.map(e => e.id) || []
      if (ids.length > 0) {
        entryQuery = entryQuery.in('employe_id', ids)
      } else {
        return NextResponse.json({ rule, entries: [], total: 0 })
      }
    }

    if (periode) {
      entryQuery = entryQuery.eq('periode', `${periode}-01`)
    }

    const { data: entries, error: entErr } = await entryQuery
    if (entErr) throw entErr

    return NextResponse.json({
      rule,
      entries,
      total: entries?.length || 0,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/frais-km
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── Set km tariff rule for a société ─────────────────────────────────────
    if (action === 'set_rule') {
      const { societe_id, tarif_par_km, vehicule_type, plafond_mensuel, notes } = body
      if (!societe_id || !tarif_par_km) {
        return NextResponse.json({ error: 'societe_id et tarif_par_km requis' }, { status: 400 })
      }

      // Deactivate previous rules
      await supabase
        .from('frais_km_regles')
        .update({ actif: false })
        .eq('societe_id', societe_id)

      const { data, error } = await supabase
        .from('frais_km_regles')
        .insert({
          societe_id,
          tarif_par_km: Number(tarif_par_km),
          vehicule_type: vehicule_type || null,
          plafond_mensuel: plafond_mensuel ? Number(plafond_mensuel) : null,
          notes: notes || null,
          actif: true,
          cree_par: user.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ rule: data }, { status: 201 })
    }

    // ── Enter km for an employee for a period ────────────────────────────────
    if (action === 'saisir') {
      const { employe_id, periode, km_parcourus, motif, societe_id } = body
      if (!employe_id || !periode || km_parcourus === undefined) {
        return NextResponse.json({ error: 'employe_id, periode et km_parcourus requis' }, { status: 400 })
      }

      // Get the active tariff for the société
      let sid = societe_id
      if (!sid) {
        const { data: emp } = await supabase
          .from('employes')
          .select('societe_id')
          .eq('id', employe_id)
          .single()
        sid = emp?.societe_id
      }

      const { data: rule } = await supabase
        .from('frais_km_regles')
        .select('tarif_par_km, plafond_mensuel')
        .eq('societe_id', sid)
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const tarif = rule?.tarif_par_km || 0
      let montant = Math.round(Number(km_parcourus) * tarif * 100) / 100

      // Apply monthly cap if set
      if (rule?.plafond_mensuel && montant > rule.plafond_mensuel) {
        montant = rule.plafond_mensuel
      }

      const periodeDate = `${periode}-01`
      const { data, error } = await supabase
        .from('frais_km_mois')
        .upsert({
          employe_id,
          periode: periodeDate,
          km_parcourus: Number(km_parcourus),
          tarif_par_km: tarif,
          montant,
          motif: motif || null,
          statut: 'en_attente',
          saisi_par: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: 'employe_id,periode' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({
        frais_km: data,
        tarif_applique: tarif,
        montant_calcule: montant,
      })
    }

    // ── Approve km expense ───────────────────────────────────────────────────
    if (action === 'approuver') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id requis' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('frais_km_mois')
        .update({
          statut: 'approuve',
          approuve_par: user.id,
          approuve_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ frais_km: data, message: 'Frais kilométriques approuvés' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
