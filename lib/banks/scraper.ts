/**
 * Robot Playwright pour scraping des comptes Internet Banking mauriciens.
 *
 * Architecture identique au robot MRA (lib/telegram/mra-robot.ts) :
 *  1. Lance Chromium headless via @sparticuz/chromium sur Vercel
 *  2. Se connecte avec credentials chiffrées (lib/crypto/symmetric.ts)
 *  3. Navigue selon l'adapter par banque (MCB, SBM, ABC, MauBank, MyT Money,
 *     AfrAsia, Bank One)
 *  4. Scrape balance + transactions récentes
 *  5. Capture screenshot si erreur
 *  6. INSERT dans bank_scrape_runs (audit) + détecte anomalies
 *
 * Fail-safe :
 *  - Si CAPTCHA / OTP / changement d'UI → status='manual_needed', l'admin reçoit
 *    une notif Telegram pour intervenir manuellement
 *  - Idempotence : un scrape concurrent sur même compte est skippé
 *
 * Setup côté Vercel pour activer :
 *   pnpm add playwright-core @sparticuz/chromium
 *   ENV: CRYPT_KEY (déjà requis pour autres robots)
 *
 * Cette implémentation est un SQUELETTE avec adapter interface :
 *  - Chaque banque a sa propre fonction `loginAndScrape*` (signature commune)
 *  - À activer banque par banque en mappant les sélecteurs réels
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/crypto/symmetric'
import { launchBrowser } from './playwright-launcher'
import { loginAndScrapeMcb } from './adapters/mcb'

export type BankCode = 'MCB' | 'SBM' | 'ABC' | 'MAUBANK' | 'MYTMONEY' | 'AFRASIA' | 'BANKONE' | 'OTHER'

export type ScrapedTransaction = {
  date: string                  // YYYY-MM-DD
  description: string
  amount: number                // négatif si débit, positif si crédit
  currency: string
  reference?: string
}

export type BankScrapeInput = {
  compte_bancaire_id: string
  societe_id: string
  trigger_source: 'cron' | 'manual' | 'telegram'
}

export type PageFieldDiagnostic = {
  tag: string
  type?: string
  name?: string
  id?: string
  placeholder?: string
  label?: string
  visible: boolean
}

export type ScrapeDiagnostic = {
  url: string
  title?: string
  inputs: PageFieldDiagnostic[]
  buttons: PageFieldDiagnostic[]
  /** Éléments cliquables (liens, cartes, tuiles) — utile pour les SPA sans <button>. */
  clickables?: PageFieldDiagnostic[]
}

export type BankScrapeResult = {
  status: 'success' | 'failed' | 'manual_needed' | 'partial'
  balance_mur?: number
  balance_devise?: string
  nb_transactions?: number
  transactions?: ScrapedTransaction[]
  raw_excerpt?: string
  screenshot_b64?: string
  /** Diagnostic capturé quand un sélecteur manque : aide à corriger l'adapter. */
  diagnostic?: ScrapeDiagnostic
  error?: string
  duration_ms?: number
}

const BANK_LOGIN_URLS: Record<BankCode, string> = {
  MCB:       'https://ibpro.mcb.mu',
  SBM:       'https://internetbanking.sbmgroup.mu',
  ABC:       'https://www.abcbank.mu/business-banking',
  MAUBANK:   'https://internetbanking.maubank.mu',
  MYTMONEY:  'https://www.myt.mu/myt-money',
  AFRASIA:   'https://www.afrasiabank.com',
  BANKONE:   'https://www.bankone.mu',
  OTHER:     'about:blank',
}

