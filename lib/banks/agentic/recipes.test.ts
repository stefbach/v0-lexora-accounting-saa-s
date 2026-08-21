/**
 * Tests du moteur de recettes : sérialisation, versionnement, rejeu,
 * invalidation (étape cassée → signal de réparation), rollback, et
 * application des garde-fous au rejeu.
 */
import { describe, expect, it } from 'vitest'
import {
  recordNewVersion,
  replayRecipe,
  rollbackToVersion,
  serializeRecipe,
  type ExecutedStep,
  type Recipe,
  type RecipeStore,
} from './recipes'
import type { BrowserPort, ObservedElement, PageObservation } from './types'

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Store in-memory : simule bank_scrape_recipes (versions conservées). */
function makeStore(initial: Recipe[] = []): RecipeStore & { rows: Recipe[] } {
  const rows: Recipe[] = [...initial]
  return {
    rows,
    async getActive(banque, objectif) {
      return rows.find((r) => r.banque === banque && r.objectif === objectif && r.actif) ?? null
    },
    async listVersions(banque, objectif) {
      return rows.filter((r) => r.banque === banque && r.objectif === objectif)
    },
    async insert(recipe) {
      const stored = { ...recipe, id: `r${rows.length + 1}` }
      rows.push(stored)
      return stored
    },
    async setActiveVersion(banque, objectif, version) {
      for (const r of rows) {
        if (r.banque === banque && r.objectif === objectif) r.actif = r.version === version
      }
    },
  }
}

/** Navigateur simulé : sélecteurs présents + page observée configurables. */
function makeBrowser(opts: {
  present?: string[]
  url?: string
  elements?: ObservedElement[]
  failOn?: string
}): BrowserPort & { calls: string[] } {
  const present = new Set(opts.present ?? [])
  const calls: string[] = []
  const observation: PageObservation = {
    url: opts.url ?? 'https://ib.bank.mu/home',
    elements:
      opts.elements ??
      [...present].map((selector) => ({ selector, text: 'Consultation', inputType: 'text', name: 'username' })),
  }
  return {
    calls,
    async observe() {
      return observation
    },
    async click(selector) {
      if (selector === opts.failOn) throw new Error('clic impossible')
      calls.push(`click:${selector}`)
    },
    async fill(selector, value) {
      calls.push(`fill:${selector}:${value}`)
    },
    async press(key) {
      calls.push(`press:${key}`)
    },
    async scroll(direction) {
      calls.push(`scroll:${direction}`)
    },
    async exists(selector) {
      return present.has(selector)
    },
  }
}

const CREDS = { username: 'jdoe', password: 's3cret', otp: '123456' }

// ─── Sérialisation ──────────────────────────────────────────────────────────

describe('serializeRecipe', () => {
  it('sérialise un parcours en étapes rejouables et ignore les états de contrôle', () => {
    const journey: ExecutedStep[] = [
      { action: { type: 'click', target: '#login', raison: 'r' }, element: { selector: '#login' } },
      { action: { type: 'scroll', value: 'down', raison: 'r' }, element: null },
      { action: { type: 'press', value: 'Enter', raison: 'r' }, element: null },
      { action: { type: 'done', raison: 'fini' }, element: null },
    ]
    const draft = serializeRecipe('MCB', 'releve', journey)
    expect(draft.banque).toBe('MCB')
    expect(draft.actions).toEqual([
      { type: 'click', selector: '#login' },
      { type: 'scroll', value: 'down' },
      { type: 'press', value: 'Enter' },
    ])
  })

  it('ne sérialise JAMAIS un secret : login/password/OTP deviennent des credentialRef', () => {
    const journey: ExecutedStep[] = [
      {
        action: { type: 'fill', target: '#user', value: 'jdoe', raison: 'r' },
        element: { selector: '#user', name: 'username' },
      },
      {
        action: { type: 'fill', target: '#pwd', value: 's3cret', raison: 'r' },
        element: { selector: '#pwd', inputType: 'password' },
      },
      {
        action: { type: 'fill', target: '#otp', value: '999111', raison: 'r' },
        element: { selector: '#otp', placeholder: 'Code SMS' },
      },
    ]
    const draft = serializeRecipe('MCB', 'releve', journey)
    expect(draft.actions).toEqual([
      { type: 'fill', selector: '#user', credentialRef: 'username' },
      { type: 'fill', selector: '#pwd', credentialRef: 'password' },
      { type: 'fill', selector: '#otp', credentialRef: 'otp' },
    ])
    const json = JSON.stringify(draft)
    expect(json).not.toContain('jdoe')
    expect(json).not.toContain('s3cret')
    expect(json).not.toContain('999111')
  })

  it('garde la valeur littérale pour une recherche de compte', () => {
    const journey: ExecutedStep[] = [
      {
        action: { type: 'fill', target: '#q', value: 'MUR 001122', raison: 'r' },
        element: { selector: '#q', ariaLabel: 'Recherche de compte' },
      },
    ]
    const draft = serializeRecipe('SBM', 'releve', journey)
    expect(draft.actions[0]).toEqual({ type: 'fill', selector: '#q', value: 'MUR 001122' })
  })
})

