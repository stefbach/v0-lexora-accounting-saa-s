/**
 * Injection des transactions scrapées dans le relevé bancaire de Lexora
 * (`transactions_bancaires`) avec dédoublonnage idempotent.
 *
 * Contexte : le robot bancaire lit chaque jour la liste des mouvements du
 * portail (lib/banks/adapters/mcb.ts). Ces mouvements doivent alimenter la
 * table `transactions_bancaires` — celle qui sert au rapprochement / lettrage —
 * SANS créer de doublons d'un jour sur l'autre (les runs quotidiens re-voient
 * les mêmes N derniers mouvements).
 *
 * Stratégie de dédoublonnage (sans DDL, 100 % applicatif — pas de contrainte
 * unique à migrer en prod) :
 *   - clé stable par mouvement : `ref:<reference>` si la banque fournit une
 *     référence unique (« FT262327YRQX »), sinon `dmd:<date>|<montant>|<libellé>` ;
 *   - on charge les mouvements déjà présents sur la fenêtre de dates scrapée,
 *     on en calcule les clés, et on n'insère que les mouvements dont la clé est
 *     nouvelle (dédoublonnage aussi à l'intérieur du lot scrapé).
 *
 * La logique de sélection est pure et testée ici ; l'I/O Supabase est une fine
 * couche au-dessus (upsertScrapedTransactions).
 */

import type { ScrapedTransaction } from './scraper'

/** Montant signé → clé de dédoublonnage stable entre exécutions. */
export function scrapedDedupeKey(t: {
  reference?: string | null
  date: string
  amount: number
  description?: string
}): string {
  const ref = (t.reference || '').trim()
  if (ref) return `ref:${ref}`
  return `dmd:${t.date}|${t.amount.toFixed(2)}|${(t.description || '').slice(0, 40).toLowerCase()}`
}

/**
 * Ligne `transactions_bancaires` existante (déjà en base) réduite à ce qu'il
 * faut pour recalculer sa clé de dédoublonnage.
 */
export interface ExistingBankRow {
  reference?: string | null
  date_transaction: string
  debit?: number | string | null
  credit?: number | string | null
  libelle_banque?: string | null
}

/** Reconstitue la clé de dédoublonnage d'une ligne déjà persistée. */
export function existingRowKey(row: ExistingBankRow): string {
  const debit = Number(row.debit || 0)
  const credit = Number(row.credit || 0)
  // Montant signé cohérent avec ScrapedTransaction (crédit +, débit −).
  const amount = credit > 0 ? credit : -debit
  return scrapedDedupeKey({
    reference: row.reference,
    date: row.date_transaction,
    amount,
    description: row.libelle_banque || '',
  })
}

/**
 * Filtre le lot scrapé : ne garde que les mouvements absents de la base
 * (`existingKeys`) et non dupliqués à l'intérieur du lot. Ordre d'entrée
 * préservé.
 */
export function selectNewTransactions(
  scraped: ScrapedTransaction[],
  existingKeys: Set<string>,
): ScrapedTransaction[] {
  const out: ScrapedTransaction[] = []
  const seen = new Set<string>()
  for (const t of scraped) {
    const k = scrapedDedupeKey(t)
    if (existingKeys.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** Mappe un mouvement scrapé vers une ligne insérable `transactions_bancaires`. */
export function toBankTransactionRow(
  t: ScrapedTransaction,
  ctx: { compte_bancaire_id: string; societe_id: string },
): Record<string, unknown> {
  const debit = t.amount < 0 ? Math.abs(t.amount) : 0
  const credit = t.amount > 0 ? t.amount : 0
  return {
    compte_bancaire_id: ctx.compte_bancaire_id,
    societe_id: ctx.societe_id,
    date_transaction: t.date,
    date_valeur: t.value_date || t.date,
    libelle_banque: t.description || '(sans libellé)',
    reference: t.reference || null,
    debit,
    credit,
    solde_apres: t.balance_after ?? null,
    type_transaction: 'scrape_auto',
    statut_lettrage: 'a_lettrer',
  }
}

export interface PersistResult {
  inserted: number
  duplicates: number
  window: { from: string; to: string } | null
}

/** Client Supabase minimal requis (admin/service-role). */
interface MinimalAdmin {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        gte(col: string, val: string): {
          lte(col: string, val: string): Promise<{ data: ExistingBankRow[] | null }>
        }
      }
    }
    insert(rows: Record<string, unknown>[]): Promise<{ error: unknown }>
  }
}

/**
 * Charge les mouvements existants sur la fenêtre scrapée, dédoublonne, et
 * insère uniquement les nouveaux dans `transactions_bancaires`. Idempotent :
 * relancer le même scrape n'ajoute rien.
 */
export async function upsertScrapedTransactions(
  admin: MinimalAdmin,
  ctx: { compte_bancaire_id: string; societe_id: string },
  transactions: ScrapedTransaction[],
): Promise<PersistResult> {
  if (!transactions || transactions.length === 0) {
    return { inserted: 0, duplicates: 0, window: null }
  }

  const dates = transactions.map((t) => t.date).filter(Boolean).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]

  const { data: existing } = await admin
    .from('transactions_bancaires')
    .select('reference, date_transaction, debit, credit, libelle_banque')
    .eq('compte_bancaire_id', ctx.compte_bancaire_id)
    .gte('date_transaction', from)
    .lte('date_transaction', to)

  const existingKeys = new Set<string>((existing || []).map(existingRowKey))
  const fresh = selectNewTransactions(transactions, existingKeys)

  if (fresh.length > 0) {
    const rows = fresh.map((t) => toBankTransactionRow(t, ctx))
    await admin.from('transactions_bancaires').insert(rows)
  }

  return {
    inserted: fresh.length,
    duplicates: transactions.length - fresh.length,
    window: { from, to },
  }
}
