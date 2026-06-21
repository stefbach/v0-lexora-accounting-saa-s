/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * contrat-pdf.tsx — Rendu PDF professionnel d'un contrat (react-pdf).
 * Lexora · Département Juridique
 *
 * Met en page un contrat rédigé en markdown léger (articles numérotés, listes,
 * gras/italique) sur un papier à en-tête cabinet : bandeau navy/or, encadré des
 * parties, corps justifié article par article, annexe des sources juridiques
 * verrouillées (RAG) et pied de page « projet — relecture avocat requise ».
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
  page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 46, fontSize: 10, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.5 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 12, marginBottom: 16 },
  firmName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 1 },
  firmTag: { fontSize: 7.5, color: C.gold, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  metaRight: { alignItems: 'flex-end' },
  metaSmall: { fontSize: 8, color: C.muted, textAlign: 'right', lineHeight: 1.4 },

  docTitle: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3, textAlign: 'center' },
  docRef: { fontSize: 8.5, color: C.muted, textAlign: 'center', marginBottom: 12 },

  partiesRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  partyBox: { flex: 1, backgroundColor: C.light, borderRadius: 4, padding: 9 },
  partyLabel: { fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  partyName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy },
  partyLine: { fontSize: 8, color: C.text, marginTop: 1.5 },

  h2: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 10, marginBottom: 3, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 2 },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 7, marginBottom: 2 },
  para: { fontSize: 10, marginBottom: 4, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 2, paddingLeft: 6 },
  bulletDot: { width: 12, fontSize: 10, color: C.gold },
  bulletText: { flex: 1, fontSize: 10 },
  divider: { borderTopWidth: 0.5, borderTopColor: C.border, marginVertical: 6 },

  srcAnnex: { marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.border },
  srcAnnexTitle: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  srcAnnexItem: { fontSize: 8, color: C.text, marginBottom: 1.5 },

  footer: { position: 'absolute', bottom: 26, left: 46, right: 46, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  draftBadge: { fontSize: 7.5, color: '#B45309', textAlign: 'center', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  footerLegal: { fontSize: 7, color: C.muted, textAlign: 'center', lineHeight: 1.4 },
  pageNo: { position: 'absolute', bottom: 14, right: 46, fontSize: 7, color: C.muted },
})

export interface ContratPdfSource { ref: string; source: string; reference: string; titre: string; maj: string }
export interface ContratPdfParty {
  nom: string
  brn?: string
  nic?: string
  adresse?: string
  representant?: string
  titre?: string
}
export interface ContratPdfData {
  type: string
  reference?: string
  corps: string
  lieu?: string
  date?: string
  employeur: ContratPdfParty
  contractant: ContratPdfParty
  sources?: ContratPdfSource[]
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return ''
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}

/** Nettoie un texte pour Helvetica/WinAnsi : retire emojis, convertit symboles. */
function clean(text: string): string {
  return (text || '')
    .replace(/[→⇒➔➜▶►]/g, '->')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[═━─]{2,}/g, '')
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
    // "Article 3 : ..." ou "ARTICLE 3" → titre d'article
    if (/^#{2,4}\s/.test(line) || /^\*\*?article\b/i.test(line) || /^article\s+\d+/i.test(line) || /^[A-ZÉÈ\s]{6,}:?$/.test(line.replace(/\*/g, '').trim())) {
      flush()
      out.push(<Text key={`${keyBase}-h2${out.length}`} style={s.h2}>{clean(line.replace(/^#{2,4}\s/, '')).replace(/\*/g, '')}</Text>)
      continue
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

export function ContratPdf({ data }: { data: ContratPdfData }) {
  return (
    <Document title={`${data.type}${data.reference ? ` — ${data.reference}` : ''}`}>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed>
          <View>
            <Text style={s.firmName}>LEXORA</Text>
            <Text style={s.firmTag}>Département Juridique</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaSmall}>Projet de contrat</Text>
            <Text style={s.metaSmall}>{(data.lieu || 'Port-Louis')}, {dateFr(data.date)}</Text>
            <Text style={s.metaSmall}>République de Maurice</Text>
          </View>
        </View>

        <Text style={s.docTitle}>{clean(data.type)}</Text>
        {data.reference ? <Text style={s.docRef}>Réf. : {data.reference}</Text> : null}

        {/* Parties */}
        <View style={s.partiesRow}>
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>Employeur / Prestataire</Text>
            <Text style={s.partyName}>{data.employeur.nom || '[À compléter]'}</Text>
            {data.employeur.brn ? <Text style={s.partyLine}>BRN : {data.employeur.brn}</Text> : null}
            {data.employeur.adresse ? <Text style={s.partyLine}>{data.employeur.adresse}</Text> : null}
            {data.employeur.representant ? <Text style={s.partyLine}>Rep. : {data.employeur.representant}{data.employeur.titre ? `, ${data.employeur.titre}` : ''}</Text> : null}
          </View>
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>Employé / Cocontractant</Text>
            <Text style={s.partyName}>{data.contractant.nom || '[À compléter]'}</Text>
            {data.contractant.nic ? <Text style={s.partyLine}>NIC : {data.contractant.nic}</Text> : null}
            {data.contractant.adresse ? <Text style={s.partyLine}>{data.contractant.adresse}</Text> : null}
          </View>
        </View>

        {/* Corps du contrat */}
        <View>{renderMarkdown(data.corps, 'corps')}</View>

        {/* Annexe — Sources juridiques (verrouillage RAG) */}
        {data.sources && data.sources.length > 0 ? (
          <View style={s.srcAnnex} wrap={false}>
            <Text style={s.srcAnnexTitle}>Sources juridiques (corpus mauricien)</Text>
            {data.sources.map((src) => (
              <Text key={src.ref} style={s.srcAnnexItem}>[{src.ref}] {src.source} {src.reference} — {src.titre} (revu {src.maj})</Text>
            ))}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.draftBadge}>
            PROJET — contrat généré par le Département Juridique Lexora · relecture par un avocat / attorney requise avant signature
          </Text>
          <Text style={s.footerLegal}>
            Lexora ne fournit pas de conseil juridique réglementé. Document à valeur de projet de travail. République de Maurice.
          </Text>
        </View>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
