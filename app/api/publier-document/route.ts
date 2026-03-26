import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  const supabase = getAdminClient()

  try {
    const { document_id, publie_client } = await request.json()

    if (!document_id || publie_client === undefined) {
      return NextResponse.json({ error: 'document_id et publie_client requis' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update({
        publie_client,
        date_publication: publie_client ? new Date().toISOString() : null,
      })
      .eq('id', document_id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
