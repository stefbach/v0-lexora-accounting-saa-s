/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * rapport-pdf.tsx — Rapport de conseil juridique/RH en PDF professionnel.
 * Lexora · Département Juridique
 *
 * Compile une consultation (questions + analyses + sources citées) en un
 * rapport à en-tête cabinet. Inclut un mini-parseur markdown → react-pdf
 * (titres, listes, gras) pour un rendu soigné.
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const C = {
  navy: '#0B0F2E',
  gold: '#D4AF37',
  muted: '#6B7280',
  border: '#E5E7EB',
  text: '#1F2937',
  light: '#F8F9FC',
}

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 44, fontSize: 10, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.5 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 12, marginBottom: 16 },
  firmName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 1 },
  firmTag: { fontSize: 7.5, color: C.gold, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  metaRight: { alignItems: 'flex-end' },
  metaSmall: { fontSize: 8, color: C.muted, textAlign: 'right', lineHeight: 1.4 },

  reportTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 4 },
  metaLine: { fontSize: 9, color: C.muted, marginBottom: 2 },

  exchange: { marginTop: 14, breakInside: 'avoid' },
  qBox: { backgroundColor: C.light, borderLeftWidth: 3, borderLeftColor: C.navy, padding: 8, borderRadius: 3, marginBottom: 6 },
  qLabel: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  qText: { fontSize: 10, color: C.navy, fontFamily: 'Helvetica-Bold' },
  aLabel: { fontSize: 7.5, color: C.gold, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginBottom: 4 },

  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 8, marginBottom: 3, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 2 },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 6, marginBottom: 2 },
  para: { fontSize: 10, marginBottom: 4, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 10, fontSize: 10, color: C.gold },
  bulletText: { flex: 1, fontSize: 10 },
  quote: { borderLeftWidth: 2, borderLeftColor: C.gold, backgroundColor: C.light, paddingLeft: 8, paddingRight: 6, paddingVertical: 4, marginVertical: 4, borderRadius: 2 },
  quoteText: { fontSize: 9.5, color: C.text, fontFamily: 'Helvetica-Oblique', lineHeight: 1.45 },
  divider: { borderTopWidth: 0.5, borderTopColor: C.border, marginVertical: 6 },

  srcBox: { marginTop: 6, backgroundColor: C.light, padding: 6, borderRadius: 3 },
  srcTitle: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  srcItem: { fontSize: 8, color: C.text, marginBottom: 1 },
  docsLine: { fontSize: 8, color: C.muted, marginTop: 3, fontStyle: 'italic' },

  footer: { position: 'absolute', bottom: 26, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  footerLegal: { fontSize: 7, color: C.muted, textAlign: 'center', lineHeight: 1.4 },
  pageNo: { position: 'absolute', bottom: 14, right: 44, fontSize: 7, color: C.muted },
})

export interface RapportSource { ref: string; source: string; reference: string; titre: string; maj: string }
export interface RapportExchange {
  question: string
  answer: string
  sources?: RapportSource[]
  docs?: string[]
}
export interface RapportData {
  title: string
  societe?: string
  date?: string
  exchanges: RapportExchange[]
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return ''
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}

/** Nettoie un texte pour le PDF (Helvetica/WinAnsi) : retire les emojis non
 * rendus, convertit flèches et symboles math en ASCII. */
function clean(text: string): string {
  return (text || '')
    .replace(/[→⇒➔➜▶►]/g, '->')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trimStart()
}

/** Rend un texte avec **gras** et *italique* en spans Text (après nettoyage). */
function inline(text: string, key: string): React.ReactNode {
  const t = clean(text)
  const parts = t.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <Text key={`${key}-${i}`} style={{ fontFamily: 'Helvetica-Bold' }}>{p.slice(2, -2)}</Text>
    if (/^\*[^*]+\*$/.test(p)) return <Text key={`${key}-${i}`} style={{ fontFamily: 'Helvetica-Oblique' }}>{p.slice(1, -1)}</Text>
    return <Text key={`${key}-${i}`}>{p.replace(/\*/g, '')}</Text>
  })
}

