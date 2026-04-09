import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Helvetica', fontSize: 8, color: '#000' },
  title: { fontSize: 14, textAlign: 'center' },
  sub: { fontSize: 9, textAlign: 'center', color: '#444' },
  headerBox: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#aaaaaa' },
  headerCol: { flex: 1, paddingTop: 10, paddingBottom: 10, paddingRight: 8 },
  headerLabel: { fontSize: 6, color: '#888888' },
  headerValue: { fontSize: 9, color: '#000000' },
  headerValue2: { fontSize: 7.5, color: '#444444' },
  secHdr: { backgroundColor: '#2c3e50', padding: 4, marginTop: 12, marginBottom: 0 },
  secTxt: { color: '#fff', fontSize: 8 },
  table: { width: '100%', borderWidth: 0.5, borderColor: '#999', marginBottom: 6 },
  hdrRow: { flexDirection: 'row', backgroundColor: '#34495e', borderBottomWidth: 0.5, borderBottomColor: '#000', minHeight: 16 },
  row: { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#ccc', minHeight: 14 },
  rowAlt: { flexDirection: 'row', backgroundColor: '#f8f8f8', borderBottomWidth: 0.3, borderBottomColor: '#ccc', minHeight: 14 },
  rowTotal: { flexDirection: 'row', backgroundColor: '#2c3e50', minHeight: 16 },
  rowGrandTotal: { flexDirection: 'row', backgroundColor: '#1a252f', minHeight: 18 },
  cDate: { width: '8%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  cJournal: { width: '5%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  cPiece: { width: '14%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  cLibelle: { width: '35%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  cLettre: { width: '6%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center' },
  cDebit: { width: '11%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center', alignItems: 'flex-end' },
  cCredit: { width: '11%', padding: 2, borderRightWidth: 0.3, borderRightColor: '#ddd', justifyContent: 'center', alignItems: 'flex-end' },
  cSolde: { width: '10%', padding: 2, justifyContent: 'center', alignItems: 'flex-end' },
  hdrTxt: { color: '#fff', fontSize: 6.5 },
  txt: { fontSize: 6.5 },
  txtRight: { fontSize: 6.5, textAlign: 'right' },
  bold: { fontSize: 6.5 },
  totalTxt: { fontSize: 7, color: '#fff' },
  grandTotalTxt: { fontSize: 8, color: '#fff' },
  footer: { position: 'absolute', bottom: 15, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: '#999', paddingTop: 3, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6, color: '#888' },
  spacer8: { height: 8 },
  spacer16: { height: 16 },
})

const fmt = (n: number) => {
  const abs = Math.abs(n || 0)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${formatted})` : formatted
}

const fmtDate = (d: string) => {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
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

interface CompteGroup {
  compte: string
  nom: string
  entries: GLEntry[]
  totalDebit: number
  totalCredit: number
  soldeFinal: number
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

function resolveCompteName(compte: string, compteNames: Record<string, string>, entryNom?: string): string {
  if (compteNames[compte]) return compteNames[compte]
  if (COMPTE_NAMES_PDF[compte]) return COMPTE_NAMES_PDF[compte]
  for (let len = compte.length; len >= 2; len--) {
    const prefix = compte.substring(0, len)
    if (compteNames[prefix]) return compteNames[prefix]
    if (COMPTE_NAMES_PDF[prefix]) return COMPTE_NAMES_PDF[prefix]
  }
  if (entryNom && entryNom.trim()) return entryNom
  return ''
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
    const key = e.numero_compte || '???'
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key)!.push(e)
  }

  const groups: CompteGroup[] = Array.from(groupsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compte, entries]) => {
      const totalDebit = entries.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
      const totalCredit = entries.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
      const nom = resolveCompteName(compte, compteNames, entries[0]?.nom_compte)
      return { compte, nom, entries, totalDebit, totalCredit, soldeFinal: totalDebit - totalCredit }
    })

  const grandTotalDebit = groups.reduce((s, g) => s + g.totalDebit, 0)
  const grandTotalCredit = groups.reduce((s, g) => s + g.totalCredit, 0)
  const grandSolde = grandTotalDebit - grandTotalCredit
  const generatedDate = new Date().toLocaleDateString('fr-FR')
  const periodeLabel = dateDebut && dateFin
    ? `${fmtDate(dateDebut)} au ${fmtDate(dateFin)}`
    : dateDebut ? `A partir du ${fmtDate(dateDebut)}`
    : dateFin ? `Jusqu'au ${fmtDate(dateFin)}`
    : 'Toutes périodes'

  const pages: CompteGroup[][] = []
  let currentPage: CompteGroup[] = []
  let rowCount = 0
  const MAX_ROWS = 38

  for (const group of groups) {
    const groupRows = group.entries.length + 2
    if (rowCount + groupRows > MAX_ROWS && currentPage.length > 0) {
      pages.push(currentPage)
      currentPage = []
      rowCount = 0
    }
    currentPage.push(group)
    rowCount += groupRows
  }
  if (currentPage.length > 0) pages.push(currentPage)
  if (pages.length === 0) pages.push([])

  const TableHeader = () => (
    <View style={s.hdrRow}>
      <View style={s.cDate}><Text style={s.hdrTxt}>Date</Text></View>
      <View style={s.cJournal}><Text style={s.hdrTxt}>Jnl</Text></View>
      <View style={s.cPiece}><Text style={s.hdrTxt}>N° Pièce</Text></View>
      <View style={s.cLibelle}><Text style={s.hdrTxt}>Libellé</Text></View>
      <View style={s.cLettre}><Text style={s.hdrTxt}>Lettre</Text></View>
      <View style={s.cDebit}><Text style={s.hdrTxt}>Débit</Text></View>
      <View style={s.cCredit}><Text style={s.hdrTxt}>Crédit</Text></View>
      <View style={s.cSolde}><Text style={s.hdrTxt}>Solde</Text></View>
    </View>
  )

  return (
    <Document>
      {pages.map((pageGroups, pageIdx) => (
        <Page key={pageIdx} size="A4" style={s.page}>

          {pageIdx === 0 && (
            <View>
              <View style={s.spacer8} />
              <Text style={s.title}>GRAND LIVRE</Text>
              <View style={s.spacer8} />
              <Text style={s.sub}>General Ledger — {societe?.nom || '—'}</Text>
              <View style={s.spacer16} />
              <View style={s.headerBox}>
                <View style={s.headerCol}>
                  <Text style={s.headerLabel}>SOCIÉTÉ</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue}>{societe?.nom || '—'}</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue2}>{societe?.brn || '—'}</Text>
                </View>
                <View style={s.headerCol}>
                  <Text style={s.headerLabel}>PÉRIODE</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue}>{periodeLabel}</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue2}>{generatedDate}</Text>
                </View>
                <View style={s.headerCol}>
                  <Text style={s.headerLabel}>COMPTES</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue}>{groups.length}</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerLabel}>ÉCRITURES</Text>
                  <View style={s.spacer8} />
                  <Text style={s.headerValue}>{ecritures.length}</Text>
                </View>
              </View>
              <View style={s.spacer16} />
            </View>
          )}

          {pageGroups.map((group) => (
            <View key={group.compte} wrap={false}>
              <View style={s.secHdr}>
                <Text style={s.secTxt}>{group.compte}{group.nom ? ` — ${group.nom}` : ''}</Text>
              </View>
              <View style={s.table}>
                <TableHeader />
                {group.entries.map((e, i) => (
                  <View key={e.id} style={i % 2 === 0 ? s.row : s.rowAlt}>
                    <View style={s.cDate}><Text style={s.txt}>{fmtDate(e.date_ecriture)}</Text></View>
                    <View style={s.cJournal}><Text style={s.txt}>{e.journal || '—'}</Text></View>
                    <View style={s.cPiece}><Text style={s.txt}>{(e.ref_folio || '—').substring(0, 20)}</Text></View>
                    <View style={s.cLibelle}><Text style={s.txt}>{(e.description || e.nom_compte || '—').substring(0, 45)}</Text></View>
                    <View style={s.cLettre}><Text style={s.txt}>{e.lettre || ''}</Text></View>
                    <View style={s.cDebit}><Text style={s.txtRight}>{(Number(e.debit_mur) || 0) > 0 ? fmt(e.debit_mur) : ''}</Text></View>
                    <View style={s.cCredit}><Text style={s.txtRight}>{(Number(e.credit_mur) || 0) > 0 ? fmt(e.credit_mur) : ''}</Text></View>
                    <View style={s.cSolde}><Text style={[s.bold, { color: e.solde_progressif < 0 ? '#c0392b' : '#000' }]}>{fmt(e.solde_progressif)}</Text></View>
                  </View>
                ))}
                <View style={s.rowTotal}>
                  <View style={s.cDate}><Text style={s.totalTxt}></Text></View>
                  <View style={s.cJournal}><Text style={s.totalTxt}></Text></View>
                  <View style={s.cPiece}><Text style={s.totalTxt}></Text></View>
                  <View style={s.cLibelle}><Text style={s.totalTxt}>Total {group.compte}</Text></View>
                  <View style={s.cLettre}><Text style={s.totalTxt}></Text></View>
                  <View style={s.cDebit}><Text style={s.totalTxt}>{fmt(group.totalDebit)}</Text></View>
                  <View style={s.cCredit}><Text style={s.totalTxt}>{fmt(group.totalCredit)}</Text></View>
                  <View style={s.cSolde}><Text style={[s.totalTxt, { color: group.soldeFinal < 0 ? '#e74c3c' : '#2ecc71' }]}>{fmt(group.soldeFinal)}</Text></View>
                </View>
              </View>
            </View>
          ))}

          {pageIdx === pages.length - 1 && (
            <View style={[s.table, { marginTop: 8 }]}>
              <View style={s.rowGrandTotal}>
                <View style={s.cDate}><Text style={s.grandTotalTxt}></Text></View>
                <View style={s.cJournal}><Text style={s.grandTotalTxt}></Text></View>
                <View style={s.cPiece}><Text style={s.grandTotalTxt}></Text></View>
                <View style={s.cLibelle}><Text style={s.grandTotalTxt}>TOTAL GÉNÉRAL — {groups.length} comptes</Text></View>
                <View style={s.cLettre}><Text style={s.grandTotalTxt}></Text></View>
                <View style={s.cDebit}><Text style={s.grandTotalTxt}>{fmt(grandTotalDebit)}</Text></View>
                <View style={s.cCredit}><Text style={s.grandTotalTxt}>{fmt(grandTotalCredit)}</Text></View>
                <View style={s.cSolde}><Text style={[s.grandTotalTxt, { color: grandSolde < 0 ? '#e74c3c' : '#2ecc71' }]}>{fmt(grandSolde)}</Text></View>
              </View>
            </View>
          )}

          <View style={s.footer} fixed>
            <Text>{societe?.nom || '—'} | BRN: {societe?.brn || '—'} | {periodeLabel} | Généré par LEXORA</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
          </View>

        </Page>
      ))}
    </Document>
  )
}
