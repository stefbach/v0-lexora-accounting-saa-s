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
import type { BankScrapeResult, ScrapedTransaction, ScrapedStatement } from '../scraper'
import { captureScreenshot, capturePageDiagnostic } from '../playwright-launcher'
import { pickBestCompany } from '../agentic/company-match'
import { findAccountBalance, parseAccounts } from '../agentic/accounts-parse'
import { parseTransactionsFromTexts, findBalanceBreaks } from '../agentic/transactions-parse'
import { parseStatements, type RawStatementRow } from '../agentic/statements-parse'

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
  /** Nombre de relevés PDF récents à télécharger par run (défaut 3, 0 = désactivé) */
  max_statements?: number
  /** URL de connexion (override) ; défaut https://ibank.mcb.mu/ */
  login_url?: string
  /** Nom de la société — pour choisir le bon « context » MCB Pro. */
  company_name?: string | null
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

    // ── Récupération : la chaîne de redirections OIDC post-login échoue parfois
    //     sur le Chromium serverless (page chrome-error / vide). La session est
    //     déjà établie (cookie), donc on recharge l'app pour reprendre la main.
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = page.url()
      const bodyLen = await page.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0)
      if (/^chrome-error:/i.test(cur) || cur === 'about:blank' || bodyLen < 40) {
        await page.goto('https://ibpro.mcb.mu/mcb-corporate-ib-web-app/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
        await page.waitForFunction(() => {
          const spinner = document.querySelector('[class*="spinner" i], [class*="loading" i], [class*="loader" i]')
          return (document.body?.innerText || '').trim().length > 120 && !spinner
        }, { timeout: 25000 }).catch(() => {})
      } else break
    }

    // ── Sélection de la société (page « Select company » de MCB Pro) ──
    const onSelectCompany = await page.evaluate(() =>
      /select a company|select company/i.test(document.body?.innerText || '')
    ).catch(() => false)

    if (onSelectCompany) {
      const company = options.company_name || ''
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      const cWords = norm(company).split(' ').filter((w) => w.length > 2 && !['ltd', 'ltee', 'ltée', 'co', 'the', 'sol', 'solutions'].includes(w))
      // Terme de recherche = mot le plus distinctif (le plus long).
      const searchTerm = [...cWords].sort((a, b) => b.length - a.length)[0] || ''

      // 1) Filtrer via la recherche (#bb_input_0) pour ne garder qu'une société.
      if (searchTerm) {
        const search = await page.$('#bb_input_0, input[type="search"]').catch(() => null)
        if (search) {
          await search.click().catch(() => {})
          await search.type(searchTerm, { delay: 40 }).catch(() => {})
          await page.waitForTimeout(1500)
        }
      }

      // 2) Collecter TOUS les libellés candidats visibles (lignes de sociétés)
      //    avec leurs coordonnées, puis laisser le matcher intelligent choisir
      //    la bonne société — tolérant aux abréviations/troncatures MCB
      //    (« Digital Data Solutions Ltd » ↔ « DIGITAL DATA SOL LTD »). Le
      //    rapprochement se fait côté Node (testé), pas dans le navigateur.
      const candidates = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll('a, li, [role="button"], [role="listitem"], button, div, span'),
        )
        const seen = new Set<string>()
        const out: { label: string; x: number; y: number }[] = []
        for (const el of nodes) {
          const txt = (el.textContent || '').trim()
          if (!txt || txt.length > 50 || seen.has(txt)) continue
          const r = (el as HTMLElement).getBoundingClientRect()
          if (r.width < 2 || r.height < 2) continue
          if ((el as HTMLElement).offsetParent === null && getComputedStyle(el as HTMLElement).position !== 'fixed') continue
          seen.add(txt)
          out.push({ label: txt, x: r.x + r.width / 2, y: r.y + r.height / 2 })
        }
        return out
      }).catch(() => [] as { label: string; x: number; y: number }[])

      const match = pickBestCompany(company, candidates.map((c) => c.label))
      const box = match ? candidates[match.index] : null
      if (box) {
        await page.evaluate((label) => {
          const el = Array.from(document.querySelectorAll('*')).find(
            (n) => (n.textContent || '').trim() === label,
          )
          el?.scrollIntoView({ block: 'center' })
        }, box.label).catch(() => {})
      }

      let clicked: string | null = box?.label || null
      if (box?.label) {
        // Priorité : clic Playwright sur le texte exact (vérifie la visibilité +
        // actionnabilité + fait un vrai clic ciblé). Repli : clic souris + chevron.
        const rowLoc = page.getByText(box.label, { exact: true }).first()
        const okClick = await rowLoc.click({ timeout: 6000 }).then(() => true).catch(() => false)
        if (!okClick) {
          await page.mouse.click(box.x, box.y).catch(() => {})
          // Chevron « › » : souvent la vraie zone cliquable, sur le bord droit.
          await page.mouse.click(box.x + 180, box.y).catch(() => {})
        }
      }

      if (!clicked) {
        return {
          status: 'manual_needed',
          error: `Login OK mais impossible de trouver la société « ${company} » dans la liste MCB. Copie le diagnostic (cliquables) pour ajuster.`,
          screenshot_b64: await captureScreenshot(page),
          diagnostic: await capturePageDiagnostic(page),
          duration_ms: Date.now() - t0,
        }
      }

      // Attendre le dashboard de la société sélectionnée.
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      await page.waitForFunction(() => {
        const spinner = document.querySelector('[class*="spinner" i], [class*="loading" i], [class*="loader" i]')
        const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
        return txt.length > 150 && !spinner && !/select a company|select company/i.test(txt)
      }, { timeout: 25000 }).catch(() => {})

      // Vérifie qu'on a bien quitté la page « Select company ».
      const stillSelect = await page.evaluate(() =>
        /select a company|select company/i.test(document.body?.innerText || '')
      ).catch(() => false)
      if (stillSelect) {
        return {
          status: 'manual_needed',
          error: `Clic sur « ${clicked} » sans navigation (toujours sur Select company). Copie le diagnostic (cliquables) pour ajuster le clic.`,
          screenshot_b64: await captureScreenshot(page),
          diagnostic: await capturePageDiagnostic(page),
          duration_ms: Date.now() - t0,
        }
      }

      // ── Dashboard atteint : lecture de la liste des comptes (page « Accounts ») ──
      // MCB (plateforme Backbase) NE rend PAS toujours un <table> sémantique :
      // la liste des comptes est une grille de <div>. On collecte donc les
      // textes de lignes candidats (agnostique table/div) et on délègue le parse
      // au module testé parseAccounts (reconnaissance par motif : numéro +
      // devise + montants), au lieu de dépendre d'un header <thead>.
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      const rowTexts: string[] = await page.evaluate(() => {
        const out: string[] = []
        const els = Array.from(document.querySelectorAll('tr, li, [role="row"], [role="listitem"], div, a'))
        for (const el of els) {
          const t = ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
          if (!t || t.length > 200) continue
          // Ligne candidate = contient exactement un numéro de compte (9-18 chiffres).
          const accs = t.match(/\b\d{9,18}\b/g)
          if (accs && accs.length === 1) out.push(t)
        }
        return out
      }).catch(() => [] as string[])

      const accountRows = parseAccounts(rowTexts)
      const acct = findAccountBalance(accountRows, options.numero_compte)
      if (!acct) {
        return {
          status: 'manual_needed',
          error: `Société sélectionnée ✅ mais compte ${options.numero_compte} introuvable dans la liste (${accountRows.length} compte(s) lus). Copie le diagnostic pour ajuster.`,
          screenshot_b64: await captureScreenshot(page),
          diagnostic: await capturePageDiagnostic(page),
          duration_ms: Date.now() - t0,
        }
      }

      // ── Solde lu ✅ — navigation vers les transactions du compte ──
      // Clic sur la ligne du compte (ouvre le détail → onglet « Transactions »).
      await page.getByText(options.numero_compte, { exact: false }).first()
        .click({ timeout: 6000 }).catch(() => {})
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

      // S'assurer d'être sur l'onglet « Transactions » (le détail de compte
      // ouvre parfois sur « Balance History » ou « Account info »).
      const txTab = page.getByRole('tab', { name: /transactions/i })
        .or(page.getByText('Transactions', { exact: true })).first()
      await txTab.click({ timeout: 4000 }).catch(() => {})
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      // Extraction des transactions, agnostique à la structure (table OU grille
      // de <div> Backbase), sur plusieurs pages (« Load more » / pagination). On
      // collecte les textes de lignes candidats (une date + un montant, peu de
      // montants → pas le conteneur global) et on délègue le parse au module
      // testé (dates « 20 Aug 2026 », montants signés, référence FT…, solde).
      const maxN = options.max_transactions ?? 30
      const allRowTexts: string[] = []
      const seenRowKeys = new Set<string>()
      for (let pageIdx = 0; pageIdx < 8 && allRowTexts.length < maxN * 2; pageIdx++) {
        const pageTexts: string[] = await page.evaluate(() => {
          const out: string[] = []
          const els = Array.from(document.querySelectorAll('tr, li, [role="row"], [role="listitem"], div, a'))
          for (const el of els) {
            const t = ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
            if (!t || t.length < 12 || t.length > 400) continue
            const hasDate = /\d{1,2}[\s/\-.][A-Za-z]{3,}[\s/\-.]\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(t)
            const monies = t.match(/-?\d[\d,]*\.\d{2}/g) || []
            // Ligne = 1 date + 1 à 3 montants (amount [+ balance]) ; > 3 montants
            // = conteneur multi-lignes → on écarte pour ne pas tout agréger.
            if (hasDate && monies.length >= 1 && monies.length <= 3) out.push(t)
          }
          return out
        }).catch(() => [] as string[])

        let added = 0
        for (const t of pageTexts) {
          if (seenRowKeys.has(t)) continue
          seenRowKeys.add(t)
          allRowTexts.push(t)
          added++
        }

        if (allRowTexts.length >= maxN * 2 || added === 0) break

        // Page suivante : bouton « Load more » / « Next » / chevron de pagination.
        const nextBtn = page.getByRole('button', { name: /load more|show more|next|suivant|voir plus|plus/i }).first()
        const clickedNext = await nextBtn.click({ timeout: 3000 }).then(() => true).catch(() => false)
        if (!clickedNext) break
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(600)
      }

      const parsed = parseTransactionsFromTexts(allRowTexts).slice(0, maxN)
      const balanceBreaks = findBalanceBreaks(parsed)
      const transactions: ScrapedTransaction[] = parsed.map((t) => ({
        date: t.date,
        value_date: t.value_date,
        reference: t.reference || undefined,
        description: t.description,
        amount: t.amount,
        balance_after: t.balance_after,
        currency: acct.currency || 'MUR',
      }))

      // ── Relevés PDF (« Documents & statements ») — best-effort, borné ──
      // Récupère les N relevés récents ; l'ingestion + OCR + dédoublonnage se
      // font côté scraper.ts via le pipeline documentaire existant. N'échoue
      // jamais le scrape principal (solde + transactions déjà obtenus).
      const statements = (options.max_statements ?? 3) > 0
        ? await downloadMcbStatements(page, options).catch(() => [] as ScrapedStatement[])
        : []

      // Solde toujours retourné ; transactions désormais mappées. Si l'extraction
      // n'a rien donné (tableau non chargé / structure inattendue), on renvoie
      // 'partial' + diagnostic pour ajuster — jamais d'échec silencieux.
      if (transactions.length > 0) {
        return {
          status: 'success',
          balance_mur: acct.balance,
          balance_devise: acct.currency || 'MUR',
          nb_transactions: transactions.length,
          transactions,
          statements,
          // Signal d'intégrité : une rupture de suite du solde = extraction
          // probablement incomplète (pagination manquée) ou montant mal lu.
          raw_excerpt: balanceBreaks.length
            ? `⚠ ${balanceBreaks.length} rupture(s) de suite du solde détectée(s) — vérifier la pagination.`
            : undefined,
          duration_ms: Date.now() - t0,
        }
      }
      return {
        status: 'partial',
        balance_mur: acct.balance,
        balance_devise: acct.currency || 'MUR',
        statements,
        error: `Solde lu ✅ (${acct.balance} ${acct.currency || ''}) — le tableau des transactions du compte ${options.numero_compte} n'a pas pu être extrait (0 ligne). Copie le diagnostic (URL + tableau) de la page Transactions pour ajuster.`,
        screenshot_b64: await captureScreenshot(page),
        diagnostic: await capturePageDiagnostic(page),
        duration_ms: Date.now() - t0,
      }
    }

    const dash = await page.$(SEL.dashboardMarker).catch(() => null)
    if (!dash) {
      return {
        status: 'manual_needed',
        error: 'Login réussi ✅ — page post-login atteinte. Copie le diagnostic (dont les CLIQUABLES) pour mapper l\'étape suivante.',
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

/**
 * Récupère les relevés PDF récents depuis « Documents & statements ».
 *
 * Best-effort et borné (max_statements) : navigue vers la section relevés,
 * extrait le tableau (Date generated / Document type / Filename + lien de
 * téléchargement) via le parser testé, puis télécharge le PDF de chaque relevé
 * récent — soit par requête HTTP authentifiée (href direct, session partagée),
 * soit par capture de l'événement de téléchargement du navigateur. Retourne les
 * relevés en base64 ; l'ingestion + OCR + dédoublonnage sont faits côté
 * scraper.ts. Toute erreur → liste vide (ne casse jamais le scrape principal).
 */
async function downloadMcbStatements(
  page: Page,
  options: McbAdapterOptions,
): Promise<ScrapedStatement[]> {
  const maxN = options.max_statements ?? 3

  // 1) Naviguer vers « Documents & statements » (lien de menu / nav latérale).
  const navLink = page.getByRole('link', { name: /documents\s*&?\s*statements|statements|relev/i })
    .or(page.getByText(/documents\s*&?\s*statements/i)).first()
  const navigated = await navLink.click({ timeout: 6000 }).then(() => true).catch(() => false)
  if (!navigated) return []
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})

  // S'assurer d'être sur l'onglet « Statements » (vs Advices / Reports).
  await page.getByRole('tab', { name: /statements/i })
    .or(page.getByText('Statements', { exact: true })).first()
    .click({ timeout: 3000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

  // 2) Extraire les relevés — agnostique à la structure (table OU grille de
  //    <div> Backbase). Ligne candidate = contient une date de génération et le
  //    mot « statement » (ou « relevé »), avec éventuellement un href PDF. Le
  //    parse (date → période) est délégué au module testé parseStatements.
  const rawRows: RawStatementRow[] = await page.evaluate(() => {
    const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim()
    const dateRe = /\d{1,2}[\s/\-.][A-Za-z]{3,}[\s/\-.]\d{2,4}/
    const out: Array<Record<string, string>> = []
    const seen = new Set<string>()
    const els = Array.from(document.querySelectorAll('tr, li, [role="row"], [role="listitem"], div'))
    for (const el of els) {
      const t = norm((el as HTMLElement).innerText)
      if (!t || t.length > 240) continue
      const dm = t.match(dateRe)
      if (!dm) continue
      if (!/statement|relev|advice|report|document/i.test(t)) continue
      // Une seule date par ligne (sinon conteneur multi-relevés).
      if ((t.match(new RegExp(dateRe.source, 'g')) || []).length !== 1) continue
      const key = dm[0] + '|' + t.slice(0, 60)
      if (seen.has(key)) continue
      seen.add(key)
      const anchors = Array.from(el.querySelectorAll('a[href]')) as HTMLAnchorElement[]
      const dl = anchors.map((a) => a.href).find((h) => /\.pdf|download|statement|document/i.test(h)) || ''
      out.push({
        dateGenerated: dm[0],
        docType: /statement|relev/i.test(t) ? 'Current account statement' : t.replace(dm[0], '').trim().slice(0, 40),
        filename: t.replace(dm[0], '').trim().slice(0, 60),
        downloadHref: dl,
      })
    }
    return out
  }).catch(() => [] as RawStatementRow[])

  const statements = parseStatements(rawRows).slice(0, maxN)
  if (statements.length === 0) return []

  const out: ScrapedStatement[] = []
  for (const s of statements) {
    let base64: string | null = null

    // Voie 1 : requête HTTP authentifiée (réutilise la session/les cookies).
    if (s.download_href) {
      base64 = await page.request.get(s.download_href, { timeout: 20000 })
        .then(async (resp) => {
          if (!resp.ok()) return null
          const ct = (resp.headers()['content-type'] || '').toLowerCase()
          const buf = Buffer.from(await resp.body())
          // Valide que c'est bien un PDF (signature %PDF) — évite d'ingérer une
          // page HTML d'erreur/login renvoyée à la place du fichier.
          const isPdf = ct.includes('pdf') || buf.slice(0, 5).toString('latin1') === '%PDF-'
          return isPdf && buf.length > 500 ? buf.toString('base64') : null
        })
        .catch(() => null)
    }

    // Voie 2 : capture de l'événement de téléchargement (clic sur l'icône ↓).
    if (!base64) {
      base64 = await (async () => {
        try {
          const rowLoc = page.getByText(
            new RegExp(s.date_generated.replace(/-/g, '.').slice(0, 4)),
          ).first()
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            rowLoc.click({ timeout: 5000 }).catch(() => {}),
          ])
          const stream = await download.createReadStream().catch(() => null)
          if (!stream) return null
          const chunks: Buffer[] = []
          for await (const chunk of stream) chunks.push(chunk as Buffer)
          const buf = Buffer.concat(chunks)
          return buf.length > 500 && buf.slice(0, 5).toString('latin1') === '%PDF-'
            ? buf.toString('base64')
            : null
        } catch {
          return null
        }
      })()
    }

    if (base64) {
      out.push({
        date_generated: s.date_generated,
        period: s.period,
        doc_type: s.doc_type,
        filename: s.filename,
        pdf_base64: base64,
      })
    }
  }

  return out
}
