import { getTauxChange } from '@/lib/taux-change'
import { getOpenInvoices } from './queries'

export interface InvoiceCombination {
  invoices: Array<{ id: string; numero_facture: string; tiers: string; montant_ttc: number; montant_mur: number; devise: string }>
  total_original: number
  total_mur: number
  diff_pct: number
  is_exact: boolean
}

export async function findInvoiceCombinations(
  societeId: string,
  targetAmount: number,
  targetDevise: string,
  filter?: { type?: 'client' | 'fournisseur'; customerName?: string },
  tolerance = 0.02
): Promise<InvoiceCombination[]> {
  const invoices = await getOpenInvoices(societeId, {
    type: filter?.type,
    customerId: filter?.customerName,
  })
  if (invoices.length === 0) return []

  const rates = await getTauxChange()
  const toMUR = (amount: number, devise: string): number => {
    if (!devise || devise === 'MUR') return amount
    return amount * (rates[devise.toUpperCase()] || 1)
  }

  const targetMUR = toMUR(targetAmount, targetDevise)
  const maxInvoices = Math.min(invoices.length, 20)
  const subset = invoices.slice(0, maxInvoices)

  const results: InvoiceCombination[] = []

  // Passe 1 : match unitaire
  for (const inv of subset) {
    const invMUR = Number(inv.montant_mur) || toMUR(Number(inv.montant_ttc) || 0, inv.devise || 'MUR')
    if (invMUR === 0) continue

    // Même devise → comparaison directe
    let diff: number
    if ((inv.devise || 'MUR').toUpperCase() === targetDevise.toUpperCase()) {
      diff = Math.abs(targetAmount - Number(inv.montant_ttc)) / Number(inv.montant_ttc)
    } else {
      diff = Math.abs(targetMUR - invMUR) / invMUR
    }

    if (diff <= tolerance + 0.10) {
      results.push({
        invoices: [{ id: inv.id, numero_facture: inv.numero_facture, tiers: inv.tiers, montant_ttc: Number(inv.montant_ttc), montant_mur: invMUR, devise: inv.devise }],
        total_original: Number(inv.montant_ttc),
        total_mur: invMUR,
        diff_pct: diff,
        is_exact: diff < 0.005,
      })
    }
  }

  // Passe 2 : combinaisons de 2-5 factures (greedy, pas brute force)
  const sortedByAmount = subset
    .map(inv => ({
      inv,
      mur: Number(inv.montant_mur) || toMUR(Number(inv.montant_ttc) || 0, inv.devise || 'MUR'),
    }))
    .filter(x => x.mur > 0 && x.mur <= targetMUR * 1.02)
    .sort((a, b) => b.mur - a.mur)

  // Greedy : accumule les plus grosses factures d'abord
  let runningSum = 0
  const combo: typeof sortedByAmount = []
  for (const item of sortedByAmount) {
    if (combo.length >= 5) break
    if (runningSum + item.mur > targetMUR * (1 + tolerance)) continue
    combo.push(item)
    runningSum += item.mur
    const diff = Math.abs(targetMUR - runningSum) / targetMUR
    if (diff <= tolerance && combo.length >= 2) {
      results.push({
        invoices: combo.map(c => ({
          id: c.inv.id,
          numero_facture: c.inv.numero_facture,
          tiers: c.inv.tiers,
          montant_ttc: Number(c.inv.montant_ttc),
          montant_mur: c.mur,
          devise: c.inv.devise,
        })),
        total_original: combo.reduce((s, c) => s + Number(c.inv.montant_ttc), 0),
        total_mur: runningSum,
        diff_pct: diff,
        is_exact: diff < 0.005,
      })
      break
    }
  }

  return results.sort((a, b) => a.diff_pct - b.diff_pct).slice(0, 10)
}

export async function findMirrorTransaction(
  societeId: string,
  sourceTxId: string,
  amount: number,
  devise: string,
  date: string,
  isDebit: boolean,
  windowDays = 2
) {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const dateObj = new Date(date)
  const dateMin = new Date(dateObj.getTime() - windowDays * 86400000).toISOString().slice(0, 10)
  const dateMax = new Date(dateObj.getTime() + windowDays * 86400000).toISOString().slice(0, 10)

  let query = supabase
    .from('transactions_bancaires')
    .select('*')
    .eq('societe_id', societeId)
    .neq('id', sourceTxId)
    .gte('date_transaction', dateMin)
    .lte('date_transaction', dateMax)

  if (isDebit) {
    query = query.gt('credit', 0).gte('credit', amount * 0.98).lte('credit', amount * 1.02)
  } else {
    query = query.gt('debit', 0).gte('debit', amount * 0.98).lte('debit', amount * 1.02)
  }

  const { data } = await query.limit(5)
  return data || []
}

export function fuzzyMatchName(input: string, candidates: string[]): { match: string | null; score: number } {
  if (!input || candidates.length === 0) return { match: null, score: 0 }

  const normalize = (s: string) => s.toLowerCase()
    .replace(/\b(ltd|limited|sarl|sas|sa|co|inc|cie|company)\b/gi, '')
    .replace(/[.,;:()/\\'\-"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const inputNorm = normalize(input)
  const inputWords = inputNorm.split(/\s+/).filter(w => w.length >= 3)

  let bestMatch: string | null = null
  let bestScore = 0

  for (const candidate of candidates) {
    const candNorm = normalize(candidate)
    const candWords = candNorm.split(/\s+/).filter(w => w.length >= 3)

    if (inputNorm === candNorm) return { match: candidate, score: 1.0 }
    if (inputNorm.includes(candNorm) || candNorm.includes(inputNorm)) {
      if (0.9 > bestScore) { bestScore = 0.9; bestMatch = candidate }
      continue
    }

    if (inputWords.length === 0 || candWords.length === 0) continue
    const intersection = inputWords.filter(w => candWords.some(cw => cw.includes(w) || w.includes(cw)))
    const score = intersection.length / Math.max(inputWords.length, candWords.length)

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  return { match: bestMatch, score: bestScore }
}
