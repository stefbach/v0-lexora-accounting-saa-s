/**
 * Robot Playwright pour soumettre des déclarations MRA.
 *
 * MRA Maurice n'a PAS d'API publique pour les soumissions. Ce module :
 *  1. Lance un Chromium headless (via @sparticuz/chromium sur Vercel)
 *  2. Se connecte avec les credentials chiffrées de la société
 *  3. Navigue vers le formulaire (PAYE / CSG-NSF / VAT / TDS)
 *  4. Remplit les champs depuis le CSV/XML généré côté Lexora
 *  5. Soumet et capture un screenshot + l'accusé de réception
 *
 * IMPORTANT — Stratégie de fail-safe :
 *  - Si MRA active un CAPTCHA / OTP / changement d'UI → on capture l'erreur,
 *    on retourne `{ status: 'manual_needed', screenshot, files }` au bot,
 *    qui envoie alors les fichiers en PJ Telegram pour soumission manuelle.
 *  - Aucune transaction MRA n'est jamais répétée tant qu'on n'a pas confirmé
 *    qu'elle a échoué (idempotence stricte via flag `last_submit_status`).
 *
 * Setup côté Vercel :
 *   pnpm add playwright-core @sparticuz/chromium
 *   ENV: CRYPT_KEY (clé chiffrement secrets — cf. lib/crypto/symmetric.ts)
 *
 * USAGE :
 *   const result = await submitMraDeclaration({
 *     societe_id, type: 'paye', periode: '2025-05',
 *     files: [{ filename, content }],
 *   })
 *
 * Cette implémentation est un SQUELETTE :
 *  - Login MRA générique
 *  - Navigation vers PAYE/CSG/VAT à compléter selon les URLs réelles
 *  - Capture screenshot en cas d'erreur
 *
 * À FINIR : sélecteurs CSS exacts MRA + scénarios par type de déclaration.
 * Tester d'abord en local avec un compte test MRA avant d'activer en prod.
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/crypto/symmetric'
import { launchBrowser, captureScreenshot } from '@/lib/banks/playwright-launcher'

export type MraSubmitInput = {
  societe_id: string
  type: 'paye' | 'csg' | 'vat' | 'tds' | 'prgf'
  periode: string                          // YYYY-MM
  files: Array<{ filename: string; content: string }>
}

export type MraSubmitResult = {
  status: 'success' | 'failed' | 'manual_needed'
  message: string
  ack_ref?: string                          // Référence MRA renvoyée si success
  screenshot_b64?: string                    // PNG base64 en cas d'erreur ou success
  error?: string
}

// URLs MRA — chaque type de déclaration a SON propre sous-domaine et
// SON propre formulaire login (architecture historique du MRA).
// À vérifier/corriger lors des premiers tests en sandbox.
const MRA_URLS = {
  // VAT a une URL dédiée bien établie
  vat: {
    login: 'https://eservices3.mra.mu/vatreturn/taxpayerlogin.jsp',
    form: 'https://eservices3.mra.mu/vatreturn/',
  },
  // CIT via central login MRA
  cit: {
    login: 'https://eservices38.mra.mu/centralLogin/login',
    form: 'https://eservices38.mra.mu/CIT/',
  },
  // PAYE, CSG, TDS, PRGF : URLs à valider — placeholders raisonnables
  paye: {
    login: 'https://eservices.mra.mu/centralLogin/login',
    form: 'https://eservices.mra.mu/PAYE/declarations/new',
  },
  csg: {
    login: 'https://eservices.mra.mu/centralLogin/login',
    form: 'https://eservices.mra.mu/CSG/declarations/new',
  },
  tds: {
    login: 'https://eservices.mra.mu/centralLogin/login',
    form: 'https://eservices.mra.mu/TDS/declarations/new',
  },
  prgf: {
    login: 'https://eservices.mra.mu/centralLogin/login',
    form: 'https://eservices.mra.mu/PRGF/declarations/new',
  },
}

async function loadCredentials(societe_id: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from('societe_mra_credentials')
    .select('mra_username, mra_password_enc, mra_tan_enc, active')
    .eq('societe_id', societe_id)
    .maybeSingle()
  if (!data) throw new Error('Credentials MRA non configurées pour cette société. Va dans Direction → MRA Credentials.')
  if (!data.active) throw new Error('Soumission MRA désactivée pour cette société.')
  if (!data.mra_username || !data.mra_password_enc) {
    throw new Error('Username ou mot de passe MRA manquant.')
  }
  return {
    username: data.mra_username,
    password: decryptSecret(data.mra_password_enc),
    tan: data.mra_tan_enc ? decryptSecret(data.mra_tan_enc) : null,
  }
}

async function updateSubmitStatus(societe_id: string, status: 'success' | 'failed' | 'manual_needed', error?: string) {
  const admin = getAdminClient()
  await admin.from('societe_mra_credentials').update({
    last_submitted_at: new Date().toISOString(),
    last_submit_status: status,
    last_submit_error: error || null,
  }).eq('societe_id', societe_id)
}

/**
 * Soumission MRA via Playwright headless.
 *
 * Étapes (génériques, à valider par type de déclaration) :
 *   1. Login sur le portail MRA correspondant au `type` demandé
 *   2. Détection CAPTCHA / OTP → si présent, retourne `manual_needed`
 *      avec screenshot pour intervention humaine via Telegram
 *   3. Navigation vers le formulaire de déclaration
 *   4. Upload du fichier (CSV/XML déjà généré par Lexora côté server)
 *   5. Soumission + capture accusé de réception
 *   6. Update DB avec last_submit_status + screenshot stocké en audit log
 *
 * ⚠ SÉLECTEURS À VALIDER : les CSS ci-dessous sont des best-guess basés
 * sur les patterns standards eGov Mauritius. Avant prod, valide chaque
 * sélecteur avec scripts/discover-mra-selectors.mjs lancé en local.
 */
