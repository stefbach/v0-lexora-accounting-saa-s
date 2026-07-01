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
import { captureScreenshot, capturePageDiagnostic } from '../playwright-launcher'

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
 * Sélecteurs MCB « Internet Banking Pro » (identity.mcb.mu, plateforme
 * Backbase/Keycloak) — confirmés via le diagnostic live (juillet 2026).
 * ⚠ Le mot de passe visible est chiffré côté navigateur (champ RSA
 * `bbRsaPublicKey`) : il FAUT taper au clavier (pressSequentially), pas fill().
 */
const SEL = {
  // Login page (username + password sur la MÊME page)
  usernameInput: '#username, input[name="username"]',
  // Champ VISIBLE (le hidden #password reçoit la version chiffrée à la soumission)
  passwordInput: '#password-field, input[name="password-field"]',
  loginButton: '#submitBtn',

  // OTP (normalement absent sur ce compte, mais on garde la détection)
  otpInput: 'input[name*="otp" i], input[id*="otp" i], input[autocomplete="one-time-code"], input[placeholder*="OTP" i]',

  // Détection d'erreur de login
  loginError: '.error-message, .alert-danger, [role="alert"], :text("incorrect"), :text("Invalid"), :text("locked")',

  // Après login : la plateforme Pro passe par une page « select-context »
  // (choix de la société) avant le dashboard.
  selectContextMarker: ':text("Select"), :text("context"), :text("profile"), [class*="context"]',
  dashboardMarker: ':text("Accounts"), :text("Balance"), :text("Dashboard"), [class*="account"], [class*="dashboard"]',

  accountRow: '[data-account-number], .account-item, tr.account',
  accountBalance: '.balance, [data-balance], .account-balance',

  transactionRow: 'table.transactions tr, [data-testid="transaction-row"], .transaction-item',
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
    // Les URL identity.mcb.mu/…/auth?…&state=…&nonce=…&code_challenge=… sont à
    // usage unique (elles expirent). Si l'utilisateur a collé une telle URL, on
    // repart de l'entrée de l'app qui amorce un flux OIDC frais.
    let entryUrl = options.login_url || 'https://ibpro.mcb.mu/'
    if (/identity\.mcb\.mu/i.test(entryUrl)) entryUrl = 'https://ibpro.mcb.mu/'
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 40000 })

    // ── 2. Attente + saisie username ──
    const usernameField = await page.waitForSelector(SEL.usernameInput, { timeout: 20000 }).catch(() => null)
    if (!usernameField) {
      return {
        status: 'manual_needed',
        error: 'Champ username introuvable sur la page login MCB. Diagnostic ci-dessous.',
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
        duration_ms: Date.now() - t0,
      }
    }
    // Frappe clavier réelle (déclenche les handlers Backbase de validation +
    // chiffrement RSA du mot de passe).
    await usernameField.click()
    await usernameField.type(credentials.username, { delay: 30 })

    const passwordField = await page.waitForSelector(SEL.passwordInput, { timeout: 10000 }).catch(() => null)
    if (!passwordField) {
      return {
        status: 'manual_needed',
        error: 'Champ mot de passe introuvable. Diagnostic ci-dessous.',
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
        duration_ms: Date.now() - t0,
      }
    }

    // ⚠ Backbase charge la clé publique RSA (#bbRsaPublicKey) de façon
    // asynchrone et ne chiffre le mot de passe (→ champ caché #password) qu'une
    // fois cette clé disponible. Taper avant → chiffrement vide → bouton « Log
    // in » reste désactivé. On attend donc que la clé soit chargée.
    await page.waitForFunction(() => {
      const el = document.querySelector('#bbRsaPublicKey') as HTMLInputElement | null
      return !!el && !!el.value && el.value.length > 20
    }, { timeout: 15000 }).catch(() => {})

    await passwordField.click()
    await passwordField.type(credentials.password, { delay: 45 })
    // Blur pour finaliser la validation du formulaire (Angular « touched »).
    await page.keyboard.press('Tab').catch(() => {})

    // La validation Angular du bouton est instable avec la saisie automatisée
    // (le champ mdp n'est pas toujours enregistré → bouton reste désactivé). On
    // force Angular à ré-évaluer (dispatch input/change/blur) en boucle jusqu'à
    // ce que #submitBtn s'active. Le champ #password chiffré ne se remplit qu'au
    // submit, donc on ne l'exige pas ici.
    let enabled = false
    for (let i = 0; i < 12 && !enabled; i++) {
      enabled = await page.evaluate(() => {
        for (const id of ['username', 'password-field']) {
          const el = document.getElementById(id)
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
            el.dispatchEvent(new Event('blur', { bubbles: true }))
          }
        }
        const btn = document.getElementById('submitBtn') as HTMLButtonElement | null
        return !!btn && !btn.disabled
      }).catch(() => false)
      if (!enabled) await page.waitForTimeout(700)
    }

    // Vrai clic sur le bouton précis (#submitBtn) — déclenche le handler Angular
    // qui chiffre le mot de passe et soumet le formulaire OIDC.
    const btn = page.locator('#submitBtn')
    await btn.click({ timeout: 8000 }).catch(async () => {
      // Repli : clic forcé, puis soumission programmatique du formulaire.
      await btn.click({ force: true, timeout: 4000 }).catch(() => {})
      await page.evaluate(() => {
        const b = document.getElementById('submitBtn') as HTMLButtonElement | null
        const f = b?.closest('form') as HTMLFormElement | null
        if (b && !b.disabled) b.click()
        else if (f) (f.requestSubmit ? f.requestSubmit() : f.submit())
      }).catch(() => {})
    })

    // ── 3. Attendre l'issue. Le login OIDC réussi fait disparaître le formulaire
    //     (redirection fragment vers select-context). On attend soit la
    //     disparition du champ mot de passe, soit une erreur, soit networkidle.
    await Promise.race([
      page.waitForSelector(SEL.passwordInput, { state: 'detached', timeout: 25000 }).catch(() => null),
      page.waitForSelector(SEL.loginError, { timeout: 25000 }).catch(() => null),
    ])
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const otp = await page.$(SEL.otpInput).catch(() => null)
    if (otp) {
      return {
        status: 'manual_needed',
        error: 'MCB demande un OTP (inattendu sur ce compte). Flow OTP non implémenté.',
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
        duration_ms: Date.now() - t0,
      }
    }
    const errEl = await page.$(SEL.loginError).catch(() => null)
    const stillOnLogin = await page.$(SEL.passwordInput).catch(() => null)
    if (errEl || stillOnLogin) {
      const errText = errEl ? (await errEl.textContent().catch(() => '') || '').trim().slice(0, 160) : ''
      // État du formulaire pour distinguer « mauvais identifiants » d'un
      // problème de timing (bouton jamais activé / mdp non chiffré).
      const formState = await page.evaluate(() => {
        const btn = document.querySelector('#submitBtn') as HTMLButtonElement | null
        const hidden = document.querySelector('#password') as HTMLInputElement | null
        const rsa = document.querySelector('#bbRsaPublicKey') as HTMLInputElement | null
        return {
          btnDisabled: btn ? btn.disabled : null,
          hiddenPwdFilled: hidden ? !!hidden.value : null,
          rsaKeyLoaded: rsa ? !!rsa.value : null,
        }
      }).catch(() => null)
      const detail = formState
        ? ` [bouton désactivé: ${formState.btnDisabled}, mdp chiffré rempli: ${formState.hiddenPwdFilled}, clé RSA chargée: ${formState.rsaKeyLoaded}]`
        : ''
      return {
        status: 'failed',
        error: (errText || 'Login MCB refusé — toujours sur la page de connexion.') + detail,
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
        duration_ms: Date.now() - t0,
      }
    }

    // Login accepté : on a quitté la page de login. La SPA post-login
    // (select-context) charge en asynchrone (spinner) → on lui laisse le temps
    // de rendre son contenu avant de capturer le diagnostic.
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    await page.waitForFunction(() => {
      const spinner = document.querySelector('[class*="spinner" i], [class*="loading" i], [class*="loader" i]')
      const hasContent = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length > 120
      return hasContent && !spinner
    }, { timeout: 20000 }).catch(() => {})

    const dash = await page.$(SEL.dashboardMarker).catch(() => null)
    if (!dash) {
      return {
        status: 'manual_needed',
        error: 'Login réussi ✅ — page post-login atteinte (« sélection de la société »). Copie le diagnostic (dont les CLIQUABLES) pour que je mappe l\'étape suivante (choix société → dashboard → transactions).',
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
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
