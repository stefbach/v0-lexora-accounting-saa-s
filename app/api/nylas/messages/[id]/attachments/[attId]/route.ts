import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { downloadNylasAttachment, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nylas/messages/[id]/attachments/[attId]?filename=&societe_id=&account_id=
 * Télécharge une pièce jointe d'un email.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attId: string }> }) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id, attId } = await params
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, req.nextUrl.searchParams.get('societe_id'), req.nextUrl.searchParams.get('account_id'))
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  try {
    const { buffer, contentType } = await downloadNylasAttachment(account.grantId, attId, id)
    const filename = (req.nextUrl.searchParams.get('filename') || 'piece-jointe').replace(/[^\w.\-() ]/g, '_')
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur téléchargement' }, { status: 502 })
  }
}
