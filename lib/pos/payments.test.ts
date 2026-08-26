import { describe, it, expect } from 'vitest'
import {
  PAYMENT_METHODS, isElectronique, estEnTransit, providerParDefaut,
  manualAdapter, resolveAdapter,
} from './payments'

describe('PAYMENT_METHODS', () => {
  it('espèces = non électronique, compte 530', () => {
    expect(PAYMENT_METHODS.especes.electronique).toBe(false)
    expect(PAYMENT_METHODS.especes.compte).toBe('530')
    expect(isElectronique('especes')).toBe(false)
  })
  it('carte / mobile money = électronique, en transit 5118', () => {
    expect(isElectronique('carte')).toBe(true)
    expect(estEnTransit('carte')).toBe(true)
    expect(estEnTransit('mobile_money')).toBe(true)
    expect(estEnTransit('especes')).toBe(false)
  })
  it('provider par défaut : null pour espèces, mcb_juice pour mobile money', () => {
    expect(providerParDefaut('especes')).toBeNull()
    expect(providerParDefaut('mobile_money')).toBe('mcb_juice')
    expect(providerParDefaut('carte')).toBe('terminal_carte')
  })
})

describe('manualAdapter', () => {
  it('capture immédiate, référence saisie conservée', () => {
    const r = manualAdapter.preparer({ moyen: 'carte', montant: 500, reference: 'AUTH-123' })
    expect(r.statut_capture).toBe('capture')
    expect(r.transaction_ref).toBe('AUTH-123')
    expect(r.provider).toBe('terminal_carte')
    expect(r.qr_payload).toBeNull()
  })
  it('espèces : provider null, pas de référence', () => {
    const r = manualAdapter.preparer({ moyen: 'especes', montant: 100 })
    expect(r.provider).toBeNull()
    expect(r.transaction_ref).toBeNull()
  })
})

describe('resolveAdapter', () => {
  it('retombe sur l’adaptateur manuel tant qu’aucun provider live n’est branché', () => {
    expect(resolveAdapter('mobile_money').id).toBe('manuel')
    expect(resolveAdapter('carte', 'provider_inexistant').id).toBe('manuel')
  })
})
