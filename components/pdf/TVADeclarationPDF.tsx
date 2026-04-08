import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 35, fontFamily: 'Helvetica', fontSize: 9, color: '#000' },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  sub: { fontSize: 9, textAlign: 'center', marginBottom: 4 },
  table: { width: '100%', borderWidth: 1, borderColor: '#000', marginBottom: 12 },
  hdrRow: { flexDirection: 'row', backgroundColor: '#2c3e50', borderBottomWidth: 1, borderBottomColor: '#000' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#999', minHeight: 20 },
  rowAlt: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 0.5, borderBottomColor: '#999', minHeight: 20 },
  rowHL: { flexDirection: 'row', backgroundColor: '#fff3cd', borderBottomWidth: 1, borderBottomColor: '#f0ad4e', minHeight: 20 },
  rowRC: { flexDirection: 'row', backgroundColor: '#fff8e1', borderBottomWidth: 0.5, borderBottomColor: '#f0ad4e', minHeight: 20 },
  rowTotal: { flexDirection: 'row', backgroundColor: '#2c3e50', minHeight: 22 },
  cBox: { width: 30, padding: 4, borderRightWidth: 0.5, borderRightColor: '#999', justifyContent: 'center' },
  cDesc: { flex: 1, padding: 4, borderRightWidth: 0.5, borderRightColor: '#999', justifyContent: 'center' },
  cAmt: { width: 110, padding: 4, textAlign: 'right', justifyContent: 'center' },
  hdrTxt: { color: '#fff', fontSize: 8, fontWeight: 'bold' },
  txt: { fontSize: 8 },
  bold: { fontSize: 8, fontWeight: 'bold' },
  totalTxt: { fontSize: 9, fontWeight: 'bold', color: '#fff' },
  negTxt: { fontSize: 8, color: '#c0392b', fontWeight: 'bold' },
  greenTxt: { fontSize: 8, color: '#27ae60', fontWeight: 'bold' },
  secHdr: { backgroundColor: '#34495e', padding: 5, marginTop: 10, marginBottom: 0 },
  secTxt: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 6, backgroundColor: '#fafafa' },
  infoLbl: { fontSize: 7, color: '#666', marginBottom: 2 },
  infoVal: { fontSize: 9, fontWeight: 'bold' },
  sigRow: { flexDirection: 'row', gap: 20, marginTop: 15 },
  sigBox: { flex: 1, borderTopWidth: 1, borderTopColor: '#000', paddingTop: 6 },
  sigLbl: { fontSize: 8, color: '#444' },
  footer: { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: '#999', paddingTop: 4, textAlign: 'center', fontSize: 7, color: '#666' },
})

