import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { testEmailAccount, checkResendDomainStatus, type EmailAccount } from '@/lib/email/router'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

/**
 * POST /api/client/email-accounts/test?id=Y
 * Envoie un email de test à l'adresse from_email du compte pour valider la config.
 * Auth multi-mode : session web, X-Internal-Token (Telegram), X-Lexora-Api-Key.
 */
export async function POST(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: acc } = await admin.from('email_accounts').select('*').eq('id', id).maybeSingle()
  if (!acc) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  await assertSocieteAccess(admin, user.id, acc.societe_id)
  if (acc.user_id && acc.user_id !== user.id) {
    return NextResponse.json({ error: 'Pas autorisé sur ce compte' }, { status: 403 })
  }

  // Pour Resend, on vérifie d'abord l'état du domaine (DKIM/SPF) : si le domaine
  // n'est pas "verified", l'envoi échouera — autant le diagnostiquer clairement.
  const domainStatus = await checkResendDomainStatus(acc as EmailAccount)

  const result = await testEmailAccount(acc as EmailAccount)
  await admin.from('email_accounts').update({
    last_test_at: new Date().toISOString(),
    last_test_status: result.ok ? 'success' : 'failed',
    last_test_error: result.ok ? null : (result.error || domainStatus.message || 'inconnu'),
  }).eq('id', id)

  return NextResponse.json({ ...result, domain_status: domainStatus }, { status: result.ok ? 200 : 500 })
}
