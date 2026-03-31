import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/planning?societe_id=...&periode=YYYY-MM
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode') // YYYY-MM

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    let query = supabase
      .from('plannings')
      .select('*, assignments:planning_assignments(*)')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })

    if (periode) {
      query = query.eq('periode', `${periode}-01`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ plannings: data, total: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/planning
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── Create planning ──────────────────────────────────────────────────────
    if (action === 'create_planning') {
      const { societe_id, periode, nom, shift_template_id } = body
      if (!societe_id || !periode) {
        return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
      }

      const periodeDate = `${periode}-01`
      const { data, error } = await supabase
        .from('plannings')
        .upsert({
          societe_id,
          periode: periodeDate,
          nom: nom || `Planning ${periode}`,
          shift_template_id: shift_template_id || null,
          statut: 'brouillon',
          cree_par: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,periode' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ planning: data }, { status: 201 })
    }

    // ── Bulk assign employees to shifts for dates ────────────────────────────
    if (action === 'assign') {
      const { planning_id, assignments } = body
      if (!planning_id || !Array.isArray(assignments) || assignments.length === 0) {
        return NextResponse.json({ error: 'planning_id et assignments[] requis' }, { status: 400 })
      }

      const rows = assignments.map((a: { employe_id: string; date: string; shift_type: string; heure_debut?: string; heure_fin?: string; notes?: string }) => ({
        planning_id,
        employe_id: a.employe_id,
        date: a.date,
        shift_type: a.shift_type,
        heure_debut: a.heure_debut || null,
        heure_fin: a.heure_fin || null,
        notes: a.notes || null,
      }))

      const { data, error } = await supabase
        .from('planning_assignments')
        .upsert(rows, { onConflict: 'planning_id,employe_id,date' })
        .select()

      if (error) throw error
      return NextResponse.json({ assignments: data, nb_assigned: data?.length || 0 })
    }

    // ── Import from Excel ────────────────────────────────────────────────────
    if (action === 'import_excel') {
      const { planning_id, societe_id, periode, data: importData } = body
      if (!societe_id || !periode || !Array.isArray(importData)) {
        return NextResponse.json({ error: 'societe_id, periode et data[] requis' }, { status: 400 })
      }

      // Ensure planning exists
      const periodeDate = `${periode}-01`
      const { data: planning, error: planErr } = await supabase
        .from('plannings')
        .upsert({
          societe_id,
          periode: periodeDate,
          nom: `Planning ${periode} (import)`,
          statut: 'brouillon',
          cree_par: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,periode' })
        .select()
        .single()

      if (planErr) throw planErr

      const pId = planning_id || planning.id

      // Map imported rows to assignments
      const rows = importData.map((row: { employe_id: string; date: string; shift_type: string; heure_debut?: string; heure_fin?: string }) => ({
        planning_id: pId,
        employe_id: row.employe_id,
        date: row.date,
        shift_type: row.shift_type,
        heure_debut: row.heure_debut || null,
        heure_fin: row.heure_fin || null,
      }))

      const { data: inserted, error: insErr } = await supabase
        .from('planning_assignments')
        .upsert(rows, { onConflict: 'planning_id,employe_id,date' })
        .select()

      if (insErr) throw insErr
      return NextResponse.json({
        planning,
        nb_imported: inserted?.length || 0,
        assignments: inserted,
      })
    }

    // ── Publish planning ─────────────────────────────────────────────────────
    if (action === 'publish') {
      const { planning_id } = body
      if (!planning_id) {
        return NextResponse.json({ error: 'planning_id requis' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('plannings')
        .update({ statut: 'publie', publie_at: new Date().toISOString(), publie_par: user.id })
        .eq('id', planning_id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ planning: data, message: 'Planning publié' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/rh/planning?planning_id=...
export async function DELETE(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const planning_id = searchParams.get('planning_id')

    if (!planning_id) {
      return NextResponse.json({ error: 'planning_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('plannings')
      .update({ statut: 'archive', archive_at: new Date().toISOString(), archive_par: user.id })
      .eq('id', planning_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ planning: data, message: 'Planning archivé' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
