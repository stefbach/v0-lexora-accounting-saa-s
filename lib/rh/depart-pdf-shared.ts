/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helpers + styles partagés pour les PDF RH (départ, attestation,
 * certificat, solde de tout compte, workfare). Garantit une
 * identité visuelle uniforme et professionnelle.
 */

import React from 'react'
import { StyleSheet, View, Text } from '@react-pdf/renderer'

export const C = {
  navy: '#0B0F2E',
  gold: '#D4AF37',
  goldSoft: '#F8E8B0',
  border: '#E5E7EB',
  text: '#1F2937',
  muted: '#6B7280',
  red: '#B91C1C',
  green: '#15803D',
  bg: '#FFFFFF',
  bgSoft: '#F8F9FC',
}

export const TYPE_LABELS: Record<string, string> = {
  demission: 'Démission volontaire',
  licenciement: 'Licenciement (motif économique)',
  licenciement_faute: 'Licenciement pour faute',
  fin_contrat: 'Fin de contrat à durée déterminée',
  retraite: 'Départ à la retraite',
  deces: 'Décès',
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  if (isNaN(dt.getTime())) return '—'
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}

export function fmtMur(n: number | null | undefined): string {
  const v = Number(n) || 0
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v).replace(/[\u00a0\u202f\u2009]/g, ' ') + ' MUR'
}

