import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST() {
  const supabase = getAdminClient()
  const results: string[] = []

  // Find orphan dossiers (dossiers without societe_id or with wrong societe)
  const { data: allDossiers } = await supabase.from('dossiers').select('id, client_id, societe_id')
  const { data: allDocs } = await supabase.from('documents').select('id, dossier_id, uploaded_by, nom_fichier')

  // For each document in an orphan dossier, find the correct dossier
  for (const doc of allDocs || []) {
    const docDossier = (allDossiers || []).find(d => d.id === doc.dossier_id)

    // If dossier has no societe_id, find the uploader's société and move doc
    if (docDossier && !docDossier.societe_id) {
      // Find uploader's société
      const { data: uploaderProfile } = await supabase.from('profiles').select('societe_id').eq('id', doc.uploaded_by).maybeSingle()
      if (uploaderProfile?.societe_id) {
        // Find correct dossier for this société
        const { data: correctDossier } = await supabase.from('dossiers').select('id').eq('societe_id', uploaderProfile.societe_id).limit(1).maybeSingle()
        if (correctDossier && correctDossier.id !== doc.dossier_id) {
          await supabase.from('documents').update({ dossier_id: correctDossier.id }).eq('id', doc.id)
          results.push(`Moved "${doc.nom_fichier}" → dossier ${correctDossier.id}`)
        }
      }
    }

    // If dossier doesn't match any known dossier (orphan doc)
    if (!docDossier) {
      const { data: uploaderProfile } = await supabase.from('profiles').select('societe_id').eq('id', doc.uploaded_by).maybeSingle()
      if (uploaderProfile?.societe_id) {
        const { data: correctDossier } = await supabase.from('dossiers').select('id').eq('societe_id', uploaderProfile.societe_id).limit(1).maybeSingle()
        if (correctDossier) {
          await supabase.from('documents').update({ dossier_id: correctDossier.id }).eq('id', doc.id)
          results.push(`Fixed orphan "${doc.nom_fichier}" → dossier ${correctDossier.id}`)
        }
      }
    }
  }

  // Also: move documents from dossier 2c9677e9 to 6793927d (DDS)
  const { data: movedDirect, error: moveErr } = await supabase.from('documents')
    .update({ dossier_id: '6793927d-8406-4218-a67b-a66da2ea533a' })
    .eq('dossier_id', '2c9677e9-4394-4cf6-9dac-51ecf3d31d15')
    .select('id')

  if (!moveErr && movedDirect) {
    results.push(`Direct move: ${movedDirect.length} documents from assistant dossier to DDS dossier`)
  }

  return NextResponse.json({ fixed: results.length, results })
}
