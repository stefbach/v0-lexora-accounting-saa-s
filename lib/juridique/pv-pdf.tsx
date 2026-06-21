/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * pv-pdf.tsx — Rendu PDF des actes de gouvernance (PV d'AG, résolutions).
 * Lexora · Vie juridique de la société
 *
 * Papier à en-tête de la société, titre de l'acte, méta (date/lieu/exercice),
 * corps en résolutions (markdown léger) et bloc signatures Président /
 * Secrétaire de séance. Document propre, sans mention « projet ».
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const C = { navy: '#0B0F2E', gold: '#D4AF37', muted: '#6B7280', border: '#E5E7EB', text: '#1F2937', light: '#F8F9FC' }

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.5 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 12, marginBottom: 16 },
  firmName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 0.5 },
  firmTag: { fontSize: 7.5, color: C.gold, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, marginTop: 2 },
  metaLeft: { fontSize: 8, color: C.muted, lineHeight: 1.4, marginTop: 1 },
  metaRight: { alignItems: 'flex-end' },
  metaSmall: { fontSize: 8, color: C.muted, textAlign: 'right', lineHeight: 1.4 },

  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'center', marginBottom: 2 },
  docSub: { fontSize: 9, color: C.muted, textAlign: 'center', marginBottom: 12 },

  metaBox: { backgroundColor: C.light, borderRadius: 4, padding: 10, marginBottom: 14 },
  metaLine: { fontSize: 9, color: C.text, marginBottom: 1.5 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: C.navy },

  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 9, marginBottom: 3, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 2 },
  h3: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 6, marginBottom: 2 },
  para: { fontSize: 10, marginBottom: 4, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 12, fontSize: 10, color: C.gold },
  bulletText: { flex: 1, fontSize: 10 },
  divider: { borderTopWidth: 0.5, borderTopColor: C.border, marginVertical: 6 },

  srcAnnex: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.border },
  srcAnnexTitle: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  srcAnnexItem: { fontSize: 8, color: C.text, marginBottom: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, gap: 24 },
  signCol: { flex: 1 },
  signRole: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  signName: { fontSize: 8.5, color: C.text, marginTop: 1 },
  signLine: { marginTop: 30, borderTopWidth: 0.7, borderTopColor: C.text, paddingTop: 3, fontSize: 7.5, color: C.muted },

  pageNo: { position: 'absolute', bottom: 14, right: 48, fontSize: 7, color: C.muted },
})

export interface PvPdfSource { ref: string; source: string; reference: string; titre: string; maj: string }
export interface PvPdfData {
  societe: { nom: string; brn?: string; adresse?: string; capital?: string }
  titre: string
  sousTitre?: string
  date?: string
  lieu?: string
  heure?: string
  exercice?: string
  president?: string
  secretaire?: string
  corps: string
  sources?: PvPdfSource[]
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}

function clean(text: string): string {
  return (text || '')
    .replace(/[→⇒➔➜▶►]/g, '->')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[═━─]{2,}/g, '')
    .replace(/ {2,}/g, ' ')
    .trimStart()
}

