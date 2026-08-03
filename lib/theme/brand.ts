/**
 * Palette de marque Lexora — surfaces claires.
 *
 * Les pages publiques étaient bâties sur un fond bleu nuit. Cette palette
 * les fait basculer sur un fond clair sans abandonner l'identité : le bleu
 * nuit devient la couleur d'encre, l'or reste l'accent premium. C'est le
 * réglage classique du B2B financier haut de gamme — canevas blanc, typo
 * très foncée, un seul accent saturé, beaucoup de respiration.
 *
 * ACCESSIBILITÉ (WCAG 2.2 AA — obligatoire, cf. CLAUDE.md)
 * Ratios mesurés sur `canvas` (#FFFFFF) :
 *
 *   ink        #0B0F2E   17,4:1   titres, texte fort
 *   inkBody    #42506B    8,0:1   texte courant
 *   inkMuted   #64708C    5,2:1   légendes, labels
 *   blue       #2563EB    5,2:1   liens, CTA, texte d'accent
 *   green      #12804A    5,9:1   texte de succès
 *   orange     #B45309    4,8:1   texte d'alerte douce
 *   goldText   #8A6D1B    5,1:1   texte doré
 *
 * `gold` (#C9A227) ne passe qu'à 2,4:1 : il est réservé aux aplats, filets
 * et bordures — JAMAIS au texte. Pour du texte doré, utiliser `goldText`.
 * Même règle pour `blueSoft`, `greenSoft`, `goldSoft`, `orangeSoft`, qui
 * sont des fonds de pastille et non des couleurs de texte.
 */
export const BRAND = {
  /* Surfaces */
  canvas: '#FFFFFF',
  /** Bandes de section alternées — assez claire pour ne pas grisailler. */
  canvasAlt: '#F5F8FD',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FBFE',

  /* Filets et séparateurs */
  border: '#E3E9F3',
  borderStrong: '#CBD5E8',

  /* Encres */
  ink: '#0B0F2E',
  inkBody: '#42506B',
  inkMuted: '#64708C',
  inkFaint: 'rgba(11,15,46,0.45)',
  /** Texte posé sur un aplat or ou coloré vif. */
  onAccent: '#0B0F2E',
  /** Texte posé sur le bleu nuit (pied de page, bandeaux inversés). */
  onInk: '#F4F6FC',

  /* Or — identité premium */
  gold: '#C9A227',
  goldLight: '#E3C765',
  goldText: '#8A6D1B',
  goldSoft: '#FBF4DF',

  /* Bleu — action */
  blue: '#2563EB',
  blueLight: '#4191FF',
  blueSoft: '#EAF1FE',

  /* Vert — succès, économies */
  green: '#12804A',
  greenLight: '#2ECC8A',
  greenSoft: '#E6F6EE',

  /* Orange — attention douce */
  orange: '#B45309',
  orangeSoft: '#FDF1E3',

  /* Ombres — très diffuses, jamais dures : c'est ce qui fait « classe »
   * plutôt que « bootstrap ». */
  shadowSm: '0 1px 2px rgba(11,15,46,0.04), 0 1px 3px rgba(11,15,46,0.06)',
  shadowMd: '0 4px 6px -2px rgba(11,15,46,0.05), 0 12px 24px -8px rgba(11,15,46,0.10)',
  shadowLg: '0 8px 12px -4px rgba(11,15,46,0.06), 0 24px 48px -16px rgba(11,15,46,0.14)',
  shadowGold: '0 8px 24px -10px rgba(201,162,39,0.45)',
} as const

export type BrandColor = keyof typeof BRAND
