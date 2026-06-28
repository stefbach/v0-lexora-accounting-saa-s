import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Aggregate the two per-type flags from conges_employes for a given société.
 * Returns a map: type_conge → { demi_journee_autorisee, imposable_par_societe }.
 * A type is flagged TRUE when any employee of the société has it TRUE
 * (opt-in model — the toggle represents "allowed in this company").
 */
async function getTypeFlagsForSociete(
  supabase: ReturnType<typeof getAdminClient>,
  societeId: string
): Promise<Record<string, { demi_journee_autorisee: boolean; imposable_par_societe: boolean }>> {
  // Fetch employee ids for this société (soft-scoped: all, active or not —
  // we only read flags).
  const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societeId)
  const empIds = (emps || []).map((e: any) => e.id)
  if (empIds.length === 0) return {}

  const { data: rows } = await supabase
    .from('conges_employes')
    .select('type_conge, demi_journee_autorisee, imposable_par_societe')
    .in('employe_id', empIds)

  const out: Record<string, { demi_journee_autorisee: boolean; imposable_par_societe: boolean }> = {}
  for (const r of rows || []) {
    const t = String((r as any).type_conge)
    if (!out[t]) out[t] = { demi_journee_autorisee: false, imposable_par_societe: false }
    if ((r as any).demi_journee_autorisee === true) out[t].demi_journee_autorisee = true
    if ((r as any).imposable_par_societe === true) out[t].imposable_par_societe = true
  }
  return out
}

// GET /api/rh/conges/entitlements?societe_id=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('regles_conges')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('type_conge')

    if (error) throw error

    // Enrich with per-type flags pulled from conges_employes.
    const flags = await getTypeFlagsForSociete(supabase, societe_id)

    return NextResponse.json({
      regles: data,
      total: data?.length || 0,
      type_flags: flags,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/conges/entitlements
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const {
      societe_id,
      type_conge,
      jours_par_an,
      prorata_entree,
      max_report,
      min_anciennete_mois,
      genre_requis,
    } = body

    if (!societe_id || !type_conge || jours_par_an === undefined) {
      return NextResponse.json(
        { error: 'societe_id, type_conge et jours_par_an requis' },
        { status: 400 }
      )
    }

    // Validate type_conge
    const typesValides = [
      'annuel',
      'maladie',
      'maternite',
      'paternite',
      'sans_solde',
      'deces',
      'mariage',
      'exceptionnel',
      'formation',
    ]
    if (!typesValides.includes(type_conge)) {
      return NextResponse.json(
        { error: `type_conge invalide. Types acceptés: ${typesValides.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate genre_requis if provided
    if (genre_requis && !['M', 'F', null].includes(genre_requis)) {
      return NextResponse.json(
        { error: 'genre_requis doit être M, F ou null' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('regles_conges')
      .upsert({
        societe_id,
        type_conge,
        jours_par_an: Number(jours_par_an),
        prorata_entree: prorata_entree !== undefined ? Boolean(prorata_entree) : true,
        max_report: max_report !== undefined ? Number(max_report) : 0,
        min_anciennete_mois: min_anciennete_mois !== undefined ? Number(min_anciennete_mois) : 0,
        genre_requis: genre_requis || null,
        actif: true,
        mis_a_jour_par: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,type_conge' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ regle: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

/**
 * PUT /api/rh/conges/entitlements
 *
 * Update the per-type flags (demi_journee_autorisee, imposable_par_societe)
 * for a given société + type_conge. The flags live on conges_employes
 * (per-(employe_id, annee, type_conge) row) — this endpoint fans the update
 * out to every employee of the société for the current year.
 *
 * Body:
 *   {
 *     societe_id: string,
 *     type_conge: string,
 *     demi_journee_autorisee?: boolean,
 *     imposable_par_societe?: boolean,
 *     annee?: number                 // default = current year
 *   }
 *
 * Returns:
 *   { updated: number, created: number }
 *
 * Access: admin / super_admin / client_admin / rh / rh_manager / direction.
 */
const ALLOWED_ROLES_FLAGS = new Set([
  'admin', 'super_admin', 'client_admin',
  'rh', 'rh_manager', 'direction',
])

export async function PUT(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()

    // Role gate
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!ALLOWED_ROLES_FLAGS.has(role)) {
      return apiError('access_denied', 403)
    }

    const body = await request.json()
    const {
      societe_id,
      type_conge,
      demi_journee_autorisee,
      imposable_par_societe,
      annee = new Date().getFullYear(),
    } = body || {}

    if (!societe_id || !type_conge) {
      return NextResponse.json({ error: 'societe_id et type_conge requis' }, { status: 400 })
    }
    if (demi_journee_autorisee === undefined && imposable_par_societe === undefined) {
      return NextResponse.json({ error: 'Aucun flag à modifier' }, { status: 400 })
    }

    // Fetch active employees for this société (inactive employees keep their
    // existing config — flipping the company-wide default shouldn't rewrite
    // historical data for departed employees).
    const { data: emps } = await supabase
      .from('employes')
      .select('id')
      .eq('societe_id', societe_id)
      .is('date_depart', null)

    const empIds = (emps || []).map((e: any) => e.id)
    if (empIds.length === 0) {
      return NextResponse.json({ updated: 0, created: 0, warning: 'Aucun employé actif pour cette société' })
    }

    // For each employee, upsert the (employe_id, annee, type_conge) row.
    // Done in small batches to keep the statement size reasonable.
    const updatePayload: Record<string, any> = {}
    if (demi_journee_autorisee !== undefined) updatePayload.demi_journee_autorisee = Boolean(demi_journee_autorisee)
    if (imposable_par_societe !== undefined) updatePayload.imposable_par_societe = Boolean(imposable_par_societe)
    updatePayload.updated_at = new Date().toISOString()

    let updated = 0
    let created = 0

    for (const empId of empIds) {
      // Does the row already exist?
      const { data: existing } = await supabase
        .from('conges_employes')
        .select('id')
        .eq('employe_id', empId)
        .eq('annee', annee)
        .eq('type_conge', type_conge)
        .maybeSingle()

      if (existing) {
        const { error: uErr } = await supabase
          .from('conges_employes')
          .update(updatePayload)
          .eq('id', existing.id)
        if (!uErr) updated++
      } else {
        // Create with sensible defaults for jours_droit per WRA 2019.
        const defaultDroit = type_conge === 'AL' ? 22
          : type_conge === 'SL' ? 15
          : type_conge === 'MAT' ? 112
          : type_conge === 'PAT' ? 28
          : 0
        const { error: iErr } = await supabase.from('conges_employes').insert({
          employe_id: empId,
          annee,
          type_conge,
          jours_droit: defaultDroit,
          jours_pris: 0,
          demi_journee_autorisee: demi_journee_autorisee !== undefined ? Boolean(demi_journee_autorisee) : true,
          imposable_par_societe: imposable_par_societe !== undefined ? Boolean(imposable_par_societe) : false,
        })
        if (!iErr) created++
      }
    }

    return NextResponse.json({ updated, created })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
