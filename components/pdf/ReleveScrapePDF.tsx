import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import Decimal from 'decimal.js'

/**
 * ReleveScrapePDF — relevé bancaire *reconstitué par Lexora* à partir des
 * transactions récupérées automatiquement par le robot de scraping (MCB
 * Internet Banking).
 *
 * ⚠️ Ce n'est PAS le PDF officiel de la banque : le portail MCB sert ses
 * relevés sous forme de formulaires dynamiques XFA (Adobe LiveCycle) que le
 * navigateur headless ne sait pas rendre (pages blanches, illisibles par OCR).
 * On génère donc un relevé propre, lisible et auditable à partir du contenu
 * réellement scrapé (solde + transactions datées, débits/crédits réconciliés).
 *
 * Le solde progressif est calculé en arithmétique décimale exacte (decimal.js)
 * — jamais en flottant natif (règle « Précision Arbitraire » du repo).
 */

export interface RelevePdfTransaction {
  date: string
  libelle: string
  debit: number | string | null
  credit: number | string | null
  reference?: string | null
}

export interface ReleveScrapePDFProps {
  societe?: { nom?: string | null; brn?: string | null } | null
  compte?: { numero_compte?: string | null; devise?: string | null; banque?: string | null } | null
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  transactions: RelevePdfTransaction[]
  /** ISO string — injecté par l'appelant pour un rendu déterministe (tests). */
  generated_at?: string
}

const S = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 30, fontFamily: 'Helvetica', fontSize: 8, color: '#111' },
  brand: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 2 },
  headRule: { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 6, marginBottom: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metaCol: { flexDirection: 'column' },
  metaLbl: { fontSize: 7, color: '#888' },
  metaVal: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111' },
  notice: { marginTop: 8, marginBottom: 8, padding: 5, backgroundColor: '#fff8e1', borderWidth: 0.5, borderColor: '#e0c060', fontSize: 6.5, color: '#665500' },
  summary: { flexDirection: 'row', marginBottom: 10, borderWidth: 0.5, borderColor: '#ccc' },
  sumCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 0.5, borderRightColor: '#ddd' },
  sumCellLast: { flex: 1, paddingVertical: 6, paddingHorizontal: 6 },
  sumLbl: { fontSize: 6.5, color: '#888', marginBottom: 3 },
  sumVal: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  table: { borderWidth: 0.5, borderColor: '#999' },
  thead: { flexDirection: 'row', backgroundColor: '#0B0F2E', minHeight: 15 },
  th: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', paddingVertical: 3, paddingHorizontal: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#eee', minHeight: 13 },
  rowAlt: { flexDirection: 'row', backgroundColor: '#f7f7f9', borderBottomWidth: 0.3, borderBottomColor: '#eee', minHeight: 13 },
  cell: { fontSize: 6.8, paddingVertical: 2.5, paddingHorizontal: 3 },
  cellR: { fontSize: 6.8, paddingVertical: 2.5, paddingHorizontal: 3, textAlign: 'right' },
  totalRow: { flexDirection: 'row', backgroundColor: '#eef0f6', minHeight: 16, borderTopWidth: 0.5, borderTopColor: '#0B0F2E' },
  totalTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', paddingVertical: 4, paddingHorizontal: 3, color: '#0B0F2E' },
  totalTxtR: { fontSize: 7, fontFamily: 'Helvetica-Bold', paddingVertical: 4, paddingHorizontal: 3, textAlign: 'right', color: '#0B0F2E' },
  footer: { position: 'absolute', bottom: 16, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: '#bbb', paddingTop: 3, flexDirection: 'row', justifyContent: 'space-between', fontSize: 5.5, color: '#888' },
  // Column widths (A4 = 595 - 60 padding = 535)
  cDate: { width: 46 },
  cLib: { width: 261 },
  cRef: { width: 70 },
  cDeb: { width: 52, textAlign: 'right' },
  cCred: { width: 52, textAlign: 'right' },
  cSolde: { width: 54, textAlign: 'right' },
})

