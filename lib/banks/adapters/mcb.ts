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
import type { BankScrapeResult, ScrapedTransaction, ScrapedStatement, StatementsDiagnostic } from '../scraper'
import { captureScreenshot, capturePageDiagnostic } from '../playwright-launcher'
import { pickBestCompany } from '../agentic/company-match'
import { findAccountBalance, parseAccounts, accountNumbersMatch } from '../agentic/accounts-parse'
import { parseTransactions, parseTransactionsFromTexts, findBalanceBreaks, reconcileAmountsFromBalance, dedupeRawTransactions } from '../agentic/transactions-parse'
import { parseStatements, selectStatementsForBackfill, type RawStatementRow } from '../agentic/statements-parse'
import {
  isBankApiUrl, extractFromCaptured, transactionsFromCaptured, arrangementsFromCaptured, findTransactionsInJson,
  findStatementsInJson,
  type CapturedApiResponse,
} from '../agentic/api-extract'

export interface McbCredentials {
  username: string                  // User ID MCB
  password: string                  // Mot de passe internet banking
  pin?: string | null               // Optionnel : PIN secondaire si configuré
}

export interface McbAdapterOptions {
  /** Numéro de compte à scraper (filtre côté UI MCB) */
  numero_compte: string
  /** Nombre de transactions à récupérer (défaut 30) — borne le pull par run ;
   *  la dédup permet aux runs successifs de compléter sans doublon. */
  max_transactions?: number
  /** Nombre max de pages « suivant / load more » à parcourir sur la vue
   *  Transactions (défaut 8) : chaque page déclenche une réponse API captée,
   *  toutes fusionnées et dédoublonnées. */
  max_transaction_pages?: number
  /** Plafond de relevés PDF téléchargés par run (défaut 3, 0 = désactivé). Le
   *  vrai frein est le budget temps ci-dessous : ce plafond n'est qu'un garde-fou. */
  max_statements?: number
  /** Périodes YYYY-MM déjà couvertes par un relevé PDF ingéré → le robot les
   *  saute et se concentre sur l'historique manquant (backfill progressif). */
  known_statement_periods?: string[]
  /** Budget temps (ms) pour la phase relevés — borne le backfill sous la limite
   *  serverless (défaut 70 000 ms, marge sous les 120 s de Vercel). */
  statement_time_budget_ms?: number
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

  // ── Capture réseau : on écoute les réponses JSON de l'API interne du portail
  //    (Backbase). C'est la source PRIMAIRE des données : plutôt que de scraper
  //    un SPA à l'aveugle, on lit les comptes / transactions / relevés dans les
  //    réponses de l'API que le SPA appelle lui-même (session authentifiée).
  //    Le scraping DOM ne sert plus que de repli.
  const apiResponses: CapturedApiResponse[] = []
  const onResponse = async (resp: import('playwright-core').Response) => {
    try {
      const url = resp.url()
      if (!isBankApiUrl(url)) return
      const ct = (resp.headers()['content-type'] || '').toLowerCase()
      if (!ct.includes('json')) return
      const json = await resp.json().catch(() => null)
      if (json != null && apiResponses.length < 200) apiResponses.push({ url, status: resp.status(), json })
    } catch {
      /* réponse illisible → ignorée */
    }
  }
  page.on('response', onResponse)
  const capturedApiUrls = () => Array.from(new Set(apiResponses.map((r) => r.url))).slice(0, 25)

