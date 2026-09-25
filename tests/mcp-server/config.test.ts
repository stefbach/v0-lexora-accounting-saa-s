import { describe, it, expect } from 'vitest'
import { resolveLexoraConfig } from '../../mcp-server/src/config'

const KEY = 'lex_0123456789abcdef'

describe('resolveLexoraConfig', () => {
  it('accepte une config valide et retire le slash final', () => {
    const r = resolveLexoraConfig({ LEXORA_API_URL: 'https://lexora.vercel.app/', LEXORA_API_KEY: KEY })
    expect(r).toEqual({ ok: true, config: { apiUrl: 'https://lexora.vercel.app', apiKey: KEY } })
  })

  it('retombe sur localhost si LEXORA_API_URL est absente', () => {
    const r = resolveLexoraConfig({ LEXORA_API_KEY: KEY })
    expect(r.ok && r.config.apiUrl).toBe('http://localhost:3000')
  })

  it('rejette une clé API collée dans LEXORA_API_URL', () => {
    const r = resolveLexoraConfig({ LEXORA_API_URL: KEY, LEXORA_API_KEY: KEY })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/clé API.*au lieu d'une adresse/)
  })

  it('détecte URL et clé inversées', () => {
    const r = resolveLexoraConfig({ LEXORA_API_URL: KEY, LEXORA_API_KEY: 'https://lexora.vercel.app' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toHaveLength(2)
      expect(r.errors[0]).toMatch(/inversées/)
    }
  })

  it('rejette une URL sans protocole http(s)', () => {
    for (const url of ['lexora.vercel.app', 'ftp://lexora.app']) {
      const r = resolveLexoraConfig({ LEXORA_API_URL: url, LEXORA_API_KEY: KEY })
      expect(r.ok).toBe(false)
    }
  })

  it('exige une clé présente et préfixée lex_', () => {
    expect(resolveLexoraConfig({ LEXORA_API_URL: 'https://x.app' }).ok).toBe(false)
    expect(resolveLexoraConfig({ LEXORA_API_URL: 'https://x.app', LEXORA_API_KEY: 'abc' }).ok).toBe(false)
  })
})
