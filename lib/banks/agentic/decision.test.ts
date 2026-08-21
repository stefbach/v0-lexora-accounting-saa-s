/**
 * Tests du parsing/validation des décisions du modèle et des bornes de run.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_RUN_BOUNDS, checkRunBounds, parseDecision } from './decision'

describe('parseDecision — JSON valide', () => {
  it('parse une décision click complète', () => {
    const result = parseDecision(
      '{"type":"click","target":"#statements","raison":"aller aux relevés"}',
    )
    expect(result.ok).toBe(true)
    expect(result.action).toEqual({
      type: 'click',
      target: '#statements',
      raison: 'aller aux relevés',
    })
  })

  it('parse une décision fill avec valeur', () => {
    const result = parseDecision('{"type":"fill","target":"#user","value":"jdoe","raison":"login"}')
    expect(result.ok).toBe(true)
    expect(result.action.value).toBe('jdoe')
  })

  it('parse les actions sans cible (done, need_otp, abort, scroll)', () => {
    for (const type of ['done', 'need_otp', 'abort', 'scroll']) {
      const result = parseDecision(`{"type":"${type}","raison":"r"}`)
      expect(result.ok, type).toBe(true)
      expect(result.action.type).toBe(type)
    }
  })

  it('accepte un type en casse mixte et une clé reason anglaise', () => {
    const result = parseDecision('{"type":"Click","target":"#a","reason":"go"}')
    expect(result.ok).toBe(true)
    expect(result.action.type).toBe('click')
    expect(result.action.raison).toBe('go')
  })

  it('extrait le JSON enrobé de markdown et de prose', () => {
    const raw = [
      'Voici mon choix :',
      '```json',
      '{"type":"click","target":"#next","raison":"page suivante"}',
      '```',
      'Merci.',
    ].join('\n')
    const result = parseDecision(raw)
    expect(result.ok).toBe(true)
    expect(result.action.target).toBe('#next')
  })

  it('gère les accolades imbriquées et les accolades dans les chaînes', () => {
    const result = parseDecision(
      'prefix {"type":"click","target":"a{b}","raison":"lib {x}"} suffix',
    )
    expect(result.ok).toBe(true)
    expect(result.action.target).toBe('a{b}')
  })
})

describe('parseDecision — refus (abort de repli)', () => {
  it('refuse un texte sans JSON', () => {
    const result = parseDecision('je clique sur le bouton relevés')
    expect(result.ok).toBe(false)
    expect(result.action.type).toBe('abort')
  })

  it('refuse un JSON malformé', () => {
    const result = parseDecision('{"type":"click","target":')
    expect(result.ok).toBe(false)
    expect(result.action.type).toBe('abort')
  })

  it('refuse un tableau ou un scalaire', () => {
    expect(parseDecision('[1,2]').ok).toBe(false)
    expect(parseDecision('"click"').ok).toBe(false)
  })

  it('refuse une action inconnue', () => {
    const result = parseDecision('{"type":"execute_script","raison":"r"}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('execute_script')
  })

  it('refuse un type manquant ou non-chaîne', () => {
    expect(parseDecision('{"raison":"r"}').ok).toBe(false)
    expect(parseDecision('{"type":42,"raison":"r"}').ok).toBe(false)
  })

  it('refuse click/fill sans cible', () => {
    expect(parseDecision('{"type":"click","raison":"r"}').ok).toBe(false)
    expect(parseDecision('{"type":"fill","value":"x","raison":"r"}').ok).toBe(false)
    expect(parseDecision('{"type":"click","target":"  ","raison":"r"}').ok).toBe(false)
  })

  it('refuse fill/press sans valeur', () => {
    expect(parseDecision('{"type":"fill","target":"#f","raison":"r"}').ok).toBe(false)
    expect(parseDecision('{"type":"press","raison":"r"}').ok).toBe(false)
  })

  it('fournit une raison par défaut quand le modèle n’en donne pas', () => {
    const result = parseDecision('{"type":"done"}')
    expect(result.ok).toBe(true)
    expect(result.action.raison).toBe('(non fournie)')
  })
})

describe('checkRunBounds', () => {
  const bounds = { maxSteps: 10, timeoutMs: 60_000, budgetUsd: '1.50' }
  const t0 = 1_000_000

  it('accepte un run dans les bornes', () => {
    const check = checkRunBounds(bounds, {
      steps: 3,
      startedAtMs: t0,
      nowMs: t0 + 10_000,
      spentUsd: '0.40',
    })
    expect(check.withinBounds).toBe(true)
  })

  it('refuse au-delà du nombre d’étapes max', () => {
    const check = checkRunBounds(bounds, { steps: 10, startedAtMs: t0, nowMs: t0 })
    expect(check.withinBounds).toBe(false)
    if (!check.withinBounds) expect(check.reason).toContain('étapes')
  })

  it('refuse après le timeout global', () => {
    const check = checkRunBounds(bounds, { steps: 0, startedAtMs: t0, nowMs: t0 + 60_000 })
    expect(check.withinBounds).toBe(false)
    if (!check.withinBounds) expect(check.reason).toContain('timeout')
  })

  it('refuse quand le budget est épuisé — comparaison décimale exacte', () => {
    // 0.1 + 0.2 + … en flottant natif dériverait ; Decimal non.
    const check = checkRunBounds(bounds, {
      steps: 1,
      startedAtMs: t0,
      nowMs: t0,
      spentUsd: '1.50',
    })
    expect(check.withinBounds).toBe(false)
    if (!check.withinBounds) expect(check.reason).toContain('budget')
  })

  it('accepte un dépassement d’un centime en dessous du budget', () => {
    const check = checkRunBounds(bounds, {
      steps: 1,
      startedAtMs: t0,
      nowMs: t0,
      spentUsd: '1.49',
    })
    expect(check.withinBounds).toBe(true)
  })

  it('ignore le budget quand il n’est pas défini', () => {
    const check = checkRunBounds(
      { maxSteps: 10, timeoutMs: 60_000 },
      { steps: 1, startedAtMs: t0, nowMs: t0, spentUsd: '999' },
    )
    expect(check.withinBounds).toBe(true)
  })

  it('expose des bornes par défaut conservatrices', () => {
    expect(DEFAULT_RUN_BOUNDS.maxSteps).toBeGreaterThan(0)
    expect(DEFAULT_RUN_BOUNDS.timeoutMs).toBeGreaterThan(0)
    expect(DEFAULT_RUN_BOUNDS.budgetUsd).toBeDefined()
  })
})
