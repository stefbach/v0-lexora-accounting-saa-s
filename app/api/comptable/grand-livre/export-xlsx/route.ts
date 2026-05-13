import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import {
  aoaSheet, buildWorkbook, cell, formula, xlsxResponse,
  FMT_MUR, FMT_DATE,
} from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Export Grand-Livre au format Excel (xlsx) — multi-feuilles :
 *   • "Synthèse" : tableau récap par compte (totaux débit/crédit/solde)
 *   • Une feuille par classe comptable (1-7) avec détail chronologique
 *   • "Filtres" : rappel des paramètres utilisés
 *
 * Les totaux sont posés en formules SUMIF afin que l'auditeur puisse modifier
 * une ligne et voir l'impact immédiat.
 */
export async function GET(request: Request) {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const date_debut = searchParams.get('date_debut')
  const date_fin   = searchParams.get('date_fin')
  const exercice   = searchParams.get('exercice')

  if (!societe_id) return new Response('societe_id requis', { status: 400 })

  let dDebut = date_debut
  let dFin   = date_fin
  if (exercice && !dDebut && !dFin) {
    const m = exercice.match(/^(\d{4})-(\d{4})$/)
    if (m) { dDebut = `${m[1]}-07-01`; dFin = `${m[2]}-06-30` }
  }

  const ecritures = await fetchAllPaginated<any>(() => {
    let q = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, ref_folio, lettre')
      .eq('societe_id', societe_id)
      .order('numero_compte')
      .order('date_ecriture')
    if (dDebut) q = q.gte('date_ecriture', dDebut)
    if (dFin)   q = q.lte('date_ecriture', dFin)
    return q
  })

  const { data: societe } = await supabase
    .from('societes').select('nom').eq('id', societe_id).single()

  const sheets: Array<{ name: string; ws: any }> = []

  // ── Feuille Filtres / méta ────────────────────────────────────────────
  sheets.push({
    name: 'Filtres',
    ws: aoaSheet([
      [cell('Grand-Livre comptable')],
      [cell('Société'), cell(societe?.nom || '—')],
      [cell('Période'), cell(`${dDebut || 'depuis origine'} → ${dFin || 'à ce jour'}`)],
      [cell('Exercice'), cell(exercice || '—')],
      [cell('Exporté le'), cell(new Date(), FMT_DATE)],
      [cell('Nombre d\'écritures'), cell(ecritures.length)],
      [],
      [cell('Devise')],
      [cell('Tous les montants sont exprimés en Roupies Mauriciennes (MUR).')],
    ], { colWidths: [22, 40] }),
  })

  // ── Synthèse par compte ──────────────────────────────────────────────
  // Agrégation côté serveur (formules Excel sur 100K+ lignes = lourd)
  const byCompte = new Map<string, { nom: string; debit: number; credit: number; nb: number }>()
  for (const e of ecritures) {
    const k = e.numero_compte || '???'
    const cur = byCompte.get(k) || { nom: e.nom_compte || '', debit: 0, credit: 0, nb: 0 }
    cur.debit  += Number(e.debit_mur)  || 0
    cur.credit += Number(e.credit_mur) || 0
    cur.nb     += 1
    if (!cur.nom && e.nom_compte) cur.nom = e.nom_compte
    byCompte.set(k, cur)
  }
  const comptesTries = [...byCompte.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const synthRows: any[][] = [
    [cell('Compte'), cell('Libellé'), cell('Nb écritures'), cell('Total débit'), cell('Total crédit'), cell('Solde')],
  ]
  const firstData = 2
  comptesTries.forEach(([num, agg]) => {
    synthRows.push([
      cell(num),
      cell(agg.nom),
      cell(agg.nb),
      cell(agg.debit, FMT_MUR),
      cell(agg.credit, FMT_MUR),
      cell(agg.debit - agg.credit, FMT_MUR),
    ])
  })
  const lastData = synthRows.length
  // Ligne TOTAUX en formules (pour que l'auditeur voit le calcul)
  synthRows.push([
    cell('TOTAL'),
    cell(''),
    formula(`SUM(C${firstData}:C${lastData})`),
    formula(`SUM(D${firstData}:D${lastData})`, FMT_MUR),
    formula(`SUM(E${firstData}:E${lastData})`, FMT_MUR),
    formula(`SUM(F${firstData}:F${lastData})`, FMT_MUR),
  ])

  sheets.push({
    name: 'Synthèse',
    ws: aoaSheet(synthRows, { colWidths: [12, 40, 14, 16, 16, 16], freezeTopRows: 1 }),
  })

  // ── Une feuille par classe (1-7) ─────────────────────────────────────
  const classeLabels: Record<string, string> = {
    '1': '1 - Capitaux', '2': '2 - Immo', '3': '3 - Stocks',
    '4': '4 - Tiers',    '5': '5 - Trésorerie',
    '6': '6 - Charges',  '7': '7 - Produits',
  }
  for (const classe of ['1', '2', '3', '4', '5', '6', '7']) {
    const lignes = ecritures.filter(e => e.numero_compte?.startsWith(classe))
    if (lignes.length === 0) continue
    const rows: any[][] = [
      [cell('Date'), cell('Compte'), cell('Libellé compte'), cell('Journal'), cell('Folio'), cell('Description'), cell('Débit'), cell('Crédit'), cell('Lettre')],
    ]
    let sumD = 0, sumC = 0
    for (const e of lignes) {
      const d = Number(e.debit_mur) || 0
      const c = Number(e.credit_mur) || 0
      sumD += d; sumC += c
      rows.push([
        cell(e.date_ecriture ? new Date(e.date_ecriture) : '', FMT_DATE),
        cell(e.numero_compte),
        cell(e.nom_compte),
        cell(e.journal || ''),
        cell(e.ref_folio || ''),
        cell(e.description || ''),
        cell(d, FMT_MUR),
        cell(c, FMT_MUR),
        cell(e.lettre || ''),
      ])
    }
    rows.push([cell('TOTAL'), cell(''), cell(''), cell(''), cell(''), cell(''), cell(sumD, FMT_MUR), cell(sumC, FMT_MUR), cell('')])
    sheets.push({
      name: classeLabels[classe],
      ws: aoaSheet(rows, { colWidths: [12, 12, 32, 8, 14, 40, 14, 14, 10], freezeTopRows: 1 }),
    })
  }

  const buf = buildWorkbook(sheets, {
    title: `Grand-Livre ${societe?.nom || ''}`,
    subject: 'Grand-Livre comptable',
  })
  const fname = `grand-livre_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${dDebut || ''}_${dFin || ''}.xlsx`
  return xlsxResponse(buf, fname)
}
