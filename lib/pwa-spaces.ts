import type { Metadata, Viewport } from 'next'

/**
 * Espaces Lexora installables comme applications distinctes.
 *
 * Le navigateur retient le manifeste de la page depuis laquelle on installe :
 * un salarié qui installe depuis /salarie obtient « Lexora Salarié », avec son
 * icône et ses raccourcis, sans que l'application publique en soit affectée.
 * Toutes cohabitent sur le même appareil — chaque manifeste porte un `id`
 * différent, et c'est `id` (non le périmètre) qui identifie une application
 * installée.
 *
 * Divergence assumée avec TIBOK, d'où ce modèle est repris : là-bas chaque
 * espace restreint son `scope` à son préfixe. Ici tous les manifestes gardent
 * `"scope": "/"`. Un comptable Lexora circule en permanence entre /comptable,
 * /client, /rh et /profil ; un périmètre étroit le ferait sortir de la fenêtre
 * installée vers un onglet de navigateur au premier clic transversal, en
 * perdant la barre de navigation de l'application.
 *
 * Chaque espace déclare ses métadonnées depuis son layout serveur — Next
 * n'accepte `metadata` que là. Ce fichier centralise la construction pour que
 * les cinq espaces ne divergent pas au fil des modifications.
 */
export interface AppSpace {
  /** Dossier des icônes et suffixe du manifeste (/manifest-<slug>.webmanifest) */
  slug: string
  /** Titre de la page et nom de l'application */
  title: string
  /**
   * Libellé affiché sous l'icône iOS. iOS tronque au-delà d'une douzaine de
   * caractères : mieux vaut abréger nous-mêmes que laisser faire le système.
   */
  appleTitle: string
}

export const APP_SPACES = {
  comptable: {
    slug: 'comptable',
    title: 'Lexora Comptable',
    appleTitle: 'Lexora Compta',
  },
  rh: {
    slug: 'rh',
    title: 'Lexora RH',
    appleTitle: 'Lexora RH',
  },
  salarie: {
    slug: 'salarie',
    title: 'Lexora Salarié',
    appleTitle: 'Lexora Salarié',
  },
  client: {
    slug: 'client',
    title: 'Lexora Client',
    appleTitle: 'Lexora Client',
  },
  admin: {
    slug: 'admin',
    title: 'Lexora Administration',
    appleTitle: 'Lexora Admin',
  },
} satisfies Record<string, AppSpace>

/** Bleu nuit de la marque (--bg-hero). Barre d'état une fois installé. */
export const THEME_COLOR = '#0B0F2E'

export function appSpaceMetadata(space: AppSpace): Metadata {
  const icons = `/icons/${space.slug}`

  return {
    title: space.title,
    manifest: `/manifest-${space.slug}.webmanifest`,
    applicationName: space.title,
    appleWebApp: {
      // Sans ces métadonnées, l'icône ajoutée depuis Safari rouvre une simple
      // fenêtre de navigateur, barre d'adresse comprise.
      capable: true,
      title: space.appleTitle,
      // « default » et non « black-translucent » : ce dernier fait dessiner la
      // page SOUS la barre d'état, et rien dans les feuilles de style du dépôt
      // ne compense les marges de sécurité (env(safe-area-inset-*)) — l'en-tête
      // passerait sous l'horloge.
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        { url: `${icons}/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { url: `${icons}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: `${icons}/apple-touch-icon.png`, sizes: '180x180', type: 'image/png' }],
    },
    // Un espace authentifié n'a rien à faire dans un moteur de recherche.
    robots: { index: false, follow: false },
  }
}

export function appSpaceViewport(): Viewport {
  return { themeColor: THEME_COLOR }
}