// ─── Versionnement / rollback ───────────────────────────────────────────────

describe('recordNewVersion / rollbackToVersion', () => {
  it('enregistre v1 puis v2 en conservant v1 (rollback possible)', async () => {
    const store = makeStore()
    const v1 = await recordNewVersion(store, { banque: 'MCB', objectif: 'releve', actions: [] })
    expect(v1.version).toBe(1)
    expect(v1.actif).toBe(true)

    const v2 = await recordNewVersion(store, {
      banque: 'MCB',
      objectif: 'releve',
      actions: [{ type: 'click', selector: '#new' }],
    })
    expect(v2.version).toBe(2)

    const versions = await store.listVersions('MCB', 'releve')
    expect(versions).toHaveLength(2)
    expect(versions.find((r) => r.version === 1)?.actif).toBe(false)
    expect((await store.getActive('MCB', 'releve'))?.version).toBe(2)
  })

  it('versionne indépendamment par (banque, objectif)', async () => {
    const store = makeStore()
    await recordNewVersion(store, { banque: 'MCB', objectif: 'releve', actions: [] })
    const sbm = await recordNewVersion(store, { banque: 'SBM', objectif: 'releve', actions: [] })
    expect(sbm.version).toBe(1)
  })

  it('rollback réactive une version antérieure sans rien supprimer', async () => {
    const store = makeStore()
    await recordNewVersion(store, { banque: 'MCB', objectif: 'releve', actions: [] })
    await recordNewVersion(store, { banque: 'MCB', objectif: 'releve', actions: [] })

    const restored = await rollbackToVersion(store, 'MCB', 'releve', 1)
    expect(restored.version).toBe(1)
    expect((await store.getActive('MCB', 'releve'))?.version).toBe(1)
    expect(await store.listVersions('MCB', 'releve')).toHaveLength(2)
  })

  it('rollback vers une version inexistante lève une erreur', async () => {
    const store = makeStore()
    await expect(rollbackToVersion(store, 'MCB', 'releve', 7)).rejects.toThrow('introuvable')
  })
})

// ─── Rejeu ──────────────────────────────────────────────────────────────────

function recipe(actions: Recipe['actions']): Recipe {
  return { banque: 'MCB', objectif: 'releve', version: 1, actif: true, actions }
}

