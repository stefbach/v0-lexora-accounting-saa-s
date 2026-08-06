/**
 * Reconnaissance du navigateur Android, pour le seul besoin de l'installation.
 *
 * Sur Android, « installer une application web » ne veut pas dire la même chose
 * selon le navigateur, et c'est la source d'un échec que rien dans notre code
 * ne peut corriger :
 *
 *  • Chrome, Edge, Opera et Brave délèguent la fabrication du paquet au
 *    serveur de Google (« WebAPK minting »). Le paquet renvoyé est signé et
 *    compilé avec un `targetSdkVersion` à jour : il s'installe sans heurt.
 *
 *  • Samsung Internet fabrique le paquet SUR L'APPAREIL, avec un
 *    `targetSdkVersion` resté ancien. Depuis Android 13, le système refuse
 *    d'installer un paquet visant un SDK aussi vieux : Play Protect affiche
 *    « Appli non sécurisée bloquée — cette application a été conçue pour une
 *    version plus ancienne d'Android », puis le navigateur notifie
 *    « Impossible d'installer l'application Web ». Le manifeste, les icônes et
 *    le service worker n'y sont pour rien — le même site s'installe
 *    normalement depuis Chrome sur le même téléphone.
 *
 *  • Les navigateurs intégrés aux applications (Facebook, Instagram,
 *    WhatsApp, LinkedIn, TikTok…) n'installent rien du tout : ce sont des
 *    WebView, sans menu d'installation.
 *
 *  • Firefox Android ne pose qu'un raccourci, sans paquet ni fenêtre autonome.
 *
 * D'où ces fonctions : elles servent à envoyer l'utilisateur vers le chemin
 * qui aboutit, au lieu de le laisser buter sur un avertissement de sécurité
 * qui lui fait croire que Lexora est un logiciel malveillant.
 */

export type AndroidBrowser = 'chromium' | 'samsung' | 'in-app' | 'firefox' | 'unknown'

/** Navigateurs intégrés aux applications : aucune installation possible. */
const IN_APP = /\bFBAN\/|\bFBAV\/|FB_IAB|Instagram|LinkedInApp|TikTok|MicroMessenger|\bLine\/|WhatsApp|Twitter|Snapchat|Pinterest/i

/** Chromium « nu » embarqué comme WebView (`; wv)` dans l'agent utilisateur). */
const WEBVIEW = /;\s*wv\)/i

/**
 * Identifie le navigateur Android à partir de l'agent utilisateur.
 *
 * L'ordre des tests est significatif : Samsung Internet et les WebView
 * annoncent tous « Chrome/… » dans leur agent utilisateur, et seraient pris
 * pour Chrome si on cherchait Chrome en premier.
 */
export function detectAndroidBrowser(userAgent: string): AndroidBrowser {
  if (!/Android/i.test(userAgent)) return 'unknown'
  if (IN_APP.test(userAgent) || WEBVIEW.test(userAgent)) return 'in-app'
  if (/SamsungBrowser\//i.test(userAgent)) return 'samsung'
  if (/Firefox\/|FxiOS/i.test(userAgent)) return 'firefox'
  // Edge (EdgA), Opera (OPR) et Brave passent tous par le serveur de Google.
  if (/Chrome\/|CriOS|EdgA\/|OPR\//i.test(userAgent)) return 'chromium'
  return 'unknown'
}

/**
 * Le navigateur sait-il produire une application installable qui s'installe
 * réellement ? `false` signifie : proposer d'ouvrir la page dans Chrome.
 */
export function canInstallCleanly(browser: AndroidBrowser): boolean {
  return browser === 'chromium' || browser === 'unknown'
}

/**
 * Lien qui rouvre une URL dans Chrome depuis un autre navigateur Android.
 *
 * `intent://` est la seule façon de désigner explicitement une application
 * cible depuis une page web. `S.browser_fallback_url` couvre le cas où Chrome
 * est absent de l'appareil : sans lui, le lien ne fait rien du tout.
 *
 * Rend `null` si l'URL n'est pas en https — un intent ne doit jamais servir à
 * relayer autre chose que notre propre site.
 */
export function chromeIntentUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const target = `${url.host}${url.pathname}${url.search}`
  return (
    `intent://${target}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url.toString())};end`
  )
}
