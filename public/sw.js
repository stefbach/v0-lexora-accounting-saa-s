/*
 * Service worker Lexora.
 *
 * Rôle volontairement étroit. Lexora manipule de la comptabilité, des
 * bulletins de paie et des données fiscales : un service worker trop zélé peut
 * servir à un utilisateur une page mise en cache pour un autre, ou un bilan
 * périmé. La règle tenue ici est donc simple —
 *
 *   • On ne met en cache QUE des fichiers statiques immuables, dont le nom
 *     contient déjà une empreinte (/_next/static/…), plus les icônes et
 *     polices de la marque. Ces fichiers ne contiennent aucune donnée
 *     d'entreprise et ne changent jamais à URL constante.
 *   • Les pages (navigations) partent TOUJOURS sur le réseau. Rien n'est
 *     stocké : hors ligne, on retombe sur /offline.html, jamais sur une page
 *     déjà consultée.
 *   • /api/ et /auth/ sont ignorés de bout en bout : le service worker ne
 *     s'interpose ni sur les données, ni sur les redirections d'authentification
 *     Supabase (échange de code, pose de cookies).
 *
 * Conséquence assumée : l'application ne fonctionne pas hors ligne. Ce n'est
 * pas l'objectif — la comptabilité vit dans Supabase, pas dans le navigateur.
 * L'objectif est l'installation sur l'écran d'accueil, le démarrage instantané
 * et un message clair en cas de coupure.
 */

const VERSION = 'lexora-v1'
const STATIC_CACHE = `${VERSION}-static`
const OFFLINE_URL = '/offline.html'

/** Au-delà, on purge les entrées les plus anciennes : les empreintes de build
 *  successifs s'accumuleraient sinon indéfiniment. */
const MAX_STATIC_ENTRIES = 200

/**
 * Chemins que le service worker ne doit jamais toucher, même en lecture.
 * Écrits sans barre oblique finale : la racine compte autant que ses
 * sous-chemins.
 */
const NEVER_HANDLE = ['/api', '/auth']

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)$/i.test(url.pathname)
  )
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  // keys() rend les entrées dans leur ordre d'insertion : les premières sont
  // les plus anciennes.
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i])
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // Une page de repli manquante ne doit pas faire échouer l'installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('lexora-') && name !== STATIC_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Rien d'autre que notre propre origine, en http(s).
  if (url.origin !== self.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (NEVER_HANDLE.some((prefix) => url.pathname.startsWith(prefix))) return

  // Navigations : réseau uniquement, avec repli hors ligne. Aucune page n'est
  // conservée — c'est ce qui garantit qu'aucun contenu comptable ne peut
  // survivre dans le cache du navigateur via le service worker.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match(OFFLINE_URL)
        return (
          fallback ||
          new Response('Hors ligne', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        )
      }),
    )
    return
  }

  if (!isImmutableAsset(url)) return

  // Statique immuable : cache d'abord, réseau ensuite, puis mise en cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        // On ne conserve que les réponses complètes et sans consigne
        // explicite de non-stockage.
        const cacheControl = response.headers.get('Cache-Control') || ''
        if (
          response.ok &&
          response.type === 'basic' &&
          response.status === 200 &&
          !/no-store/i.test(cacheControl)
        ) {
          const copy = response.clone()
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(request, copy))
            .then(() => trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES))
            .catch(() => undefined)
        }
        return response
      })
    }),
  )
})

// Permet à la page de forcer l'activation d'une nouvelle version.
self.addEventListener('message', (event) => {
  if (event.data === 'lexora:skip-waiting') self.skipWaiting()
})