describe('replayRecipe', () => {
  it('rejoue une recette complète (login + credentialRef + navigation)', async () => {
    const browser = makeBrowser({
      present: ['#user', '#pwd', '#statements'],
      elements: [
        { selector: '#user', name: 'username' },
        { selector: '#pwd', inputType: 'password' },
        { selector: '#statements', text: 'Relevés' },
      ],
    })
    const result = await replayRecipe(
      recipe([
        { type: 'fill', selector: '#user', credentialRef: 'username' },
        { type: 'fill', selector: '#pwd', credentialRef: 'password' },
        { type: 'press', value: 'Enter' },
        { type: 'click', selector: '#statements' },
        { type: 'scroll', value: 'down' },
      ]),
      browser,
      CREDS,
    )
    expect(result).toEqual({ status: 'completed', stepsExecuted: 5 })
    expect(browser.calls).toEqual([
      'fill:#user:jdoe',
      'fill:#pwd:s3cret',
      'press:Enter',
      'click:#statements',
      'scroll:down',
    ])
  })

  it('sélecteur introuvable → broken avec index (signal de réparation)', async () => {
    const browser = makeBrowser({ present: ['#a'], elements: [{ selector: '#a', text: 'ok' }] })
    const result = await replayRecipe(
      recipe([
        { type: 'click', selector: '#a' },
        { type: 'click', selector: '#disparu' },
      ]),
      browser,
      CREDS,
    )
    expect(result.status).toBe('broken')
    if (result.status === 'broken') {
      expect(result.stepIndex).toBe(1)
      expect(result.reason).toContain('#disparu')
    }
  })

  it('utilise un sélecteur de repli quand le principal a disparu', async () => {
    const browser = makeBrowser({
      present: ['#fallback'],
      elements: [{ selector: '#fallback', text: 'Relevés' }],
    })
    const result = await replayRecipe(
      recipe([{ type: 'click', selector: '#gone', fallbackSelectors: ['#fallback'] }]),
      browser,
      CREDS,
    )
    expect(result.status).toBe('completed')
    expect(browser.calls).toEqual(['click:#fallback'])
  })

  it('étape sans sélecteur → broken', async () => {
    const browser = makeBrowser({})
    const result = await replayRecipe(recipe([{ type: 'click' }]), browser, CREDS)
    expect(result.status).toBe('broken')
  })

  it('échec navigateur pendant l’exécution → broken', async () => {
    const browser = makeBrowser({
      present: ['#a'],
      elements: [{ selector: '#a', text: 'ok' }],
      failOn: '#a',
    })
    const result = await replayRecipe(recipe([{ type: 'click', selector: '#a' }]), browser, CREDS)
    expect(result.status).toBe('broken')
    if (result.status === 'broken') expect(result.reason).toContain('clic impossible')
  })

  it('étape OTP sans code disponible → awaiting_otp', async () => {
    const browser = makeBrowser({
      present: ['#otp'],
      elements: [{ selector: '#otp', placeholder: 'Code SMS' }],
    })
    const result = await replayRecipe(
      recipe([{ type: 'fill', selector: '#otp', credentialRef: 'otp' }]),
      browser,
      { username: 'u', password: 'p' },
    )
    expect(result).toEqual({ status: 'awaiting_otp', stepIndex: 0 })
  })

  it('les garde-fous s’appliquent AUSSI au rejeu : recette empoisonnée → blocked', async () => {
    const browser = makeBrowser({
      present: ['#evil'],
      elements: [{ selector: '#evil', text: 'Nouveau virement' }],
    })
    const result = await replayRecipe(recipe([{ type: 'click', selector: '#evil' }]), browser, CREDS)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') expect(result.reason).toContain('forbidden_label')
    expect(browser.calls).toHaveLength(0)
  })

  it('fill de recette vers un champ non autorisé → blocked', async () => {
    const browser = makeBrowser({
      present: ['#amount'],
      elements: [{ selector: '#amount', name: 'amount' }],
    })
    const result = await replayRecipe(
      recipe([{ type: 'fill', selector: '#amount', value: '100' }]),
      browser,
      CREDS,
    )
    expect(result.status).toBe('blocked')
    expect(browser.calls).toHaveLength(0)
  })

  it('sélecteur présent mais absent de l’observation → broken (pas d’exécution aveugle)', async () => {
    const browser = makeBrowser({ present: ['#a'], elements: [] })
    const result = await replayRecipe(recipe([{ type: 'click', selector: '#a' }]), browser, CREDS)
    expect(result.status).toBe('broken')
    expect(browser.calls).toHaveLength(0)
  })
})
