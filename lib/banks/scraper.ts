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
import { upsertScrapedTransactions } from './persist-transactions'
import { ingestScrapedTransactions } from './ingest-scrape'
import { ingestScrapedStatements } from './ingest-statements'
import { enqueueDocumentProcessing } from '@/lib/documents/queue'

export type BankCode = 'MCB' | 'SBM' | 'ABC' | 'MAUBANK' | 'MYTMONEY' | 'AFRASIA' | 'BANKONE' | 'OTHER'

export type ScrapedTransaction = {
  date: string                  // YYYY-MM-DD (date d'opération)
  description: string
  amount: number                // négatif si débit, positif si crédit
  currency: string
  reference?: string
  value_date?: string           // YYYY-MM-DD (date de valeur, si distincte)
  balance_after?: number | null // solde courant après opération (running balance)
}

/** Relevé PDF téléchargé depuis « Documents & statements » (à passer à l'OCR). */
export type ScrapedStatement = {
  date_generated: string        // YYYY-MM-DD (date de génération)
  period: string                // YYYY-MM (période comptable dérivée)
  doc_type: string
  filename: string
  pdf_base64: string            // contenu du PDF (base64)
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

/** Diagnostic de la phase « relevés PDF » : où ça s'arrête, pour corriger sans
 *  être à l'aveugle. Rendu même quand 0 PDF n'est récupéré. */
export type StatementsDiagnostic = {
  navigated: boolean          // le lien « Documents & statements » a été cliqué
  accountSelected: boolean    // le compte cible a été sélectionné
  yearTabs: number            // nb d'onglets année détectés
  apiListed: number           // relevés vus dans l'API captée
  domRows: number             // lignes relevé extraites du DOM
  parsed: number              // relevés parsés (API + DOM)
  toDownload: number          // relevés retenus (après exclusion des déjà-ingérés)
  downloaded: number          // PDF réellement téléchargés
  errors: string[]            // échecs de téléchargement (échantillon)
  navLabels?: string[]        // libellés cliquables visibles (si navigation KO)
  url?: string
  note?: string
  sampleRaw?: string          // échantillon JSON de la réponse relevés (si 0 parsé)
  apiUrls?: string[]          // URLs de l'API relevés captées (pour cibler la liste)
}

export type BankScrapeResult = {
  status: 'success' | 'failed' | 'manual_needed' | 'partial'
  balance_mur?: number
  balance_devise?: string
  nb_transactions?: number
  transactions?: ScrapedTransaction[]
  /** Relevés PDF récupérés depuis « Documents & statements » (best-effort). */
  statements?: ScrapedStatement[]
  /** Diagnostic de la phase relevés PDF (où ça s'arrête). */
  statements_diagnostic?: StatementsDiagnostic
  raw_excerpt?: string
  screenshot_b64?: string
  /** Diagnostic capturé quand un sélecteur manque : aide à corriger l'adapter. */
  diagnostic?: ScrapeDiagnostic
  error?: string
  duration_ms?: number
  /** Résultat de l'alimentation du relevé Lexora (relevés_bancaires + solde compte). */
  ingestion?: { ingested: boolean; nb_transactions?: number; releve_id?: string; reason?: string }
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
      // Nom de la société : nécessaire pour choisir le bon « context » MCB Pro.
      const admin = getAdminClient()
      const { data: soc } = await admin
        .from('societes').select('nom').eq('id', compte.societe_id).maybeSingle()

      // Mois déjà couverts par un relevé PDF ingéré (document lié) → le robot ne
      // les re-télécharge pas et se concentre sur l'historique manquant. Permet
      // un backfill PROGRESSIF de tout l'historique MCB (onglets année) run après
      // run, sans jamais dépasser le budget temps serverless. Best-effort.
      let knownPeriods: string[] = []
      try {
        const { data: existing } = await admin
          .from('releves_bancaires')
          .select('periode')
          .eq('compte_bancaire_id', input.compte_bancaire_id)
          .not('document_id', 'is', null)
        knownPeriods = [...new Set((existing || [])
          .map((r: { periode: string | null }) => r.periode)
          .filter((p): p is string => !!p))]
      } catch { /* best-effort : au pire on re-télécharge (dédup au stockage) */ }

      session = await launchBrowser({ defaultTimeout: 30000 })
      const scraped = await loginAndScrapeMcb(
        session.page,
        credentials,
        {
          numero_compte: compte.numero_compte,
          // Transactions « live » (HTML/API, pas PDF) : on parcourt plusieurs
          // pages (« suivant / load more ») et on fusionne toutes les réponses
          // API captées, dédoublonnées. Généreux mais borné ; la dédup au niveau
          // transactions_bancaires évite tout doublon entre runs quotidiens.
          max_transactions: 60,
          max_transaction_pages: 10,
          // Backfill des relevés PDF mensuels : plafond haut (24) + budget temps
          // (~70 s) + exclusion des mois déjà ingérés (knownPeriods). Le robot
          // parcourt les onglets année MCB et récupère l'historique manquant,
          // du plus récent au plus ancien, sur plusieurs runs si besoin. L'OCR +
          // le dédoublonnage par chemin de stockage se font côté scraper.ts.
          max_statements: 24,
          known_statement_periods: knownPeriods,
          company_name: soc?.nom || null,
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

    // ── Alimentation du relevé bancaire Lexora (transactions_bancaires) ──
    // Les mouvements scrapés (success OU partial avec transactions) sont
    // injectés dans la table de rapprochement, dédoublonnés de façon idempotente
    // (référence FT… ou date+montant+libellé). Un run quotidien ne recrée jamais
    // les mouvements déjà présents.
    if (
      (result.status === 'success' || result.status === 'partial') &&
      result.transactions &&
      result.transactions.length > 0
    ) {
      try {
        const persist = await upsertScrapedTransactions(
          getAdminClient() as never,
          { compte_bancaire_id: input.compte_bancaire_id, societe_id: input.societe_id },
          result.transactions,
        )
        result.raw_excerpt = [
          result.raw_excerpt,
          `Relevé Lexora : +${persist.inserted} mouvement(s), ${persist.duplicates} doublon(s) ignoré(s).`,
        ].filter(Boolean).join(' ')
      } catch {
        // L'échec d'injection ne doit pas faire échouer le scrape lui-même
        // (le solde + l'audit bank_scrape_runs restent valides).
      }

      // ── Relevé de rapprochement + solde courant du compte ──
      // Construit/actualise le relevé `releves_bancaires` (source du moteur de
      // rapprochement, transactions_json) ET met à jour comptes_bancaires
      // (solde_actuel / date_dernier_releve). Appelé pour TOUS les déclencheurs
      // (cron ET manuel) : le robot quotidien alimente ainsi le rapprochement de
      // façon autonome, et la carte compte ne reste plus figée sur l'ancien solde.
      // Best-effort : n'échoue jamais le scrape.
      try {
        result.ingestion = await ingestScrapedTransactions(getAdminClient() as never, {
          compte_bancaire_id: input.compte_bancaire_id,
          societe_id: input.societe_id,
          numero_compte: null,
          result,
        })
      } catch (e) {
        result.ingestion = { ingested: false, reason: e instanceof Error ? e.message : 'ingestion_failed' }
      }
    }

    // ── Ingestion des relevés PDF dans le pipeline OCR existant ──
    // Les relevés « Documents & statements » récupérés sont stockés comme
    // documents `releve_bancaire` et passés à la file OCR (process-document →
    // process-releve) qui crée les entrées `releves_bancaires`. Dédoublonné par
    // chemin de stockage déterministe. Best-effort : n'affecte pas le scrape.
    if (result.statements && result.statements.length > 0) {
      try {
        const admin = getAdminClient()
        const { data: dossier } = await admin
          .from('dossiers')
          .select('id, comptable_id, client_id')
          .eq('societe_id', input.societe_id)
          .limit(1)
          .maybeSingle()
        const uploadedBy = dossier?.comptable_id || dossier?.client_id || null
        const compte = await loadCompte(input.compte_bancaire_id)
        if (dossier?.id && uploadedBy) {
          const ing = await ingestScrapedStatements(
            admin as never,
            {
              societe_id: input.societe_id,
              compte_bancaire_id: input.compte_bancaire_id,
              banque: compte.banque || 'BANK',
              numero_compte: compte.numero_compte || input.compte_bancaire_id,
              dossier_id: dossier.id,
              uploaded_by: uploadedBy,
            },
            result.statements,
            // forced_type : le robot SAIT que c'est un relevé bancaire → le
            // pipeline ne re-classe pas à tort en « autre » et utilise un modèle
            // d'extraction plus fort. Sans ça, le PDF scrapé était archivé mais
            // jamais transformé en relevé.
            (documentId: string) => enqueueDocumentProcessing({
              documentId, source: 'manual', payload: { forced_type: 'releve_bancaire' },
            }),
          )
          result.raw_excerpt = [
            result.raw_excerpt,
            `Relevés PDF : ${ing.ingested} ingéré(s) → OCR, ${ing.skipped} déjà présent(s)${ing.errors ? `, ${ing.errors} erreur(s)` : ''}.`,
          ].filter(Boolean).join(' ')
        }
      } catch {
        // Ingestion best-effort : jamais bloquant pour le scrape.
      }
    }

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
