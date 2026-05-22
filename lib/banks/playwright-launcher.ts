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
    const sparticuz = await import('@sparticuz/chromium')
    const chromiumModule = (sparticuz.default || sparticuz) as typeof import('@sparticuz/chromium').default
    executablePath = await chromiumModule.executablePath()
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
