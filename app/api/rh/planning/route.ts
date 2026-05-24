import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToSociete } from '@/lib/rh/access'

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
    // ?merge_leaves=1 : fusionne les congés approuvés du mois dans les
    // assignments côté serveur. Chaque assignment couvert par un congé
    // approuvé reçoit un champ `type_conge` (AL, SL, UL, …). Utile pour
    // l'espace salarié qui veut afficher un planning unifié.
    const mergeLeaves = searchParams.get('merge_leaves') === '1'

    if (!societe_id) {
      // Régression hotfix — auparavant on renvoyait 400 si societe_id
      // manquait. Plusieurs callers (notamment le polling de l'UI) tirent
      // l'API sans avoir encore résolu la société (init), provoquant un
      // 400 visible dans la console. On retourne maintenant une réponse
      // vide cohérente qui ne casse pas le rendu et laisse le client
      // recharger quand societe_id sera disponible.
      return NextResponse.json({ planning: [], published: false, total: 0, error: 'societe_id requis' })
    }

    // Multi-tenant OR self-service: verify user has access
    const hasAccess = await userHasAccessToSociete(user.id, societe_id)
    // Sprint 10 BUG 5 — si l'user est un employé self-service (pas RH/admin),
    // on NE doit retourner QUE les plannings publiés. Les brouillons RH ne
    // doivent pas fuiter côté /salarie.
    let selfServiceOnly = false
    if (!hasAccess) {
      // Self-service fallback: check if user is an employee of this société
      const { data: selfEmp } = await supabase
        .from('employes')
        .select('id')
        .eq('societe_id', societe_id)
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email || 'NONE'}`)
        .is('date_depart', null)
        .maybeSingle()
      if (!selfEmp) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }
      selfServiceOnly = true
    }

    // Find the planning for this societe + periode
    let planningQuery = supabase
      .from('plannings')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })

    // Sprint 10 BUG 5 — employé self-service : uniquement plannings publiés
    if (selfServiceOnly) {
      planningQuery = planningQuery.eq('statut', 'publie')
    }

    if (periode) {
      // periode can be "2026-04" or "2026-04-01" — try both formats
      const periodeWithDay = periode.length === 7 ? `${periode}-01` : periode
      const periodeShort = periode.slice(0, 7)
      planningQuery = planningQuery.or(`periode.eq.${periodeWithDay},periode.eq.${periodeShort}`)
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

    // Build leave-by-date index if merge_leaves=1. On prend tous les congés
    // approuvés qui chevauchent la période, et on marque chaque (employe_id, date)
    // avec le type_conge. Si plusieurs congés chevauchent le même jour (cas
    // limite), le premier trouvé gagne — l'UI doit traiter un seul type/jour.
    const leaveByKey: Record<string, string> = {}
    if (mergeLeaves && periode) {
      const periodeWithDay = periode.length === 7 ? `${periode}-01` : periode
      const ymShort = periode.slice(0, 7)
      const monthStart = `${ymShort}-01`
      const [y, m] = ymShort.split('-').map(n => parseInt(n, 10))
      const lastDay = new Date(y, m, 0).getDate()
      const monthEnd = `${ymShort}-${String(lastDay).padStart(2, '0')}`

      const employeIds = [...new Set((assignments || []).map(a => a.employe_id))]
      if (employeIds.length > 0) {
        // Les congés approuvés qui débordent sur ce mois (début ≤ fin du mois ET fin ≥ début du mois)
        const { data: leaves } = await supabase
          .from('demandes_conges')
          .select('employe_id, type_conge, date_debut, date_fin')
          .in('employe_id', employeIds)
          .eq('statut', 'approuve')
          .lte('date_debut', monthEnd)
          .gte('date_fin', monthStart)

        for (const l of leaves || []) {
          const start = String(l.date_debut).slice(0, 10)
          const end = String(l.date_fin).slice(0, 10)
          const from = start < monthStart ? monthStart : start
          const to = end > monthEnd ? monthEnd : end
          // Itération jour par jour, bornée à ~31 par congé (coût négligeable).
          const cursor = new Date(from + 'T12:00:00')
          const stop = new Date(to + 'T12:00:00')
          while (cursor <= stop) {
            const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
            const key = `${l.employe_id}|${iso}`
            if (!leaveByKey[key]) leaveByKey[key] = l.type_conge
            cursor.setDate(cursor.getDate() + 1)
          }
        }
      }
    }

    // Flatten to the format the frontend expects:
    // { employe_id, jour (day-of-month number), shift (shift name) }
    const flatEntries = (assignments || []).map(a => {
      const dayOfMonth = new Date(a.date).getUTCDate()
      const isoDate = typeof a.date === 'string' ? a.date.slice(0, 10) : new Date(a.date).toISOString().slice(0, 10)
      const leaveKey = `${a.employe_id}|${isoDate}`
      const type_conge = mergeLeaves ? (leaveByKey[leaveKey] || null) : undefined
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
        ...(mergeLeaves ? { type_conge } : {}),
      }
    })

    return NextResponse.json({ planning: flatEntries, published, total: flatEntries.length })
  } catch (e: any) {
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

      // Multi-tenant: verify user has access to this société
      const hasAccessSave = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccessSave) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })

      const periodeDate = `${periode}-01`

      // Find or create the planning record
      let planningRecord: any = null

      // First try to find existing planning
      const { data: existing } = await supabase
        .from('plannings')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('periode', periodeDate)
        .maybeSingle()

      if (existing) {
        // Update existing planning
        const { data: updated, error: upErr } = await supabase
          .from('plannings')
          .update({
            statut: publish ? 'publie' : existing.statut,
            nom: `Planning ${periode}`,
          })
          .eq('id', existing.id)
          .select()
          .single()
        if (upErr) throw upErr
        planningRecord = updated
      } else {
        // Create new planning
        const { data: created, error: crErr } = await supabase
          .from('plannings')
          .insert({
            societe_id,
            periode: periodeDate,
            nom: `Planning ${periode}`,
            statut: publish ? 'publie' : 'brouillon',
            created_by: user.id,
          })
          .select()
          .single()
        if (crErr) throw crErr
        planningRecord = created
      }

      if (!planningRecord) throw new Error('Impossible de créer/trouver le planning')

      // Convert frontend entries to DB rows
      // Frontend sends: { employe_id, jour, shift, creneau_id, heure_debut, heure_fin, heures_prevues }
      const rows = entries.map((entry: any) => {
        const shiftName = entry.shift || 'Repos'
        const isRepos = shiftName === 'Repos' || entry.creneau_id === 'repos'
        const shiftDef = SHIFT_HOURS[shiftName] || SHIFT_HOURS['Repos']
        const dateStr = `${periode}-${String(entry.jour).padStart(2, '0')}`
        return {
          planning_id: planningRecord.id,
          employe_id: entry.employe_id,
          date: dateStr,
          shift_code: shiftName,
          heure_debut: entry.heure_debut || shiftDef.heure_debut || null,
          heure_fin: entry.heure_fin || shiftDef.heure_fin || null,
          heures_prevues: entry.heures_prevues || shiftDef.heures_prevues || 0,
          est_repos: isRepos,
        }
      })

      // Bug critique — Le DELETE+INSERT global wipe TOUS les assignments
      // du planning, ce qui combiné au filtre UI "Collaborateurs"
      // (qui n'envoie au backend que les employés visibles) effaçait
      // les assignments des employés non-filtrés. Cas Mégane : filtre
      // sur Wendy → save → 407 assignments DDS Avril réduits à 27.
      //
      // Fix : DELETE ciblé sur les seuls employe_id présents dans le
      // payload. Si l'utilisateur sauve avec 1 seul employé visible,
      // on remplace UNIQUEMENT ses assignments, les autres restent
      // intacts. Le filtre UI redevient un filtre d'affichage pur,
      // sans side-effect destructif côté DB.
      const employeIdsInPayload = [...new Set(rows.map((r: any) => r.employe_id))]
      if (employeIdsInPayload.length === 0) {
        // Garde-fou : payload vide → ne rien faire (avant ce patch,
        // un payload vide aurait wipé tout le planning).
        return NextResponse.json({
          success: true,
          inserted: 0,
          message: 'Aucun assignment dans le payload — rien à sauvegarder.',
        })
      }
      // Monitoring : warn si > 200 deletes en une seule opération.
      // Permet de détecter une régression future qui réintroduirait un
      // wipe massif (sans bloquer l'usage normal multi-employés).
      const { count: nbAssignmentsToDelete } = await supabase
        .from('planning_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('planning_id', planningRecord.id)
        .in('employe_id', employeIdsInPayload)
      if ((nbAssignmentsToDelete || 0) > 200) {
        console.warn(
          `[planning POST] bulk delete ${nbAssignmentsToDelete} assignments `
          + `for planning=${planningRecord.id} (${employeIdsInPayload.length} employés). `
          + `Si inattendu, vérifier que le front n'envoie pas un wipe massif.`,
        )
      }
      const { error: delErr } = await supabase.from('planning_assignments')
        .delete()
        .eq('planning_id', planningRecord.id)
        .in('employe_id', employeIdsInPayload)
      if (delErr) {
        console.error('[planning POST] delete error:', delErr.message)
        return NextResponse.json({ error: `Erreur suppression: ${delErr.message}` }, { status: 500 })
      }

      // Batch insert in chunks to avoid payload limits
      const CHUNK_SIZE = 500
      let totalInserted = 0
      const insertErrors: string[] = []
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE)
        const { data: inserted, error: insErr } = await supabase
          .from('planning_assignments')
          .insert(chunk)
          .select()
        if (insErr) {
          console.error('[planning POST] insert error:', insErr.message, 'chunk size:', chunk.length, 'first row:', JSON.stringify(chunk[0]))
          insertErrors.push(insErr.message)
        }
        totalInserted += inserted?.length || 0
      }
      if (insertErrors.length > 0 && totalInserted === 0) {
        return NextResponse.json({ error: `Erreur sauvegarde: ${insertErrors[0]}` }, { status: 500 })
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

      // Multi-tenant: verify user has access to this société
      const hasAccessCreate = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccessCreate) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })

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

      // Multi-tenant: verify user has access to this société
      const hasAccessImport = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccessImport) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })

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
  } catch (e: any) {
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
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
