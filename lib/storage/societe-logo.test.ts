import { describe, it, expect } from 'vitest'
import { validateLogo, logoPath, MAX_BYTES } from './societe-logo'

describe('validateLogo', () => {
  it('refuse un fichier manquant', () => {
    const r = validateLogo({ type: '', size: 0 } as Parameters<typeof validateLogo>[0])
    expect(r.ok).toBe(false)
  })

  it('refuse un format non supporté', () => {
    const r = validateLogo({ type: 'application/pdf', size: 100 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Format/)
  })

  it('refuse un fichier vide', () => {
    const r = validateLogo({ type: 'image/png', size: 0 })
    expect(r.ok).toBe(false)
  })

  it('refuse un fichier trop volumineux', () => {
    const r = validateLogo({ type: 'image/png', size: MAX_BYTES + 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/volumineux/)
  })

  it("accepte PNG dans la limite", () => {
    const r = validateLogo({ type: 'image/png', size: 50_000 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ext).toBe('png')
  })

  it("accepte JPEG", () => {
    const r = validateLogo({ type: 'image/jpeg', size: 50_000 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ext).toBe('jpg')
  })

  it("accepte WebP et SVG", () => {
    expect(validateLogo({ type: 'image/webp', size: 1000 }).ok).toBe(true)
    expect(validateLogo({ type: 'image/svg+xml', size: 1000 }).ok).toBe(true)
  })
})

describe('logoPath', () => {
  it('génère un path déterministe', () => {
    expect(logoPath('abc-123', 'png')).toBe('abc-123/logo.png')
  })
})
