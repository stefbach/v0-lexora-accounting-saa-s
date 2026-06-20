/**
 * acte-pdf.tsx — Rendu PDF professionnel des actes juridiques (react-pdf).
 * Lexora · Département Juridique
 *
 * Papier à en-tête type cabinet : bandeau navy/or, bloc émetteur + destinataire,
 * lieu/date, objet, corps de l'acte justifié, bloc signature, pied de page avec
 * la mention « projet — relecture avocat requise ».
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

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 70, paddingHorizontal: 44, fontSize: 10.5, fontFamily: 'Helvetica', color: C.text, lineHeight: 1.5 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: C.gold, paddingBottom: 12, marginBottom: 18 },
  firmName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 1 },
  firmTag: { fontSize: 8, color: C.gold, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 },
  issuerRight: { width: 220, alignItems: 'flex-end' },
  issuerName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  small: { fontSize: 8, color: C.muted, textAlign: 'right', lineHeight: 1.4 },

  recipientBox: { alignSelf: 'flex-end', width: 250, backgroundColor: C.light, padding: 10, borderRadius: 4, marginBottom: 16 },
  recipientLabel: { fontSize: 7.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  recipientName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy },
  recipientAddr: { fontSize: 9, color: C.text, marginTop: 2 },

  placeDate: { fontSize: 9.5, color: C.text, textAlign: 'right', marginBottom: 14 },

  objetRow: { flexDirection: 'row', marginBottom: 12 },
  objetLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginRight: 4 },
  objetText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.text, flex: 1 },

  ref: { fontSize: 8.5, color: C.muted, marginBottom: 14 },

  body: { fontSize: 10.5, textAlign: 'justify', lineHeight: 1.6 },
  para: { marginBottom: 9, textAlign: 'justify' },

  amountBox: { marginVertical: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: C.gold, backgroundColor: C.light },
  amountLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 },
  amountValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 2 },

  signBlock: { marginTop: 30, alignItems: 'flex-end' },
  signName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy },
  signFor: { fontSize: 9, color: C.muted },
  signLine: { marginTop: 36, borderTopWidth: 0.7, borderTopColor: C.text, width: 200, paddingTop: 3, fontSize: 8, color: C.muted, textAlign: 'center' },

  footer: { position: 'absolute', bottom: 28, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  footerLegal: { fontSize: 7, color: C.muted, textAlign: 'center', lineHeight: 1.4 },
  draftBadge: { fontSize: 7.5, color: '#B45309', textAlign: 'center', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
})

export interface ActePdfData {
  titre: string
  reference?: string
  corps: string
  lieu?: string
  date?: string
  objet?: string
  montant?: number
  devise?: string
  emetteur: { nom: string; brn?: string; adresse?: string }
  destinataire: { nom: string; adresse?: string }
  signataire?: string
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function dateFr(d?: string): string {
  const dt = d ? new Date(d) : new Date()
  if (isNaN(dt.getTime())) return ''
  return `${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`
}
function fmtMontant(n?: number, devise = 'MUR'): string {
  if (n == null) return ''
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${devise}`
}

export function ActePdf({ data }: { data: ActePdfData }) {
  const paragraphs = (data.corps || '').split(/\n\s*\n/).filter((p) => p.trim())

  return (
    <Document title={`${data.titre}${data.reference ? ` — ${data.reference}` : ''}`}>
      <Page size="A4" style={styles.page}>
        {/* Bandeau cabinet */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.firmName}>LEXORA</Text>
            <Text style={styles.firmTag}>Département Juridique</Text>
          </View>
          <View style={styles.issuerRight}>
            <Text style={styles.issuerName}>{data.emetteur.nom}</Text>
            {data.emetteur.brn ? <Text style={styles.small}>BRN : {data.emetteur.brn}</Text> : null}
            {data.emetteur.adresse ? <Text style={styles.small}>{data.emetteur.adresse}</Text> : null}
            <Text style={styles.small}>République de Maurice</Text>
          </View>
        </View>

        {/* Destinataire */}
        <View style={styles.recipientBox}>
          <Text style={styles.recipientLabel}>À l'attention de</Text>
          <Text style={styles.recipientName}>{data.destinataire.nom}</Text>
          {data.destinataire.adresse ? <Text style={styles.recipientAddr}>{data.destinataire.adresse}</Text> : null}
        </View>

        {/* Lieu / date */}
        <Text style={styles.placeDate}>
          {data.lieu || 'Port-Louis'}, le {dateFr(data.date)}
        </Text>

        {data.reference ? <Text style={styles.ref}>Réf. : {data.reference}</Text> : null}

        {/* Objet */}
        <View style={styles.objetRow}>
          <Text style={styles.objetLabel}>Objet :</Text>
          <Text style={styles.objetText}>{data.objet || data.titre}</Text>
        </View>

        {/* Montant mis en évidence */}
        {data.montant != null ? (
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Montant réclamé</Text>
            <Text style={styles.amountValue}>{fmtMontant(data.montant, data.devise)}</Text>
          </View>
        ) : null}

        {/* Corps */}
        <View style={styles.body}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={styles.para}>
              {p.trim()}
            </Text>
          ))}
        </View>

        {/* Signature */}
        <View style={styles.signBlock}>
          <Text style={styles.signFor}>Pour {data.emetteur.nom},</Text>
          {data.signataire ? <Text style={styles.signName}>{data.signataire}</Text> : null}
          <Text style={styles.signLine}>Signature</Text>
        </View>

        {/* Pied de page */}
        <View style={styles.footer} fixed>
          <Text style={styles.draftBadge}>
            PROJET — document généré par le Département Juridique Lexora · relecture par un avocat / attorney requise avant envoi
          </Text>
          <Text style={styles.footerLegal}>
            Lexora ne fournit pas de conseil juridique réglementé. Document à valeur de projet de travail. République de Maurice.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