function toDec(v: number | string | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  try {
    const d = new Decimal(v)
    return d.isFinite() ? d : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}

function fmt(v: Decimal | number, devise?: string | null): string {
  const d = v instanceof Decimal ? v : new Decimal(v || 0)
  const abs = d.abs()
  const s = abs.toNumber().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const signed = d.isNegative() ? `(${s})` : s
  return devise ? `${signed}` : signed
}

function fmtDate(d: string): string {
  if (!d) return ''
  const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

/** Tri chronologique croissant (ancien → récent) pour un solde progressif lisible. */
function sortAsc(txs: RelevePdfTransaction[]): RelevePdfTransaction[] {
  return [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function ReleveScrapePDF(props: ReleveScrapePDFProps) {
  const { societe, compte, periode, date_debut, date_fin } = props
  const devise = compte?.devise || 'MUR'
  const txs = sortAsc(props.transactions || [])

  // Solde progressif exact (decimal.js), à partir du solde d'ouverture.
  const opening = toDec(props.solde_ouverture)
  let running = opening
  const rows = txs.map((t) => {
    const debit = toDec(t.debit)
    const credit = toDec(t.credit)
    running = running.plus(credit).minus(debit)
    return { t, debit, credit, solde: running }
  })

  const generated = props.generated_at ? new Date(props.generated_at) : new Date()
  const generatedLabel = generated.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const banque = compte?.banque || 'MCB'

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* En-tête */}
        <View style={S.headRule} fixed>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={S.brand}>LEXORA</Text>
            <Text style={{ fontSize: 8, color: '#666' }}>{banque}</Text>
          </View>
          <Text style={S.title}>RELEVÉ DE COMPTE</Text>
          <View style={S.metaRow}>
            <View style={S.metaCol}>
              <Text style={S.metaLbl}>SOCIÉTÉ</Text>
              <Text style={S.metaVal}>{societe?.nom || '—'}</Text>
            </View>
            <View style={[S.metaCol, { alignItems: 'center' }]}>
              <Text style={S.metaLbl}>COMPTE</Text>
              <Text style={S.metaVal}>{compte?.numero_compte || '—'} · {devise}</Text>
            </View>
            <View style={[S.metaCol, { alignItems: 'flex-end' }]}>
              <Text style={S.metaLbl}>PÉRIODE</Text>
              <Text style={S.metaVal}>{fmtDate(date_debut)} → {fmtDate(date_fin)}</Text>
            </View>
          </View>
        </View>

        {/* Avertissement : document reconstitué, non officiel */}
        <Text style={S.notice}>
          Relevé reconstitué automatiquement par Lexora à partir des transactions récupérées sur MCB Internet Banking
          ({periode}). Document interne à usage de rapprochement — il ne remplace pas le relevé officiel émis par la banque.
        </Text>

        {/* Synthèse */}
        <View style={S.summary}>
          <View style={S.sumCell}>
            <Text style={S.sumLbl}>SOLDE D'OUVERTURE</Text>
            <Text style={S.sumVal}>{fmt(opening)} {devise}</Text>
          </View>
          <View style={S.sumCell}>
            <Text style={S.sumLbl}>TOTAL CRÉDITS</Text>
            <Text style={[S.sumVal, { color: '#1a7a3a' }]}>{fmt(toDec(props.total_credits))} {devise}</Text>
          </View>
          <View style={S.sumCell}>
            <Text style={S.sumLbl}>TOTAL DÉBITS</Text>
            <Text style={[S.sumVal, { color: '#b02a2a' }]}>{fmt(toDec(props.total_debits))} {devise}</Text>
          </View>
          <View style={S.sumCellLast}>
            <Text style={S.sumLbl}>SOLDE DE CLÔTURE</Text>
            <Text style={S.sumVal}>{fmt(toDec(props.solde_cloture))} {devise}</Text>
          </View>
        </View>

        {/* Tableau des transactions */}
        <View style={S.table}>
          <View style={S.thead} fixed>
            <Text style={[S.th, S.cDate]}>Date</Text>
            <Text style={[S.th, S.cLib]}>Libellé</Text>
            <Text style={[S.th, S.cRef]}>Référence</Text>
            <Text style={[S.th, S.cDeb]}>Débit</Text>
            <Text style={[S.th, S.cCred]}>Crédit</Text>
            <Text style={[S.th, S.cSolde]}>Solde</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
              <Text style={[S.cell, S.cDate]}>{fmtDate(r.t.date)}</Text>
              <Text style={[S.cell, S.cLib]}>{(r.t.libelle || '').replace(/\s+/g, ' ').trim().slice(0, 150)}</Text>
              <Text style={[S.cell, S.cRef]}>{(r.t.reference || '').slice(0, 22)}</Text>
              <Text style={[S.cellR, S.cDeb]}>{r.debit.gt(0) ? fmt(r.debit) : ''}</Text>
              <Text style={[S.cellR, S.cCred]}>{r.credit.gt(0) ? fmt(r.credit) : ''}</Text>
              <Text style={[S.cellR, S.cSolde, { color: r.solde.isNegative() ? '#b02a2a' : '#111' }]}>{fmt(r.solde)}</Text>
            </View>
          ))}
          <View style={S.totalRow}>
            <Text style={[S.totalTxt, S.cDate]}> </Text>
            <Text style={[S.totalTxt, { width: 261 + 70 }]}>TOTAUX · {rows.length} transaction(s)</Text>
            <Text style={[S.totalTxtR, S.cDeb]}>{fmt(toDec(props.total_debits))}</Text>
            <Text style={[S.totalTxtR, S.cCred]}>{fmt(toDec(props.total_credits))}</Text>
            <Text style={[S.totalTxtR, S.cSolde]}>{fmt(toDec(props.solde_cloture))}</Text>
          </View>
        </View>

        {/* Pied de page */}
        <View style={S.footer} fixed>
          <Text>
            {societe?.nom || '—'}{societe?.brn ? ` · BRN ${societe.brn}` : ''} · Relevé Lexora ({banque} {compte?.numero_compte || ''}) · Généré le {generatedLabel}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
