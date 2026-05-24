/**
 * Tests pour submitCIT() / submitTDS() — wrappers MRA.
 *
 * STRATÉGIE : on mock `submitMraDeclaration` (l'engine Playwright + DB)
 * pour ne tester que la validation d'input + le mapping payload → MraSubmitInput.
 * Aucun browser n'est lancé, aucune connexion MRA n'est ouverte.
 *
 * Cf. CLAUDE.md : pas de test en navigateur (l'environnement n'a pas de browser).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock complet du sous-système Playwright + DB AVANT l'import.
// `submitMraDeclaration` est la fonction interne appelée par les wrappers ;
// on l'espionne pour vérifier le payload exact qui lui est transmis.
const submitMraDeclarationMock = vi.fn()
vi.mock('@/lib/banks/playwright-launcher', () => ({
  launchBrowser: vi.fn(),
  captureScreenshot: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
  })),
}))
vi.mock('@/lib/crypto/symmetric', () => ({ decryptSecret: (s: string) => s }))

// On remplace `submitMraDeclaration` lui-même pour isoler les wrappers.
vi.mock('./mra-robot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mra-robot')>()
  return {
    ...actual,
    submitMraDeclaration: (...args: any[]) => submitMraDeclarationMock(...args),
  }
})

// Import APRÈS le mock (sinon le module original gagne).
import { submitCIT, submitTDS } from './mra-robot'

beforeEach(() => {
  submitMraDeclarationMock.mockReset()
})

describe('submitCIT', () => {
  it('rejette un XML vide sans appeler le robot', async () => {
    const res = await submitCIT({ societe_id: 'soc-1', exercice: '2024-2025', xml: '' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('empty_xml')
    expect(submitMraDeclarationMock).not.toHaveBeenCalled()
  })

  it('rejette un XML blanc', async () => {
    const res = await submitCIT({ societe_id: 'soc-1', exercice: '2024-2025', xml: '   \n  ' })
    expect(res.status).toBe('failed')
    expect(submitMraDeclarationMock).not.toHaveBeenCalled()
  })

  it('mappe le payload vers MraSubmitInput type cit et propage le success', async () => {
    submitMraDeclarationMock.mockResolvedValueOnce({
      status: 'success',
      message: 'Soumis. Réf MRA : CIT-ABC-123',
      ack_ref: 'CIT-ABC-123',
      screenshot_b64: 'fake-png-base64',
    })

    const res = await submitCIT({
      societe_id: 'soc-1',
      exercice: '2024-2025',
      xml: '<?xml version="1.0"?><CITReturn/>',
    })

    expect(submitMraDeclarationMock).toHaveBeenCalledOnce()
    const arg = submitMraDeclarationMock.mock.calls[0][0]
    expect(arg.societe_id).toBe('soc-1')
    expect(arg.type).toBe('cit')
    expect(arg.periode).toBe('2024-2025')
    expect(arg.files).toHaveLength(1)
    expect(arg.files[0].filename).toBe('cit_2024-2025.xml')
    expect(arg.files[0].content).toContain('CITReturn')

    expect(res.status).toBe('success')
    expect(res.ack_ref).toBe('CIT-ABC-123')
    expect(res.screenshot_b64).toBe('fake-png-base64')
  })

  it('propage le manual_needed du robot', async () => {
    submitMraDeclarationMock.mockResolvedValueOnce({
      status: 'manual_needed',
      message: 'CAPTCHA détecté',
      screenshot_b64: 'png',
    })
    const res = await submitCIT({ societe_id: 's', exercice: '2024-2025', xml: '<x/>' })
    expect(res.status).toBe('manual_needed')
    expect(res.screenshot_b64).toBe('png')
  })
})

describe('submitTDS', () => {
  it('rejette un CSV vide sans appeler le robot', async () => {
    const res = await submitTDS({ societe_id: 'soc-1', periode: '2025-05', csv: '' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('empty_csv')
    expect(submitMraDeclarationMock).not.toHaveBeenCalled()
  })

  it('rejette une période mal formée', async () => {
    const res = await submitTDS({ societe_id: 'soc-1', periode: '2025-5', csv: 'data' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('invalid_periode')
    expect(submitMraDeclarationMock).not.toHaveBeenCalled()
  })

  it('rejette une période YYYY-MM-DD (full date)', async () => {
    const res = await submitTDS({ societe_id: 's', periode: '2025-05-15', csv: 'data' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('invalid_periode')
  })

  it('mappe le payload vers MraSubmitInput type tds avec filename CSV', async () => {
    submitMraDeclarationMock.mockResolvedValueOnce({
      status: 'success',
      message: 'OK',
      ack_ref: 'TDS-REF-9',
    })

    const res = await submitTDS({
      societe_id: 'soc-x',
      periode: '2025-05',
      csv: '# header\nTiers,Brut\n"ABC",1000',
    })

    expect(submitMraDeclarationMock).toHaveBeenCalledOnce()
    const arg = submitMraDeclarationMock.mock.calls[0][0]
    expect(arg.type).toBe('tds')
    expect(arg.periode).toBe('2025-05')
    expect(arg.files[0].filename).toBe('tds_2025-05.csv')
    expect(arg.files[0].content).toContain('"ABC",1000')
    expect(res.ack_ref).toBe('TDS-REF-9')
  })

  it('propage un failed du robot (login rejected) sans masquer le message', async () => {
    submitMraDeclarationMock.mockResolvedValueOnce({
      status: 'failed',
      message: 'MRA a rejeté les credentials',
      error: 'login_rejected',
    })
    const res = await submitTDS({ societe_id: 's', periode: '2025-05', csv: 'a' })
    expect(res.status).toBe('failed')
    expect(res.error).toBe('login_rejected')
    expect(res.message).toContain('rejeté')
  })
})