function inline(text: string, key: string): React.ReactNode {
  const t = clean(text)
  const parts = t.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <Text key={`${key}-${i}`} style={{ fontFamily: 'Helvetica-Bold' }}>{p.slice(2, -2)}</Text>
    if (/^\*[^*]+\*$/.test(p)) return <Text key={`${key}-${i}`} style={{ fontFamily: 'Helvetica-Oblique' }}>{p.slice(1, -1)}</Text>
    return <Text key={`${key}-${i}`}>{p.replace(/\*/g, '')}</Text>
  })
}

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
    if (/^#{2,4}\s/.test(line) || /^(premi[èe]re|deuxi[èe]me|troisi[èe]me|quatri[èe]me|cinqui[èe]me|sixi[èe]me|septi[èe]me|huiti[èe]me)\s+r[ée]solution/i.test(line.replace(/\*/g, '').trim()) || /^r[ée]solution\s+(n|\d)/i.test(line.replace(/\*/g, '').trim())) {
      flush(); out.push(<Text key={`${keyBase}-h2${out.length}`} style={s.h2}>{clean(line.replace(/^#{2,4}\s/, '')).replace(/\*/g, '')}</Text>); continue
    }
    if (/^#\s/.test(line)) { flush(); out.push(<Text key={`${keyBase}-h3${out.length}`} style={s.h3}>{clean(line.replace(/^#\s/, '')).replace(/\*/g, '')}</Text>); continue }
    if (/^---+$/.test(line) || /^[═━─]{3,}$/.test(line)) { flush(); out.push(<View key={`${keyBase}-hr${out.length}`} style={s.divider} />); continue }
    const bullet = line.match(/^[-•]\s+(.+)$/) || line.match(/^(\d+(?:\.\d+)?)[).]\s+(.+)$/)
    if (bullet) {
      flush()
      const content = bullet.length === 3 ? bullet[2] : bullet[1]
      const mark = bullet.length === 3 ? `${bullet[1]}.` : '•'
      out.push(
        <View key={`${keyBase}-li${out.length}`} style={s.bullet}>
          <Text style={s.bulletDot}>{mark}</Text>
          <Text style={s.bulletText}>{inline(content, `${keyBase}-li${out.length}`)}</Text>
        </View>,
      )
      continue
    }
    para.push(line)
  }
  flush()
  return out
}

export function PvPdf({ data }: { data: PvPdfData }) {
  return (
    <Document title={`${data.titre}${data.societe.nom ? ` — ${data.societe.nom}` : ''}`}>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed>
          <View style={{ maxWidth: 320 }}>
            <Text style={s.firmName}>{(data.societe.nom || 'Société').toUpperCase()}</Text>
            {data.societe.brn ? <Text style={s.firmTag}>BRN : {data.societe.brn}</Text> : null}
            {data.societe.adresse ? <Text style={s.metaLeft}>{data.societe.adresse}</Text> : null}
            {data.societe.capital ? <Text style={s.metaLeft}>Capital : {data.societe.capital}</Text> : null}
            <Text style={s.metaLeft}>République de Maurice</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaSmall}>{data.lieu || 'Port-Louis'}</Text>
            <Text style={s.metaSmall}>{dateFr(data.date)}</Text>
          </View>
        </View>

        <Text style={s.docTitle}>{clean(data.titre)}</Text>
        {data.sousTitre ? <Text style={s.docSub}>{clean(data.sousTitre)}</Text> : null}

        <View style={s.metaBox}>
          {data.date ? <Text style={s.metaLine}><Text style={s.metaLabel}>Date : </Text>{dateFr(data.date)}{data.heure ? ` à ${data.heure}` : ''}</Text> : null}
          {data.lieu ? <Text style={s.metaLine}><Text style={s.metaLabel}>Lieu : </Text>{data.lieu}</Text> : null}
          {data.exercice ? <Text style={s.metaLine}><Text style={s.metaLabel}>Exercice : </Text>{data.exercice}</Text> : null}
          {data.president ? <Text style={s.metaLine}><Text style={s.metaLabel}>Président de séance : </Text>{data.president}</Text> : null}
          {data.secretaire ? <Text style={s.metaLine}><Text style={s.metaLabel}>Secrétaire : </Text>{data.secretaire}</Text> : null}
        </View>

        <View>{renderMarkdown(data.corps, 'corps')}</View>

        {data.sources && data.sources.length > 0 ? (
          <View style={s.srcAnnex} wrap={false}>
            <Text style={s.srcAnnexTitle}>Sources juridiques (corpus mauricien)</Text>
            {data.sources.map((src) => (
              <Text key={src.ref} style={s.srcAnnexItem}>[{src.ref}] {src.source} {src.reference} — {src.titre} (revu {src.maj})</Text>
            ))}
          </View>
        ) : null}

        <View style={s.signRow} wrap={false}>
          <View style={s.signCol}>
            <Text style={s.signRole}>Le Président de séance</Text>
            {data.president ? <Text style={s.signName}>{data.president}</Text> : null}
            <Text style={s.signLine}>Signature</Text>
          </View>
          <View style={s.signCol}>
            <Text style={s.signRole}>Le Secrétaire de séance</Text>
            {data.secretaire ? <Text style={s.signName}>{data.secretaire}</Text> : null}
            <Text style={s.signLine}>Signature</Text>
          </View>
        </View>

        <Text style={s.pageNo} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
