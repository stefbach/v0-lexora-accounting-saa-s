import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

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
    let societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')

    // Si pas de societe_id, utiliser la première société accessible
    if (!societe_id) {
      const accessible = await getUserSocieteIds(user.id)
      if (accessible.length > 0) societe_id = accessible[0]
      else return NextResponse.json({ rule: null, frais: [], tarif_km: 4, entries: [], total: 0 })
    }

    // Fetch km rule — try both table names (frais_km_rules or frais_km_regles)
    let rule: any = null
    const { data: r1, error: e1 } = await supabase
      .from('frais_km_rules')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('date_effet', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!e1) {
      rule = r1
    } else {
      const { data: r2 } = await supabase
        .from('frais_km_regles')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      rule = r2
    }

    // Fetch monthly entries — pas de FK join (peut crasher RLS)
    let entryQuery = supabase
      .from('frais_km_mois')
      .select('*')
      .order('periode', { ascending: false })

    // Filter by employees of this société
    if (employe_id) {
      entryQuery = entryQuery.eq('employe_id', employe_id)
    } else {
      // Sprint 5 FIX 1 — exclure employés partis des frais km courants.
      // Les frais historiques restent accessibles via l'employe_id direct.
      const { data: emps } = await supabase
        .from('employes')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('actif', true)
        .is('date_depart', null)
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

    // Enrich entries with employee names (avoid FK join)
    const empIds = [...new Set((entries || []).map((e: any) => e.employe_id))]
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', empIds)
      for (const e of emps || []) empMap[e.id] = e
    }

    const frais = (entries || []).map((e: any) => {
      const emp = empMap[e.employe_id] || e.employe || {}
      // Sprint 11 BUG 5 — statut dérivé de la colonne approuve BOOLEAN.
      // Fallback sur e.statut pour envs legacy qui auraient gardé l'ancien schéma.
      const statutDerive = e.statut
        ?? (e.approuve === true ? 'approuve' : 'en_attente')
      return {
        id: e.id,
        employe_id: e.employe_id,
        employe_nom: emp.nom || '',
        employe_prenom: emp.prenom || '',
        employe_poste: emp.poste || '',
        periode: e.periode,
        km: Number(e.km_parcourus) || 0,
        tarif: Number(e.tarif_applique || e.tarif_par_km) || Number(rule?.tarif_par_km) || 16,
        montant: Number(e.montant) || 0,
        statut: statutDerive,
        approuve: e.approuve === true,
        justificatif: e.justificatif || null,
      }
    })

    return NextResponse.json({
      rule,
      frais,
      tarif_km: Number(rule?.tarif_par_km) || 4,
      entries: entries || [],
      total: (entries || []).length,
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
    if (action === 'set_rule' || action === 'update_tarif') {
      const societe_id = body.societe_id
      const tarifValue = Number(body.tarif_par_km || body.tarif_km)
      if (!societe_id || !tarifValue) {
        return NextResponse.json({ error: 'societe_id et tarif requis' }, { status: 400 })
      }

      // Try frais_km_rules first, fallback to frais_km_regles
      let tableName = 'frais_km_rules'
      let deactivateErr = null
      const r1 = await supabase.from('frais_km_rules').update({ actif: false }).eq('societe_id', societe_id)
      if (r1.error) {
        tableName = 'frais_km_regles'
        await supabase.from('frais_km_regles').update({ actif: false }).eq('societe_id', societe_id)
      }

      const { data, error } = await supabase
        .from(tableName)
        .insert({
          societe_id,
          tarif_par_km: tarifValue,
          vehicule_type: body.vehicule_type || 'voiture',
          plafond_mensuel: body.plafond_mensuel ? Number(body.plafond_mensuel) : null,
          actif: true,
          date_effet: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (error) {
        console.error('[frais-km set_rule]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ rule: data, tarif_km: tarifValue })
    }

    // ── Enter km for an employee for a period ────────────────────────────────
    // Sprint 11 BUG 5 — aligner l'INSERT sur le schéma réel (mig 037) :
    //   - colonne TARIF : tarif_applique (pas tarif_par_km)
    //   - colonne MONTANT : GENERATED ALWAYS AS (km_parcourus * tarif_applique)
    //     STORED — NE JAMAIS envoyer dans l'INSERT, sinon 42601/erreur PG.
    //   - colonne TEXTE : justificatif (pas motif)
    //   - colonne STATUT : approuve BOOLEAN (pas statut 'en_attente')
    //   - PAS de colonnes saisi_par/approuve_at/created_at sur frais_km_mois.
    // Le plafond mensuel est appliqué en capant km_parcourus (puisque
    // montant est dérivé) au lieu de capper le montant seul.
    if (action === 'saisir') {
      const { employe_id, periode, km_parcourus, justificatif, motif, societe_id } = body
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

      // Try both table names (legacy fallback)
      let saisieRule: any = null
      const { data: sr1 } = await supabase.from('frais_km_rules').select('tarif_par_km, plafond_mensuel').eq('societe_id', sid).eq('actif', true).order('date_effet', { ascending: false }).limit(1).maybeSingle()
      if (sr1) { saisieRule = sr1 } else {
        const { data: sr2 } = await supabase.from('frais_km_regles').select('tarif_par_km, plafond_mensuel').eq('societe_id', sid).eq('actif', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
        saisieRule = sr2
      }

      const tarif = Number(saisieRule?.tarif_par_km) || 4
      let kmEffectifs = Number(km_parcourus)
      // Apply monthly cap on km (puisque montant est GENERATED)
      const plafond = Number(saisieRule?.plafond_mensuel) || 0
      if (plafond > 0 && kmEffectifs * tarif > plafond) {
        kmEffectifs = Math.floor((plafond / tarif) * 100) / 100
      }

      const periodeDate = `${periode}-01`
      // frais_km_mois.montant est GENERATED ALWAYS AS (km_parcourus * tarif_applique)
      // STORED en prod → ne JAMAIS l'inclure dans l'INSERT, sinon Postgres
      // renvoie 428C9 / 42601 et l'API répond 400. Le montant est calculé
      // automatiquement par la base. Même règle pour `approuve` : default
      // côté DB (false) — on garde un payload minimal aux 5 champs requis.
      const insertRow: Record<string, unknown> = {
        employe_id,
        periode: periodeDate,
        km_parcourus: kmEffectifs,
        tarif_applique: tarif,
        justificatif: justificatif || motif || null,
      }
      const { data, error } = await supabase
        .from('frais_km_mois')
        .upsert(insertRow, { onConflict: 'employe_id,periode' })
        .select()
        .single()

      if (error) {
        console.error('[frais-km saisir] insert error:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        })
        return NextResponse.json({
          error: `Erreur saisie frais km : ${error.message}${error.hint ? ` (${error.hint})` : ''}`,
          code: error.code,
        }, { status: 500 })
      }
      return NextResponse.json({
        frais_km: data,
        tarif_applique: tarif,
        km_retenus: kmEffectifs,
        montant_calcule: Number(data?.montant) || Math.round(kmEffectifs * tarif * 100) / 100,
      })
    }

    // ── Approve km expense ───────────────────────────────────────────────────
    // Sprint 11 BUG 5 — colonne approuve BOOLEAN (pas statut). approuve_par
    // doit pointer sur employes(id) ou null (schéma permissif : UUID sans FK
    // explicite mais des anciens envs ont la FK vers employes).
    if (action === 'approuver') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id requis' }, { status: 400 })
      }

      // Résolution auth_user → employe_id (même pattern que BUG 2)
      let approuveParEmpId: string | null = null
      try {
        const { data: profile } = await supabase
          .from('profiles').select('employe_id').eq('id', user.id).maybeSingle()
        approuveParEmpId = profile?.employe_id || null
      } catch {}

      const { data, error } = await supabase
        .from('frais_km_mois')
        .update({
          approuve: true,
          approuve_par: approuveParEmpId,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[frais-km approuver] update error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ frais_km: data, message: 'Frais kilométriques approuvés' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