async function loadCredentials(compte_bancaire_id: string) {
  const admin = getAdminClient()
  const { data: cred } = await admin
    .from('comptes_bancaires_scraping_creds')
    .select('username_enc, password_enc, secondary_pin_enc, login_url, active')
    .eq('compte_bancaire_id', compte_bancaire_id)
    .maybeSingle()
  if (!cred) throw new Error(`Credentials non configurées pour compte ${compte_bancaire_id}. Va dans Direction → Accès Bancaires.`)
  if (!cred.active) throw new Error('Scraping désactivé pour ce compte.')
  if (!cred.username_enc || !cred.password_enc) {
    throw new Error('Username/password manquants.')
  }
  return {
    username: decryptSecret(cred.username_enc),
    password: decryptSecret(cred.password_enc),
    pin: cred.secondary_pin_enc ? decryptSecret(cred.secondary_pin_enc) : null,
    login_url: cred.login_url || null,
  }
}

async function loadCompte(compte_bancaire_id: string) {
  const admin = getAdminClient()
  const { data: cb } = await admin
    .from('comptes_bancaires')
    .select('id, societe_id, banque, numero_compte, devise, solde_actuel')
    .eq('id', compte_bancaire_id)
    .maybeSingle()
  if (!cb) throw new Error(`Compte bancaire ${compte_bancaire_id} introuvable`)
  return cb
}

function detectBankCode(banque: string | null): BankCode {
  const b = (banque || '').toUpperCase()
  if (b.includes('MCB')) return 'MCB'
  if (b.includes('SBM')) return 'SBM'
  if (b.includes('ABC')) return 'ABC'
  if (b.includes('MAUBANK')) return 'MAUBANK'
  if (b.includes('MYT')) return 'MYTMONEY'
  if (b.includes('AFRASIA')) return 'AFRASIA'
  if (b.includes('BANKONE') || b.includes('BANK ONE')) return 'BANKONE'
  return 'OTHER'
}

async function recordRun(args: {
  compte_bancaire_id: string
  societe_id: string
  trigger_source: string
  result: BankScrapeResult
}) {
  const admin = getAdminClient()
  await admin.from('bank_scrape_runs').insert({
    societe_id: args.societe_id,
    compte_bancaire_id: args.compte_bancaire_id,
    status: args.result.status,
    balance_mur: args.result.balance_mur ?? null,
    balance_devise: args.result.balance_devise ?? null,
    nb_transactions: args.result.nb_transactions ?? null,
    transactions: args.result.transactions ?? null,
    raw_excerpt: args.result.raw_excerpt ?? null,
    error_msg: args.result.error ?? null,
    duration_ms: args.result.duration_ms ?? null,
    trigger_source: args.trigger_source,
  }).then(() => {}, () => {})

  await admin.from('comptes_bancaires_scraping_creds').update({
    last_scrape_at: new Date().toISOString(),
    last_scrape_status: args.result.status,
    last_scrape_error: args.result.error ?? null,
    last_balance_mur: args.result.balance_mur ?? null,
  }).eq('compte_bancaire_id', args.compte_bancaire_id).then(() => {}, () => {})
}

/**
 * Point d'entrée principal.
 * Stub : retourne `manual_needed` tant que Playwright n'est pas installé.
 * À activer : décommenter les blocs ci-dessous et mapper les sélecteurs.
 */
