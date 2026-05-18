import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

/**
 * POST /api/client/telegram-permissions/employee-code
 *
 * Génère un code de liaison Telegram pour un employé sur demande d'un admin.
 *
 * Body : { societe_id, employe_id }
 *
 * Flow :
 *  1. Vérifie que le caller est admin/direction/client_admin de la société
 *  2. Récupère l'employé, vérifie qu'il appartient bien à la société
 *  3. Si l'employé n'a pas d'auth_user_id : créer un user Supabase (invite par email)
 *     et lier `employes.auth_user_id` + `profiles.employe_id`. Email obligatoire dans ce cas.
 *  4. (Re)génère un code Telegram via RPC `telegram_generate_verification_code`
 *  5. Retourne code + deep link + message prêt à copier-coller pour l'employé
 *
 * Garde-fous :
 *  - L'employé doit appartenir à la société active
 *  - Si déjà lié et vérifié, retourne 409 (utiliser DELETE pour délier d'abord)
 *  - Email valide requis pour créer un user
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const societeId: string | undefined = body?.societe_id
  const employeId: string | undefined = body?.employe_id
  const desiredRole: string | undefined = body?.role
  // Capabilities personnalisées à appliquer à l'INSERT/UPDATE user_societes.
  // null/undefined → utilise les caps par défaut du rôle.
  const desiredCaps: string[] | null | undefined =
    body?.capabilities === null
      ? null
      : Array.isArray(body?.capabilities)
        ? body.capabilities.map((c: any) => String(c))
        : undefined

  if (!societeId || !employeId) {
    return NextResponse.json({ error: 'societe_id et employe_id requis' }, { status: 400 })
  }
  await assertSocieteAccess(supabase, user.id, societeId)

  // Vérifier rôle du caller
  const { data: caller } = await supabase
    .from('user_societes')
    .select('role')
    .eq('user_id', user.id)
    .eq('societe_id', societeId)
    .maybeSingle()
  const callerRole = caller?.role || ''
  if (!['admin', 'super_admin', 'direction', 'client_admin', 'rh'].includes(callerRole)) {
    return NextResponse.json({ error: 'Accès refusé. Rôle direction, RH ou admin requis.' }, { status: 403 })
  }

  const admin = getAdminClient()

  // Récupérer l'employé
  const { data: emp, error: empErr } = await admin
    .from('employes')
    .select('id, societe_id, prenom, nom, email, auth_user_id, date_depart')
    .eq('id', employeId)
    .maybeSingle()
  if (empErr || !emp) {
    return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })
  }
  if (emp.societe_id !== societeId) {
    return NextResponse.json({ error: 'Employé hors société active' }, { status: 403 })
  }
  if (emp.date_depart) {
    return NextResponse.json({ error: 'Employé non actif (date_depart renseignée)' }, { status: 400 })
  }

  // 1. S'assurer qu'un auth user existe pour cet employé
  let authUserId = emp.auth_user_id as string | null
  if (!authUserId) {
    if (!emp.email) {
      return NextResponse.json({
        error: `Email manquant pour ${emp.prenom} ${emp.nom}. Ajoute son email dans sa fiche RH avant de générer le code.`,
      }, { status: 400 })
    }
    // Chercher d'abord un user existant avec ce mail
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', emp.email.toLowerCase())
      .maybeSingle()
    if (existingProfile?.id) {
      authUserId = existingProfile.id
    } else {
      // Créer via Supabase Auth Admin (invite email)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: emp.email,
        email_confirm: false, // l'employé recevra un email d'invitation à confirmer
        user_metadata: { full_name: `${emp.prenom} ${emp.nom}`.trim(), source: 'telegram_employee_link' },
      })
      if (createErr || !created?.user?.id) {
        return NextResponse.json({
          error: `Création du compte Lexora échouée : ${createErr?.message || 'inconnu'}`,
        }, { status: 500 })
      }
      authUserId = created.user.id
      // Best-effort : créer le profil aussi
      await admin.from('profiles').insert({
        id: authUserId,
        email: emp.email,
        full_name: `${emp.prenom} ${emp.nom}`.trim(),
        role: 'employe',
      }).then(() => {}, () => {})
    }
    // Lier employes.auth_user_id (trigger sync_employe_profile mettra à jour profiles.employe_id)
    await admin.from('employes').update({ auth_user_id: authUserId }).eq('id', employeId)
  }

  // 2. S'assurer que l'utilisateur est listé dans user_societes pour cette société
  // + appliquer le rôle et les capabilities pré-configurées par l'admin.
  const { data: existingMembership } = await admin
    .from('user_societes')
    .select('role')
    .eq('user_id', authUserId)
    .eq('societe_id', societeId)
    .maybeSingle()

  const insertOrUpdatePayload: Record<string, unknown> = {}
  if (desiredRole) insertOrUpdatePayload.role = desiredRole
  // capabilities seulement si on a un override explicite. desiredCaps === undefined
  // signifie "ne touche pas" — on garde le défaut (NULL = caps du rôle).
  if (desiredCaps !== undefined) insertOrUpdatePayload.telegram_capabilities = desiredCaps

  if (!existingMembership) {
    const insertBase: Record<string, unknown> = {
      user_id: authUserId,
      societe_id: societeId,
      role: desiredRole || 'employe',
    }
    if (desiredCaps !== undefined) insertBase.telegram_capabilities = desiredCaps
    const ins = await admin.from('user_societes').insert(insertBase)
    if (ins.error && /telegram_capabilities/i.test(ins.error.message || '')) {
      // Migration 266 non appliquée → fallback sans la colonne (le rôle seul est attribué)
      delete insertBase.telegram_capabilities
      await admin.from('user_societes').insert(insertBase).then(() => {}, () => {})
    }
  } else if (Object.keys(insertOrUpdatePayload).length > 0) {
    const upd = await admin.from('user_societes').update(insertOrUpdatePayload)
      .eq('user_id', authUserId)
      .eq('societe_id', societeId)
    if (upd.error && /telegram_capabilities/i.test(upd.error.message || '')) {
      const cleaned = { ...insertOrUpdatePayload }
      delete cleaned.telegram_capabilities
      if (Object.keys(cleaned).length > 0) {
        await admin.from('user_societes').update(cleaned)
          .eq('user_id', authUserId)
          .eq('societe_id', societeId)
      }
    }
  }

  // 3. Vérifier que l'employé n'est pas déjà lié et vérifié
  const { data: alreadyLinked } = await admin
    .from('telegram_users')
    .select('chat_id, verified, telegram_username')
    .eq('user_id', authUserId)
    .eq('verified', true)
    .maybeSingle()
  if (alreadyLinked) {
    return NextResponse.json({
      error: `Cet employé est déjà lié à Telegram (@${alreadyLinked.telegram_username || 'compte lié'}). Délie-le d'abord pour générer un nouveau code.`,
      already_linked: true,
    }, { status: 409 })
  }

  // 4. Générer le code via RPC
  const { data: code, error: codeErr } = await admin.rpc('telegram_generate_verification_code', { p_user_id: authUserId })
  if (codeErr || !code) {
    return NextResponse.json({
      error: `Génération du code échouée : ${codeErr?.message || 'inconnu'}`,
    }, { status: 500 })
  }

  // 5. Audit trace
  await admin.from('telegram_actions').insert({
    chat_id: 0,
    user_id: user.id,
    societe_id: societeId,
    intent: 'admin.employee_code_generated',
    payload: { target_user_id: authUserId, employe_id: employeId, code },
    status: 'success',
  }).then(() => {}, () => {})

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'LexoraBot'
  const deepLink = `https://t.me/${botUsername}?start=${code}`
  const message = `Bonjour ${emp.prenom},\n\nPour activer Lexora Bot sur Telegram :\n1. Ouvre Telegram et cherche @${botUsername}\n2. Tape exactement : /start ${code}\n\n(ou clique sur ce lien depuis ton téléphone : ${deepLink})\n\nLe code expire dans 15 minutes.`

  return NextResponse.json({
    ok: true,
    code,
    deep_link: deepLink,
    expires_in_minutes: 15,
    bot_username: botUsername,
    employee: {
      id: employeId,
      nom_complet: `${emp.prenom} ${emp.nom}`.trim(),
      email: emp.email,
      auth_user_id: authUserId,
    },
    share_message: message,
  })
}

/**
 * DELETE /api/client/telegram-permissions/employee-code?societe_id=X&employe_id=Y
 *
 * Délie l'employé de Telegram (supprime telegram_users + audit).
 * L'admin peut faire ça pour régénérer un code ou révoquer un accès.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const societeId = req.nextUrl.searchParams.get('societe_id')
  const employeId = req.nextUrl.searchParams.get('employe_id')
  if (!societeId || !employeId) {
    return NextResponse.json({ error: 'societe_id et employe_id requis' }, { status: 400 })
  }
  await assertSocieteAccess(supabase, user.id, societeId)

  const { data: caller } = await supabase
    .from('user_societes').select('role')
    .eq('user_id', user.id).eq('societe_id', societeId).maybeSingle()
  if (!['admin', 'super_admin', 'direction', 'client_admin', 'rh'].includes(caller?.role || '')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const admin = getAdminClient()
  const { data: emp } = await admin
    .from('employes').select('societe_id, auth_user_id, prenom, nom')
    .eq('id', employeId).maybeSingle()
  if (!emp || emp.societe_id !== societeId || !emp.auth_user_id) {
    return NextResponse.json({ error: 'Employé non lié' }, { status: 404 })
  }

  await admin.from('telegram_users').delete().eq('user_id', emp.auth_user_id)

  await admin.from('telegram_actions').insert({
    chat_id: 0, user_id: user.id, societe_id: societeId,
    intent: 'admin.employee_telegram_unlinked',
    payload: { employe_id: employeId, target_user_id: emp.auth_user_id },
    status: 'success',
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true })
}
