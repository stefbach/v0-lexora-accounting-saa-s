/**
 * GET /api/nylas/diag
 *   → Diagnostic de la connexion Nylas (email + agenda) de l'utilisateur.
 *
 * POURQUOI CETTE ROUTE
 * --------------------
 * Une boîte Nylas peut cesser de fonctionner sans qu'aucun écran ne le dise.
 * Trois pannes distinctes produisent le même silence :
 *
 *   1. `CRYPT_KEY` a changé côté Vercel → le `grant_id` stocké ne se déchiffre
 *      plus. `resolveNylasAccount` et `listNylasAccounts` avalent l'erreur et
 *      renvoient `null` / `[]`, ce qui est indistinguable de « aucune boîte ».
 *   2. Le grant est mort côté fournisseur (mot de passe changé, accès révoqué,
 *      application retirée). La ligne reste `active = true` en base.
 *   3. `NYLAS_API_KEY` / `NYLAS_CLIENT_ID` absents ou erronés.
 *
 * Dans les trois cas, `/api/auth/nylas/accounts` continue d'afficher la boîte
 * comme connectée — il ne déchiffre rien et n'appelle pas Nylas — pendant que
 * `/api/nylas/messages` renvoie une liste vide en 200 et que l'agenda répond
 * « Aucune boîte connectée » en 404. Cette route tranche en un appel.
 *
 * Auth : session web de l'utilisateur ; ne renvoie que ses propres comptes.
 * Aucun secret n'est exposé — ni grant_id, ni clé, ni jeton.
 *
 * Volontairement absente de la liste blanche du middleware : elle décrit la
 * configuration d'un compte et doit rester derrière une session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/crypto/symmetric'
import {
  isNylasConfigured,
  nylasRedirectUri,
  getNylasGrantStatus,
  listNylasCalendars,
} from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

/** Le format produit par `encryptSecret` : `${iv}:${tag}:${cipher}`. */
function tokenFormat(enc: string | null): 'absent' | 'ok' | 'inattendu' {
  if (!enc) return 'absent'
  return enc.split(':').length === 3 ? 'ok' : 'inattendu'
}

type AccountDiag = {
  id: string
  compte: string
  actif: boolean
  derniere_synchro: string | null
  format_jeton: 'absent' | 'ok' | 'inattendu'
  dechiffrement: 'ok' | 'echec'
  dechiffrement_erreur?: string
  grant_http?: number
  grant_statut?: string | null
  grant_fournisseur?: string | null
  grant_erreur?: string | null
  calendriers?: number
  calendriers_erreur?: string
  verdict: string
}

