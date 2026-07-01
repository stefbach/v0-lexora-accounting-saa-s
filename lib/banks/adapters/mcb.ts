/**
 * Adapter MCB Internet Banking (ibank.mcb.mu).
 *
 * ⚠ SÉLECTEURS À VALIDER : le code ci-dessous utilise des sélecteurs
 * "best-guess" basés sur les patterns courants des portails bancaires
 * mauriciens. Avant activation prod, lance `scripts/discover-mcb-selectors.mjs`
 * en local avec un compte test pour CONFIRMER chaque sélecteur :
 *   pnpm exec node scripts/discover-mcb-selectors.mjs
 *
 * Flow attendu MCB :
 *   1. GET https://ibank.mcb.mu/                       → page login (User ID)
 *   2. Saisie User ID + bouton "Next" / "Continue"     → page password
 *   3. Saisie Password + bouton "Login"                → soit dashboard, soit OTP page
 *   4. Si OTP page : on retourne `manual_needed` avec screenshot.
 *      Le user reçoit Telegram, saisit l'OTP, le bot relance le scrape
 *      avec l'OTP en argument (TODO : flow OTP à implémenter v2).
 *   5. Dashboard : on lit la liste des comptes, on filtre sur le numéro,
 *      on extrait le solde et on clique pour voir les transactions.
 *   6. Page transactions : on extrait les N dernières lignes.
 *
 * Anti-bot : MCB peut détecter Playwright via :
 *   - navigator.webdriver = true → mitigé via patch dans launcher
 *   - User-Agent générique → on override avec un UA Chrome récent
 *   - Fingerprinting timing → on ajoute des waits réalistes
 *
 * Échec gracieux : si n'importe quel sélecteur manque ou que la page
 * affiche un message d'erreur, on retourne `manual_needed` avec
 * screenshot — pas de retry agressif qui pourrait bloquer le compte.
 */

import type { Page } from 'playwright-core'
import type { BankScrapeResult, ScrapedTransaction } from '../scraper'
import { captureScreenshot } from '../playwright-launcher'

export interface McbCredentials {
  username: string                  // User ID MCB
  password: string                  // Mot de passe internet banking
  pin?: string | null               // Optionnel : PIN secondaire si configuré
}

export interface McbAdapterOptions {
  /** Numéro de compte à scraper (filtre côté UI MCB) */
  numero_compte: string
  /** Nombre de transactions à récupérer (défaut 30) */
  max_transactions?: number
  /** URL de connexion (override) ; défaut https://ibank.mcb.mu/ */
  login_url?: string
}

/**
 * Sélecteurs MCB — à vérifier sur le portail réel.
 * Format `data-testid` priorisé s'il existe, sinon CSS / ARIA.
 */
const SEL = {
  // Étape 1 : page username
  usernameInput: 'input[name="userId"], input[id="userId"], input[placeholder*="User ID" i]',
  usernameNextButton: 'button[type="submit"], button:has-text("Next"), button:has-text("Continue")',

  // Étape 2 : page password (peut être sur même page ou suivante)
  passwordInput: 'input[type="password"], input[name="password"], input[id="password"]',
  loginButton: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign in")',

  // Étape 3 : détection OTP
  otpInput: 'input[name*="otp" i], input[id*="otp" i], input[placeholder*="OTP" i], input[placeholder*="One Time" i]',
  otpForm: 'form:has(input[name*="otp" i]), :text("One Time Password"), :text("OTP")',

  // Étape 4 : dashboard — détection
  dashboardMarker: ':text("Welcome"), :text("Dashboard"), :text("Accounts"), .account-list, [data-testid="dashboard"]',
  loginError: '.error-message, .alert-danger, :text("Invalid"), :text("incorrect")',

  // Étape 5 : liste comptes (à adapter)
  accountRow: '[data-account-number], .account-item, tr.account',
  accountBalance: '.balance, [data-balance], .account-balance',

  // Étape 6 : transactions
  transactionRow: 'table.transactions tr, [data-testid="transaction-row"], .transaction-item',
  transactionDate: '.date, td:nth-child(1)',
  transactionDesc: '.description, td:nth-child(2)',
  transactionAmount: '.amount, td:nth-child(3)',
}

