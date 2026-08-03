import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  nylasRedirectUri, getNylasGrantStatus, probeNylasApplication,
  checkNylasApplication, listNylasConnectors, NYLAS_REGIONS,
} from './client'

/**
 * Ces fonctions portent le diagnostic de /api/nylas/diag et le garde-fou de
 * /api/auth/nylas/init.
 *
 * `nylasRedirectUri` produit l'URL qui doit être déclarée à l'identique dans
 * le tableau de bord Nylas : un slash de trop et l'échange du code échoue en
 * fin de parcours, après que l'utilisateur a déjà accordé ses autorisations.
 *
 * `getNylasGrantStatus` est le seul appel capable de distinguer une boîte
 * vivante d'une boîte dont l'accès a été révoqué — la base, elle, continue de
 * la marquer `active`.
 *
 * `probeNylasApplication` et `checkNylasApplication` tranchent les deux causes
 * de « Application not found: 404/50002 » : mauvaise région, ou client_id
 * étranger à l'application de la clé serveur. Les deux hôtes régionaux
 * renvoient un message rigoureusement identique, d'où la double sonde.
 */

const ENV_KEYS = ['NEXT_PUBLIC_APP_URL', 'NYLAS_API_KEY', 'NYLAS_API_URI', 'NYLAS_CLIENT_ID'] as const
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

describe('probeNylasApplication', () => {
  it('interroge l’hôte de la région demandée, pas NYLAS_API_URI', async () => {
    // Le but de la sonde est précisément de tester l'AUTRE région que celle
    // configurée : elle ne doit donc pas se laisser dicter l'hôte par l'env.
    process.env.NYLAS_API_URI = NYLAS_REGIONS.us
    const fn = mockFetch(200, { data: { application_id: 'app-1' } })
    await probeNylasApplication('eu')
    expect(fn.mock.calls[0][0]).toBe(`${NYLAS_REGIONS.eu}/v3/applications`)
  })

  it('signale que le client_id configuré est celui de l’application', async () => {
    process.env.NYLAS_CLIENT_ID = 'app-1'
    mockFetch(200, { data: { application_id: 'app-1' } })
    const p = await probeNylasApplication('us')
    expect(p.httpStatus).toBe(200)
    expect(p.applicationId).toBe('app-1')
    expect(p.correspondAuClientId).toBe(true)
    expect(p.error).toBeNull()
  })

  it('signale un client_id qui n’est pas celui de la clé serveur', async () => {
    // Clé serveur et client_id issus de deux applications différentes : la
    // région est bonne, mais /v3/connect/auth renvoie quand même 50002.
    process.env.NYLAS_CLIENT_ID = 'app-autre'
    mockFetch(200, { data: { application_id: 'app-1' } })
    const p = await probeNylasApplication('us')
    expect(p.correspondAuClientId).toBe(false)
  })

  it('ne conclut rien quand le client_id n’est pas configuré', async () => {
    delete process.env.NYLAS_CLIENT_ID
    mockFetch(200, { data: { application_id: 'app-1' } })
    const p = await probeNylasApplication('us')
    expect(p.correspondAuClientId).toBeNull()
  })

  it('remonte une région qui ne reconnaît pas la clé', async () => {
    // Cas réel visé : l'application vit en EU, NYLAS_API_URI pointe sur US.
    mockFetch(401, { error: { message: 'unauthorized' } })
    const p = await probeNylasApplication('us')
    expect(p.httpStatus).toBe(401)
    expect(p.applicationId).toBeNull()
    expect(p.error).toContain('unauthorized')
  })

  it('ne jette pas si l’hôte est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND') }))
    const p = await probeNylasApplication('eu')
    expect(p.httpStatus).toBe(0)
    expect(p.error).toContain('ENOTFOUND')
  })
})

