/**
 * Tests pour submitCIT() / submitTDS() — wrappers MRA.
 *
 * STRATÉGIE : on stub les dépendances bas niveau (playwright-launcher, admin
 * Supabase, crypto) pour que le vrai code de `submitMraDeclaration` s'exécute
 * sans lancer Chromium ni toucher la BDD. Aucune connexion MRA n'est ouverte.
 *
 * On valide :
 *   • la validation d'input des wrappers (XML/CSV vide, période mal formée)
 *   • le mapping payload → MraSubmitInput (type, periode, filename)
 *   • la propagation des résultats (success, manual_needed, failed)
 *
 * Cf. CLAUDE.md : pas de test navigateur (environnement headless sans browser).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks bas niveau (hoistés en haut du fichier par vitest) ───────────────
// IMPORTANT : les factories vi.mock sont hoistées et ne peuvent pas référencer
// de variables du scope module. On utilise vi.hoisted() pour créer les
// références partagées entre les mocks et les tests.
const h = vi.hoisted(() => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({
      setInputFiles: vi.fn().mockResolvedValue(undefined),
    }),
    locator: vi.fn(),
  }
  const session = { page, close: vi.fn().mockResolvedValue(undefined) }
  const captchaState = { captcha: false }
  return { page, session, captchaState }
})

vi.mock('@/lib/banks/playwright-launcher', () => ({
  launchBrowser: vi.fn().mockResolvedValue(h.session),
  captureScreenshot: vi.fn().mockResolvedValue('fake-png-base64'),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: {
              mra_username: 'TEST_USER',
              mra_password_enc: 'enc_pw',
              mra_tan_enc: null,
              active: true,
            },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  })),
}))

vi.mock('@/lib/crypto/symmetric', () => ({ decryptSecret: (s: string) => s }))

import { submitCIT, submitTDS, submitMraDeclaration } from './mra-robot'

beforeEach(() => {
  h.page.goto.mockClear()
  h.page.fill.mockClear()
  h.page.click.mockClear()
  h.page.waitForLoadState.mockClear()
  h.page.waitForSelector.mockClear()
  h.session.close.mockClear()
  h.captchaState.captcha = false
  // Locator par défaut : pas de CAPTCHA, pas d'erreur login,
  // ack ref détectée = 'MRA-REF-AUTO'.
  h.page.locator.mockImplementation((sel: string) => {
    const isCaptchaSel = typeof sel === 'string' && /captcha|otp|verif/i.test(sel)
    return {
      count: vi.fn().mockResolvedValue(isCaptchaSel && h.captchaState.captcha ? 1 : 0),
      first: () => ({ textContent: vi.fn().mockResolvedValue('MRA-REF-AUTO') }),
    }
  })
})

// ─── submitCIT ──────────────────────────────────────────────────────────────
describe('submitCIT', () => {
  it('rejette un XML vide sans lancer le browser', async () => {
    const res = await submitCIT({ societe_id: 'soc-1', exercice: '2024-2025', xml: '' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('empty_xml')
    expect(h.session.close).not.toHaveBeenCalled()
  })

  it('rejette un XML uniquement composé d\'espaces', async () => {
    const res = await submitCIT({ societe_id: 'soc-1', exercice: '2024-2025', xml: '   \n  ' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('empty_xml')
  })

  it('navigue vers eservices38 CIT et upload le XML en cas de succès', async () => {
    const res = await submitCIT({
      societe_id: 'soc-1',
      exercice: '2024-2025',
      xml: '<?xml version="1.0"?><CITReturn/>',
    })
    if (res.status !== 'success') console.log('DBG-CIT', res)
    expect(res.status).toBe('success')
    const gotoUrls = h.page.goto.mock.calls.map((c: any[]) => c[0])
    expect(gotoUrls.some((u: string) => u.includes('eservices38.mra.mu') && u.toLowerCase().includes('login'))).toBe(true)
    expect(gotoUrls.some((u: string) => u.includes('CIT'))).toBe(true)
    expect(h.session.close).toHaveBeenCalledOnce()
  })

  it('détecte un CAPTCHA et retourne manual_needed', async () => {
    h.captchaState.captcha = true
    const res = await submitCIT({ societe_id: 's', exercice: '2024-2025', xml: '<x/>' })
    expect(res.status).toBe('manual_needed')
    expect(res.screenshot_b64).toBe('fake-png-base64')
  })
})

// ─── submitTDS ──────────────────────────────────────────────────────────────
describe('submitTDS', () => {
  it('rejette un CSV vide sans lancer le browser', async () => {
    const res = await submitTDS({ societe_id: 'soc-1', periode: '2025-05', csv: '' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('empty_csv')
    expect(h.session.close).not.toHaveBeenCalled()
  })

  it('rejette une période mal formée (mois 1 chiffre)', async () => {
    const res = await submitTDS({ societe_id: 'soc-1', periode: '2025-5', csv: 'data' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('invalid_periode')
  })

  it('rejette une période full date YYYY-MM-DD', async () => {
    const res = await submitTDS({ societe_id: 's', periode: '2025-05-15', csv: 'data' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('invalid_periode')
  })

  it('navigue vers eservices.mra.mu TDS et soumet le CSV', async () => {
    const res = await submitTDS({
      societe_id: 'soc-x',
      periode: '2025-05',
      csv: '# header\nTiers,Brut\n"ABC",1000',
    })
    expect(res.status).toBe('success')
    const gotoUrls = h.page.goto.mock.calls.map((c: any[]) => c[0])
    expect(gotoUrls.some((u: string) => u.includes('TDS'))).toBe(true)
    expect(h.session.close).toHaveBeenCalledOnce()
  })
})

// ─── submitMraDeclaration : contrat de base ─────────────────────────────────
describe('submitMraDeclaration (contrat)', () => {
  it('refuse un type inconnu', async () => {
    const res = await submitMraDeclaration({
      societe_id: 's',
      // @ts-expect-error — type invalide volontaire
      type: 'bogus',
      periode: '2025-01',
      files: [{ filename: 'x.xml', content: 'x' }],
    })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('invalid_type')
  })
})
