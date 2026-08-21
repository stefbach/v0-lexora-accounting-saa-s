/**
 * Tests de l'orchestrateur : boucle observation → décision → action avec
 * navigateur SIMULÉ (BrowserPort mock), garde-fous, OTP, bornes, et routage
 * recette d'abord / IA en secours.
 */
import { describe, expect, it } from 'vitest'
import { runAgenticNavigation, runNavigation, type NavigatorDeps } from './navigator'
import type { Recipe, RecipeStore } from './recipes'
import type {
  ActionLogEntry,
  BrowserPort,
  ObservedElement,
  PageObservation,
} from './types'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const LOGIN_PAGE: PageObservation = {
  url: 'https://ib.mcb.mu/login',
  elements: [
    { selector: '#user', name: 'username', inputType: 'text' },
    { selector: '#pwd', inputType: 'password' },
    { selector: '#submit', role: 'button', text: 'Se connecter' },
  ],
}

const ACCOUNTS_PAGE: PageObservation = {
  url: 'https://ib.mcb.mu/accounts',
  elements: [
    { selector: '#statements', role: 'link', text: 'Relevés de compte', href: '/accounts/statements' },
    { selector: '#transfer', role: 'link', text: 'Nouveau virement', href: '/transfer/new' },
    { selector: '#export', role: 'button', text: 'Exporter le relevé' },
  ],
}

const OTP_PAGE: PageObservation = {
  url: 'https://ib.mcb.mu/otp',
  elements: [{ selector: '#otp', placeholder: 'Code SMS', inputType: 'tel' }],
}

type MockBrowser = BrowserPort & { calls: string[] }

/** Navigateur simulé : une séquence de pages, avance à chaque action. */
function makeBrowser(pages: PageObservation[], opts: { failOn?: string } = {}): MockBrowser {
  let index = 0
  const calls: string[] = []
  const current = () => pages[Math.min(index, pages.length - 1)]
  const advance = () => {
    if (index < pages.length - 1) index++
  }
  return {
    calls,
    async observe() {
      return current()
    },
    async click(selector) {
      if (selector === opts.failOn) throw new Error('élément détaché du DOM')
      calls.push(`click:${selector}`)
      advance()
    },
    async fill(selector, value) {
      calls.push(`fill:${selector}:${value}`)
    },
    async press(key) {
      calls.push(`press:${key}`)
      advance()
    },
    async scroll(direction) {
      calls.push(`scroll:${direction}`)
    },
    async exists(selector) {
      return current().elements.some((el) => el.selector === selector)
    },
  }
}

/** Fournisseur de décision scripté : rejoue une liste de réponses brutes. */
function makeDecide(responses: string[], costUsd?: string) {
  let i = 0
  const calls: number[] = []
  const decide: NavigatorDeps['decide'] = async () => {
    calls.push(i)
    const raw = responses[Math.min(i, responses.length - 1)]
    i++
    return { raw, costUsd }
  }
  return { decide, calls }
}

function makeAudit() {
  const entries: ActionLogEntry[] = []
  return { entries, record: async (e: ActionLogEntry) => void entries.push(e) }
}

function makeStore(initial: Recipe[] = []): RecipeStore & { rows: Recipe[] } {
  const rows = [...initial]
  return {
    rows,
    async getActive(banque, objectif) {
      return rows.find((r) => r.banque === banque && r.objectif === objectif && r.actif) ?? null
    },
    async listVersions(banque, objectif) {
      return rows.filter((r) => r.banque === banque && r.objectif === objectif)
    },
    async insert(r) {
      rows.push(r)
      return r
    },
    async setActiveVersion(banque, objectif, version) {
      for (const r of rows) {
        if (r.banque === banque && r.objectif === objectif) r.actif = r.version === version
      }
    },
  }
}

const PARAMS = {
  runId: 'run-1',
  societeId: 'soc-1',
  banque: 'MCB',
  objectif: 'relevé du compte courant',
  credentials: { username: 'jdoe', password: 's3cret' },
}

function deps(overrides: Partial<NavigatorDeps> & Pick<NavigatorDeps, 'browser' | 'decide'>): NavigatorDeps {
  return { audit: makeAudit(), now: () => 1_000_000, ...overrides }
}

