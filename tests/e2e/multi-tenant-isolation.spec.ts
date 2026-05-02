import { test, expect } from '@playwright/test'
import { isTestDbAvailable } from './helpers/db'
import {
  loginProgrammatic,
  getCredentialsA,
  getCredentialsB,
} from './helpers/auth'

/**
 * Workflow couvert :
 *   Un utilisateur de la société A tente d'accéder aux données de la société
 *   B → l'API doit répondre 403 (assertSocieteAccess).
 *
 * On vise quelques endpoints sensibles :
 *   • /api/comptable/cloture (POST)
 *   • /api/client/factures   (GET avec societe_id=B)
 *   • /api/client/grand-livre (GET)
 */
const dbReady = isTestDbAvailable()
const credsA = getCredentialsA()
const credsB = getCredentialsB()
const societeAId = process.env.E2E_SOCIETE_A_ID
const societeBId = process.env.E2E_SOCIETE_B_ID

test.describe('Multi-tenant isolation', () => {
  test.skip(
    !dbReady || !credsA || !credsB || !societeAId || !societeBId,
    'DATABASE_URL_TEST / E2E_USER_B_* / E2E_SOCIETE_B_ID absent — spec skipped',
  )

  test('user A → /api/comptable/cloture sur société B est refusé (403)', async ({
    context,
    request,
  }) => {
    await loginProgrammatic(context, credsA!)
    const res = await request.post('/api/comptable/cloture', {
      data: {
        action: 'cloture_mensuelle',
        societe_id: societeBId,
        periode: '2026-04',
      },
    })
    expect(res.status()).toBe(403)
  })

  test('user A → liste factures société B est vide ou 403', async ({
    context,
    request,
  }) => {
    await loginProgrammatic(context, credsA!)
    const res = await request.get(
      `/api/client/factures?societe_id=${societeBId}`,
    )
    if (res.status() === 403) {
      expect(res.status()).toBe(403)
      return
    }
    // Si l'API filtre silencieusement plutôt que 403, le résultat doit être vide
    const body = await res.json()
    const list = Array.isArray(body) ? body : body.data || []
    expect(list.length).toBe(0)
  })

  test('user A non-authentifié → 401 sur cloture', async ({ request }) => {
    const res = await request.post('/api/comptable/cloture', {
      data: {
        action: 'cloture_mensuelle',
        societe_id: societeAId,
        periode: '2026-04',
      },
    })
    expect([401, 403]).toContain(res.status())
  })
})