describe('checkNylasApplication', () => {
  /** Répond 200 sur l'hôte de `regionVivante`, 404 sur l'autre. */
  function mockRegions(regionVivante: 'us' | 'eu', applicationId = 'app-1') {
    const hoteVivant = NYLAS_REGIONS[regionVivante]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.startsWith(hoteVivant)
        ? new Response(JSON.stringify({ data: { application_id: applicationId } }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
    )))
  }

  it('ne signale rien quand région et client_id concordent', async () => {
    process.env.NYLAS_API_URI = NYLAS_REGIONS.us
    process.env.NYLAS_CLIENT_ID = 'app-1'
    mockRegions('us')
    const c = await checkNylasApplication()
    expect(c.regionDetectee).toBe('us')
    expect(c.probleme).toBeNull()
  })

  it('nomme la bonne région quand NYLAS_API_URI pointe sur la mauvaise', async () => {
    // Le cas qui produit « Application not found: 404/50002 » en production :
    // l'application est en EU, la configuration interroge les États-Unis.
    process.env.NYLAS_API_URI = NYLAS_REGIONS.us
    process.env.NYLAS_CLIENT_ID = 'app-1'
    mockRegions('eu')
    const c = await checkNylasApplication()
    expect(c.regionDetectee).toBe('eu')
    expect(c.probleme).toContain('eu')
    expect(c.probleme).toContain(NYLAS_REGIONS.eu)
  })

  it('tolère un NYLAS_API_URI avec slash final', async () => {
    process.env.NYLAS_API_URI = `${NYLAS_REGIONS.us}/`
    process.env.NYLAS_CLIENT_ID = 'app-1'
    mockRegions('us')
    expect((await checkNylasApplication()).probleme).toBeNull()
  })

  it('prend api.us par défaut quand NYLAS_API_URI est absente', async () => {
    delete process.env.NYLAS_API_URI
    process.env.NYLAS_CLIENT_ID = 'app-1'
    mockRegions('us')
    const c = await checkNylasApplication()
    expect(c.hoteConfigure).toBe(NYLAS_REGIONS.us)
    expect(c.probleme).toBeNull()
  })

  it('distingue un client_id d’une autre application et donne la bonne valeur', async () => {
    // Le message doit porter le correctif : sans l'application_id attendu,
    // l'utilisateur sait que c'est faux sans savoir quoi mettre à la place.
    process.env.NYLAS_API_URI = NYLAS_REGIONS.us
    process.env.NYLAS_CLIENT_ID = 'app-autre'
    mockRegions('us', 'app-1')
    const c = await checkNylasApplication()
    expect(c.regionDetectee).toBe('us')
    expect(c.probleme).toContain('NYLAS_CLIENT_ID')
    expect(c.probleme).toContain('app-1')
  })

  it('signale une clé serveur rejetée partout', async () => {
    process.env.NYLAS_API_URI = NYLAS_REGIONS.us
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const c = await checkNylasApplication()
    expect(c.regionDetectee).toBeNull()
    expect(c.probleme).toContain('NYLAS_API_KEY')
  })
})

describe('listNylasConnectors', () => {
  it('interroge l’hôte configuré et remonte les providers', async () => {
    process.env.NYLAS_API_URI = NYLAS_REGIONS.eu
    const fn = mockFetch(200, { data: [{ provider: 'google' }, { provider: 'microsoft' }] })
    const c = await listNylasConnectors()
    expect(fn.mock.calls[0][0]).toBe(`${NYLAS_REGIONS.eu}/v3/connectors`)
    expect(c.providers).toEqual(['google', 'microsoft'])
    expect(c.httpStatus).toBe(200)
    expect(c.error).toBeNull()
  })

  it('rend une liste vide sur une application neuve', async () => {
    // Cas réel : application fraîchement créée — aucun connecteur. L'auth
    // s'interrompt alors chez Nylas sans jamais rappeler /callback.
    mockFetch(200, { data: [] })
    const c = await listNylasConnectors()
    expect(c.httpStatus).toBe(200)
    expect(c.providers).toEqual([])
    expect(c.error).toBeNull()
  })

  it('ignore les entrées sans provider exploitable', async () => {
    mockFetch(200, { data: [{ provider: '  google ' }, {}, { provider: '' }] })
    expect((await listNylasConnectors()).providers).toEqual(['google'])
  })

  it('signale une clé serveur refusée sans jeter', async () => {
    mockFetch(401, { error: { message: 'unauthorized' } })
    const c = await listNylasConnectors()
    expect(c.httpStatus).toBe(401)
    expect(c.providers).toEqual([])
    expect(c.error).toContain('unauthorized')
  })

  it('ne jette pas si l’hôte est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND') }))
    const c = await listNylasConnectors()
    expect(c.httpStatus).toBe(0)
    expect(c.error).toContain('ENOTFOUND')
  })
})
