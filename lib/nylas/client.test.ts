import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { nylasRedirectUri, getNylasGrantStatus } from './client'

/**
 * Ces deux fonctions portent le diagnostic de /api/nylas/diag.
 *
 * `nylasRedirectUri` produit l'URL qui doit être déclarée à l'identique dans
 * le tableau de bord Nylas : un slash de trop et l'échange du code échoue en
 * fin de parcours, après que l'utilisateur a déjà accordé ses autorisations.
 *
 * `getNylasGrantStatus` est le seul appel capable de distinguer une boîte
 * vivante d'une boîte dont l'accès a été révoqué — la base, elle, continue de
 * la marquer `active`.
 */

const ENV_KEYS = ['NEXT_PUBLIC_APP_URL', 'NYLAS_API_KEY', 'NYLAS_API_URI'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.NYLAS_API_KEY = 'nyk_test'
  process.env.NYLAS_API_URI = 'https://api.us.nylas.com'
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    void url
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status, headers: { 'Content-Type': 'application/json' } },
    )
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('nylasRedirectUri', () => {
  it('construit l’URL de callback à partir de NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.lexora.finance'
    expect(nylasRedirectUri('https://ignore.example'))
      .toBe('https://www.lexora.finance/api/auth/nylas/callback')
  })

  it('supprime les slashs finaux — Nylas compare la chaîne exacte', () => {
    // Cas réel : la variable est saisie avec un slash final dans Vercel.
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.lexora.finance///'
    expect(nylasRedirectUri('https://ignore.example'))
      .toBe('https://www.lexora.finance/api/auth/nylas/callback')
  })

  it('retombe sur l’origine de la requête si la variable est absente', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(nylasRedirectUri('https://apercu.vercel.app'))
      .toBe('https://apercu.vercel.app/api/auth/nylas/callback')
  })

  it('ignore une variable vide plutôt que de produire une URL relative', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   '
    expect(nylasRedirectUri('https://apercu.vercel.app'))
      .toBe('https://apercu.vercel.app/api/auth/nylas/callback')
  })
})

describe('getNylasGrantStatus', () => {
  it('remonte un grant vivant', async () => {
    mockFetch(200, { data: { grant_status: 'valid', provider: 'google', email: 'a@b.mu' } })
    const s = await getNylasGrantStatus('grant-1')
    expect(s).toEqual({
      httpStatus: 200,
      grantStatus: 'valid',
      provider: 'google',
      email: 'a@b.mu',
      error: null,
    })
  })

  it('interroge bien le grant demandé, en l’échappant', async () => {
    const fn = mockFetch(200, { data: {} })
    await getNylasGrantStatus('gr ant/1')
    expect(fn).toHaveBeenCalledOnce()
    const url = fn.mock.calls[0][0] as unknown as string
    expect(url).toBe('https://api.us.nylas.com/v3/grants/gr%20ant%2F1')
  })

  it('signale un grant révoqué sans jeter', async () => {
    // Accès retiré depuis la console Google : Nylas répond 404, mais la ligne
    // reste `active` en base. C'est exactement le cas que le diagnostic doit
    // nommer au lieu d'afficher une boîte de réception vide.
    mockFetch(404, { error: { message: 'grant not found' } })
    const s = await getNylasGrantStatus('grant-mort')
    expect(s.httpStatus).toBe(404)
    expect(s.grantStatus).toBeNull()
    expect(s.error).toContain('grant not found')
  })

  it('signale une clé serveur refusée', async () => {
    mockFetch(401, { error: { message: 'invalid api key' } })
    const s = await getNylasGrantStatus('grant-1')
    expect(s.httpStatus).toBe(401)
    expect(s.error).toContain('invalid api key')
  })

  it('survit à une réponse non JSON', async () => {
    // Une passerelle qui renvoie du HTML ne doit pas faire tomber le diagnostic.
    mockFetch(502, '<html>Bad Gateway</html>')
    const s = await getNylasGrantStatus('grant-1')
    expect(s.httpStatus).toBe(502)
    expect(s.grantStatus).toBeNull()
    expect(s.error).toContain('Bad Gateway')
  })

  it('tronque le message d’erreur pour ne pas déverser la réponse entière', async () => {
    mockFetch(500, 'x'.repeat(1000))
    const s = await getNylasGrantStatus('grant-1')
    expect(s.error).toHaveLength(200)
  })
})
