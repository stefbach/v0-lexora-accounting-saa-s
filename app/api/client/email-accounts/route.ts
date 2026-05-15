import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { encryptSecret } from '@/lib/crypto/symmetric'

/**
 * Comptes email multi-tenant.
 *
 * GET    ?societe_id=X     → liste tous les comptes visibles à l'user
 *                            (société + ses comptes perso)
 * POST   ?societe_id=X     → crée un compte (body = config)
 *                            societe_id-only requires direction/admin role,
 *                            personal account allowed for any member.
 * PATCH  ?id=Y             → met à jour un compte
 * DELETE ?id=Y             → supprime
 */

const ALLOWED_PROVIDERS = ['smtp', 'resend', 'gmail_oauth'] as const
const SOCIETE_ROLES = ['direction', 'client_admin', 'admin', 'super_admin']

async function getCallerContext(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  return { user, supabase }
}

function publicFields(row: any) {
  if (!row) return null
  return {
    id: row.id,
    societe_id: row.societe_id,
    user_id: row.user_id,
    label: row.label,
    from_email: row.from_email,
    from_name: row.from_name,
    reply_to: row.reply_to,
    provider: row.provider,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
    smtp_user: row.smtp_user,
    has_smtp_password: !!row.smtp_password_enc,
    has_resend_key: !!row.resend_api_key_enc,
    resend_domain: row.resend_domain,
    is_default_for_user: row.is_default_for_user,
    is_default_for_societe: row.is_default_for_societe,
    active: row.active,
    last_used_at: row.last_used_at,
    last_test_at: row.last_test_at,
    last_test_status: row.last_test_status,
    last_test_error: row.last_test_error,
    use_count: row.use_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function GET(req: NextRequest) {
  const c = await getCallerContext(req)
  if ('error' in c) return c.error
  const { user, supabase } = c
  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  const admin = getAdminClient()
  const { data } = await admin
    .from('email_accounts')
    .select('*')
    .eq('societe_id', societeId)
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('is_default_for_societe', { ascending: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({ accounts: (data || []).map(publicFields) })
}

export async function POST(req: NextRequest) {
  const c = await getCallerContext(req)
  if ('error' in c) return c.error
  const { user, supabase } = c
  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  await assertSocieteAccess(supabase, user.id, societeId)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

  const provider = String(body.provider || '')
  if (!ALLOWED_PROVIDERS.includes(provider as any)) {
    return NextResponse.json({ error: `provider doit être ${ALLOWED_PROVIDERS.join(' | ')}` }, { status: 400 })
  }
  const isPersonal = !!body.personal
  const fromEmail = String(body.from_email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return NextResponse.json({ error: 'from_email invalide' }, { status: 400 })
  }

  // Permission : un compte société-wide requiert un rôle direction+
  if (!isPersonal) {
    const { data: us } = await supabase.from('user_societes').select('role')
      .eq('user_id', user.id).eq('societe_id', societeId).maybeSingle()
    if (!SOCIETE_ROLES.includes(us?.role || '')) {
      return NextResponse.json({ error: 'Compte société-wide réservé à direction/admin' }, { status: 403 })
    }
  }

  const row: Record<string, any> = {
    societe_id: societeId,
    user_id: isPersonal ? user.id : null,
    label: String(body.label || 'Sans nom').slice(0, 80),
    from_email: fromEmail,
    from_name: body.from_name ? String(body.from_name).slice(0, 80) : null,
    reply_to: body.reply_to ? String(body.reply_to) : null,
    provider,
    is_default_for_user: !!body.is_default_for_user && isPersonal,
    is_default_for_societe: !!body.is_default_for_societe && !isPersonal,
    active: body.active !== false,
    created_by: user.id,
  }

  try {
    if (provider === 'smtp') {
      if (!body.smtp_host || !body.smtp_port || !body.smtp_user || !body.smtp_password) {
        return NextResponse.json({ error: 'smtp_host, smtp_port, smtp_user, smtp_password requis' }, { status: 400 })
      }
      row.smtp_host = String(body.smtp_host)
      row.smtp_port = Number(body.smtp_port)
      row.smtp_secure = body.smtp_secure !== false
      row.smtp_user = String(body.smtp_user)
      row.smtp_password_enc = encryptSecret(String(body.smtp_password))
    } else if (provider === 'resend') {
      if (!body.resend_api_key || !body.resend_domain) {
        return NextResponse.json({ error: 'resend_api_key et resend_domain requis' }, { status: 400 })
      }
      row.resend_api_key_enc = encryptSecret(String(body.resend_api_key))
      row.resend_domain = String(body.resend_domain)
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Chiffrement impossible : ${e.message}. Configure CRYPT_KEY.` }, { status: 500 })
  }

  const admin = getAdminClient()

  // Si is_default → reset l'ancien default
  if (row.is_default_for_societe) {
    await admin.from('email_accounts').update({ is_default_for_societe: false })
      .eq('societe_id', societeId).is('user_id', null).eq('is_default_for_societe', true)
  }
  if (row.is_default_for_user) {
    await admin.from('email_accounts').update({ is_default_for_user: false })
      .eq('societe_id', societeId).eq('user_id', user.id).eq('is_default_for_user', true)
  }

  const { data, error } = await admin.from('email_accounts').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ account: publicFields(data) })
}

export async function PATCH(req: NextRequest) {
  const c = await getCallerContext(req)
  if ('error' in c) return c.error
  const { user, supabase } = c
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: existing } = await admin.from('email_accounts').select('*').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  await assertSocieteAccess(supabase, user.id, existing.societe_id)

  if (existing.user_id && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Tu ne peux modifier que tes propres comptes perso' }, { status: 403 })
  }
  if (!existing.user_id) {
    const { data: us } = await supabase.from('user_societes').select('role')
      .eq('user_id', user.id).eq('societe_id', existing.societe_id).maybeSingle()
    if (!SOCIETE_ROLES.includes(us?.role || '')) {
      return NextResponse.json({ error: 'Modification compte société réservée à direction/admin' }, { status: 403 })
    }
  }

  const updates: Record<string, any> = {}
  for (const k of ['label', 'from_email', 'from_name', 'reply_to', 'active', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'resend_domain']) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  try {
    if (body.smtp_password) updates.smtp_password_enc = encryptSecret(String(body.smtp_password))
    if (body.resend_api_key) updates.resend_api_key_enc = encryptSecret(String(body.resend_api_key))
  } catch (e: any) {
    return NextResponse.json({ error: `Chiffrement impossible : ${e.message}` }, { status: 500 })
  }

  // Handle default toggles
  if (typeof body.is_default_for_societe === 'boolean' && !existing.user_id) {
    if (body.is_default_for_societe) {
      await admin.from('email_accounts').update({ is_default_for_societe: false })
        .eq('societe_id', existing.societe_id).is('user_id', null).eq('is_default_for_societe', true)
    }
    updates.is_default_for_societe = body.is_default_for_societe
  }
  if (typeof body.is_default_for_user === 'boolean' && existing.user_id) {
    if (body.is_default_for_user) {
      await admin.from('email_accounts').update({ is_default_for_user: false })
        .eq('societe_id', existing.societe_id).eq('user_id', existing.user_id).eq('is_default_for_user', true)
    }
    updates.is_default_for_user = body.is_default_for_user
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const { data, error } = await admin.from('email_accounts').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ account: publicFields(data) })
}

export async function DELETE(req: NextRequest) {
  const c = await getCallerContext(req)
  if ('error' in c) return c.error
  const { user, supabase } = c
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const admin = getAdminClient()
  const { data: existing } = await admin.from('email_accounts').select('societe_id, user_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  await assertSocieteAccess(supabase, user.id, existing.societe_id)

  if (existing.user_id && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Tu ne peux supprimer que tes propres comptes perso' }, { status: 403 })
  }
  if (!existing.user_id) {
    const { data: us } = await supabase.from('user_societes').select('role')
      .eq('user_id', user.id).eq('societe_id', existing.societe_id).maybeSingle()
    if (!SOCIETE_ROLES.includes(us?.role || '')) {
      return NextResponse.json({ error: 'Suppression compte société réservée à direction/admin' }, { status: 403 })
    }
  }

  const { error } = await admin.from('email_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