// ─── Parcours nominal ───────────────────────────────────────────────────────

describe('runAgenticNavigation — parcours nominal', () => {
  it('login → relevés → done, avec recette enregistrée', async () => {
    const browser = makeBrowser([LOGIN_PAGE, ACCOUNTS_PAGE])
    const audit = makeAudit()
    const store = makeStore()
    const { decide } = makeDecide([
      '{"type":"fill","target":"#user","value":"IGNORED","raison":"saisir le login"}',
      '{"type":"fill","target":"#pwd","value":"IGNORED","raison":"saisir le mot de passe"}',
      '{"type":"click","target":"#submit","raison":"valider"}',
      '{"type":"click","target":"#statements","raison":"aller aux relevés"}',
      '{"type":"done","raison":"relevé récupéré"}',
    ])

    const outcome = await runAgenticNavigation(
      { browser, decide, audit, recipeStore: store, now: () => 1_000_000 },
      PARAMS,
    )

    expect(outcome.status).toBe('done')
    expect(outcome.mode).toBe('agentic')
    expect(outcome.session.state).toBe('done')
    // Les credentials INJECTÉS sont saisis, jamais la valeur du modèle.
    expect(browser.calls).toEqual([
      'fill:#user:jdoe',
      'fill:#pwd:s3cret',
      'click:#submit',
      'click:#statements',
    ])
    // Journal d'audit : une entrée par étape + le done.
    expect(audit.entries).toHaveLength(5)
    expect(audit.entries.every((e) => e.mode === 'agentic')).toBe(true)
    expect(audit.entries[4].resultat).toBe('done')
    // Recette apprise, secrets remplacés par des credentialRef.
    expect(store.rows).toHaveLength(1)
    const learned = store.rows[0]
    expect(learned.version).toBe(1)
    expect(learned.actions).toEqual([
      { type: 'fill', selector: '#user', credentialRef: 'username' },
      { type: 'fill', selector: '#pwd', credentialRef: 'password' },
      { type: 'click', selector: '#submit' },
      { type: 'click', selector: '#statements' },
    ])
    expect(JSON.stringify(learned)).not.toContain('s3cret')
  })
})

// ─── Garde-fous ─────────────────────────────────────────────────────────────

