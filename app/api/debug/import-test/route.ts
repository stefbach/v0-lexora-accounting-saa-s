import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const supabase = getAdminClient()
  const results: Record<string, any> = {}
  const societeId = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'

  // 1. Check dossier exists
  const { data: dossier, error: dossierErr } = await supabase.from('dossiers').select('id').eq('societe_id', societeId).limit(1).maybeSingle()
  results['dossier'] = dossier ? dossier.id : `NOT FOUND: ${dossierErr?.message || 'null'}`

  // 2. Check employes table
  const { data: empCount } = await supabase.from('employes').select('id', { count: 'exact', head: true }).eq('societe_id', societeId)
  results['employes_count'] = empCount

  // 3. Try to insert a test employe
  const { data: testEmp, error: empErr } = await supabase.from('employes').insert({
    societe_id: societeId, nom: 'TEST_DELETE', prenom: 'Test', salaire_base: 10000
  }).select('id').single()
  results['test_employe_insert'] = empErr ? `ERROR: ${empErr.message}` : `OK: ${testEmp?.id}`

  // 4. Try to insert a test bulletin
  if (testEmp) {
    const { data: testBul, error: bulErr } = await supabase.from('bulletins_paie').insert({
      employe_id: testEmp.id, societe_id: societeId, periode: '2025-08-01',
      salaire_base: 10000, salaire_net: 8000, statut: 'valide', source: 'test'
    }).select('id').single()
    results['test_bulletin_insert'] = bulErr ? `ERROR: ${bulErr.message}` : `OK: ${testBul?.id}`

    // 5. Try to insert test ecriture
    if (dossier) {
      const { data: testEcr, error: ecrErr } = await supabase.from('ecritures_comptables').insert({
        dossier_id: dossier.id, date_ecriture: '2025-08-01', journal: 'SAL',
        compte: '641100', libelle: 'TEST SALAIRE', debit: 10000, credit: 0
      }).select('id').single()
      results['test_ecriture_insert'] = ecrErr ? `ERROR: ${ecrErr.message}` : `OK: ${testEcr?.id}`
      if (testEcr) await supabase.from('ecritures_comptables').delete().eq('id', testEcr.id)
    }

    // Cleanup
    if (testBul) await supabase.from('bulletins_paie').delete().eq('id', testBul.id)
    await supabase.from('employes').delete().eq('id', testEmp.id)
    results['cleanup'] = 'done'
  }

  // 6. Check bulletins_paie columns
  const { data: bulCols, error: bulColErr } = await supabase.from('bulletins_paie').select('*').limit(0)
  results['bulletins_table'] = bulColErr ? `ERROR: ${bulColErr.message}` : 'OK'

  // 7. Check if source column exists
  const { error: srcErr } = await supabase.from('bulletins_paie').select('source').limit(1)
  results['source_column'] = srcErr ? `MISSING: ${srcErr.message}` : 'EXISTS'

  return NextResponse.json(results)
}