export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const cryptKey = process.env.CRYPT_KEY || ''
  const env = {
    nylas_configure: isNylasConfigured(),
    NYLAS_API_KEY_definie: !!process.env.NYLAS_API_KEY,
    NYLAS_CLIENT_ID_definie: !!process.env.NYLAS_CLIENT_ID,
    NYLAS_API_URI: process.env.NYLAS_API_URI || '(defaut us)',
    // Doit être déclarée à l'identique dans le tableau de bord Nylas, sinon
    // l'échange du code échoue en fin de parcours.
    redirect_uri_attendue: nylasRedirectUri(req.nextUrl.origin),
    CRYPT_KEY_definie: !!cryptKey,
    CRYPT_KEY_longueur_valide: cryptKey.length === 64,
    // Clé de signature du `state` OAuth : sans elle, /init jette avant la
    // redirection et /callback rejette tout retour.
    cle_state_oauth_definie: !!(process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRYPT_KEY),
  }

  const admin = getAdminClient()
  const { data: rows } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, active, access_token_enc, last_synced_at')
    .eq('user_id', user.id)
    .eq('provider', 'nylas')
    .order('created_at', { ascending: false })

  const comptes: AccountDiag[] = []
  for (const r of (rows || []) as Array<{
    id: string; account_email: string; active: boolean
    access_token_enc: string | null; last_synced_at: string | null
  }>) {
    const d: AccountDiag = {
      id: r.id,
      compte: r.account_email,
      actif: !!r.active,
      derniere_synchro: r.last_synced_at,
      format_jeton: tokenFormat(r.access_token_enc),
      dechiffrement: 'echec',
      verdict: '',
    }

    let grantId = ''
    try {
      grantId = decryptSecret(r.access_token_enc || '')
      d.dechiffrement = grantId ? 'ok' : 'echec'
    } catch (e) {
      d.dechiffrement_erreur = e instanceof Error ? e.message : 'erreur inconnue'
    }

    if (d.dechiffrement !== 'ok') {
      if (d.format_jeton === 'absent') {
        d.verdict = 'Aucun jeton stocké pour cette boîte — l’enregistrement a échoué à la connexion. Reconnecter la boîte.'
      } else if (!env.CRYPT_KEY_longueur_valide) {
        d.verdict = 'CRYPT_KEY absente ou de longueur invalide (64 caractères hexadécimaux attendus). Aucune boîte ne peut fonctionner tant que ce n’est pas corrigé.'
      } else if (d.format_jeton === 'inattendu') {
        d.verdict = 'Le jeton stocké n’a pas le format attendu (iv:tag:chiffré) — donnée corrompue. Reconnecter la boîte.'
      } else {
        d.verdict = 'Le grant_id ne se déchiffre plus alors que CRYPT_KEY est bien formée : la clé a changé depuis la connexion de cette boîte. Reconnecter la boîte.'
      }
      comptes.push(d)
      continue
    }

    try {
      const g = await getNylasGrantStatus(grantId)
      d.grant_http = g.httpStatus
      d.grant_statut = g.grantStatus
      d.grant_fournisseur = g.provider
      d.grant_erreur = g.error
    } catch (e) {
      d.grant_erreur = e instanceof Error ? e.message : 'erreur inconnue'
    }

    if (d.grant_http === 200 && (d.grant_statut === null || d.grant_statut === 'valid')) {
      try {
        d.calendriers = (await listNylasCalendars(grantId)).length
      } catch (e) {
        d.calendriers_erreur = e instanceof Error ? e.message : 'erreur inconnue'
      }
      d.verdict = d.calendriers_erreur
        ? 'Grant valide mais l’agenda est inaccessible : le scope calendrier n’a probablement pas été accordé. Reconnecter la boîte.'
        : 'Boîte opérationnelle.'
    } else if (d.grant_http === 401 || d.grant_http === 403) {
      d.verdict = 'Nylas refuse la clé serveur (NYLAS_API_KEY) ou ce grant. Vérifier la clé, puis reconnecter la boîte.'
    } else if (d.grant_http === 404) {
      d.verdict = 'Le grant n’existe plus côté Nylas — accès révoqué ou application supprimée. Reconnecter la boîte.'
    } else {
      d.verdict = `Grant en échec (HTTP ${d.grant_http ?? '?'}, statut ${d.grant_statut ?? 'inconnu'}). Reconnecter la boîte.`
    }
    comptes.push(d)
  }

  const utilisables = comptes.filter((c) => c.actif && c.verdict === 'Boîte opérationnelle.').length
  const resume = !env.nylas_configure
    ? 'Nylas n’est pas configuré : NYLAS_API_KEY et/ou NYLAS_CLIENT_ID manquent côté Vercel.'
    : comptes.length === 0
      ? 'Aucune boîte Nylas enregistrée pour cet utilisateur. Connecter une boîte depuis /client/email-accounts.'
      : utilisables === 0
        ? `${comptes.length} boîte(s) enregistrée(s), aucune utilisable — voir le verdict de chacune ci-dessous.`
        : `${utilisables} boîte(s) sur ${comptes.length} opérationnelle(s).`

  return NextResponse.json({ resume, env, comptes })
}
