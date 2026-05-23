/**
 * /api/client/user-api-keys/[id] — révocation d'une clé.
 *
 * DELETE → met revoked_at = NOW(). Soft delete (on garde la ligne pour
 * audit historique). La clé devient inutilisable immédiatement.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin
    .from('user_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)         // garde-fou : seul le propriétaire révoque
    .is('revoked_at', null)         // pas de re-révocation idempotente

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ revoked: true })
}