export function ancienneteLabel(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const s = new Date(String(start).slice(0, 10) + 'T00:00:00')
  const e = new Date(String(end).slice(0, 10) + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '—'
  let years = e.getFullYear() - s.getFullYear()
  let months = e.getMonth() - s.getMonth()
  let days = e.getDate() - s.getDate()
  if (days < 0) { months -= 1; days += 30 }
  if (months < 0) { years -= 1; months += 12 }
  return `${years} an(s), ${months} mois, ${days} jour(s)`
}

export const sharedStyles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40,
    fontFamily: 'Helvetica', fontSize: 10, color: C.text, lineHeight: 1.5,
  },

  // Header
  headerBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingBottom: 14, marginBottom: 16,
    borderBottomWidth: 2, borderBottomColor: C.gold,
  },
  headerLeft: { flex: 1 },
  headerLogo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: 1 },
  headerLogoAccent: { color: C.gold },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 4 },
  companyMeta: { fontSize: 8, color: C.muted, marginTop: 2, lineHeight: 1.4 },
  headerRight: { width: 220, alignItems: 'flex-end' },
  docKind: {
    fontSize: 8, color: C.gold, letterSpacing: 2, textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
  },
  docNumber: {
    fontSize: 9, color: C.muted, marginTop: 2,
  },
  docDate: { fontSize: 9, color: C.muted, marginTop: 2 },

  // Title
  docTitle: {
    fontSize: 18, fontFamily: 'Helvetica-Bold',
    color: C.navy, textAlign: 'center',
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginVertical: 14,
  },
  subTitle: {
    fontSize: 9, color: C.muted, textAlign: 'center',
    marginTop: -8, marginBottom: 16, fontStyle: 'italic',
  },

  // Sections
  section: { marginTop: 6, marginBottom: 6 },
  sectionTitle: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingBottom: 4, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  paragraph: { fontSize: 10, marginBottom: 8, textAlign: 'justify', lineHeight: 1.5 },
  bold: { fontFamily: 'Helvetica-Bold' },

  // Two columns info block
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  infoCell: { width: '50%', paddingVertical: 3, paddingRight: 8 },
  infoLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 1 },

  // Table
  tableHead: {
    flexDirection: 'row', backgroundColor: C.navy,
    paddingVertical: 7, paddingHorizontal: 8, marginTop: 6,
  },
  tableHeadCell: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8,
    borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  tableRowAlt: { backgroundColor: C.bgSoft },
  cellLabel: { flex: 5, fontSize: 9 },
  cellDetail: { flex: 4, fontSize: 8, color: C.muted },
  cellAmount: { flex: 2, fontSize: 9, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalRow: {
    flexDirection: 'row', padding: 10, marginTop: 6,
    backgroundColor: C.navy, borderRadius: 2,
  },
  totalLabel: { flex: 9, color: C.gold, fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  totalValue: { flex: 2, color: C.gold, fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  // Signatures
  sigBlock: { marginTop: 28, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox: { width: '45%' },
  sigCaption: { fontSize: 8, color: C.muted },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#374151', marginTop: 56, marginBottom: 4 },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  sigHint: { fontSize: 7, color: C.muted, marginTop: 1 },

  // Footer
  pageFooter: {
    position: 'absolute', bottom: 20, left: 40, right: 40,
    paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.border,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: C.muted },

  // Watermark BROUILLON
  watermark: {
    position: 'absolute',
    top: 320, left: 80, width: 440,
    transform: 'rotate(-22deg)',
    fontSize: 92, color: 'rgba(212,175,55,0.16)',
    fontFamily: 'Helvetica-Bold', textAlign: 'center',
    letterSpacing: 6,
  },
})

// ---- Composants partagés ----

export function PdfHeader({ soc, docKind, docNumber }: { soc: any; docKind: string; docNumber?: string }) {
  const meta: string[] = []
  if (soc?.adresse) meta.push(soc.adresse)
  if (soc?.ville) meta.push(soc.ville)
  const ids: string[] = []
  if (soc?.brn) ids.push(`BRN ${soc.brn}`)
  if (soc?.ern) ids.push(`ERN ${soc.ern}`)
  if (soc?.numero_tva_mra || soc?.vat_number) ids.push(`VAT ${soc.numero_tva_mra || soc.vat_number}`)

  return React.createElement(View, { style: sharedStyles.headerBar },
    React.createElement(View, { style: sharedStyles.headerLeft },
      React.createElement(Text, { style: sharedStyles.companyName }, soc?.nom || 'Société'),
      meta.length > 0 ? React.createElement(Text, { style: sharedStyles.companyMeta }, meta.join(' — ')) : null,
      ids.length > 0 ? React.createElement(Text, { style: sharedStyles.companyMeta }, ids.join(' · ')) : null,
      soc?.telephone || soc?.email ? React.createElement(Text, { style: sharedStyles.companyMeta },
        [soc.telephone, soc.email].filter(Boolean).join(' · ')) : null,
    ),
    React.createElement(View, { style: sharedStyles.headerRight },
      React.createElement(Text, { style: sharedStyles.docKind }, docKind),
      docNumber ? React.createElement(Text, { style: sharedStyles.docNumber }, `N° ${docNumber}`) : null,
      React.createElement(Text, { style: sharedStyles.docDate }, `Émis le ${fmtDate(new Date().toISOString().slice(0, 10))}`),
    ),
  )
}

export function PdfFooter({ legal }: { legal?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @react-pdf/renderer props `fixed`/`render` non typés sur React.createElement
  return React.createElement(View, { style: sharedStyles.pageFooter, fixed: true } as any,
    React.createElement(Text, { style: sharedStyles.footerText },
      legal || "Conforme au Workers' Rights Act 2019 (Mauritius)."
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @react-pdf/renderer `render` callback typing
    React.createElement(Text, { style: sharedStyles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` } as any),
  )
}

export function PdfWatermark({ text = 'BROUILLON' }: { text?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @react-pdf/renderer `fixed` prop non typé sur React.createElement
  return React.createElement(Text, { style: sharedStyles.watermark, fixed: true } as any, text)
}

export function SigBlock({ socName, empFullName, dateLieu }: { socName: string; empFullName: string; dateLieu: string }) {
  return React.createElement(View, { style: { marginTop: 22 } },
    React.createElement(Text, { style: { fontSize: 10, marginBottom: 4 } }, dateLieu),
    React.createElement(View, { style: sharedStyles.sigBlock },
      React.createElement(View, { style: sharedStyles.sigBox },
        React.createElement(Text, { style: sharedStyles.sigCaption }, "Pour l'employeur"),
        React.createElement(View, { style: sharedStyles.sigLine }),
        React.createElement(Text, { style: sharedStyles.sigName }, socName),
        React.createElement(Text, { style: sharedStyles.sigHint }, 'Signature et cachet'),
      ),
      React.createElement(View, { style: sharedStyles.sigBox },
        React.createElement(Text, { style: sharedStyles.sigCaption }, "L'employé(e)"),
        React.createElement(View, { style: sharedStyles.sigLine }),
        React.createElement(Text, { style: sharedStyles.sigName }, empFullName),
        React.createElement(Text, { style: sharedStyles.sigHint }, 'Lu et approuvé — signature manuscrite'),
      ),
    ),
  )
}
