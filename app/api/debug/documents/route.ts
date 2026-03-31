import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const supabase = getAdminClient()
  const results: Record<string, unknown> = {}

  // Stéphane Bach's user ID
  const adminId = 'a62ccf45-0f40-4148-b2bf-a4e816240748'
  const societeId = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'

  // 1. Dossiers for admin
  const { data: adminDossiers } = await supabase.from('dossiers').select('id, client_id, societe_id').eq('client_id', adminId)
  results['admin_dossiers'] = adminDossiers || []

  // 2. ALL dossiers for this société
  const { data: societeDossiers } = await supabase.from('dossiers').select('id, client_id, societe_id').eq('societe_id', societeId)
  results['societe_dossiers'] = societeDossiers || []

  // 3. user_societes for admin
  const { data: userSocietes } = await supabase.from('user_societes').select('*').eq('user_id', adminId)
  results['admin_user_societes'] = userSocietes || []

  // 4. All documents count
  const { count: totalDocs } = await supabase.from('documents').select('id', { count: 'exact', head: true })
  results['total_documents'] = totalDocs

  // 5. Documents by dossier
  if (societeDossiers && societeDossiers.length > 0) {
    const dossierIds = societeDossiers.map(d => d.id)
    const { data: docs, count } = await supabase.from('documents').select('id, nom_fichier, type_document, dossier_id, uploaded_by', { count: 'exact' }).in('dossier_id', dossierIds).limit(5)
    results['docs_in_societe_dossiers'] = { count, samples: docs }
  }

  // 6. Documents uploaded by assistants
  const assistantIds = ['963b7f3e-2f6d-4faa-b85a-ee1760c1e024', '53ed107f-a22d-441e-8e55-3d308bc609d0']
  const { data: assistantDocs, count: assistantCount } = await supabase.from('documents').select('id, nom_fichier, dossier_id, uploaded_by', { count: 'exact' }).in('uploaded_by', assistantIds).limit(5)
  results['assistant_docs'] = { count: assistantCount, samples: assistantDocs }

  // 7. Sociétés owned by admin
  const { data: ownedSoc } = await supabase.from('societes').select('id, nom').eq('created_by', adminId)
  results['owned_societes'] = ownedSoc || []

  return NextResponse.json(results)
}