  // Attend qu'une réponse d'API correspondant au prédicat soit captée (ex. la
  // page a déclenché son appel transaction-manager). Évite d'extraire avant que
  // les données ne soient arrivées (cause n°1 des « 0 ligne » en SPA).
  const waitForApiCapture = async (pred: (url: string) => boolean, timeoutMs: number): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (apiResponses.some((r) => pred(r.url))) return true
      await page.waitForTimeout(400)
    }
    return apiResponses.some((r) => pred(r.url))
  }

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

      // Source PRIMAIRE = API interne captée (JSON structuré) ; repli = DOM.
      const apiAccounts = extractFromCaptured(apiResponses).accounts
      const accountRows = apiAccounts.length > 0 ? apiAccounts : parseAccounts(rowTexts)
      const acct = findAccountBalance(accountRows, options.numero_compte)
      if (!acct) {
        const apiUrls = capturedApiUrls()
        return {
          status: 'manual_needed',
          error:
            `Société sélectionnée ✅ mais compte ${options.numero_compte} introuvable (${accountRows.length} compte(s) lus, ` +
            `${apiAccounts.length} via API, ${rowTexts.length} lignes DOM). ` +
            (apiUrls.length
              ? `API captées : ${apiUrls.join(' | ')}`
              : `Aucune API JSON captée — le SPA charge peut-être ses données autrement. Copie le diagnostic.`),
          raw_excerpt: apiUrls.join('\n'),
          screenshot_b64: await captureScreenshot(page),
          diagnostic: await capturePageDiagnostic(page),
          duration_ms: Date.now() - t0,
        }
      }

      // ── Solde lu ✅ — navigation vers les transactions du compte ──
      // Deux chemins possibles selon MCB : (1) détail du compte à onglets, ou
      // (2) page « Transactions » GLOBALE qui exige de SÉLECTIONNER le compte
      // dans un menu déroulant avant de charger les mouvements. On tente les
      // deux et on ATTEND que l'API transaction-manager réponde (déclenchée par
      // la sélection) — c'est la vraie source des données, pas le DOM.

      // On veut que le SPA lui-même charge la liste (avec son token valide en
      // mémoire) : on capte alors sa réponse. Le prédicat attend la VRAIE liste
      // (.../transactions?…), PAS l'appel enumValues du filtre.
      const wantsTxList = (u: string) =>
        /transaction-manager/i.test(u) && /\/transactions(\?|$)/i.test(u) && !/enumvalues/i.test(u)

      // Tentative 1 : ouvrir le DÉTAIL du compte (clic sur la ligne) → cliquer
      // l'ONGLET Transactions DU DÉTAIL (role=tab / bouton — surtout PAS le lien
      // de la barre latérale, qui mène à la page globale et ne charge que les
      // enumValues du filtre, jamais la liste du compte).
      await page.getByText(options.numero_compte, { exact: false }).first()
        .click({ timeout: 5000 }).catch(() => {})
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
      const detailTxTab = page.getByRole('tab', { name: /transactions/i })
        .or(page.locator('button, [role="tab"], [class*="tab" i]').filter({ hasText: /^\s*transactions\s*$/i }))
        .first()
      await detailTxTab.click({ timeout: 5000 }).catch(() => {})
      let gotTxApi = await waitForApiCapture(wantsTxList, 12000)

      // Tentative 2 : page « Transactions » globale + sélection explicite du compte
      // (certains parcours ne passent pas par le détail).
      if (!gotTxApi) {
        await page.getByRole('link', { name: /transactions/i })
          .or(page.getByText('Transactions', { exact: true })).first()
          .click({ timeout: 4000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await selectMcbAccount(page, options.numero_compte).catch(() => {})
        gotTxApi = await waitForApiCapture(wantsTxList, 12000)
      }
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})

      // Extraction des transactions, agnostique à la structure (table OU grille
      // de <div> Backbase), sur plusieurs pages (« Load more » / pagination). On
      // collecte les textes de lignes candidats (une date + un montant, peu de
      // montants → pas le conteneur global) et on délègue le parse au module
      // testé (dates « 20 Aug 2026 », montants signés, référence FT…, solde).
      const maxN = options.max_transactions ?? 30
      const maxPages = options.max_transaction_pages ?? 8
      const allRowTexts: string[] = []
      const seenRowKeys = new Set<string>()
      for (let pageIdx = 0; pageIdx < maxPages && allRowTexts.length < maxN * 3; pageIdx++) {
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

      // ── Source PRIMAIRE : appel DIRECT de l'API transaction-manager ──
      // Le SPA ne déclenche pas toujours la requête liste (il ne charge que les
      // enumValues du filtre). Puisqu'on connaît l'endpoint (diagnostic) et
      // qu'on a l'arrangementId du compte dans la réponse productsummary captée,
      // on interroge l'API directement avec la session authentifiée (page.request).
      // Union DÉDOUBLONNÉE de toutes les réponses captées (≠ extractFromCaptured
      // qui ne garde que la plus grosse) : le relevé « Transactions » est paginé,
      // chaque clic « suivant / load more » ci-dessus a déclenché une page que le
      // SPA a chargée et qu'on a captée. On les fusionne toutes ici.
      let apiTx = transactionsFromCaptured(apiResponses)
      let txApiDebug = ''
      if (apiTx.length === 0) {
        const origin = new URL(page.url()).origin // https://ibpro.mcb.mu
        const allArr = arrangementsFromCaptured(apiResponses)
        const arr = allArr.find((a) => accountNumbersMatch(a.number, options.numero_compte))
        const dbg: string[] = [
          `arrangements=${allArr.length} [${allArr.map((a) => `${a.number}:${a.id.slice(0, 8)}`).join(',')}]`,
          `matched=${arr ? arr.id : 'AUCUN'}`,
        ]

        // Endpoints/params Backbase à tester. IMPORTANT : l'appel se fait DANS le
        // contexte de la page (page.evaluate + fetch credentials:'include' + header
        // XSRF) — page.request donnait 401 car il ne réplique pas l'auth complète
        // de la session Backbase (cookie session + token XSRF).
        const tryUrls: string[] = []
        if (arr) {
          for (const ver of ['v2', 'v3']) {
            const base = `${origin}/api/transaction-manager/client-api/${ver}/transactions`
            tryUrls.push(`${base}?arrangementId=${encodeURIComponent(arr.id)}&from=0&size=${maxN}`)
            tryUrls.push(`${base}?arrangementsIds=${encodeURIComponent(arr.id)}&from=0&size=${maxN}`)
          }
        }
        // Sans arrangement (contexte société courant) — repli de diagnostic.
        tryUrls.push(`${origin}/api/transaction-manager/client-api/v2/transactions?from=0&size=${maxN}`)

        let tokMarker = ''
        for (const url of tryUrls.slice(0, 6)) {
          const res = await page.evaluate(async (u: string) => {
            const cookie = (n: string) => {
              const m = document.cookie.match(new RegExp('(?:^|; )' + n.replace(/-/g, '\\-') + '=([^;]+)'))
              return m ? decodeURIComponent(m[1]) : ''
            }
            const xsrf = cookie('XSRF-TOKEN') || cookie('XSRF-TOKEN-IB') || cookie('CSRF-TOKEN') || ''

            // Backbase ajoute un token Bearer (JWT) via un intercepteur HTTP : un
            // fetch brut avec cookies seuls reçoit 401. On récupère donc le JWT
            // stocké par le SPA (session/localStorage), directement ou dans un
            // objet JSON (access_token / accessToken / token).
            const findJwt = (store: Storage): string => {
              try {
                for (let i = 0; i < store.length; i++) {
                  const k = store.key(i)
                  if (!k) continue
                  const v = store.getItem(k) || ''
                  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) return v
                  if (v.includes('eyJ')) {
                    try {
                      const o = JSON.parse(v)
                      const cand = o.access_token || o.accessToken || o.token ||
                        (o.value && (o.value.access_token || o.value.accessToken)) ||
                        (o.tokens && (o.tokens.access_token || o.tokens.accessToken))
                      if (typeof cand === 'string' && /^eyJ/.test(cand)) return cand
                    } catch { /* pas du JSON */ }
                  }
                }
              } catch { /* storage inaccessible */ }
              return ''
            }
            let bearer = ''
            try { bearer = findJwt(sessionStorage) || findJwt(localStorage) } catch { /* */ }

            const headers: Record<string, string> = { Accept: 'application/json' }
            if (xsrf) headers['X-XSRF-TOKEN'] = xsrf
            if (bearer) headers['Authorization'] = 'Bearer ' + bearer
            try {
              const r = await fetch(u, { method: 'GET', credentials: 'include', headers })
              const body = await r.text()
              return { status: r.status, body: body.slice(0, 300000), tok: bearer ? 1 : 0 }
            } catch {
              return { status: -1, body: '', tok: bearer ? 1 : 0 }
            }
          }, url).catch(() => ({ status: -2, body: '', tok: 0 }))

          if (!tokMarker) tokMarker = `mode=inpage tok=${res.tok}`
          const tag = url.replace(origin, '').replace(/\?.*$/, '') +
            (url.includes('arrangementsIds') ? '?arrangementsIds' : url.includes('arrangementId') ? '?arrangementId' : '?none')
          let parsedN = 0
          let rows: ReturnType<typeof findTransactionsInJson> = []
          if (res.status >= 200 && res.status < 300 && res.body) {
            try { rows = findTransactionsInJson(JSON.parse(res.body)); parsedN = rows.length } catch { /* non-JSON */ }
          }
          dbg.push(`${tag}=${res.status}/len${res.body.length}/tx${parsedN}`)
          if (parsedN > 0) { apiTx = rows; break }
        }
        if (tokMarker) dbg.splice(2, 0, tokMarker)
        txApiDebug = dbg.join(' || ')
      }

      // Repli final : DOM (grille Backbase) si l'API n'a rien donné.
      // Le solde courant (running balance) tranche le SENS débit/crédit de façon
      // fiable, quelle que soit la nomenclature de l'indicateur côté banque —
      // évite le bug « tout en crédit » quand l'API renvoie un montant positif +
      // un indicateur non reconnu. No-op si les soldes manquent (cf. fonction).
      const parsed = reconcileAmountsFromBalance((apiTx.length > 0
        ? parseTransactions(apiTx)
        : parseTransactionsFromTexts(allRowTexts)
      ).slice(0, maxN))
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
      let statements: ScrapedStatement[] = []
      let statementsDiag: StatementsDiagnostic | undefined
      if ((options.max_statements ?? 3) > 0) {
        const st = await downloadMcbStatements(page, options, apiResponses)
          .catch(() => ({ statements: [] as ScrapedStatement[], diagnostic: undefined as StatementsDiagnostic | undefined }))
        statements = st.statements
        statementsDiag = st.diagnostic
      }
      // Résumé lisible de la phase PDF, persisté dans bank_scrape_runs.raw_excerpt.
      const pdfSummary = statementsDiag
        ? `Relevés PDF: nav=${statementsDiag.navigated} compte=${statementsDiag.accountSelected} listés=${statementsDiag.parsed} téléchargés=${statementsDiag.downloaded}${statementsDiag.note ? ` — ${statementsDiag.note}` : ''}`
        : ''

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
          statements_diagnostic: statementsDiag,
          // Signal d'intégrité : rupture de suite du solde = extraction
          // probablement incomplète. Toujours joindre le résumé PDF pour ne
          // plus être à l'aveugle sur la récupération des relevés.
          raw_excerpt: [
            balanceBreaks.length ? `⚠ ${balanceBreaks.length} rupture(s) de suite du solde — vérifier la pagination.` : '',
            pdfSummary,
          ].filter(Boolean).join(' | ') || undefined,
          duration_ms: Date.now() - t0,
        }
      }
      const apiUrls = capturedApiUrls()

      // Le SPA a bien appelé la liste (.../transactions?arrangementsIds=…) et sa
      // réponse est captée, mais findTransactionsInJson n'en extrait rien → la
      // structure JSON exacte de MCB nous échappe. On dumpe un échantillon du
      // corps de CETTE réponse pour figer le parseur au prochain run.
      const txResp = apiResponses.find((r) => wantsTxList(r.url))
      let txShape = 'TXRESP=absente des captures'
      if (txResp) {
        try {
          const s = JSON.stringify(txResp.json)
          txShape = `TXRESP len=${s.length} sample=${s.slice(0, 900)}`
        } catch { txShape = 'TXRESP=nonjson' }
      }

      return {
        status: 'partial',
        balance_mur: acct.balance,
        balance_devise: acct.currency || 'MUR',
        statements,
        error:
          `Solde lu ✅ (${acct.balance} ${acct.currency || ''}) — transactions non extraites ` +
          `(0 ligne, ${apiTx.length} via API, ${allRowTexts.length} lignes DOM, sélection compte ${gotTxApi ? 'OK' : 'KO'}). ` +
          `${txShape}`,
        raw_excerpt: [txShape, txApiDebug, apiUrls.join('\n')].filter(Boolean).join('\n---\n'),
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
 * Sélectionne un compte dans le menu déroulant « Select an account » des pages
 * globales MCB (Transactions, Documents & statements). Ces pages n'affichent
 * rien tant qu'aucun compte n'est choisi (« You did not select an account
 * yet ») — c'est la cause n°1 des « 0 ligne ». Best-effort : ouvre le déroulant,
 * tape les derniers chiffres du numéro, clique l'option correspondante.
 * Retourne true si une option a pu être cliquée.
 */
async function selectMcbAccount(page: Page, numero: string): Promise<boolean> {
  const digits = (numero || '').replace(/\D/g, '')
  if (!digits) return false
  const last4 = digits.slice(-4)

  // 1) Ouvrir le sélecteur : bouton/combobox « Select an account ».
  const trigger = page.getByRole('combobox')
    .or(page.getByText(/select an? account|choisir un compte|select account/i)).first()
  await trigger.click({ timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(400)

  // 2) Filtrer via le champ de recherche du déroulant (souvent un input search
  //    masqué jusqu'à l'ouverture).
  const search = page.locator(
    'input[type="search"], input[placeholder*="typing" i], input[placeholder*="Search" i], input[role="combobox"]',
  ).first()
  await search.fill(last4).catch(async () => {
    await search.click({ timeout: 2000 }).catch(() => {})
    await search.type(last4, { delay: 40 }).catch(() => {})
  })
  await page.waitForTimeout(800)

  // 3) Cliquer l'option qui contient le numéro complet ou ses 4 derniers chiffres.
  const option = page.getByRole('option', { name: new RegExp(digits + '|' + last4) })
    .or(page.getByText(new RegExp('\\b' + digits + '\\b|' + last4)).last())
    .first()
  const clicked = await option.click({ timeout: 4000 }).then(() => true).catch(() => false)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  return clicked
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
  captured: CapturedApiResponse[] = [],
): Promise<{ statements: ScrapedStatement[]; diagnostic: StatementsDiagnostic }> {
  const maxN = options.max_statements ?? 3
  const knownPeriods = new Set(options.known_statement_periods || [])
  // Budget temps : borne la phase relevés sous la limite serverless (120 s
  // Vercel). On s'arrête proprement avant, quitte à finir l'historique au run
  // suivant (les mois déjà pris sont sautés via knownPeriods → progression).
  const deadline = Date.now() + (options.statement_time_budget_ms ?? 70000)
  const diag: StatementsDiagnostic = {
    navigated: false, accountSelected: false, yearTabs: 0,
    apiListed: 0, domRows: 0, parsed: 0, toDownload: 0, downloaded: 0, errors: [],
  }

  // Diagnostic : récupère les libellés cliquables visibles — sert à trouver le
  // VRAI libellé du menu quand notre sélecteur de navigation ne matche pas.
  const collectNavLabels = (): Promise<string[]> => page.evaluate(() => {
    const out: string[] = []
    const sel = 'a, button, [role="tab"], [role="link"], [role="menuitem"], [role="button"]'
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const t = ((el as HTMLElement).innerText || (el as HTMLElement).getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ').trim()
      if (t && t.length <= 40) out.push(t)
    }
    return Array.from(new Set(out)).slice(0, 60)
  }).catch(() => [] as string[])

  // 1) Naviguer vers « Documents & statements » (lien de menu / nav latérale).
  //    Libellés élargis (e-documents / e-statements) + rôle bouton en plus du lien.
  const navLink = page.getByRole('link', { name: /documents\s*&?\s*statements|e-?statements|e-?documents|statements|relev/i })
    .or(page.getByRole('button', { name: /documents\s*&?\s*statements|e-?statements|statements|relev/i }))
    .or(page.getByText(/documents\s*&?\s*statements/i)).first()
  const navigated = await navLink.click({ timeout: 6000 }).then(() => true).catch(() => false)
  diag.navigated = navigated
  if (!navigated) {
    diag.url = page.url()
    diag.navLabels = await collectNavLabels()
    diag.note = "Lien « Documents & statements » introuvable — voir navLabels pour le vrai libellé du menu."
    return { statements: [], diagnostic: diag }
  }
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})

  // La page « Documents & statements » est globale et affiche « You did not
  // select an account yet » tant qu'aucun compte n'est choisi → on sélectionne
  // le compte cible avant de lister les relevés.
  diag.accountSelected = await selectMcbAccount(page, options.numero_compte)
    .then(() => true).catch(() => false)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

  // S'assurer d'être sur l'onglet « Statements » (vs Advices / Reports).
  await page.getByRole('tab', { name: /statements/i })
    .or(page.getByText('Statements', { exact: true })).first()
    .click({ timeout: 3000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

  // ── Déclencher la LISTE des relevés ──
  // Diagnostic réel : le SPA charge d'office /account-statements/category-options
  // (juste les onglets Statements/Advices/Reports), mais la LISTE elle-même
  // n'arrive qu'après sélection de la catégorie + une action « Search/View ».
  // On sélectionne un éventuel type/période et on clique les boutons d'action
  // plausibles, puis on ATTEND qu'une réponse « account-statements » (hors
  // category-options / *-options / enumvalues) contenant des relevés soit captée
  // — même principe éprouvé que pour la liste des transactions.
  const isStatementList = (u: string) =>
    /account-statement|statements/i.test(u) && !/category-options|type-options|enum-?values|[-/]options(\?|$)/i.test(u)
  // Sélectionne le 1er choix d'un éventuel <select> de type/période de relevé.
  await page.evaluate(() => {
    for (const sel of Array.from(document.querySelectorAll('select'))) {
      const s = sel as HTMLSelectElement
      if (s.options.length > 1 && s.selectedIndex <= 0) {
        s.selectedIndex = 1
        s.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  }).catch(() => {})
  for (const rx of [/search|view|afficher|rechercher|generate|apply|submit|display|list|voir|valider|ok/i]) {
    await page.getByRole('button', { name: rx }).first().click({ timeout: 1500 }).catch(() => {})
  }
  // Attend la vraie liste (jusqu'à 12 s) — le listener réseau alimente `captured`.
  {
    const start = Date.now()
    while (Date.now() - start < 12000) {
      if (captured.some((r) => isStatementList(r.url) && findStatementsInJson(r.json).length > 0)) break
      await page.waitForTimeout(500)
    }
  }

  // 2) Extraire les relevés de la vue courante — agnostique à la structure
  //    (table OU grille de <div> Backbase). Ligne candidate = date de génération
  //    + mot « statement »/« relevé », avec éventuellement un href PDF. Le parse
  //    (date → période) est délégué au module testé parseStatements.
  const extractRows = (): Promise<RawStatementRow[]> => page.evaluate(() => {
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

  // MCB range les relevés par ANNÉE (onglets « 2026 » « 2025 » « 2024 »…). Pour
  // récupérer TOUT l'historique — pas seulement l'année courante affichée par
  // défaut — on parcourt chaque onglet année (best-effort ; si aucun onglet, on
  // lit simplement la vue par défaut). Borné par le budget temps.
  const rawRows: RawStatementRow[] = []
  rawRows.push(...(await extractRows()))
  const yearTabs = page.getByRole('tab', { name: /^20\d{2}$/ })
    .or(page.getByRole('button', { name: /^20\d{2}$/ }))
    .or(page.getByRole('link', { name: /^20\d{2}$/ }))
  const yearCount = await yearTabs.count().catch(() => 0)
  diag.yearTabs = yearCount
  for (let i = 0; i < yearCount; i++) {
    if (Date.now() > deadline) break
    await yearTabs.nth(i).click({ timeout: 3000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    rawRows.push(...(await extractRows()))
  }
  diag.domRows = rawRows.length

  // Source API captée — calculée MAINTENANT (après navigation vers la page
  // relevés) : la réponse de l'API « statements » n'est émise par le SPA qu'une
  // fois cette page ouverte. La calculer avant la navigation captait de faux
  // positifs (transactions/soldes) — c'était la cause du « API 10 → parsés 0 ».
  const apiStatements = extractFromCaptured(captured).statements
  diag.apiListed = apiStatements.length

  // Fusionne API captée + DOM (multi-années), dédoublonne, EXCLUT les mois déjà
  // ingérés (backfill progressif) et priorise le plus récent, borné à maxN.
  const parsedAll = parseStatements([...apiStatements, ...rawRows])
  diag.parsed = parsedAll.length
  const statements = selectStatementsForBackfill(parsedAll, knownPeriods, maxN)
  diag.toDownload = statements.length
  if (statements.length === 0) {
    if (diag.parsed === 0) {
      diag.url = page.url()
      diag.navLabels = await collectNavLabels()
      // Toutes les URLs de l'API relevés captées (chemins) — pour repérer
      // l'endpoint exact de la LISTE (vs category-options déjà connu).
      diag.apiUrls = Array.from(new Set(
        captured
          .filter((r) => /account-statement|statements|document|advice/i.test(r.url))
          .map((r) => r.url.replace(/^https?:\/\/[^/]+/, ''))
      )).slice(0, 15)
      // Dump de la réponse « relevés » la plus grosse (hors category-options),
      // pour figer le parseur au prochain run.
      const stResp = captured
        .filter((r) => isStatementList(r.url))
        .sort((a, b) => JSON.stringify(b.json).length - JSON.stringify(a.json).length)[0]
        || captured.filter((r) => /account-statement|statements/i.test(r.url)).slice(-1)[0]
      if (stResp) {
        try { diag.sampleRaw = `${stResp.url.replace(/^https?:\/\/[^/]+/, '')} → ${JSON.stringify(stResp.json).slice(0, 1500)}` } catch { /* nonjson */ }
      }
      diag.note = "Navigué mais 0 relevé listé — la LISTE des relevés n'est pas captée (voir apiUrls/sampleRaw)."
    } else {
      diag.note = "Tous les relevés listés sont déjà ingérés (rien de neuf à télécharger)."
    }
    return { statements: [], diagnostic: diag }
  }

  const out: ScrapedStatement[] = []
  for (const s of statements) {
    if (Date.now() > deadline) break // budget temps épuisé → on finit au prochain run
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
    } else if (diag.errors.length < 5) {
      diag.errors.push(`${s.period}: téléchargement échoué (href=${s.download_href ? 'oui' : 'non'})`)
    }
  }

  diag.downloaded = out.length
  if (out.length === 0 && !diag.note) {
    diag.note = `${statements.length} relevé(s) listé(s) mais 0 téléchargé — lien/clic de téléchargement à confirmer.`
  }
  return { statements: out, diagnostic: diag }
}
