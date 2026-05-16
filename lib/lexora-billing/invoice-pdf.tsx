/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PDF facture Lexora (Digital Data Solutions Ltd) — react-pdf.
 *
 * Layout : entête DDS (raison sociale, BRN, VAT, adresse), bloc client,
 * tableau lignes, totaux HT/TVA/TTC, footer avec coordonnées bancaires
 * (IBAN, BIC, banque) pour le virement.
 */

import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { LexoraInvoice } from './types'

const C = {
  navy: '#0B0F2E',
  gold: '#D4AF37',
  muted: '#6B7280',
  border: '#E5E7EB',
  light: '#F8F9FC',
}

const styles = StyleSheet.create({
  page:      { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1F2937' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  issuerBox: { flex: 1 },
  issuerName:{ fontSize: 16, fontWeight: 'bold', color: C.navy, marginBottom: 2 },
  small:     { fontSize: 8, color: C.muted, lineHeight: 1.5 },
  badgeBox:  { width: 200, alignItems: 'flex-end' },
  invTitle:  { fontSize: 22, fontWeight: 'bold', color: C.gold, marginBottom: 8 },
  invMeta:   { fontSize: 9, textAlign: 'right' },
  metaLine:  { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel: { fontSize: 8, color: C.muted, marginRight: 8 },
  metaValue: { fontSize: 9, fontWeight: 'bold', color: C.navy },

  divider:   { borderTopWidth: 1, borderTopColor: C.gold, marginVertical: 12 },

  twoCol:    { flexDirection: 'row', gap: 16, marginBottom: 16 },
  card:      { flex: 1, backgroundColor: C.light, padding: 10, borderRadius: 4 },
  cardLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  cardName:  { fontSize: 11, fontWeight: 'bold', color: C.navy, marginBottom: 3 },
  cardText:  { fontSize: 9, color: '#374151', lineHeight: 1.5 },

  tableHead: { flexDirection: 'row', backgroundColor: C.navy, color: '#fff', paddingVertical: 8, paddingHorizontal: 6, marginTop: 8 },
  tableHeadCell: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  row:       { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  cellDesig: { flex: 4 },
  cellQty:   { flex: 1, textAlign: 'right' },
  cellPrice: { flex: 2, textAlign: 'right' },
  cellTotal: { flex: 2, textAlign: 'right' },

  totalsBox: { marginTop: 12, marginLeft: 'auto', width: 240 },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel:{ fontSize: 9, color: C.muted },
  totalValue:{ fontSize: 10, fontWeight: 'bold', color: C.navy },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.gold, marginTop: 6, borderRadius: 4 },
  grandLabel:{ fontSize: 11, fontWeight: 'bold', color: C.navy },
  grandValue:{ fontSize: 13, fontWeight: 'bold', color: C.navy },

  footer:    { position: 'absolute', bottom: 30, left: 32, right: 32, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  footerTitle:{ fontSize: 9, fontWeight: 'bold', color: C.navy, marginBottom: 4 },
  footerLine:{ fontSize: 8, color: C.muted, lineHeight: 1.4 },
  legalLine: { fontSize: 7, color: C.muted, textAlign: 'center', marginTop: 6 },
})

function fmt(n: number, devise = 'MUR'): string {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${devise}`
}

export function InvoicePdf({ invoice }: { invoice: LexoraInvoice }) {
  const issuer = invoice.issuer_snapshot
  const customer = invoice.customer_snapshot
  const lines = invoice.lines || []

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER : émetteur + bloc facture */}
        <View style={styles.header}>
          <View style={styles.issuerBox}>
            <Text style={styles.issuerName}>{issuer.raison_sociale}</Text>
            <Text style={styles.small}>
              {issuer.adresse || ''}
              {issuer.ville ? `\n${issuer.ville}` : ''}
              {issuer.pays ? `, ${issuer.pays}` : ''}
            </Text>
            <Text style={styles.small}>
              {issuer.brn ? `BRN : ${issuer.brn}` : ''}
              {issuer.vat_number ? `   ·   VAT : ${issuer.vat_number}` : ''}
            </Text>
            {issuer.telephone || issuer.email ? (
              <Text style={styles.small}>
                {issuer.telephone || ''}
                {issuer.telephone && issuer.email ? '   ·   ' : ''}
                {issuer.email || ''}
              </Text>
            ) : null}
          </View>

          <View style={styles.badgeBox}>
            <Text style={styles.invTitle}>FACTURE</Text>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>N°</Text>
              <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{invoice.invoice_date}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Échéance</Text>
              <Text style={styles.metaValue}>{invoice.due_date}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* CLIENT + REFERENCES */}
        <View style={styles.twoCol}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Facturer à</Text>
            <Text style={styles.cardName}>{customer.nom}</Text>
            {customer.dirigeant_nom ? <Text style={styles.cardText}>À l'attention de {customer.dirigeant_nom}</Text> : null}
            {customer.adresse ? <Text style={styles.cardText}>{customer.adresse}</Text> : null}
            {customer.ville ? <Text style={styles.cardText}>{customer.ville}</Text> : null}
            {customer.brn ? <Text style={styles.cardText}>BRN : {customer.brn}</Text> : null}
            {customer.vat ? <Text style={styles.cardText}>VAT : {customer.vat}</Text> : null}
            {customer.dirigeant_email ? <Text style={styles.cardText}>{customer.dirigeant_email}</Text> : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Conditions</Text>
            <Text style={styles.cardText}>Devise : {invoice.devise}</Text>
            <Text style={styles.cardText}>Échéance : {invoice.due_date}</Text>
            {invoice.cgv_accepted_at ? (
              <Text style={styles.cardText}>CGV acceptées le : {invoice.cgv_accepted_at.slice(0, 10)}</Text>
            ) : null}
            <Text style={styles.cardText}>Mode de règlement : virement bancaire</Text>
          </View>
        </View>

        {/* LIGNES */}
        <View style={styles.tableHead}>
          <Text style={[styles.tableHeadCell, styles.cellDesig]}>Désignation</Text>
          <Text style={[styles.tableHeadCell, styles.cellQty]}>Qté</Text>
          <Text style={[styles.tableHeadCell, styles.cellPrice]}>P.U. HT</Text>
          <Text style={[styles.tableHeadCell, styles.cellTotal]}>Total HT</Text>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellDesig}>{l.designation}</Text>
            <Text style={styles.cellQty}>{l.quantite}</Text>
            <Text style={styles.cellPrice}>{fmt(l.prix_unitaire_ht, invoice.devise)}</Text>
            <Text style={styles.cellTotal}>{fmt(l.montant_ht, invoice.devise)}</Text>
          </View>
        ))}

        {/* TOTAUX */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total HT</Text>
            <Text style={styles.totalValue}>{fmt(invoice.amount_ht, invoice.devise)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TVA</Text>
            <Text style={styles.totalValue}>{fmt(invoice.tva_amount, invoice.devise)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total TTC</Text>
            <Text style={styles.grandValue}>{fmt(invoice.amount_ttc, invoice.devise)}</Text>
          </View>
        </View>

        {/* FOOTER bancaire */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerTitle}>Coordonnées bancaires pour règlement</Text>
          <Text style={styles.footerLine}>
            {issuer.banque_nom ? `Banque : ${issuer.banque_nom}` : ''}
            {issuer.iban ? `   ·   IBAN : ${issuer.iban}` : ''}
            {issuer.swift_bic ? `   ·   BIC : ${issuer.swift_bic}` : ''}
          </Text>
          {issuer.numero_compte ? (
            <Text style={styles.footerLine}>Compte (MUR) : {issuer.numero_compte}</Text>
          ) : null}
          <Text style={styles.legalLine}>
            Merci d'indiquer le numéro {invoice.invoice_number} en référence du virement.
            {issuer.website ? `   ·   ${issuer.website}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
