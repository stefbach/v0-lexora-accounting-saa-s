import { test, expect } from '@playwright/test'
import { isTestDbAvailable, getTestAdminClient } from './helpers/db'
import { loginProgrammatic, getCredentialsA } from './helpers/auth'

/**
 * Workflow couvert :
 *   Création d'un bulletin de paie → validation → verrouillage → vérification
 *   que les écritures OD-PAIE ont bien été générées automatiquement.
 *
 * NB : la création d'un salarié de test passe par une RPC seed dédiée si elle
 * existe ; sinon le test skip (la couche RH est lourde à mocker côté API).
 */
const dbReady = isTestDbAvailable()
const creds = getCredentialsA()
const societeId = process.env.E2E_SOCIETE_A_ID
const salarieId = process.env.E2E_SALARIE_A_ID

test.describe('Paie mensuelle → OD-PAIE auto', () => {
  test.skip(
    !dbReady || !creds || !societeId || !salarieId,
    'DATABASE_URL_TEST / E2E_SALARIE_A_ID absent — spec skipped',
  )

  test('génère les écritures OD-PAIE après verrouillage du bulletin', async ({
    context,
    request,
  }) => {
    await loginProgrammatic(context, creds!)

    // 1. Crée un bulletin pour la période 2026-04
    const create = await request.post('/api/rh/bulletins', {
      data: {
        societe_id: societeId,
        salarie_id: salarieId,
        periode: '2026-04',
        salaire_brut: 50000,
      },
    })
    if (create.status() === 404) test.skip(true, 'endpoint /api/rh/bulletins absent')
    expect(create.ok(), `bulletins create status=${create.status()}`).toBeTruthy()
    const { id: bulletinId } = await create.json()

    // 2. Verrouille → l'API doit créer les écritures OD-PAIE
    const lock = await request.post(`/api/rh/bulletins/${bulletinId}/verrouiller`, {
      data: {},
    })
    expect(lock.ok(), `verrouiller status=${lock.status()}`).toBeTruthy()

    // 3. Vérifie qu'au moins une écriture journal=PAIE a été générée
    const supa = getTestAdminClient()
    const { data: ecritures } = await supa
      .from('ecritures_comptables_v2')
      .select('numero_compte,journal,debit_mur,credit_mur')
      .eq('societe_id', societeId)
      .eq('journal', 'PAIE')
      .gte('date_ecriture', '2026-04-01')
      .lte('date_ecriture', '2026-04-30')
    expect((ecritures || []).length).toBeGreaterThan(0)
  })
})