const fmt = (n: number) => {
  const abs = Math.abs(n || 0)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${formatted})` : formatted
}

interface TVAPDFProps {
  societe: any
  periodeLabel: string
  effectiveCollectee: number
  effectiveDeductible: number
  tvaAPayer: number
  creditTVA: number
  totalReverseChargeBase: number
  reverseChargeTVA: number
  caHT: number
  taxableAchatsHT: number
  groupedSuppliers: { tiers: string; totalTVA: number; count: number }[]
  reverseChargeFacts: any[]
}

export function TVADeclarationPDF(props: TVAPDFProps) {
  const { societe, periodeLabel, effectiveCollectee, effectiveDeductible, tvaAPayer, creditTVA, totalReverseChargeBase, reverseChargeTVA, caHT, taxableAchatsHT, groupedSuppliers, reverseChargeFacts } = props
  const box7 = effectiveCollectee - effectiveDeductible

  const BoxRow = ({ box, desc, val, style }: { box: string; desc: string; val: string; style?: any }) => (
    <View style={style || s.row}>
      <View style={s.cBox}><Text style={s.bold}>{box}</Text></View>
      <View style={s.cDesc}><Text style={s.txt}>{desc}</Text></View>
      <View style={s.cAmt}><Text style={s.bold}>{val}</Text></View>
    </View>
  )

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <Text style={s.title}>MAURITIUS REVENUE AUTHORITY</Text>
        <Text style={[s.sub, { fontSize: 11, fontWeight: 'bold', marginBottom: 6 }]}>VALUE ADDED TAX RETURN</Text>
        <Text style={s.sub}>Déclaration de la Taxe sur la Valeur Ajoutée</Text>

        {/* Company Info */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLbl}>Registered Person</Text>
            <Text style={s.infoVal}>{societe?.nom || '—'}</Text>
            <Text style={[s.infoLbl, { marginTop: 3 }]}>BRN</Text>
            <Text style={s.infoVal}>{societe?.brn || '—'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLbl}>VAT Registration Number</Text>
            <Text style={s.infoVal}>{societe?.numero_tva_mra || '___________'}</Text>
            <Text style={[s.infoLbl, { marginTop: 3 }]}>Tax Period</Text>
            <Text style={s.infoVal}>{periodeLabel}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLbl}>Registered Office</Text>
            <Text style={s.infoVal}>{societe?.adresse || '—'}</Text>
            <Text style={[s.infoLbl, { marginTop: 3 }]}>Due Date</Text>
            <Text style={s.infoVal}>20th of following month</Text>
          </View>
        </View>

        {/* VAT Boxes */}
        <View style={s.secHdr}><Text style={s.secTxt}>VAT COMPUTATION — All amounts in Mauritian Rupees (MUR)</Text></View>
        <View style={s.table}>
          <View style={s.hdrRow}>
            <View style={s.cBox}><Text style={s.hdrTxt}>Box</Text></View>
            <View style={s.cDesc}><Text style={s.hdrTxt}>Description</Text></View>
            <View style={s.cAmt}><Text style={s.hdrTxt}>Amount (MUR)</Text></View>
          </View>
          <BoxRow box="1" desc="Value of Taxable Supplies (excl. VAT)" val={fmt(caHT)} />
          <BoxRow box="2" desc="Output Tax — TVA collectée (sur ventes)" val={fmt(effectiveCollectee)} style={s.rowAlt} />
          <BoxRow box="3" desc="Value of Taxable Purchases (excl. VAT)" val={fmt(taxableAchatsHT)} />
          <BoxRow box="4" desc="Input Tax — TVA déductible (achats locaux)" val={fmt(effectiveDeductible)} style={s.rowAlt} />
          {reverseChargeTVA > 0 && <BoxRow box="R5" desc={`Reverse Charge — Services importés (Output=Input=Net 0) Base: ${fmt(totalReverseChargeBase)}`} val={fmt(reverseChargeTVA)} style={s.rowRC} />}
          <BoxRow box="5" desc="VAT Credit brought forward — Crédit TVA reporté" val={fmt(0)} />
          <BoxRow box="6" desc="Total Deductible VAT (Box 4 + Box 5)" val={fmt(effectiveDeductible)} style={s.rowAlt} />
          <BoxRow box="7" desc="Net VAT — TVA nette (Box 2 - Box 6)" val={fmt(box7)} style={s.rowHL} />
          <BoxRow box="8" desc="VAT Payable — TVA à payer" val={fmt(tvaAPayer)} />
          <View style={s.rowTotal}>
            <View style={s.cBox}><Text style={s.totalTxt}>9</Text></View>
            <View style={s.cDesc}><Text style={s.totalTxt}>VAT Credit to carry forward — Crédit TVA à reporter</Text></View>
            <View style={s.cAmt}><Text style={[s.totalTxt, creditTVA > 0 ? { color: '#2ecc71' } : {}]}>{fmt(creditTVA)}</Text></View>
          </View>
        </View>

        {/* Input Tax Detail */}
        {groupedSuppliers.length > 0 && (<>
          <View style={s.secHdr}><Text style={s.secTxt}>INPUT TAX DETAILS — Fournisseurs avec TVA</Text></View>
          <View style={s.table}>
            <View style={s.hdrRow}>
              <View style={s.cDesc}><Text style={s.hdrTxt}>Fournisseur / Supplier</Text></View>
              <View style={s.cAmt}><Text style={s.hdrTxt}>TVA (MUR)</Text></View>
            </View>
            {groupedSuppliers.map((g, i) => (
              <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
                <View style={s.cDesc}><Text style={s.txt}>{g.tiers}{g.count > 1 ? ` (×${g.count})` : ''}</Text></View>
                <View style={s.cAmt}><Text style={s.txt}>{fmt(g.totalTVA)}</Text></View>
              </View>
            ))}
            <View style={s.rowTotal}>
              <View style={s.cDesc}><Text style={s.totalTxt}>TOTAL INPUT TAX</Text></View>
              <View style={s.cAmt}><Text style={s.totalTxt}>{fmt(effectiveDeductible)}</Text></View>
            </View>
          </View>
        </>)}

        {/* Reverse Charge Detail */}
        {reverseChargeFacts.length > 0 && (<>
          <View style={s.secHdr}><Text style={s.secTxt}>REVERSE CHARGE R5 — Services importés</Text></View>
          <View style={s.table}>
            <View style={s.hdrRow}>
              <View style={s.cDesc}><Text style={s.hdrTxt}>Fournisseur étranger</Text></View>
              <View style={[s.cAmt, { width: 90 }]}><Text style={s.hdrTxt}>Base HT</Text></View>
              <View style={[s.cAmt, { width: 80 }]}><Text style={s.hdrTxt}>TVA 15%</Text></View>
            </View>
            {reverseChargeFacts.map((rc: any, i: number) => (
              <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
                <View style={s.cDesc}><Text style={s.txt}>{rc.tiers}</Text></View>
                <View style={[s.cAmt, { width: 90 }]}><Text style={s.txt}>{fmt(Number(rc.montant_ht) || 0)}</Text></View>
                <View style={[s.cAmt, { width: 80 }]}><Text style={s.txt}>{fmt((Number(rc.montant_ht) || 0) * 0.15)}</Text></View>
              </View>
            ))}
            <View style={s.rowTotal}>
              <View style={s.cDesc}><Text style={s.totalTxt}>Total R5 (Output = Input = Net 0)</Text></View>
              <View style={[s.cAmt, { width: 90 }]}><Text style={s.totalTxt}>{fmt(totalReverseChargeBase)}</Text></View>
              <View style={[s.cAmt, { width: 80 }]}><Text style={s.totalTxt}>{fmt(reverseChargeTVA)}</Text></View>
            </View>
          </View>
        </>)}

        {/* Declaration */}
        <View style={{ marginTop: 20 }}>
          <View style={s.secHdr}><Text style={s.secTxt}>DECLARATION</Text></View>
          <Text style={{ fontSize: 8, padding: 8, lineHeight: 1.5 }}>I/We declare that the information given in this return is true, correct and complete to the best of my/our knowledge and belief.</Text>
          <View style={s.sigRow}>
            <View style={s.sigBox}>
              <Text style={s.sigLbl}>Name / Nom: ____________________________</Text>
              <Text style={[s.sigLbl, { marginTop: 4 }]}>Capacity: Director / Directeur</Text>
            </View>
            <View style={s.sigBox}>
              <Text style={s.sigLbl}>Signature: ____________________________</Text>
              <Text style={[s.sigLbl, { marginTop: 4 }]}>Date: ____________________________</Text>
            </View>
          </View>
        </View>

        <Text style={s.footer}>{societe?.nom} | BRN: {societe?.brn} | VAT: {societe?.numero_tva_mra || 'N/A'} | {periodeLabel} | Généré par LEXORA — MRA VAT Return</Text>
      </Page>
    </Document>
  )
}
