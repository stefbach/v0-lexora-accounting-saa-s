import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasMessages, listNylasFolders, isNylasConfigured, type MailFolder } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nylas/messages?societe_id=&q=&limit=&page_token=&folder=&unread=&folders=1
 * Liste les messages + les analyses IA en cache (badges). Avec folders=1,
 * renvoie aussi la liste des dossiers.
 */
export async function GET(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, sp.get('societe_id'), sp.get('account_id'))
  if (!account) return NextResponse.json({ account: null, messages: [] })

  try {
    // Vue Envoyés : on résout le dossier "sent" via ses attributs.
    let folderId = sp.get('folder') || undefined
    const box = sp.get('box')
    let allFolders: MailFolder[] | undefined
    if (box === 'sent' || sp.get('folders') === '1') {
      allFolders = await listNylasFolders(account.grantId).catch(() => [])
      if (box === 'sent') {
        const sent = allFolders.find((f) => (f.attributes || []).some((a) => /sent/i.test(a)) || /sent|envoy/i.test(f.name))
        folderId = sent?.id || folderId
      }
    }

    // Période : received_after en epoch secondes.
    const days = Number(sp.get('days')) || 0
    const receivedAfter = days > 0 ? Math.floor(Date.now() / 1000) - days * 86400 : undefined

    const { data, nextCursor } = await listNylasMessages(account.grantId, {
      limit: Math.min(Number(sp.get('limit')) || 30, 50),
      pageToken: sp.get('page_token') || undefined,
      q: sp.get('q') || undefined,
      folderId,
      unread: sp.get('unread') === '1' ? true : undefined,
      receivedAfter,
    })
    const folders = sp.get('folders') === '1' ? allFolders : undefined

    // Analyses IA déjà en cache pour ces messages → badges immédiats.
    const ids = data.map((m) => m.id)
    let analyses: Record<string, unknown> = {}
    if (ids.length) {
      const { data: cached } = await admin
        .from('nylas_message_analysis')
        .select('message_id, category, priority, needs_reply, summary, suggested_action')
        .eq('user_id', user.id)
        .in('message_id', ids)
      analyses = Object.fromEntries((cached || []).map((c: { message_id: string }) => [c.message_id, c]))
    }

    return NextResponse.json({ account: { id: account.id, email: account.account_email }, messages: data, nextCursor, analyses, folders })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur lecture Nylas' }, { status: 502 })
  }
}