export async function loginAndScrapeMcb(
  page: Page,
  credentials: McbCredentials,
  options: McbAdapterOptions,
): Promise<BankScrapeResult> {
  const t0 = Date.now()
  const maxTx = options.max_transactions ?? 30

  try {
    // ── 1. Navigation page login ──
    await page.goto(options.login_url || 'https://ibank.mcb.mu/', { waitUntil: 'domcontentloaded', timeout: 30000 })

    // ── 2. Saisie User ID ──
    const usernameField = await page.waitForSelector(SEL.usernameInput, { timeout: 10000 }).catch(() => null)
    if (!usernameField) {
      return {
        status: 'manual_needed',
        error: 'Champ User ID introuvable — MCB a probablement modifié sa page login',
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }
    await usernameField.fill(credentials.username)
    await page.click(SEL.usernameNextButton).catch(() => {})

    // ── 3. Saisie Password (peut être sur même page ou nouvelle) ──
    const passwordField = await page.waitForSelector(SEL.passwordInput, { timeout: 10000 }).catch(() => null)
    if (!passwordField) {
      return {
        status: 'manual_needed',
        error: 'Champ password introuvable après saisie User ID',
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }
    await passwordField.fill(credentials.password)
    await page.click(SEL.loginButton)

    // ── 4. Attendre soit dashboard, soit OTP, soit erreur ──
    const outcome = await Promise.race([
      page.waitForSelector(SEL.dashboardMarker, { timeout: 20000 }).then(() => 'dashboard' as const).catch(() => null),
      page.waitForSelector(SEL.otpInput, { timeout: 20000 }).then(() => 'otp' as const).catch(() => null),
      page.waitForSelector(SEL.loginError, { timeout: 20000 }).then(() => 'error' as const).catch(() => null),
    ])

    if (outcome === 'otp') {
      // OTP requis — on capture le state et on demande au user de saisir.
      // TODO v2 : implémenter le flow OTP via Telegram (notif user, attente
      // réponse, resume avec OTP fourni)
      return {
        status: 'manual_needed',
        error: 'MCB demande un OTP. Flow OTP automatique pas encore implémenté — login en attente.',
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }

    if (outcome === 'error') {
      return {
        status: 'failed',
        error: 'MCB a rejeté les credentials (mot de passe incorrect ?)',
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }

    if (outcome !== 'dashboard') {
      return {
        status: 'manual_needed',
        error: 'Page inconnue après login (ni dashboard, ni OTP, ni erreur)',
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }

    // ── 5. Extraction solde du compte ciblé ──
    // ⚠ Cette section dépend fortement de la structure HTML MCB.
    // À valider impérativement avec un test live.
    const balance = await page.evaluate((numeroCompte: string) => {
      const rows = Array.from(document.querySelectorAll('[data-account-number], .account-item, tr'))
      for (const row of rows) {
        const text = row.textContent || ''
        if (text.includes(numeroCompte)) {
          const balanceEl = row.querySelector('.balance, [data-balance], .amount, td:last-child')
          if (balanceEl) {
            const raw = balanceEl.textContent?.replace(/[^\d.,-]/g, '').replace(/,/g, '') || ''
            const n = parseFloat(raw)
            if (isFinite(n)) return n
          }
        }
      }
      return null
    }, options.numero_compte)

    if (balance == null) {
      return {
        status: 'manual_needed',
        error: `Compte ${options.numero_compte} introuvable dans le dashboard MCB`,
        screenshot_b64: await captureScreenshot(page),
        duration_ms: Date.now() - t0,
      }
    }

    // ── 6. Extraction transactions ──
    // TODO : naviguer vers la page transactions du compte (clic sur la row, puis scroll/paginate)
    const transactions: ScrapedTransaction[] = await page.evaluate((maxN: number) => {
      const rows = Array.from(document.querySelectorAll('table.transactions tr, [data-testid="transaction-row"], .transaction-item'))
      const out: Array<{ date: string; description: string; amount: number; currency: string }> = []
      for (const row of rows.slice(0, maxN)) {
        const cells = Array.from(row.querySelectorAll('td, [data-field]'))
        if (cells.length < 3) continue
        const date = cells[0]?.textContent?.trim() || ''
        const desc = cells[1]?.textContent?.trim() || ''
        const amountStr = cells[2]?.textContent?.replace(/[^\d.,-]/g, '').replace(/,/g, '') || ''
        const amount = parseFloat(amountStr)
        if (date && desc && isFinite(amount)) {
          // Format date YYYY-MM-DD (MCB renvoie souvent DD/MM/YYYY)
          const d = date.match(/(\d{2})\/(\d{2})\/(\d{4})/)
          const isoDate = d ? `${d[3]}-${d[2]}-${d[1]}` : date
          out.push({ date: isoDate, description: desc, amount, currency: 'MUR' })
        }
      }
      return out
    }, maxTx)

    return {
      status: 'success',
      balance_mur: balance,
      balance_devise: 'MUR',
      nb_transactions: transactions.length,
      transactions,
      duration_ms: Date.now() - t0,
    }
  } catch (e) {
    return {
      status: 'failed',
      error: e instanceof Error ? e.message : 'Erreur scraping inconnue',
      screenshot_b64: await captureScreenshot(page).catch(() => undefined),
      duration_ms: Date.now() - t0,
    }
  }
}