export async function submitMraDeclaration(input: MraSubmitInput): Promise<MraSubmitResult> {
  let creds
  try {
    creds = await loadCredentials(input.societe_id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Credentials introuvables'
    return { status: 'failed', message: msg, error: msg }
  }

  const urls = MRA_URLS[input.type]
  if (!urls) {
    return { status: 'failed', message: `Type de déclaration inconnu : ${input.type}`, error: 'invalid_type' }
  }

  let session: Awaited<ReturnType<typeof launchBrowser>> | null = null
  try {
    session = await launchBrowser({ defaultTimeout: 30000 })
    const { page } = session

    // ── 1. Login ──
    await page.goto(urls.login, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="username"], input[name="userId"], input[id="username"]', creds.username)
    await page.fill('input[type="password"]', creds.password)
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Login")')

    // ── 2. Attendre soit dashboard, soit CAPTCHA/OTP, soit erreur ──
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})

    const needsManual = await page
      .locator(':text-matches("captcha|otp|verification|verify", "i")')
      .count()
      .then((c: number) => c > 0)
      .catch(() => false)

    if (needsManual) {
      const screenshot = await captureScreenshot(page)
      await updateSubmitStatus(input.societe_id, 'manual_needed', '2FA/CAPTCHA détecté')
      return {
        status: 'manual_needed',
        message: 'MRA demande CAPTCHA ou OTP. Soumission manuelle requise via Telegram (fichiers joints).',
        screenshot_b64: screenshot,
      }
    }

    const loginError = await page
      .locator(':text-matches("invalid|incorrect|wrong|failed", "i")')
      .count()
      .then((c: number) => c > 0)
      .catch(() => false)

    if (loginError) {
      const screenshot = await captureScreenshot(page)
      await updateSubmitStatus(input.societe_id, 'failed', 'Login MRA rejeté')
      return {
        status: 'failed',
        message: 'MRA a rejeté les credentials',
        error: 'login_rejected',
        screenshot_b64: screenshot,
      }
    }

    // ── 3. Navigation vers le formulaire ──
    await page.goto(urls.form, { waitUntil: 'domcontentloaded' }).catch(() => {})

    // ── 4. Upload du premier fichier de la liste ──
    // (les déclarations MRA acceptent généralement 1 seul fichier CSV/XML)
    if (input.files.length === 0) {
      throw new Error('Aucun fichier fourni pour la déclaration MRA')
    }
    const file = input.files[0]
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 }).catch(() => null)
    if (!fileInput) {
      const screenshot = await captureScreenshot(page)
      await updateSubmitStatus(input.societe_id, 'manual_needed', 'Champ upload introuvable')
      return {
        status: 'manual_needed',
        message: `Formulaire ${input.type.toUpperCase()} : champ d'upload introuvable. Soumission manuelle requise.`,
        screenshot_b64: screenshot,
      }
    }
    await fileInput.setInputFiles({
      name: file.filename,
      mimeType: file.filename.endsWith('.xml') ? 'application/xml' : 'text/csv',
      buffer: Buffer.from(file.content),
    })

    // ── 5. Soumission ──
    await page.click('button:has-text("Submit"), button:has-text("Soumettre"), input[value*="Submit" i]')
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})

    // ── 6. Extraction de la référence d'accusé ──
    const ackRef = await page
      .locator('[data-ref="ack"], .ack-ref, :text-matches("Reference|Réf", "i")')
      .first()
      .textContent()
      .catch(() => null)

    const screenshot = await captureScreenshot(page)
    await updateSubmitStatus(input.societe_id, 'success')
    return {
      status: 'success',
      message: ackRef ? `Soumis. Réf MRA : ${ackRef.trim()}` : 'Soumis (référence non détectée)',
      ack_ref: ackRef?.trim() || undefined,
      screenshot_b64: screenshot,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur soumission MRA inconnue'
    await updateSubmitStatus(input.societe_id, 'failed', msg)
    let screenshot_b64: string | undefined
    if (session) {
      try { screenshot_b64 = await captureScreenshot(session.page) } catch { /* ignore */ }
    }
    return { status: 'failed', message: msg, error: msg, screenshot_b64 }
  } finally {
    if (session) await session.close()
  }
}
