import { describe, it, expect } from 'vitest'
import { partyName } from '../party-name'

describe('partyName', () => {
  it('texte : inchangé', () => {
    expect(partyName('MIPSIT Digital Ltd')).toBe('MIPSIT Digital Ltd')
  })

  it('objet OCR : renvoie le nom', () => {
    expect(partyName({ nom: 'Vercel Inc.', adresse: 'Covina', vat_number: 'EU056329113' })).toBe('Vercel Inc.')
    expect(partyName({ name: 'Fly.io, Inc.' })).toBe('Fly.io, Inc.')
    expect(partyName({ raison_sociale: 'OCC Ltd' })).toBe('OCC Ltd')
  })

  it('valeurs absentes ou inexploitables : chaîne vide', () => {
    expect(partyName(null)).toBe('')
    expect(partyName(undefined)).toBe('')
    expect(partyName({ adresse: 'x' })).toBe('')
    expect(partyName(42)).toBe('')
  })
})
