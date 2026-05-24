/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
