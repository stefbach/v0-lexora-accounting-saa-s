import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const COL = StyleSheet.create({
  // A4 width 595pt - left/right padding 60pt = 535pt available
  // Total widths below MUST sum to 535
  date:    { width: 48,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  jnl:     { width: 24,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  piece:   { width: 78,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  libelle: { width: 175, padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  lettre:  { width: 28,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  debit:   { width: 56,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center', alignItems: 'flex-end' },
  credit:  { width: 56,  padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center', alignItems: 'flex-end' },
  solde:   { width: 70,  padding: 2, justifyContent: 'center', alignItems: 'flex-end' },
  // 48+24+78+175+28+56+56+70 = 535 ✓
})

const S = StyleSheet.create({
  page:         { paddingTop: 30, paddingBottom: 45, paddingLeft: 30, paddingRight: 30, fontFamily: 'Helvetica', fontSize: 7, color: '#000' },
  title:        { fontSize: 13, textAlign: 'center' },
  sub:          { fontSize: 8, textAlign: 'center', color: '#555' },
  gap4:         { height: 4 },
  gap6:         { height: 6 },
  gap8:         { height: 8 },
  gap12:        { height: 12 },
  gap16:        { height: 16 },
  hline:        { height: 0.5, backgroundColor: '#aaaaaa' },
  infoRow:      { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 },
  infoBox:      { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 6, backgroundColor: '#fafafa' },
  infoLbl:      { fontSize: 7, color: '#666', marginBottom: 2 },
  infoVal:      { fontSize: 9, color: '#111' },
  secHdr:       { backgroundColor: '#2c3e50', paddingTop: 3, paddingBottom: 3, paddingLeft: 5, marginTop: 10 },
  secTxt:       { color: '#ffffff', fontSize: 7.5 },
  table:        { borderWidth: 0.5, borderColor: '#999', marginBottom: 4 },
  hdrRow:       { flexDirection: 'row', backgroundColor: '#34495e', minHeight: 15 },
  row:          { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#ddd', minHeight: 13 },
  rowAlt:       { flexDirection: 'row', backgroundColor: '#f7f7f7', borderBottomWidth: 0.3, borderBottomColor: '#ddd', minHeight: 13 },
  rowTotal:     { flexDirection: 'row', backgroundColor: '#2c3e50', minHeight: 15 },
  rowGrandTotal:{ flexDirection: 'row', backgroundColor: '#1a252f', minHeight: 17 },
  hdrTxt:       { color: '#ffffff', fontSize: 6 },
  txt:          { fontSize: 6.5 },
  txtR:         { fontSize: 6.5, textAlign: 'right' },
  totalTxt:     { fontSize: 6.5, color: '#ffffff' },
  grandTxt:     { fontSize: 7.5, color: '#ffffff' },
  footer:       { position: 'absolute', bottom: 15, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: '#aaa', paddingTop: 3, flexDirection: 'row', justifyContent: 'space-between', fontSize: 5.5, color: '#888' },
})

const fmt = (n: number) => {
  const abs = Math.abs(n || 0)
  const f = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${f})` : f
}

const fmtDate = (d: string) => {
  if (!d) return '—'
  const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

const COMPTE_NAMES_PDF: Record<string, string> = {
  '421': 'Net à payer employés', '421000': 'Net à payer employés',
  '4212': '13ème mois à payer',
  '431': 'CSG à payer', '431000': 'CSG à payer',
  '431100': 'NSF à payer',
  '432': 'Training Levy à payer', '432000': 'Training Levy à payer',
  '432100': 'PRGF à payer',
  '444': 'PAYE à payer', '444000': 'PAYE à payer',
  '4429': 'TDS retenu à verser MRA',
  '4431': 'TDS retenu à la source', '4434': 'TDS retenu à la source',
  '641000': 'Salaires bruts — STC', '641100': 'Salaires de base',
  '641200': 'Heures supplémentaires', '641300': 'Primes et indemnités',
  '641900': 'Retenues absences', '6416': 'Provision 13ème mois',
  '6411': 'Rémunérations',
  '6451': 'CSG patronale', '645100': 'CSG patronale',
  '6452': 'NSF patronal', '645200': 'NSF patronal',
  '6453': 'PRGF patronal', '645300': 'PRGF patronal',
  '6454': 'Training Levy patronal', '645400': 'Training Levy patronal',
}

function resolveName(compte: string, map: Record<string, string>, nom?: string): string {
  if (map[compte]) return map[compte]
  if (COMPTE_NAMES_PDF[compte]) return COMPTE_NAMES_PDF[compte]
  for (let l = compte.length; l >= 2; l--) {
    const p = compte.substring(0, l)
    if (map[p]) return map[p]
    if (COMPTE_NAMES_PDF[p]) return COMPTE_NAMES_PDF[p]
  }
  return nom?.trim() || ''
}

interface GLEntry {
  id: string
  numero_compte: string
  nom_compte?: string
  description?: string
  date_ecriture: string
  journal: string
  ref_folio?: string
  debit_mur: number
  credit_mur: number
  solde_progressif: number
  lettre?: string | null
}

interface GrandLivrePDFProps {
  societe: any
  dateDebut: string
  dateFin: string
  ecritures: GLEntry[]
  compteNames: Record<string, string>
}

export function GrandLivrePDF({ societe, dateDebut, dateFin, ecritures, compteNames }: GrandLivrePDFProps) {
  const groupsMap = new Map<string, GLEntry[]>()
  for (const e of ecritures) {
    const k = e.numero_compte || '???'
    if (!groupsMap.has(k)) groupsMap.set(k, [])
    groupsMap.get(k)!.push(e)
  }

  const groups = Array.from(groupsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compte, entries]) => ({
      compte,
      nom: resolveName(compte, compteNames, entries[0]?.nom_compte),
      entries,
      totalDebit:  entries.reduce((s, e) => s + (Number(e.debit_mur)  || 0), 0),
      totalCredit: entries.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0),
      soldeFinal:  entries.reduce((s, e) => s + (Number(e.debit_mur)  || 0), 0)
                 - entries.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0),
    }))

  const grandDebit  = groups.reduce((s, g) => s + g.totalDebit,  0)
  const grandCredit = groups.reduce((s, g) => s + g.totalCredit, 0)
  const grandSolde  = grandDebit - grandCredit
  const today       = new Date().toLocaleDateString('fr-FR')
  const periode     = dateDebut && dateFin
    ? `${fmtDate(dateDebut)} au ${fmtDate(dateFin)}`
    : dateDebut ? `À partir du ${fmtDate(dateDebut)}`
    : dateFin   ? `Jusqu'au ${fmtDate(dateFin)}`
    : 'Toutes périodes'

  const pages: (typeof groups)[] = []
  let cur: typeof groups = []
  let rows = 0
  for (const g of groups) {
    const n = g.entries.length + 2
    if (rows + n > 38 && cur.length > 0) { pages.push(cur); cur = []; rows = 0 }
    cur.push(g); rows += n
  }
  if (cur.length > 0) pages.push(cur)
  if (pages.length === 0) pages.push([])

  const TH = () => (
    <View style={S.hdrRow}>
      <View style={COL.date}><Text style={S.hdrTxt}>Date</Text></View>
      <View style={COL.jnl}><Text style={S.hdrTxt}>Jnl</Text></View>
      <View style={COL.piece}><Text style={S.hdrTxt}>N° Pièce</Text></View>
      <View style={COL.libelle}><Text style={S.hdrTxt}>Libellé</Text></View>
      <View style={COL.lettre}><Text style={S.hdrTxt}>Lettre</Text></View>
      <View style={COL.debit}><Text style={S.hdrTxt}>Débit</Text></View>
      <View style={COL.credit}><Text style={S.hdrTxt}>Crédit</Text></View>
      <View style={COL.solde}><Text style={S.hdrTxt}>Solde</Text></View>
    </View>
  )

  return (
    <Document>
      {pages.map((pg, pi) => (
        <Page key={pi} size="A4" style={S.page}>

          {pi === 0 && (
            <View>
              <Text style={S.title}>GRAND LIVRE</Text>
              <Text style={[S.sub, { marginBottom: 6 }]}>General Ledger — {societe?.nom || '—'}</Text>
              <View style={S.infoRow}>
                <View style={S.infoBox}>
                  <Text style={S.infoLbl}>Société</Text>
                  <Text style={S.infoVal}>{societe?.nom || '—'}</Text>
                  <Text style={[S.infoLbl, { marginTop: 3 }]}>BRN</Text>
                  <Text style={S.infoVal}>{societe?.brn || '—'}</Text>
                </View>
                <View style={S.infoBox}>
                  <Text style={S.infoLbl}>Période</Text>
                  <Text style={S.infoVal}>{periode}</Text>
                  <Text style={[S.infoLbl, { marginTop: 3 }]}>Généré le</Text>
                  <Text style={S.infoVal}>{today}</Text>
                </View>
                <View style={S.infoBox}>
                  <Text style={S.infoLbl}>Comptes</Text>
                  <Text style={S.infoVal}>{groups.length}</Text>
                  <Text style={[S.infoLbl, { marginTop: 3 }]}>Écritures</Text>
                  <Text style={S.infoVal}>{ecritures.length}</Text>
                </View>
              </View>
            </View>
          )}

          {pg.map((g) => (
            <View key={g.compte} wrap={false}>
              <View style={S.secHdr}>
                <Text style={S.secTxt}>{g.compte}{g.nom ? ` — ${g.nom}` : ''}</Text>
              </View>
              <View style={S.table}>
                <TH />
                {g.entries.map((e, i) => (
                  <View key={e.id} style={i % 2 === 0 ? S.row : S.rowAlt}>
                    <View style={COL.date}><Text style={S.txt}>{fmtDate(e.date_ecriture)}</Text></View>
                    <View style={COL.jnl}><Text style={S.txt}>{e.journal || '—'}</Text></View>
                    <View style={COL.piece}><Text style={S.txt}>{(e.ref_folio || '—').substring(0, 22)}</Text></View>
                    <View style={COL.libelle}><Text style={S.txt}>{(e.description || e.nom_compte || '—').substring(0, 50)}</Text></View>
                    <View style={COL.lettre}><Text style={S.txt}>{e.lettre || ''}</Text></View>
                    <View style={COL.debit}><Text style={S.txtR}>{(Number(e.debit_mur) || 0) > 0 ? fmt(e.debit_mur) : ''}</Text></View>
                    <View style={COL.credit}><Text style={S.txtR}>{(Number(e.credit_mur) || 0) > 0 ? fmt(e.credit_mur) : ''}</Text></View>
                    <View style={COL.solde}><Text style={[S.txtR, { color: e.solde_progressif < 0 ? '#c0392b' : '#000' }]}>{fmt(e.solde_progressif)}</Text></View>
                  </View>
                ))}
                <View style={S.rowTotal}>
                  <View style={COL.date}><Text style={S.totalTxt}> </Text></View>
                  <View style={COL.jnl}><Text style={S.totalTxt}> </Text></View>
                  <View style={COL.piece}><Text style={S.totalTxt}> </Text></View>
                  <View style={COL.libelle}><Text style={S.totalTxt}>Total {g.compte}</Text></View>
                  <View style={COL.lettre}><Text style={S.totalTxt}> </Text></View>
                  <View style={COL.debit}><Text style={S.totalTxt}>{fmt(g.totalDebit)}</Text></View>
                  <View style={COL.credit}><Text style={S.totalTxt}>{fmt(g.totalCredit)}</Text></View>
                  <View style={COL.solde}><Text style={[S.totalTxt, { color: g.soldeFinal < 0 ? '#e74c3c' : '#2ecc71' }]}>{fmt(g.soldeFinal)}</Text></View>
                </View>
              </View>
            </View>
          ))}

          {pi === pages.length - 1 && (
            <View style={[S.table, { marginTop: 6 }]}>
              <View style={S.rowGrandTotal}>
                <View style={COL.date}><Text style={S.grandTxt}> </Text></View>
                <View style={COL.jnl}><Text style={S.grandTxt}> </Text></View>
                <View style={COL.piece}><Text style={S.grandTxt}> </Text></View>
                <View style={COL.libelle}><Text style={S.grandTxt}>TOTAL GÉNÉRAL — {groups.length} comptes</Text></View>
                <View style={COL.lettre}><Text style={S.grandTxt}> </Text></View>
                <View style={COL.debit}><Text style={S.grandTxt}>{fmt(grandDebit)}</Text></View>
                <View style={COL.credit}><Text style={S.grandTxt}>{fmt(grandCredit)}</Text></View>
                <View style={COL.solde}><Text style={[S.grandTxt, { color: grandSolde < 0 ? '#e74c3c' : '#2ecc71' }]}>{fmt(grandSolde)}</Text></View>
              </View>
            </View>
          )}

          <View style={S.footer} fixed>
            <Text>{societe?.nom || '—'} | BRN: {societe?.brn || '—'} | {periode} | Généré par LEXORA</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
          </View>

        </Page>
      ))}
    </Document>
  )
}