/** Mini-parseur markdown → blocs react-pdf. */
function renderMarkdown(text: string, keyBase: string): React.ReactNode[] {
  const lines = (text || '').replace(/\r/g, '').split('\n')
  const out: React.ReactNode[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      const t = para.join(' ').trim()
      if (t) out.push(<Text key={`${keyBase}-p${out.length}`} style={s.para}>{inline(t, `${keyBase}-p${out.length}`)}</Text>)
      para = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    if (/^#{4} /.test(line) || /^### /.test(line)) { flush(); out.push(<Text key={`${keyBase}-h3${out.length}`} style={s.h3}>{clean(line.replace(/^#{3,4} /, '')).replace(/\*/g, '')}</Text>); continue }
    if (/^## /.test(line) || /^# /.test(line)) { flush(); out.push(<Text key={`${keyBase}-h2${out.length}`} style={s.h2}>{clean(line.replace(/^#{1,2} /, '')).replace(/\*/g, '')}</Text>); continue }
    if (/^---+$/.test(line)) { flush(); out.push(<View key={`${keyBase}-hr${out.length}`} style={s.divider} />); continue }
    if (/^>\s?/.test(line)) { flush(); out.push(<View key={`${keyBase}-q${out.length}`} style={s.quote}><Text style={s.quoteText}>{inline(line.replace(/^>\s?/, ''), `${keyBase}-q${out.length}`)}</Text></View>); continue }
    const bullet = line.match(/^[-•]\s+(.+)$/) || line.match(/^(\d+)\.\s+(.+)$/)
    if (bullet) {
      flush()
      const content = bullet.length === 3 ? bullet[2] : bullet[1]
      const mark = bullet.length === 3 ? `${bullet[1]}.` : '•'
      out.push(
        <View key={`${keyBase}-li${out.length}`} style={s.bullet}>
          <Text style={s.bulletDot}>{mark}</Text>
          <Text style={s.bulletText}>{inline(content.replace(/\|/g, ' '), `${keyBase}-li${out.length}`)}</Text>
        </View>,
      )
      continue
    }
    // ligne de tableau → texte simple nettoyé
    if (/^\|.+\|$/.test(line)) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.every((c) => /^[-:]+$/.test(c))) continue
      flush()
      out.push(<Text key={`${keyBase}-tr${out.length}`} style={s.para}>{inline(cells.join('  ·  ').replace(/\*\*/g, ''), `${keyBase}-tr${out.length}`)}</Text>)
      continue
    }
    para.push(line)
  }
  flush()
  return out
}

export function RapportPdf({ data }: { data: RapportData }) {
  return (
    <Document title={data.title}>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed>
          <View>
            <Text style={s.firmName}>LEXORA</Text>
            <Text style={s.firmTag}>Département Juridique</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaSmall}>Rapport de consultation</Text>
            <Text style={s.metaSmall}>{dateFr(data.date)}</Text>
            <Text style={s.metaSmall}>République de Maurice</Text>
          </View>
        </View>

        <Text style={s.reportTitle}>{data.title}</Text>
        {data.societe ? <Text style={s.metaLine}>Société : {data.societe}</Text> : null}
        <Text style={s.metaLine}>Établi le {dateFr(data.date)}</Text>

        {data.exchanges.map((ex, i) => (
          <View key={i} style={s.exchange} wrap>
            <View style={s.qBox}>
              <Text style={s.qLabel}>Question {i + 1}</Text>
              <Text style={s.qText}>{clean(ex.question)}</Text>
              {ex.docs && ex.docs.length > 0 ? <Text style={s.docsLine}>Documents analysés : {ex.docs.join(', ')}</Text> : null}
            </View>
            <Text style={s.aLabel}>Analyse</Text>
            {renderMarkdown(ex.answer, `ex${i}`)}
            {ex.sources && ex.sources.length > 0 ? (
              <View style={s.srcBox}>
                <Text style={s.srcTitle}>Sources citées (corpus mauricien)</Text>
                {ex.sources.map((src) => (
                  <Text key={src.ref} style={s.srcItem}>[{src.ref}] {src.source} {src.reference} — {src.titre} (revu {src.maj})</Text>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerLegal}>
            Rapport généré par le Département Juridique Lexora — projet de travail à valider par un avocat / attorney inscrit.
            Lexora ne fournit pas de conseil juridique réglementé.
          </Text>
        </View>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
