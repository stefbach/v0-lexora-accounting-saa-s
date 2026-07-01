/**
 * Launcher Playwright unifié pour scraping Vercel + local.
 *
 * Sur Vercel, on utilise @sparticuz/chromium (binaire compatible serverless,
 * sans dépendances système). En local dev, on utilise le Chromium classique
 * via PLAYWRIGHT_BROWSERS_PATH si dispo, sinon fallback @sparticuz.
 *
 * Toujours retourner { browser, context, page } pour que l'appelant gère
 * la cleanup explicitement (les serverless invocations doivent fermer
 * proprement le browser, sinon fuite mémoire + cold start lent).
 *
 * Usage type :
 *   const { browser, page, close } = await launchBrowser()
 *   try { ... } finally { await close() }
 */

import type { Browser, BrowserContext, Page } from 'playwright-core'

export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
  close: () => Promise<void>
}

export interface LaunchOptions {
  /** Timeout par défaut sur les actions Playwright (ms). Vercel a 60s max — ne pas dépasser ~50s. */
  defaultTimeout?: number
  /** User-Agent custom (banques détectent parfois l'absence d'UA). */
  userAgent?: string
  /** Forcer le mode headless. Mettre false uniquement en local pour debug. */
  headless?: boolean
}

const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function launchBrowser(opts: LaunchOptions = {}): Promise<BrowserSession> {
  const { chromium } = await import('playwright-core')

  // En env Vercel/serverless on a besoin du binaire chromium spécifique.
  // En local, si PLAYWRIGHT_BROWSERS_PATH est défini ou que Chromium est installé,
  // playwright-core le trouvera tout seul (executablePath = undefined).
  let executablePath: string | undefined
  let args: string[] = ['--no-sandbox', '--disable-dev-shm-usage']

  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
  if (isServerless) {
    // ⚠ Vercel n'expose PAS AWS_EXECUTION_ENV / AWS_LAMBDA_JS_RUNTIME. Or
    // @sparticuz/chromium ne détecte l'environnement Lambda (et donc n'extrait
    // les librairies système comme libnss3.so depuis al2023.tar.br) que si ces
    // variables sont présentes. Sans ça : « /tmp/chromium: error while loading
    // shared libraries: libnss3.so ». On force la détection Node20+/AL2023
    // AVANT l'import du module (sa détection tourne au chargement + dans
    // executablePath()).
    process.env.AWS_LAMBDA_JS_RUNTIME ||= 'nodejs20.x'

    // @sparticuz/chromium est publié en CJS et son typing n'expose pas de
    // `.default`. Selon le mode d'interop ESM (ESM strict vs Node interop
    // historique), `import` peut placer l'API sur `.default` ou directement
    // sur le namespace. On gère les deux en castant via `unknown`.
    type SparticuzChromium = {
      args: string[]
      executablePath: () => Promise<string>
      headless?: boolean
    }
    const sparticuz = await import('@sparticuz/chromium') as unknown as SparticuzChromium & { default?: SparticuzChromium }
    const chromiumModule: SparticuzChromium = sparticuz.default ?? sparticuz
    // Déclenche l'inflation de chromium + al2023.tar.br (libs) dans /tmp.
    executablePath = await chromiumModule.executablePath()
    // Ceinture + bretelles : si le setup de librairie du module a tourné avant
    // que la détection soit forcée, LD_LIBRARY_PATH peut manquer /tmp/al2023/lib.
    // On l'ajoute explicitement pour que Chromium trouve ses .so.
    const libDir = '/tmp/al2023/lib'
    if (!(process.env.LD_LIBRARY_PATH || '').split(':').includes(libDir)) {
      process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
        ? `${process.env.LD_LIBRARY_PATH}:${libDir}`
        : libDir
    }
    process.env.FONTCONFIG_PATH ||= '/tmp/fonts'
    args = [...chromiumModule.args, ...args]
  }

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    executablePath,
    args,
  })

  const context = await browser.newContext({
    userAgent: opts.userAgent ?? DEFAULT_UA,
    locale: 'en-US',
    timezoneId: 'Indian/Mauritius',
    viewport: { width: 1280, height: 800 },
  })

  const page = await context.newPage()
  if (opts.defaultTimeout) page.setDefaultTimeout(opts.defaultTimeout)

  const close = async () => {
    try { await context.close() } catch { /* ignore */ }
    try { await browser.close() } catch { /* ignore */ }
  }

  return { browser, context, page, close }
}

/**
 * Capture un screenshot PNG en base64 pour stockage en DB ou envoi Telegram.
 * Limité à `fullPage: false` (viewport visible) pour rester sous la limite
 * de payload Telegram (~10MB) — un screenshot full-page peut peser 5MB+.
 */
export async function captureScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ fullPage: false, type: 'png' })
  return Buffer.from(buf).toString('base64')
}

/**
 * Capture un diagnostic de la page courante : URL, titre, et la liste des
 * champs (inputs) et boutons visibles avec leurs attributs (name/id/type/
 * placeholder). Sert à corriger les sélecteurs d'un adapter bancaire depuis
 * l'appli sans avoir besoin des identifiants ni d'un script local.
 * Ne capture AUCUNE valeur saisie — uniquement la structure du formulaire.
 */
export async function capturePageDiagnostic(page: Page): Promise<{
  url: string
  title?: string
  inputs: Array<{ tag: string; type?: string; name?: string; id?: string; placeholder?: string; label?: string; visible: boolean }>
  buttons: Array<{ tag: string; type?: string; name?: string; id?: string; placeholder?: string; label?: string; visible: boolean }>
  clickables: Array<{ tag: string; type?: string; name?: string; id?: string; placeholder?: string; label?: string; visible: boolean }>
}> {
  const url = page.url()
  const title = await page.title().catch(() => undefined)
  const data = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 40).map((el) => {
      const e = el as HTMLInputElement
      return {
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || undefined,
        name: e.getAttribute('name') || undefined,
        id: e.getAttribute('id') || undefined,
        placeholder: e.getAttribute('placeholder') || undefined,
        label: (e.getAttribute('aria-label') || '').slice(0, 60) || undefined,
        visible: isVisible(el),
      }
    })
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"], input[type="button"]')).slice(0, 40).map((el) => {
      const e = el as HTMLElement
      return {
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || undefined,
        name: e.getAttribute('name') || undefined,
        id: e.getAttribute('id') || undefined,
        placeholder: undefined,
        label: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 60) || undefined,
        visible: isVisible(el),
      }
    })
    // Cliquables des SPA (cartes, tuiles, liens de contexte) — pas des <button>.
    const clickSel = 'a, [role="button"], [role="listitem"], li, [class*="card" i], [class*="tile" i], [class*="context" i], [class*="account" i], [class*="select" i], [tabindex]'
    const seen = new Set()
    const clickables = Array.from(document.querySelectorAll(clickSel)).map((el) => {
      const e = el as HTMLElement
      const text = (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
      return {
        tag: e.tagName.toLowerCase(),
        type: undefined,
        name: undefined,
        id: e.getAttribute('id') || undefined,
        placeholder: (e.getAttribute('class') || '').slice(0, 80) || undefined,
        label: text.slice(0, 80) || undefined,
        visible: isVisible(el),
      }
    }).filter((c) => {
      if (!c.visible || !c.label) return false
      const k = `${c.tag}|${c.label}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).slice(0, 40)
    return { inputs, buttons, clickables }
  }).catch(() => ({ inputs: [], buttons: [], clickables: [] }))
  return { url, title, inputs: data.inputs, buttons: data.buttons, clickables: data.clickables }
}
