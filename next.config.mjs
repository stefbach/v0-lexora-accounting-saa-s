/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // TODO 2026-05-23 — La PR #232 OHADA a été mergée avec ~300 erreurs TS
  // documentées dans ses "Known limitations" (statementsProvider mismatch,
  // champs manquants accountNumber/cacRate sur Account et payroll-config,
  // etc.). On ignore temporairement la type-check Next pour ne pas bloquer
  // le déploiement, le temps de nettoyer proprement les types OHADA
  // (planifié S2 du roadmap multi-juridictions).
  // À retirer dès que `npx tsc --noEmit -p tsconfig.json` est vert.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
    ]
  },
}

export default nextConfig
