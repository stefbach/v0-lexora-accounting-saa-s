/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * registre-pdf.tsx — Rendu PDF des registres légaux de la société.
 * Lexora · Vie juridique de la société
 *
 * Tableau à en-tête de la société (registre des associés, des administrateurs,
 * des bénéficiaires effectifs) — Companies Act 2001. Document propre, certifié
 * conforme par un signataire.
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const C = { navy: '#0B0F2E', gold: '#D4AF37', muted: '#6B7280', border: '#E5E7EB', text: '#1F2937', light: '#F8F9FC' }

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 52, paddingHorizontal: 40, fontSize: 9, fontFamily: 'Helvetica', color: C.text },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 10, marginBottom: 14 },
  firmName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 0.5 },
  firmTag: { fontSize: 7, color: C.gold, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  metaLeft: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  metaRight: { alignItems: 'flex-end' },
  metaSmall: { fontSize: 7.5, color: C.muted, textAlign: 'right' },

  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 2 },
  sub: { fontSize: 8.5, color: C.muted, marginBottom: 12 },

  thead: { flexDirection: 'row', backgroundColor: C.navy, borderRadius: 3 },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', paddingVertical: 5, paddingHorizontal: 5 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border },
  trAlt: { backgroundColor: C.light },
  td: { fontSize: 8, color: C.text, paddingVertical: 4, paddingHorizontal: 5 },

  empty: { fontSize: 9, color: C.muted, fontFamily: 'Helvetica-Oblique', marginTop: 12, textAlign: 'center' },

  certify: { marginTop: 24, fontSize: 8, color: C.text },
  signLine: { marginTop: 28, borderTopWidth: 0.7, borderTopColor: C.text, width: 220, paddingTop: 3, fontSize: 7.5, color: C.muted },

  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: C.muted },
})

export interface RegistreColumn { key: string; label: string; width: number }
export interface RegistrePdfData {
  societe: { nom: string; brn?: string; adresse?: string }
  titre: string
  sousTitre?: string
  date?: string
  columns: RegistreColumn[]
  rows: Record<string, string>[]
  certifie_par?: string
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return ''
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}

export function RegistrePdf({ data }: { data: RegistrePdfData }) {
  return (
    <Document title={`${data.titre} — ${data.societe.nom}`}>
      <Page size="A4" style={s.page} orientation="landscape">
        <View style={s.topBar} fixed>
          <View style={{ maxWidth: 380 }}>
            <Text style={s.firmName}>{(data.societe.nom || 'Société').toUpperCase()}</Text>
            {data.societe.brn ? <Text style={s.firmTag}>BRN : {data.societe.brn}</Text> : null}
            {data.societe.adresse ? <Text style={s.metaLeft}>{data.societe.adresse}</Text> : null}
            <Text style={s.metaLeft}>République de Maurice</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaSmall}>Établi le {dateFr(data.date)}</Text>
            <Text style={s.metaSmall}>Companies Act 2001</Text>
          </View>
        </View>

        <Text style={s.title}>{data.titre}</Text>
        {data.sousTitre ? <Text style={s.sub}>{data.sousTitre}</Text> : null}

        <View style={s.thead} fixed>
          {data.columns.map((c) => <Text key={c.key} style={[s.th, { width: `${c.width}%` }]}>{c.label}</Text>)}
        </View>

        {data.rows.length === 0 ? (
          <Text style={s.empty}>Aucune inscription enregistrée à ce jour.</Text>
        ) : (
          data.rows.map((row, i) => (
            <View key={i} style={i % 2 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
              {data.columns.map((c) => <Text key={c.key} style={[s.td, { width: `${c.width}%` }]}>{row[c.key] || '—'}</Text>)}
            </View>
          ))
        )}

        <View wrap={false}>
          <Text style={s.certify}>
            Certifié conforme au registre tenu par la société conformément au Companies Act 2001.
          </Text>
          <Text style={s.signLine}>{data.certifie_par ? `${data.certifie_par} — Signature` : 'Nom et signature du signataire autorisé'}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>{data.societe.nom}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
