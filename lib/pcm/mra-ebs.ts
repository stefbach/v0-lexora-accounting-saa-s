/**
 * Génération de la déclaration TVA MRA (format EBS — Electronic Business
 * Submission) à partir du grand livre.
 *
 * Agrège sur une période :
 *   • Output Tax (TVA collectée)  → comptes tagués mra_ebs_output (4457)
 *   • Input Tax  (TVA déductible) → comptes tagués mra_ebs_input  (4456)
 *   • Net VAT payable / refundable = Output - Input
 *
 * Le mapping repose sur les tags des comptes (comptes_societes.tags) posés
 * dans les templates PCM. Robuste aux numéros custom par société.
 */

interface SupabaseLike { from: (t: string) => any }

export interface MRAVatLine {
  numero: string
  intitule: string
  base: number
  montant_tva: number
}

export interface MRAVatReturn {
  societe_id: string
  periode_debut: string
  periode_fin: string
  output_tax: number       // TVA collectée
  input_tax: number        // TVA déductible
  net_vat: number          // > 0 = à payer ; < 0 = crédit / remboursement
  sens: 'a_payer' | 'credit'
  output_comptes: MRAVatLine[]
  input_comptes: MRAVatLine[]
  generated_at: string
}

export async function generateMRAVatReturn(
  supabase: SupabaseLike,
  societeId: string,
  periodeDebut: string,
  periodeFin: string,
): Promise<MRAVatReturn> {
  // 1. Comptes TVA tagués (output / input)
  const { data: comptes } = await supabase
    .from('comptes_societes')
    .select('numero, intitule, tags')
    .eq('societe_id', societeId)
  const outputNumeros = new Map<string, string>()
  const inputNumeros = new Map<string, string>()
  for (const c of comptes || []) {
    const tags: string[] = c.tags || []
    if (tags.includes('mra_ebs_output')) outputNumeros.set(c.numero, c.intitule)
    if (tags.includes('mra_ebs_input')) inputNumeros.set(c.numero, c.intitule)
  }
  // Fallback : si pas de tags, on utilise les numéros standard PCM Maurice
  if (outputNumeros.size === 0) outputNumeros.set('4457', 'TVA collectée')
  if (inputNumeros.size === 0) inputNumeros.set('4456', 'TVA déductible')

  const allNumeros = new Set<string>([...outputNumeros.keys(), ...inputNumeros.keys()])

  // 2. Agréger les écritures de la période sur ces comptes
  const agg = new Map<string, { debit: number; credit: number }>()
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur')
      .eq('societe_id', societeId)
      .gte('date_ecriture', periodeDebut)
      .lte('date_ecriture', periodeFin)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const e of data) {
      if (!allNumeros.has(e.numero_compte)) continue
      if (!agg.has(e.numero_compte)) agg.set(e.numero_compte, { debit: 0, credit: 0 })
      const a = agg.get(e.numero_compte)!
      a.debit += +e.debit_mur || 0
      a.credit += +e.credit_mur || 0
    }
    if (data.length < 1000) break
    from += 1000
  }

  // 3. Construire les lignes
  // TVA collectée = solde créditeur (credit - debit) ; déductible = solde débiteur
  const outputLines: MRAVatLine[] = []
  let outputTax = 0
  for (const [num, nom] of outputNumeros) {
    const a = agg.get(num) || { debit: 0, credit: 0 }
    const montant = Math.round((a.credit - a.debit) * 100) / 100
    outputLines.push({ numero: num, intitule: nom, base: 0, montant_tva: montant })
    outputTax += montant
  }
  const inputLines: MRAVatLine[] = []
  let inputTax = 0
  for (const [num, nom] of inputNumeros) {
    const a = agg.get(num) || { debit: 0, credit: 0 }
    const montant = Math.round((a.debit - a.credit) * 100) / 100
    inputLines.push({ numero: num, intitule: nom, base: 0, montant_tva: montant })
    inputTax += montant
  }

  const netVat = Math.round((outputTax - inputTax) * 100) / 100

  return {
    societe_id: societeId,
    periode_debut: periodeDebut,
    periode_fin: periodeFin,
    output_tax: Math.round(outputTax * 100) / 100,
    input_tax: Math.round(inputTax * 100) / 100,
    net_vat: netVat,
    sens: netVat >= 0 ? 'a_payer' : 'credit',
    output_comptes: outputLines,
    input_comptes: inputLines,
    generated_at: new Date().toISOString(),
  }
}
