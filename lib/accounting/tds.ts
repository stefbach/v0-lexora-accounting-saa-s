/**
 * TDS Maurice (Tax Deducted at Source) — Section 111A Income Tax Act 1995.
 * Auto-classification + calcul retenue lors de la création d'une facture fournisseur.
 */

export type TdsCategory =
  | 'rent' | 'royalties' | 'management_fees' | 'contract_payments'
  | 'professional_fees' | 'director_fees' | 'interest_non_resident'
  | 'payment_to_artist' | 'commission' | 'none'

export const TDS_RATES: Record<TdsCategory, { rate: number; threshold: number; label: string }> = {
  rent:                  { rate:  5.0,  threshold: 500,  label: 'Loyers' },
  royalties:             { rate: 15.0,  threshold: 0,    label: 'Redevances IP' },
  management_fees:       { rate:  5.0,  threshold: 500,  label: 'Honoraires management' },
  contract_payments:     { rate:  0.75, threshold: 500,  label: 'Paiements travaux/contrats' },
  professional_fees:     { rate:  3.0,  threshold: 500,  label: 'Honoraires professionnels' },
  director_fees:         { rate: 15.0,  threshold: 0,    label: 'Jetons admin' },
  interest_non_resident: { rate: 15.0,  threshold: 0,    label: 'Intérêts non-résident' },
  payment_to_artist:     { rate: 10.0,  threshold: 0,    label: 'Artistes/sportifs' },
  commission:            { rate:  3.0,  threshold: 500,  label: 'Commissions' },
  none:                  { rate:  0,    threshold: 0,    label: 'Aucune' },
}

/** Auto-classification depuis description + compte comptable. */
export function autoClassifyTds(opts: {
  description?: string | null
  numero_compte?: string | null
  tiers_country?: string | null  // pour interest non-résident
}): TdsCategory {
  const d = (opts.description || '').toLowerCase()
  const compte = opts.numero_compte || ''

  // Loyer (compte 6132 loyers immobiliers). Le regex couvre les libellés
  // français et anglais courants : « loyer », « location », « bail »,
  // « locaux », « rental », « leasing » immobilier, et accepte aussi un
  // tiers fournisseur explicite ("XXX Properties", "XXX Real Estate",
  // "XXX immobilier") fréquent en facturation Maurice.
  if (compte.startsWith('6132')
      || d.match(/loyer|rent\b|rental|\blease\b|leasing|location|bail|locaux|immobili[eè]r|real\s*estate|properties\b/)) return 'rent'
  // Redevances IP (compte 651)
  if (compte.startsWith('651') || d.match(/royalt|redevance|licen[cs]e/)) return 'royalties'
  // Honoraires professionnels (comptes 6226 avocats, 6227 comptables, 622 conseil)
  if (compte.match(/^622[67]/) || d.match(/avocat|lawyer|comptable|accountant|notaire|m[ée]decin|consultant juridique|honoraires?|fiscaliste|expert.comptable/)) return 'professional_fees'
  // Management fees (compte 6228)
  if (compte.startsWith('6228') || d.match(/management fee|honoraires? de gestion|frais de gestion/)) return 'management_fees'
  // Director fees (compte 6411 directors fees)
  if (d.match(/jeton.*pr[ée]sence|director.*fee|board.*fee|administrateur/)) return 'director_fees'
  // Travaux BTP (compte 6135 entretien & réparations)
  if (compte.startsWith('6135') || d.match(/travaux|btp|construction|maintenance|r[ée]paration|chantier|plombier|[ée]lectricien/)) return 'contract_payments'
  // Commissions (compte 622)
  if (d.match(/commission|apporteur/)) return 'commission'
  // Intérêts non-résidents
  if (compte.startsWith('661') && opts.tiers_country && opts.tiers_country.toUpperCase() !== 'MU') return 'interest_non_resident'

  return 'none'
}

/** Calcule la retenue TDS pour un montant payé. */
export function computeTds(amountMur: number, category: TdsCategory): { amount: number; rate: number; applies: boolean } {
  const def = TDS_RATES[category]
  if (!def || category === 'none') return { amount: 0, rate: 0, applies: false }
  if (amountMur < def.threshold) return { amount: 0, rate: def.rate, applies: false }
  const amount = Math.round(amountMur * (def.rate / 100) * 100) / 100
  return { amount, rate: def.rate, applies: true }
}

/** Génère le CSV TDS mensuel format MRA. */
export function generateTdsCsv(opts: {
  societe_name: string
  societe_tan: string
  periode: string  // YYYY-MM
  records: Array<{ tiers: string; tiers_brn?: string; tiers_tan?: string; category: TdsCategory; gross_mur: number; tds_mur: number; payment_date: string }>
}): string {
  const lines = [
    `# TDS Statement — ${opts.societe_name} — TAN: ${opts.societe_tan} — Période: ${opts.periode}`,
    'Tiers,BRN,TAN_Tiers,Categorie,Code_Categorie,Brut_MUR,Taux_pct,TDS_MUR,Date_Paiement',
    ...opts.records.map(r => {
      const cat = TDS_RATES[r.category]
      const taux = cat?.rate || 0
      return [
        `"${r.tiers}"`, r.tiers_brn || '', r.tiers_tan || '',
        `"${cat?.label || r.category}"`, r.category,
        r.gross_mur.toFixed(2), taux.toFixed(2),
        r.tds_mur.toFixed(2), r.payment_date,
      ].join(',')
    }),
    `,,,,TOTAL,${opts.records.reduce((s, r) => s + r.gross_mur, 0).toFixed(2)},,${opts.records.reduce((s, r) => s + r.tds_mur, 0).toFixed(2)},`,
  ]
  return lines.join('\n')
}
