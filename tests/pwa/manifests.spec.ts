import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { APP_SPACES, THEME_COLOR } from '@/lib/pwa-spaces'

/**
 * Le socle de l'application installable ne se casse pas bruyamment : un
 * manifeste qui pointe vers une icône renommée ne lève aucune erreur au build
 * et ne fait pas échouer le déploiement. Le site cesse simplement d'être
 * installable, ou s'installe avec une icône vide — et personne ne le remarque
 * avant qu'un client ne le signale.
 *
 * Ces tests verrouillent donc les invariants que ni TypeScript ni Next ne
 * vérifient : cohérence entre les manifestes, les icônes réellement présentes
 * sur le disque et la table des espaces de lib/pwa-spaces.ts.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public')

interface Manifest {
  id: string
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type?: string; purpose?: string }[]
  shortcuts?: { name: string; url: string; icons?: { src: string }[] }[]
}

function read(file: string): Manifest {
  return JSON.parse(readFileSync(path.join(PUBLIC_DIR, file), 'utf-8'))
}

const MANIFEST_FILES = [
  'manifest.webmanifest',
  ...Object.values(APP_SPACES).map((s) => `manifest-${s.slug}.webmanifest`),
]

describe('manifestes PWA', () => {
  it('existe un manifeste par espace déclaré, plus celui de l’application publique', () => {
    const onDisk = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.webmanifest')).sort()
    expect(onDisk).toEqual([...MANIFEST_FILES].sort())
  })

  it.each(MANIFEST_FILES)('%s : champs requis et valeurs de marque', (file) => {
    const m = read(file)

    expect(m.id).toBeTruthy()
    expect(m.name).toBeTruthy()
    expect(m.start_url).toBeTruthy()
    expect(m.display).toBe('standalone')
    expect(m.theme_color).toBe(THEME_COLOR)
    expect(m.background_color).toBe('#FFFFFF')

    // iOS tronque au-delà d'une douzaine de caractères sous l'icône.
    expect(m.short_name.length).toBeLessThanOrEqual(14)
  })

  it('chaque manifeste porte un `id` unique — c’est lui qui distingue deux applications installées', () => {
    const ids = MANIFEST_FILES.map((f) => read(f).id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('garde un périmètre large partout : un comptable circule entre /comptable, /client et /rh', () => {
    for (const file of MANIFEST_FILES) {
      expect(read(file).scope).toBe('/')
    }
  })

  it('démarre dans le périmètre déclaré', () => {
    for (const file of MANIFEST_FILES) {
      const m = read(file)
      expect(m.start_url.startsWith(m.scope)).toBe(true)
    }
  })

  it('marque chaque ouverture comme venant de l’application installée', () => {
    for (const file of MANIFEST_FILES) {
      const m = read(file)
      const urls = [m.start_url, ...(m.shortcuts ?? []).map((s) => s.url)]
      for (const url of urls) {
        expect(new URLSearchParams(url.split('?')[1] ?? '').get('source')).toBe('pwa')
      }
    }
  })

  it('référence des icônes qui existent réellement dans public/', () => {
    for (const file of MANIFEST_FILES) {
      const m = read(file)
      const sources = [
        ...m.icons.map((i) => i.src),
        ...(m.shortcuts ?? []).flatMap((s) => (s.icons ?? []).map((i) => i.src)),
      ]
      for (const src of sources) {
        expect(existsSync(path.join(PUBLIC_DIR, src)), `${file} → ${src}`).toBe(true)
      }
    }
  })

  it('fournit les deux tailles en `any` ET en `maskable`', () => {
    // Sans `maskable`, Android recadre l'icône carrée dans un cercle et rogne
    // le lettrage ; sans `any`, les plateformes qui n'appliquent aucun masque
    // affichent une icône pleine bord à bord.
    for (const file of MANIFEST_FILES) {
      const m = read(file)
      for (const purpose of ['any', 'maskable']) {
        const sizes = m.icons.filter((i) => i.purpose === purpose).map((i) => i.sizes).sort()
        expect(sizes, `${file} / ${purpose}`).toEqual(['192x192', '512x512'])
      }
    }
  })
})

describe('icônes des espaces', () => {
  it.each(Object.values(APP_SPACES))('$slug : jeu d’icônes complet, icône Apple comprise', (space) => {
    for (const name of [
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-192.png',
      'icon-maskable-512.png',
      // iOS ignore le manifeste : l'icône d'accueil vient de ce fichier,
      // référencé par appSpaceMetadata().
      'apple-touch-icon.png',
    ]) {
      expect(existsSync(path.join(PUBLIC_DIR, 'icons', space.slug, name)), name).toBe(true)
    }
  })
})

describe('service worker', () => {
  const sw = readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf-8')

  it('sert une page de repli hors ligne, et elle existe', () => {
    expect(sw).toContain("OFFLINE_URL = '/offline.html'")
    expect(existsSync(path.join(PUBLIC_DIR, 'offline.html'))).toBe(true)
  })

  it('ne s’interpose jamais sur /api ni sur /auth', () => {
    expect(sw).toContain("NEVER_HANDLE = ['/api', '/auth']")
  })

  it('ne met en cache aucune navigation — aucune page comptable ne doit survivre au cache', () => {
    // Le seul `cache.put` du fichier est gardé par isImmutableAsset(), atteint
    // uniquement après le `return` de la branche des navigations.
    const navigation = sw.indexOf("request.mode === 'navigate'")
    const put = sw.indexOf('cache.put')
    expect(navigation).toBeGreaterThan(-1)
    expect(put).toBeGreaterThan(navigation)
    expect(sw.slice(navigation, put)).toContain('if (!isImmutableAsset(url)) return')
  })
})
