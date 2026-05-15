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

const MRA_URLS = {
  login: 'https://eservices.mra.mu/login',
  paye: 'https://eservices.mra.mu/paye/declarations/new',
  csg: 'https://eservices.mra.mu/csg/declarations/new',
  vat: 'https://eservices.mra.mu/vat/declarations/new',
  tds: 'https://eservices.mra.mu/tds/declarations/new',
  prgf: 'https://eservices.mra.mu/prgf/declarations/new',
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
 * Stub principal — à compléter avec Playwright quand le package sera installé.
 * Pour l'instant : retourne `manual_needed` → le caller envoie les fichiers
 * en PJ Telegram et l'admin soumet à la main sur eservices.mra.mu.
 */
export async function submitMraDeclaration(input: MraSubmitInput): Promise<MraSubmitResult> {
  try {
    await loadCredentials(input.societe_id)
  } catch (e: any) {
    return { status: 'failed', message: e.message, error: e.message }
  }

  // ⚠️ Stub : la soumission auto est désactivée tant que Playwright n'est
  // pas installé + les sélecteurs MRA réels mappés. On retourne donc
  // toujours `manual_needed` pour que le bot envoie les fichiers à l'admin.
  await updateSubmitStatus(
    input.societe_id,
    'manual_needed',
    'Soumission auto MRA pas encore activée — fichiers envoyés en PJ Telegram pour soumission manuelle.',
  )
  return {
    status: 'manual_needed',
    message:
      'Soumission auto MRA pas encore activée (Playwright stub). Les fichiers ont été envoyés en PJ Telegram, ' +
      'soumets-les manuellement sur https://eservices.mra.mu (' + input.type.toUpperCase() + ', période ' + input.periode + ').',
  }

  /*
  // === Code Playwright (commenté tant que les packages ne sont pas installés) ===
  // Pour activer :
  //   pnpm add playwright-core @sparticuz/chromium
  //   import chromium from '@sparticuz/chromium'
  //   import { chromium as playwright } from 'playwright-core'
  //
  //   const browser = await playwright.launch({
  //     args: chromium.args, defaultViewport: chromium.defaultViewport,
  //     executablePath: await chromium.executablePath(),
  //     headless: chromium.headless,
  //   })
  //   const ctx = await browser.newContext()
  //   const page = await ctx.newPage()
  //
  //   await page.goto(MRA_URLS.login, { waitUntil: 'networkidle' })
  //   await page.fill('input[name="username"]', creds.username)
  //   await page.fill('input[name="password"]', creds.password)
  //   await page.click('button[type="submit"]')
  //   await page.waitForNavigation({ waitUntil: 'networkidle' })
  //
  //   // Détection CAPTCHA / OTP → return manual_needed
  //   if (await page.locator('text=/captcha|otp|verification/i').count() > 0) {
  //     const screenshot = await page.screenshot({ encoding: 'base64' })
  //     await browser.close()
  //     await updateSubmitStatus(input.societe_id, 'manual_needed', '2FA/CAPTCHA détecté')
  //     return { status: 'manual_needed', message: '2FA actif côté MRA', screenshot_b64: screenshot }
  //   }
  //
  //   // Navigate to declaration form
  //   await page.goto(MRA_URLS[input.type], { waitUntil: 'networkidle' })
  //   // ... fill form depending on input.type ...
  //   // ... upload file from input.files[0] ...
  //   await page.click('button:has-text("Submit")')
  //   await page.waitForLoadState('networkidle')
  //
  //   const ackRef = await page.locator('[data-ref="ack"]').textContent()
  //   const screenshot = await page.screenshot({ encoding: 'base64' })
  //   await browser.close()
  //   await updateSubmitStatus(input.societe_id, 'success')
  //   return { status: 'success', message: `Soumis. Réf MRA : ${ackRef}`, ack_ref: ackRef, screenshot_b64: screenshot }
  */
}
