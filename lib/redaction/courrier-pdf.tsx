/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * courrier-pdf.tsx — Rendu PDF d'un courrier professionnel (react-pdf).
 * Lexora · Assistant de rédaction
 *
 * Papier à en-tête de l'expéditeur : bloc émetteur, destinataire, lieu/date,
 * objet, corps justifié (markdown léger), formule de politesse + signature.
 * Document propre, prêt à envoyer.
 */
import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const C = { navy: '#0B0F2E', gold: '#D4AF37', muted: '#6B7280', border: '#E5E7EB', text: '#1F2937', light: '#F8F9FC' }

const s = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 60, paddingHorizontal: 48, fontSize: 10.5, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.5 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 12, marginBottom: 18 },
  fromName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy },
  fromLine: { fontSize: 8.5, color: C.muted, marginTop: 1.5 },
  recipientBox: { alignSelf: 'flex-end', width: 250, marginBottom: 16 },
  recipientLabel: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  recipientName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy },
  recipientAddr: { fontSize: 9, color: C.text, marginTop: 2 },
  placeDate: { fontSize: 9.5, color: C.text, textAlign: 'right', marginBottom: 16 },
  objetRow: { flexDirection: 'row', marginBottom: 14 },
  objetLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginRight: 4 },
  objetText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, flex: 1 },
  para: { fontSize: 10.5, marginBottom: 8, textAlign: 'justify', lineHeight: 1.6 },
  signBlock: { marginTop: 26, alignItems: 'flex-end' },
  signName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy },
  signRole: { fontSize: 9, color: C.muted },
  signLine: { marginTop: 28, borderTopWidth: 0.7, borderTopColor: C.text, width: 200, paddingTop: 3, fontSize: 8, color: C.muted, textAlign: 'center' },
  pageNo: { position: 'absolute', bottom: 16, right: 48, fontSize: 7, color: C.muted },
})

export interface CourrierPdfData {
  expediteur: { nom?: string; adresse?: string; brn?: string; contact?: string }
  destinataire: { nom?: string; adresse?: string }
  lieu?: string
  date?: string
  objet?: string
  corps: string
  signataire?: string
  signataireTitre?: string
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return new Date().toLocaleDateString('fr-FR')
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}

function clean(t: string): string {
  return (t || '')
    .replace(/[→⇒➔➜▶►]/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[═━─]{2,}/g, '').replace(/ {2,}/g, ' ')
}

export function CourrierPdf({ data }: { data: CourrierPdfData }) {
  // On retire d'éventuels en-têtes / objets / signatures déjà inclus par le
  // modèle pour éviter les doublons : on garde le corps « propre ».
  const paragraphs = clean(data.corps).split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  return (
    <Document title={`Courrier${data.objet ? ` — ${data.objet}` : ''}`}>
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.fromName}>{(data.expediteur.nom || 'Expéditeur').toUpperCase()}</Text>
            {data.expediteur.brn ? <Text style={s.fromLine}>BRN : {data.expediteur.brn}</Text> : null}
            {data.expediteur.adresse ? <Text style={s.fromLine}>{data.expediteur.adresse}</Text> : null}
            {data.expediteur.contact ? <Text style={s.fromLine}>{data.expediteur.contact}</Text> : null}
          </View>
        </View>

        <View style={s.recipientBox}>
          <Text style={s.recipientLabel}>À l'attention de</Text>
          <Text style={s.recipientName}>{data.destinataire.nom || '[Destinataire]'}</Text>
          {data.destinataire.adresse ? <Text style={s.recipientAddr}>{data.destinataire.adresse}</Text> : null}
        </View>

        <Text style={s.placeDate}>{data.lieu || 'Port-Louis'}, le {dateFr(data.date)}</Text>

        {data.objet ? (
          <View style={s.objetRow}>
            <Text style={s.objetLabel}>Objet :</Text>
            <Text style={s.objetText}>{clean(data.objet)}</Text>
          </View>
        ) : null}

        {paragraphs.map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}

        <View style={s.signBlock}>
          {data.signataire ? <Text style={s.signName}>{data.signataire}</Text> : null}
          {data.signataireTitre ? <Text style={s.signRole}>{data.signataireTitre}</Text> : null}
          <Text style={s.signLine}>Signature</Text>
        </View>

        <Text style={s.pageNo} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