export async function scrapeBankAccount(input: BankScrapeInput): Promise<BankScrapeResult> {
  const t0 = Date.now()
  let result: BankScrapeResult
  let session: Awaited<ReturnType<typeof launchBrowser>> | null = null

  try {
    const compte = await loadCompte(input.compte_bancaire_id)
    const credentials = await loadCredentials(input.compte_bancaire_id)
    const bankCode = detectBankCode(compte.banque)

    // Dispatch par banque. Pour l'instant seule MCB est implémentée ;
    // les autres banques restent en manual_needed jusqu'à mapping de
    // leurs sélecteurs respectifs.
    if (bankCode === 'MCB') {
      session = await launchBrowser({ defaultTimeout: 30000 })
      const scraped = await loginAndScrapeMcb(
        session.page,
        credentials,
        {
          numero_compte: compte.numero_compte,
          max_transactions: 30,
          // URL configurée par l'utilisateur, sinon URL par défaut de la banque.
          login_url: credentials.login_url || BANK_LOGIN_URLS[bankCode],
        },
      )
      result = { ...scraped, duration_ms: Date.now() - t0 }
    } else {
      result = {
        status: 'manual_needed',
        error: `Adapter ${bankCode} pas encore implémenté. Banques actives : MCB. Pour les autres, upload manuel du relevé via /client/comptes-bancaires.`,
        duration_ms: Date.now() - t0,
      }
    }

    await recordRun({
      compte_bancaire_id: input.compte_bancaire_id,
      societe_id: input.societe_id,
      trigger_source: input.trigger_source,
      result,
    })
    return result
  } catch (e) {
    result = {
      status: 'failed',
      error: e instanceof Error ? e.message : 'Erreur inconnue',
      duration_ms: Date.now() - t0,
    }
    await recordRun({
      compte_bancaire_id: input.compte_bancaire_id,
      societe_id: input.societe_id,
      trigger_source: input.trigger_source,
      result,
    })
    return result
  } finally {
    if (session) await session.close()
  }
}

/**
 * Détection d'anomalies post-scrape : compare le solde scrapé avec le dernier
 * relevé bancaire et avec le scrape précédent. Insère dans bank_scrape_anomalies
 * si écart > 1% ou variation absolue > seuil.
 */
export async function detectAnomalies(compte_bancaire_id: string, result: BankScrapeResult) {
  if (result.status !== 'success' || result.balance_mur == null) return

  const admin = getAdminClient()
  const compte = await loadCompte(compte_bancaire_id)

  // 1. Compare avec le solde "officiel" dans comptes_bancaires (issu des relevés)
  const officialBalance = Number(compte.solde_actuel || 0)
  const scraped = Number(result.balance_mur)
  const diff = Math.abs(scraped - officialBalance)
  const diffPct = officialBalance !== 0 ? (diff / Math.abs(officialBalance)) * 100 : 0

  if (diff > 100 && diffPct > 1) {
    await admin.from('bank_scrape_anomalies').insert({
      societe_id: compte.societe_id,
      compte_bancaire_id,
      type: 'balance_mismatch',
      severity: diffPct > 5 ? 'critical' : 'warning',
      details: {
        scraped_balance: scraped,
        official_balance: officialBalance,
        diff,
        diff_pct: Number(diffPct.toFixed(2)),
      },
    }).then(() => {}, () => {})
  }

  // 2. Variation anormale depuis le dernier scrape success (drop > 30% en 1 jour)
  const { data: previousRuns } = await admin
    .from('bank_scrape_runs')
    .select('balance_mur, scrape_at')
    .eq('compte_bancaire_id', compte_bancaire_id)
    .eq('status', 'success')
    .order('scrape_at', { ascending: false })
    .limit(2)
  if (previousRuns && previousRuns.length >= 2) {
    const prev = Number(previousRuns[1].balance_mur || 0)
    if (prev !== 0) {
      const dropPct = ((prev - scraped) / Math.abs(prev)) * 100
      if (dropPct > 30) {
        await admin.from('bank_scrape_anomalies').insert({
          societe_id: compte.societe_id,
          compte_bancaire_id,
          type: 'balance_drop',
          severity: 'critical',
          details: {
            previous_balance: prev,
            current_balance: scraped,
            drop_pct: Number(dropPct.toFixed(2)),
            previous_scrape_at: previousRuns[1].scrape_at,
          },
        }).then(() => {}, () => {})
      }
    }
  }
}

export const BANK_NAMES: Record<BankCode, string> = {
  MCB: 'MCB',
  SBM: 'SBM',
  ABC: 'ABC Banking',
  MAUBANK: 'MauBank',
  MYTMONEY: 'MyT Money',
  AFRASIA: 'AfrAsia',
  BANKONE: 'Bank One',
  OTHER: 'Autre',
}