describe('runAgenticNavigation — garde-fous', () => {
  it('un clic vers « virement » est bloqué AVANT exécution → aborted', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const audit = makeAudit()
    const { decide } = makeDecide([
      '{"type":"click","target":"#transfer","raison":"je veux explorer"}',
    ])

    const outcome = await runAgenticNavigation(deps({ browser, decide, audit }), PARAMS)

    expect(outcome.status).toBe('aborted')
    expect(outcome.session.state).toBe('aborted')
    expect(outcome.reason).toContain('forbidden')
    // Le navigateur n'a JAMAIS exécuté le clic.
    expect(browser.calls).toHaveLength(0)
    expect(audit.entries[0].resultat).toBe('blocked')
  })

  it('un fill hors liste blanche est bloqué → aborted, rien saisi', async () => {
    const page: PageObservation = {
      url: 'https://ib.mcb.mu/x',
      elements: [{ selector: '#free', name: 'commentaire' }],
    }
    const browser = makeBrowser([page])
    const { decide } = makeDecide(['{"type":"fill","target":"#free","value":"hello","raison":"r"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('aborted')
    expect(browser.calls).toHaveLength(0)
  })

  it('une cible absente de l’observation est refusée', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide } = makeDecide(['{"type":"click","target":"#ghost","raison":"r"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('aborted')
    expect(outcome.reason).toContain('target_not_observed')
  })
})

// ─── Décisions invalides et bornes ──────────────────────────────────────────

describe('runAgenticNavigation — décisions invalides et bornes', () => {
  it('JSON malformé → aborted proprement, journalisé', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const audit = makeAudit()
    const { decide } = makeDecide(['je clique sur relevés'])
    const outcome = await runAgenticNavigation(deps({ browser, decide, audit }), PARAMS)
    expect(outcome.status).toBe('aborted')
    expect(audit.entries[0].decisionModele).toBe('je clique sur relevés')
  })

  it('nombre d’étapes max atteint → aborted', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide, calls } = makeDecide(['{"type":"scroll","raison":"chercher"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), {
      ...PARAMS,
      bounds: { maxSteps: 3, timeoutMs: 60_000 },
    })
    expect(outcome.status).toBe('aborted')
    expect(outcome.reason).toContain('étapes')
    expect(calls).toHaveLength(3)
  })

  it('budget IA épuisé → aborted (cumul Decimal des coûts)', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide } = makeDecide(['{"type":"scroll","raison":"r"}'], '0.10')
    const outcome = await runAgenticNavigation(deps({ browser, decide }), {
      ...PARAMS,
      bounds: { maxSteps: 100, timeoutMs: 60_000, budgetUsd: '0.30' },
    })
    expect(outcome.status).toBe('aborted')
    expect(outcome.reason).toContain('budget')
    expect(browser.calls.filter((c) => c.startsWith('scroll')).length).toBe(3)
  })

  it('timeout global → aborted', async () => {
    let t = 0
    const now = () => {
      t += 30_000
      return t
    }
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide } = makeDecide(['{"type":"scroll","raison":"r"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide, now }), {
      ...PARAMS,
      bounds: { maxSteps: 100, timeoutMs: 90_000 },
    })
    expect(outcome.status).toBe('aborted')
    expect(outcome.reason).toContain('timeout')
  })

  it('le modèle décide abort → aborted avec sa raison', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide } = makeDecide(['{"type":"abort","raison":"captcha détecté"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('aborted')
    expect(outcome.reason).toBe('captcha détecté')
  })

  it('erreur du navigateur pendant une action → failed', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE], { failOn: '#statements' })
    const { decide } = makeDecide(['{"type":"click","target":"#statements","raison":"r"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('failed')
    expect(outcome.session.state).toBe('failed')
  })
})

// ─── OTP ────────────────────────────────────────────────────────────────────

