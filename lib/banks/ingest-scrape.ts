/**
 * ingestScrapedTransactions — injecte les transactions récupérées par le robot
 * de scraping dans le pipeline de rapprochement.
 *
 * Le moteur de rapprochement lit `releves_bancaires.transactions_json`
 * (cf. app/api/agent/rapprochement/*, lib/bank/process-releve.ts). On construit
 * donc, à partir d'un scrape réussi, un « relevé » couvrant la période des
 * transactions récupérées, via la même RPC versionnée `replace_releve_bancaire`
 * que l'import OCR — de sorte que le scraping et l'OCR alimentent le rapprochement
 * de manière identique.
 *
 * ⚠️ Intégrité comptable : le scraping ne récupère que les N dernières
 * transactions (pas un relevé complet avec solde d'ouverture officiel). On borne
 * donc la période aux dates réellement récupérées et on calcule le solde
 * d'ouverture pour cohérence interne (écart = 0). Comme la clé de versioning est
 * (compte, date_debut, date_fin), un relevé OCR mensuel (période différente) et
 * un relevé de scraping ne s'écrasent pas ; en revanche deux scrapes couvrant
 * exactement la même plage se remplacent (idempotent), ce qui est voulu.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertReleveBancaire } from '@/lib/bank/upsert-releve'
import type { BankScrapeResult } from './scraper'

export interface IngestScrapeInput {
  compte_bancaire_id: string
  societe_id: string
  numero_compte: string | null
  result: BankScrapeResult
}

export interface IngestScrapeResult {
  ingested: boolean
  reason?: string
  releve_id?: string
  nb_transactions?: number
}

/** Coerce best-effort en YYYY-MM-DD. */
function normalizeDate(raw: string): string | null {
  const s = (raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

export async function ingestScrapedTransactions(
  supabase: SupabaseClient,
  input: IngestScrapeInput,
): Promise<IngestScrapeResult> {
  const { result } = input
  if (result.status !== 'success') return { ingested: false, reason: 'scrape_not_success' }
  const rawTx = Array.isArray(result.transactions) ? result.transactions : []
  if (rawTx.length === 0) return { ingested: false, reason: 'no_transactions' }

  // Map ScrapedTransaction (amount signé) → format normalisé debit/credit.
  const normalized = rawTx
    .map((t) => {
      const date = normalizeDate(t.date)
      if (!date) return null
      const amount = Number(t.amount)
      if (!Number.isFinite(amount) || amount === 0) return null
      const debit = amount < 0 ? Math.abs(amount) : 0
      const credit = amount > 0 ? amount : 0
      return {
        date,
        libelle: (t.description || '(sans libellé)').slice(0, 500),
        debit,
        credit,
        reference: t.reference || null,
        tiers_detecte: null as string | null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (normalized.length === 0) return { ingested: false, reason: 'no_valid_transactions' }

  // Période = bornes des dates récupérées.
  const dates = normalized.map((t) => t.date).sort()
  const dateDebut = dates[0]
  const dateFin = dates[dates.length - 1]

  const totalDebits = normalized.reduce((s, t) => s + t.debit, 0)
  const totalCredits = normalized.reduce((s, t) => s + t.credit, 0)
  // Solde de clôture = solde scrapé ; solde d'ouverture calculé pour écart nul.
  const soldeCloture = Number(result.balance_mur ?? 0)
  const soldeOuverture = soldeCloture - (totalCredits - totalDebits)

  const upserted = await upsertReleveBancaire(
    supabase,
    {
      compte_bancaire_id: input.compte_bancaire_id,
      societe_id: input.societe_id,
      periode: dateFin.substring(0, 7),
      date_debut: dateDebut,
      date_fin: dateFin,
      solde_ouverture: soldeOuverture,
      solde_cloture: soldeCloture,
      total_debits: totalDebits,
      total_credits: totalCredits,
      nb_transactions: normalized.length,
      ecart_solde: 0,
      document_id: null,
      transactions_json: normalized,
      statut_rapprochement: 'en_attente',
    },
    { uploaded_by: null, source: 'api' },
  )

  // Best-effort : lignes par transaction dans transactions_bancaires (recherche
  // libre Telegram). Le rapprochement, lui, lit transactions_json ci-dessus.
  try {
    const rows = normalized.map((t) => ({
      releve_id: upserted.releve_id,
      compte_bancaire_id: input.compte_bancaire_id,
      societe_id: input.societe_id,
      date_transaction: t.date,
      libelle_banque: t.libelle,
      reference: t.reference,
      debit: t.debit,
      credit: t.credit,
      statut_lettrage: 'a_lettrer',
    }))
    if (rows.length > 0) await supabase.from('transactions_bancaires').insert(rows)
  } catch { /* non-fatal */ }

  return {
    ingested: true,
    releve_id: upserted.releve_id,
    nb_transactions: normalized.length,
  }
}
