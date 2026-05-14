import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import {
  aoaSheet, buildWorkbook, cell, formula, xlsxResponse,
  FMT_MUR, FMT_DATE,
} from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'

/**
 * Export Balance comptable au format Excel — 3 feuilles :
 *   • "Balance" : par compte avec mouvements + solde, totaux formulés
 *   • "Par classe" : agrégat classe 1-7 avec contrôle équilibre
 *   • "Filtres" : méta
 *
 * Cette balance respecte le format de présentation IFRS Maurice (4-digits)
 * et fait apparaître le contrôle d'équilibre Σ débit = Σ crédit en formule
 * (auditeur peut tracer le calcul).
 */
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const date_debut = searchParams.get('date_debut')
  const date_fin   = searchParams.get('date_fin')
  const exercice   = searchParams.get('exercice')

  if (!societe_id) return new Response('societe_id requis', { status: 400 })

  let dDebut = date_debut
  let dFin   = date_fin
  if (exercice && !dDebut && !dFin) {
    const { data: ex } = await supabase
      .from('exercices_fiscaux')
      .select('date_debut, date_fin')
      .eq('societe_id', societe_id)
      .eq('annee', exercice)
      .single()
    if (ex) { dDebut = ex.date_debut; dFin = ex.date_fin }
  }

  const ecritures = await fetchAllPaginated<any>(() => {
    let q = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, nom_compte, debit_mur, credit_mur')
      .eq('societe_id', societe_id)
      .order('numero_compte')
    if (dDebut) q = q.gte('date_ecriture', dDebut)
    if (dFin)   q = q.lte('date_ecriture', dFin)
    return q
  })

  const { data: societe } = await supabase
    .from('societes').select('nom').eq('id', societe_id).single()

  const compteNums = [...new Set(ecritures.map(e => e.numero_compte))]
  const { data: planComptable } = await supabase
    .from('plan_comptable')
    .select('compte, libelle, type_compte, sens_normal')
    .in('compte', compteNums)
  const planMap = new Map<string, any>()
  for (const pc of planComptable || []) planMap.set(pc.compte, pc)

  const byCompte = new Map<string, { nom: string; debit: number; credit: number }>()
  for (const e of ecritures) {
    const k = e.numero_compte || '???'
    const cur = byCompte.get(k) || { nom: e.nom_compte || planMap.get(k)?.libelle || '', debit: 0, credit: 0 }
    cur.debit  += Number(e.debit_mur)  || 0
    cur.credit += Number(e.credit_mur) || 0
    byCompte.set(k, cur)
  }

  const sheets: Array<{ name: string; ws: any }> = []

  // ── Filtres ──
  sheets.push({
    name: 'Filtres',
    ws: aoaSheet([
      [cell('Balance comptable')],
      [cell('Société'),  cell(societe?.nom || '—')],
      [cell('Période'),  cell(`${dDebut || 'depuis origine'} → ${dFin || 'à ce jour'}`)],
      [cell('Exercice'), cell(exercice || '—')],
      [cell('Exporté le'), cell(new Date(), FMT_DATE)],
      [],
      [cell('Plan comptable'), cell('PCM Maurice (4 chiffres)')],
      [cell('Devise'),         cell('MUR (Roupies Mauriciennes)')],
    ], { colWidths: [22, 40] }),
  })

  // ── Balance par compte ──
  const rows: any[][] = [
    [cell('Compte'), cell('Libellé'), cell('Type'), cell('Total débit'), cell('Total crédit'), cell('Solde débit'), cell('Solde crédit')],
  ]
  const firstData = 2
  const comptes = [...byCompte.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [num, agg] of comptes) {
    const solde = agg.debit - agg.credit
    rows.push([
      cell(num),
      cell(agg.nom),
      cell(planMap.get(num)?.type_compte || ''),
      cell(agg.debit, FMT_MUR),
      cell(agg.credit, FMT_MUR),
      cell(solde > 0 ? solde : 0, FMT_MUR),
      cell(solde < 0 ? -solde : 0, FMT_MUR),
    ])
  }
  const lastData = rows.length
  rows.push([
    cell('TOTAL'), cell(''), cell(''),
    formula(`SUM(D${firstData}:D${lastData})`, FMT_MUR),
    formula(`SUM(E${firstData}:E${lastData})`, FMT_MUR),
    formula(`SUM(F${firstData}:F${lastData})`, FMT_MUR),
    formula(`SUM(G${firstData}:G${lastData})`, FMT_MUR),
  ])
  // Contrôle équilibre — formule explicite
  rows.push([])
  rows.push([
    cell('Contrôle équilibre Σdébit − Σcrédit'), cell(''), cell(''),
    formula(`SUM(D${firstData}:D${lastData}) - SUM(E${firstData}:E${lastData})`, FMT_MUR),
  ])

  sheets.push({
    name: 'Balance',
    ws: aoaSheet(rows, { colWidths: [12, 40, 12, 16, 16, 16, 16], freezeTopRows: 1 }),
  })

  // ── Par classe ──
  const classeLabels: Record<string, string> = {
    '1': 'Capitaux propres', '2': 'Immobilisations', '3': 'Stocks',
    '4': 'Tiers',            '5': 'Trésorerie',
    '6': 'Charges',          '7': 'Produits',
  }
  const byClasse = new Map<string, { debit: number; credit: number }>()
  for (const [num, agg] of byCompte.entries()) {
    const c = num[0]
    const cur = byClasse.get(c) || { debit: 0, credit: 0 }
    cur.debit  += agg.debit
    cur.credit += agg.credit
    byClasse.set(c, cur)
  }
  const classeRows: any[][] = [
    [cell('Classe'), cell('Libellé'), cell('Total débit'), cell('Total crédit'), cell('Solde')],
  ]
  for (const c of ['1', '2', '3', '4', '5', '6', '7']) {
    const agg = byClasse.get(c) || { debit: 0, credit: 0 }
    classeRows.push([
      cell(c),
      cell(classeLabels[c] || c),
      cell(agg.debit, FMT_MUR),
      cell(agg.credit, FMT_MUR),
      cell(agg.debit - agg.credit, FMT_MUR),
    ])
  }
  sheets.push({
    name: 'Par classe',
    ws: aoaSheet(classeRows, { colWidths: [8, 24, 16, 16, 16], freezeTopRows: 1 }),
  })

  const buf = buildWorkbook(sheets, {
    title: `Balance ${societe?.nom || ''}`,
    subject: 'Balance comptable',
  })
  const fname = `balance_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${dDebut || ''}_${dFin || ''}.xlsx`
  return xlsxResponse(buf, fname)
}