describe('runAgenticNavigation — parcours OTP', () => {
  it('need_otp explicite → awaiting_otp, session suspendue', async () => {
    const browser = makeBrowser([OTP_PAGE])
    const { decide } = makeDecide(['{"type":"need_otp","raison":"page OTP détectée"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('awaiting_otp')
    expect(outcome.session.state).toBe('awaiting_otp')
    expect(outcome.session.otpRequestedAtMs).toBe(1_000_000)
  })

  it('fill d’un champ OTP sans code disponible → awaiting_otp implicite', async () => {
    const browser = makeBrowser([OTP_PAGE])
    const { decide } = makeDecide(['{"type":"fill","target":"#otp","value":"000000","raison":"r"}'])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome.status).toBe('awaiting_otp')
    expect(browser.calls).toHaveLength(0)
  })

  it('reprise avec le code reçu : le champ OTP est rempli avec le code INJECTÉ', async () => {
    const browser = makeBrowser([OTP_PAGE, ACCOUNTS_PAGE])
    const { decide } = makeDecide([
      '{"type":"fill","target":"#otp","value":"IGNORED","raison":"saisir le code"}',
      '{"type":"press","value":"Enter","raison":"valider"}',
      '{"type":"done","raison":"fini"}',
    ])
    const outcome = await runAgenticNavigation(deps({ browser, decide }), {
      ...PARAMS,
      otp: '445566',
    })
    expect(outcome.status).toBe('done')
    expect(browser.calls[0]).toBe('fill:#otp:445566')
  })
})

// ─── Routage recette d'abord / IA en secours ────────────────────────────────

const RECIPE_V1: Recipe = {
  banque: 'MCB',
  objectif: 'relevé du compte courant',
  version: 1,
  actif: true,
  actions: [{ type: 'click', selector: '#statements' }],
}

describe('runNavigation — recette d’abord, IA en secours', () => {
  it('recette valide → rejeu déterministe SANS appel IA', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const audit = makeAudit()
    const { decide, calls } = makeDecide(['{"type":"done","raison":"r"}'])
    const store = makeStore([RECIPE_V1])

    const outcome = await runNavigation(
      { browser, decide, audit, recipeStore: store, now: () => 1_000_000 },
      PARAMS,
    )

    expect(outcome).toMatchObject({ status: 'done', mode: 'recipe' })
    expect(outcome.session.state).toBe('done')
    expect(calls).toHaveLength(0) // zéro appel IA
    expect(browser.calls).toEqual(['click:#statements'])
    expect(audit.entries[0]).toMatchObject({ mode: 'recipe', resultat: 'done' })
  })

  it('étape cassée → bascule agentique, réparation, NOUVELLE version enregistrée', async () => {
    const broken: Recipe = { ...RECIPE_V1, actions: [{ type: 'click', selector: '#old-ui' }] }
    const store = makeStore([broken])
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const audit = makeAudit()
    const { decide, calls } = makeDecide([
      '{"type":"click","target":"#statements","raison":"nouvelle UI"}',
      '{"type":"done","raison":"réparé"}',
    ])

    const outcome = await runNavigation(
      { browser, decide, audit, recipeStore: store, now: () => 1_000_000 },
      PARAMS,
    )

    expect(outcome).toMatchObject({ status: 'done', mode: 'agentic' })
    expect(calls.length).toBeGreaterThan(0)
    // v1 conservée, v2 active.
    expect(store.rows).toHaveLength(2)
    expect(store.rows.find((r) => r.version === 1)?.actif).toBe(false)
    const v2 = store.rows.find((r) => r.version === 2)
    expect(v2?.actif).toBe(true)
    expect(v2?.actions).toEqual([{ type: 'click', selector: '#statements' }])
    // Le journal contient la trace de la bascule.
    expect(audit.entries[0]).toMatchObject({ mode: 'recipe', resultat: 'error' })
  })

  it('recette bloquée par un garde-fou → aborted, PAS de réparation automatique', async () => {
    const poisoned: Recipe = { ...RECIPE_V1, actions: [{ type: 'click', selector: '#transfer' }] }
    const store = makeStore([poisoned])
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide, calls } = makeDecide(['{"type":"done","raison":"r"}'])

    const outcome = await runNavigation(
      deps({ browser, decide, recipeStore: store }),
      PARAMS,
    )

    expect(outcome.status).toBe('aborted')
    expect(outcome.mode).toBe('recipe')
    expect(calls).toHaveLength(0)
    expect(browser.calls).toHaveLength(0)
    expect(store.rows).toHaveLength(1) // pas de nouvelle version
  })

  it('recette atteignant une étape OTP sans code → awaiting_otp', async () => {
    const withOtp: Recipe = {
      ...RECIPE_V1,
      actions: [{ type: 'fill', selector: '#otp', credentialRef: 'otp' }],
    }
    const store = makeStore([withOtp])
    const browser = makeBrowser([OTP_PAGE])
    const { decide } = makeDecide(['{"type":"done","raison":"r"}'])

    const outcome = await runNavigation(deps({ browser, decide, recipeStore: store }), PARAMS)
    expect(outcome).toMatchObject({ status: 'awaiting_otp', mode: 'recipe' })
    expect(outcome.session.state).toBe('awaiting_otp')
  })

  it('aucune recette → démarre directement en agentique (nouvelle banque)', async () => {
    const store = makeStore()
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide, calls } = makeDecide(['{"type":"done","raison":"r"}'])

    const outcome = await runNavigation(
      { browser, decide, audit: makeAudit(), recipeStore: store, now: () => 1_000_000 },
      PARAMS,
    )
    expect(outcome).toMatchObject({ status: 'done', mode: 'agentic' })
    expect(calls).toHaveLength(1)
  })

  it('sans recipeStore, runNavigation délègue au mode agentique', async () => {
    const browser = makeBrowser([ACCOUNTS_PAGE])
    const { decide } = makeDecide(['{"type":"done","raison":"r"}'])
    const outcome = await runNavigation(deps({ browser, decide }), PARAMS)
    expect(outcome).toMatchObject({ status: 'done', mode: 'agentic' })
  })
})
