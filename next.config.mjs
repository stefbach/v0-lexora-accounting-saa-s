/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Scraping bancaire Playwright sur Vercel serverless.
  // 1) On empêche Next de bundler playwright-core / @sparticuz/chromium
  //    (sinon webpack les transforme en modules externes hashés qui ne
  //    retrouvent plus leurs assets → "Cannot find module browsers.json").
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  // 2) On force le file-tracing Vercel à embarquer les assets non-JS de
  //    playwright-core (browsers.json) + le binaire chromium, pour les
  //    routes qui lancent le robot.
  outputFileTracingIncludes: {
    '/api/client/direction/bank-credentials/scrape': [
      './node_modules/playwright-core/**',
      './node_modules/@sparticuz/chromium/**',
    ],
    '/api/cron/bank-scraper': [
      './node_modules/playwright-core/**',
      './node_modules/@sparticuz/chromium/**',
    ],
    '/api/telegram/internal/bank-scrape': [
      './node_modules/playwright-core/**',
      './node_modules/@sparticuz/chromium/**',
    ],
  },
  // Sprint 1 RH — l'audit a relevé que 12 des 24 URLs RH avaient été
  // renommées en prod par rapport aux conventions historiques. Pour
  // éviter les liens cassés (docs internes, emails, bookmarks, partages
  // entre équipes), on redirige les anciens chemins vers les nouveaux
  // en HTTP 308 (permanent, conserve méthode + body).
  async redirects() {
    return [
      { source: '/rh/contrats',      destination: '/rh/juridique',       permanent: true },
      { source: '/rh/departs',       destination: '/rh/depart',          permanent: true },
      { source: '/rh/carte',         destination: '/rh/geolocalisation', permanent: true },
      { source: '/rh/paie/controle', destination: '/rh/paie/validation', permanent: true },
      { source: '/rh/frais',         destination: '/rh/frais-km',        permanent: true },
      { source: '/rh/gps',           destination: '/rh/trajets-km',      permanent: true },
      { source: '/rh/imports',       destination: '/rh/import-paie',     permanent: true },
      { source: '/rh/historique',    destination: '/rh/historique-paie', permanent: true },
      { source: '/rh/clara',         destination: '/rh/chat',            permanent: true },
      { source: '/rh/exports',       destination: '/rh/exports/paie',    permanent: true },
      // Sprint 2 — /rh/parametres existe maintenant comme hub dédié,
      // donc PAS de redirect ici (sinon la page serait inatteignable).

      // V3-27/30 (mai 2026) — consolidation doublons routes.
      // /comptable/inter-societes était une V1 "lecture + actions optimistes
      // locales" (sans persistance), /comptable/interco est la version
      // complète (CRUD flux + reconciliation paire-à-paire). On supprime
      // la V1 et on redirige les anciens liens (bookmarks, docs) en 308.
      { source: '/comptable/inter-societes', destination: '/comptable/interco', permanent: true },
    ]
  },
}

export default nextConfig
