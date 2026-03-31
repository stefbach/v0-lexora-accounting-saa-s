import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = getAdminClient()
  const results: Record<string, unknown> = {}

  // 1. Check pointages table columns
  const { data: cols, error: colErr } = await supabase.from('pointages').select('*').limit(0)
  if (colErr) {
    results['pointages_table'] = `ERROR: ${colErr.message}`
  } else {
    results['pointages_table'] = 'OK'
  }

  // 2. Try to get column info by inserting/selecting
  const testCols = ['heure_entree', 'heure_sortie', 'date_pointage', 'employe_id', 'statut_jour', 'duree_minutes', 'notes', 'type_entree']
  for (const col of testCols) {
    const { error } = await supabase.from('pointages').select(col).limit(1)
    results[`col_${col}`] = error ? `MISSING: ${error.message}` : 'EXISTS'
  }

  // 3. Get one employe
  const { data: emp } = await supabase.from('employes').select('id, nom, prenom, societe_id').limit(1).single()
  results['sample_employe'] = emp ? `${emp.prenom} ${emp.nom} (societe: ${emp.societe_id})` : 'NO EMPLOYEES'

  if (emp) {
    // 4. Try to insert a test pointage
    const testDate = '2099-12-31'
    const { data: inserted, error: insErr } = await supabase.from('pointages').insert({
      employe_id: emp.id,
      date_pointage: testDate,
      heure_entree: '08:30:00',
    }).select().single()

    if (insErr) {
      results['test_insert'] = `FAILED: ${insErr.message}`

      // Try without any optional columns
      const { data: ins2, error: ins2Err } = await supabase.from('pointages').insert({
        employe_id: emp.id,
        date_pointage: testDate,
        heure_entree: '08:30:00',
      }).select('id, employe_id, date_pointage, heure_entree, heure_sortie').single()

      results['test_insert_minimal'] = ins2Err ? `ALSO FAILED: ${ins2Err.message}` : `OK: ${JSON.stringify(ins2)}`

      if (ins2) {
        await supabase.from('pointages').delete().eq('id', ins2.id)
        results['test_cleanup'] = 'DELETED'
      }
    } else {
      results['test_insert'] = `OK: id=${inserted.id}, heure_entree=${inserted.heure_entree}`
      results['test_insert_full'] = JSON.stringify(inserted)

      // 5. Try to read it back
      const { data: readBack, error: readErr } = await supabase.from('pointages')
        .select('*')
        .eq('id', inserted.id)
        .single()
      results['test_read'] = readErr ? `FAILED: ${readErr.message}` : `OK: heure_entree=${readBack?.heure_entree}`

      // 6. Try update (add sortie)
      const { data: updated, error: updErr } = await supabase.from('pointages')
        .update({ heure_sortie: '17:00:00' })
        .eq('id', inserted.id)
        .select()
        .single()
      results['test_update'] = updErr ? `FAILED: ${updErr.message}` : `OK: sortie=${updated?.heure_sortie}`

      // Cleanup
      await supabase.from('pointages').delete().eq('id', inserted.id)
      results['test_cleanup'] = 'DELETED'
    }

    // 7. Check today's actual pointages
    const today = new Date().toISOString().split('T')[0]
    const { data: todayP, error: todayErr } = await supabase.from('pointages')
      .select('id, employe_id, date_pointage, heure_entree, heure_sortie')
      .eq('date_pointage', today)
      .limit(5)
    results['today_pointages'] = todayErr ? `ERROR: ${todayErr.message}` : `${(todayP || []).length} records: ${JSON.stringify(todayP)}`
  }

  return NextResponse.json(results)
}
