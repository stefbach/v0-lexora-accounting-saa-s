import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Shift definitions with hours (Bug 2)
const SHIFT_HOURS: Record<string, { heure_debut: string; heure_fin: string; heures_prevues: number; est_repos: boolean }> = {
  Jour:          { heure_debut: '08:00', heure_fin: '17:00', heures_prevues: 9, est_repos: false },
  Matin:         { heure_debut: '06:00', heure_fin: '14:00', heures_prevues: 8, est_repos: false },
  'Après-midi':  { heure_debut: '14:00', heure_fin: '22:00', heures_prevues: 8, est_repos: false },
  Nuit:          { heure_debut: '22:00', heure_fin: '06:00', heures_prevues: 8, est_repos: false },
  Repos:         { heure_debut: '',      heure_fin: '',      heures_prevues: 0, est_repos: true },
}

// GET /api/rh/planning?societe_id=...&periode=YYYY-MM
// Returns { planning: [...flat assignment entries...], published: boolean }
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

    // Find the planning for this societe + periode
    let planningQuery = supabase
      .from('plannings')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })

    if (periode) {
      planningQuery = planningQuery.eq('periode', `${periode}-01`)
    }

    const { data: plannings, error: planErr } = await planningQuery
    if (planErr) throw planErr

    const planningRecord = plannings && plannings.length > 0 ? plannings[0] : null
    const published = planningRecord?.statut === 'publie'

    if (!planningRecord) {
      return NextResponse.json({ planning: [], published: false, total: 0 })
    }

    // Fetch assignments for this planning
    const { data: assignments, error: assErr } = await supabase
      .from('planning_assignments')
      .select('*')
      .eq('planning_id', planningRecord.id)

    if (assErr) throw assErr

    // Flatten to the format the frontend expects:
    // { employe_id, jour (day-of-month number), shift (shift name) }
    const flatEntries = (assignments || []).map(a => {
      const dayOfMonth = new Date(a.date).getUTCDate()
      return {
        employe_id: a.employe_id,
        jour: dayOfMonth,
        day: dayOfMonth,
        shift: a.shift_code,
        type_shift: a.shift_code,
        heure_debut: a.heure_debut,
        heure_fin: a.heure_fin,
        heures_prevues: a.heures_prevues,
        est_repos: a.est_repos,
      }
    })

    return NextResponse.json({ planning: flatEntries, published, total: flatEntries.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/planning
// Accepts the format sent by the frontend page:
//   { periode: "YYYY-MM", societe_id, planning: [{ employe_id, jour, shift }], publish? }
// Also still supports action-based calls for backwards compatibility.
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ══════════════════════════════════════════════════════════════════════════
    // Frontend save format: { periode, societe_id, planning: entries[], publish? }
    // ══════════════════════════════════════════════════════════════════════════
    if (!action && body.planning && Array.isArray(body.planning)) {
      const { periode, societe_id, planning: entries, publish } = body
      if (!periode || !societe_id) {
        return NextResponse.json({ error: 'periode et societe_id requis' }, { status: 400 })
      }

      const periodeDate = `${periode}-01`

      // Upsert the planning record
      const { data: planningRecord, error: planErr } = await supabase
        .from('plannings')
        .upsert({
          societe_id,
          periode: periodeDate,
          nom: `Planning ${periode}`,
          statut: publish ? 'publie' : 'brouillon',
          created_by: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,periode' })
        .select()
        .single()

      if (planErr) throw planErr

      // Convert frontend entries to DB rows
      // Frontend sends: { employe_id, jour (day number), shift (shift name like "Jour") }
      const rows = entries.map((entry: { employe_id: string; jour: number; shift: string }) => {
        const shiftName = entry.shift || 'Repos'
        const shiftDef = SHIFT_HOURS[shiftName] || SHIFT_HOURS['Repos']
        const dateStr = `${periode}-${String(entry.jour).padStart(2, '0')}`
        return {
          planning_id: planningRecord.id,
          employe_id: entry.employe_id,
          date: dateStr,
          shift_code: shiftName,
          heure_debut: shiftDef.heure_debut || null,
          heure_fin: shiftDef.heure_fin || null,
          heures_prevues: shiftDef.heures_prevues,
          est_repos: shiftDef.est_repos,
        }
      })

      // Batch upsert in chunks to avoid payload limits
      const CHUNK_SIZE = 500
      let totalInserted = 0
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE)
        const { data: inserted, error: insErr } = await supabase
          .from('planning_assignments')
          .upsert(chunk, { onConflict: 'planning_id,employe_id,date' })
          .select()
        if (insErr) throw insErr
        totalInserted += inserted?.length || 0
      }

      // If publishing, update statut
      if (publish && planningRecord.statut !== 'publie') {
        await supabase
          .from('plannings')
          .update({ statut: 'publie' })
          .eq('id', planningRecord.id)
      }

      return NextResponse.json({
        planning: planningRecord,
        nb_saved: totalInserted,
        message: publish ? 'Planning publié' : 'Planning enregistré',
      }, { status: 201 })
    }

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
          created_by: user.id,
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

      const rows = assignments.map((a: { employe_id: string; date: string; shift_code?: string; shift_type?: string; heure_debut?: string; heure_fin?: string; notes?: string }) => {
        const shiftName = a.shift_code || a.shift_type || 'Repos'
        const shiftDef = SHIFT_HOURS[shiftName] || SHIFT_HOURS['Repos']
        return {
          planning_id,
          employe_id: a.employe_id,
          date: a.date,
          shift_code: shiftName,
          heure_debut: a.heure_debut || shiftDef.heure_debut || null,
          heure_fin: a.heure_fin || shiftDef.heure_fin || null,
          heures_prevues: shiftDef.heures_prevues,
          est_repos: shiftDef.est_repos,
          commentaire: a.notes || null,
        }
      })

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
          created_by: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: 'societe_id,periode' })
        .select()
        .single()

      if (planErr) throw planErr

      const pId = planning_id || planning.id

      // Map imported rows to assignments
      const rows = importData.map((row: { employe_id: string; date: string; shift_code?: string; shift_type?: string; heure_debut?: string; heure_fin?: string }) => {
        const shiftName = row.shift_code || row.shift_type || 'Repos'
        const shiftDef = SHIFT_HOURS[shiftName] || SHIFT_HOURS['Repos']
        return {
          planning_id: pId,
          employe_id: row.employe_id,
          date: row.date,
          shift_code: shiftName,
          heure_debut: row.heure_debut || shiftDef.heure_debut || null,
          heure_fin: row.heure_fin || shiftDef.heure_fin || null,
          heures_prevues: shiftDef.heures_prevues,
          est_repos: shiftDef.est_repos,
        }
      })

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
        .update({ statut: 'publie' })
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
