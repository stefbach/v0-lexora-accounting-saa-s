import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { encryptSecret } from '@/lib/crypto/symmetric'

/**
 * GET  /api/client/direction/bank-credentials?societe_id=X
 *   → liste tous les comptes_bancaires de la société + leur statut credentials/scrape
 *
 * PUT  /api/client/direction/bank-credentials?compte_id=Y
 *   Body : { username?, password?, secondary_pin?, notes?, active? }
 *   Tous les secrets sont chiffrés AES-256-GCM avant stockage.
 *
 * Accès : direction / client_admin / admin / super_admin uniquement.
 */
const SOCIETE_ROLES = ['direction', 'client_admin', 'admin', 'super_admin']

async function assertCallerIsDirection(req: NextRequest, societeIdFromQuery?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  if (!societeIdFromQuery) return { error: NextResponse.json({ error: 'societe_id requis' }, { status: 400 }) }
  await assertSocieteAccess(supabase, user.id, societeIdFromQuery)
  const { data: us } = await supabase
    .from('user_societes').select('role')
    .eq('user_id', user.id).eq('societe_id', societeIdFromQuery).maybeSingle()
  if (!SOCIETE_ROLES.includes(us?.role || '')) {
    return { error: NextResponse.json({ error: 'Accès réservé à la direction' }, { status: 403 }) }
  }
  return { user }
}

export async function GET(req: NextRequest) {
  const societeId = req.nextUrl.searchParams.get('societe_id') || ''
  const c = await assertCallerIsDirection(req, societeId)
  if ('error' in c) return c.error

  const admin = getAdminClient()
  const { data: comptes } = await admin
    .from('comptes_bancaires')
    .select('id, banque, numero_compte, intitule, devise, solde_actuel, actif')
    .eq('societe_id', societeId)
    .order('banque', { ascending: true })

  const ids = (comptes || []).map(c => c.id)
  const { data: creds } = ids.length > 0
    ? await admin.from('comptes_bancaires_scraping_creds')
        .select('compte_bancaire_id, username_enc, password_enc, secondary_pin_enc, notes, active, last_scrape_at, last_scrape_status, last_scrape_error, last_balance_mur')
        .in('compte_bancaire_id', ids)
    : { data: [] }

  const credByCompte = new Map((creds || []).map((c: any) => [c.compte_bancaire_id, c]))

  return NextResponse.json({
    comptes: (comptes || []).map(cb => {
      const cred = credByCompte.get(cb.id) as any
      return {
        id: cb.id,
        banque: cb.banque,
        numero_compte: cb.numero_compte,
        intitule: cb.intitule,
        devise: cb.devise,
        solde_actuel: cb.solde_actuel,
        actif: cb.actif,
        scraping: cred ? {
          configured: true,
          has_username: !!cred.username_enc,
          has_password: !!cred.password_enc,
          has_pin: !!cred.secondary_pin_enc,
          notes: cred.notes,
          active: cred.active,
          last_scrape_at: cred.last_scrape_at,
          last_scrape_status: cred.last_scrape_status,
          last_scrape_error: cred.last_scrape_error,
          last_balance_mur: cred.last_balance_mur,
        } : { configured: false },
      }
    }),
  })
}

export async function PUT(req: NextRequest) {
  const compteId = req.nextUrl.searchParams.get('compte_id') || ''
  if (!compteId) return NextResponse.json({ error: 'compte_id requis' }, { status: 400 })

  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return apiError('not_authenticated', 401)

  try {
    const admin = getAdminClient()
    const { data: compte } = await admin
      .from('comptes_bancaires').select('id, societe_id').eq('id', compteId).maybeSingle()
    if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

    try { await assertSocieteAccess(supabaseAuth, user.id, compte.societe_id) }
    catch { return NextResponse.json({ error: 'Accès société refusé (assertSocieteAccess).' }, { status: 403 }) }

    const { data: us } = await supabaseAuth
      .from('user_societes').select('role')
      .eq('user_id', user.id).eq('societe_id', compte.societe_id).maybeSingle()
    if (!SOCIETE_ROLES.includes(us?.role || '')) {
      return NextResponse.json({ error: `Accès réservé à la direction (ton rôle : ${us?.role || 'aucun'}).` }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

    const updates: Record<string, any> = { compte_bancaire_id: compteId, updated_by: user.id }
    if (typeof body.notes === 'string') updates.notes = body.notes
    if (typeof body.active === 'boolean') updates.active = body.active
    if (typeof body.username === 'string') updates.username_enc = body.username ? encryptSecret(body.username) : null
    if (typeof body.password === 'string') updates.password_enc = body.password ? encryptSecret(body.password) : null
    if (typeof body.secondary_pin === 'string') updates.secondary_pin_enc = body.secondary_pin ? encryptSecret(body.secondary_pin) : null

    const { error } = await admin
      .from('comptes_bancaires_scraping_creds')
      .upsert(updates, { onConflict: 'compte_bancaire_id' })
    if (error) return NextResponse.json({ error: `Enregistrement DB : ${error.message}` }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: `Erreur serveur : ${e?.message || e}` }, { status: 500 })
  }
}
