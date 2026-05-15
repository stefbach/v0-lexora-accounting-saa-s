import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export const dynamic = 'force-dynamic'

// ============================================================================
// MRA VAT Return Export — PDF (filing form) + CSV (Schedule A/B detail)
// ============================================================================
// PDF mirrors the MRA VAT Return form layout: 1 page, header (BRN/VAT/period),
// Output Tax section, Input Tax section, Summary, signature block.
// CSV produces Schedule A (purchases) or Schedule B (sales) — one row per
// invoice — for archival and bulk-upload to the MRA portal.
// ============================================================================

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const styles = StyleSheet.create({
  page:    { padding: 24, fontSize: 9, fontFamily: 'Helvetica' },
  h1:      { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  h2:      { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 12, color: '#444' },
  section: { marginTop: 10, marginBottom: 6, padding: 6, backgroundColor: '#0B0F2E', color: '#fff', fontSize: 10, fontWeight: 'bold' },
  row:     { flexDirection: 'row', borderBottom: '1pt solid #ddd', paddingVertical: 3 },
  cellL:   { flex: 3, paddingHorizontal: 4 },
  cellR:   { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  bold:    { fontWeight: 'bold' },
  hdrBlock:{ flexDirection: 'row', justifyContent: 'space-between', borderTop: '1pt solid #0B0F2E', borderBottom: '1pt solid #0B0F2E', paddingVertical: 6, marginBottom: 6 },
  hdrCol:  { flex: 1, paddingHorizontal: 4 },
  hdrLabel:{ color: '#666', fontSize: 8 },
  hdrVal:  { fontSize: 10, fontWeight: 'bold' },
  total:   { flexDirection: 'row', backgroundColor: '#f4f4f4', padding: 6, marginTop: 4, fontWeight: 'bold' },
  small:   { fontSize: 8, color: '#666', marginTop: 6 },
})

interface PdfProps {
  societe: { nom: string; brn: string | null; numero_tva_mra: string | null; tan_societe: string | null; registered_office: string | null; mra_declarant_name: string | null }
  periode: string
  date_limite: string
  boxes: { box1: number; box2: number; box3: number; box4: number; box5: number; box6: number; box7: number; box8: number; box9: number }
  bases: { taxable_15: number; taxable_other: number; export_zr: number; exonere: number; ca_ht_total: number }
  synthese: { tva_collectee: number; tva_deductible: number; credit_reporte: number; tva_nette: number; penalites: number; interets: number; total_a_payer: number }
}

function VatReturnPdf(props: PdfProps) {
  const { societe, periode, date_limite, boxes, bases, synthese } = props
  return React.createElement(
    Document, {},
    React.createElement(
      Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.h1 }, 'VAT Return — Mauritius Revenue Authority'),
      React.createElement(Text, { style: styles.h2 }, `Période : ${periode}  ·  Date limite : ${date_limite}`),

      React.createElement(View, { style: styles.hdrBlock },
        React.createElement(View, { style: styles.hdrCol },
          React.createElement(Text, { style: styles.hdrLabel }, 'Business name'),
          React.createElement(Text, { style: styles.hdrVal }, societe.nom),
        ),
        React.createElement(View, { style: styles.hdrCol },
          React.createElement(Text, { style: styles.hdrLabel }, 'BRN'),
          React.createElement(Text, { style: styles.hdrVal }, societe.brn || '—'),
        ),
        React.createElement(View, { style: styles.hdrCol },
          React.createElement(Text, { style: styles.hdrLabel }, 'VAT Reg. No.'),
          React.createElement(Text, { style: styles.hdrVal }, societe.numero_tva_mra || '—'),
        ),
        React.createElement(View, { style: styles.hdrCol },
          React.createElement(Text, { style: styles.hdrLabel }, 'TAN'),
          React.createElement(Text, { style: styles.hdrVal }, societe.tan_societe || '—'),
        ),
      ),

      societe.registered_office
        ? React.createElement(Text, { style: styles.small }, `Adresse : ${societe.registered_office}`)
        : null,

      // Output Tax
      React.createElement(Text, { style: styles.section }, 'A · Output Tax (TVA collectée)'),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Standard rated supplies (15%) — base HT'),
        React.createElement(Text, { style: styles.cellR }, fmt(bases.taxable_15)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 1 — VAT on standard rated supplies'),
        React.createElement(Text, { style: { ...styles.cellR, ...styles.bold } }, fmt(boxes.box1)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 2 — Taxable exports'),
        React.createElement(Text, { style: styles.cellR }, fmt(boxes.box2)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 3 — Exempt supplies (HT)'),
        React.createElement(Text, { style: styles.cellR }, fmt(Math.max(boxes.box3, bases.exonere))),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 4 — Reverse charge (output)'),
        React.createElement(Text, { style: styles.cellR }, fmt(boxes.box4)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 6 — Zero-rated exports (HT)'),
        React.createElement(Text, { style: styles.cellR }, fmt(Math.max(boxes.box6, bases.export_zr))),
      ),

      // Input Tax
      React.createElement(Text, { style: styles.section }, 'B · Input Tax (TVA déductible)'),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 5 — Reverse charge input'),
        React.createElement(Text, { style: styles.cellR }, fmt(boxes.box5)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 7 — Capital goods VAT'),
        React.createElement(Text, { style: styles.cellR }, fmt(boxes.box7)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 8 — Bad debt relief'),
        React.createElement(Text, { style: styles.cellR }, fmt(boxes.box8)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Box 9 — Other input VAT'),
        React.createElement(Text, { style: { ...styles.cellR, ...styles.bold } }, fmt(boxes.box9)),
      ),

      // Summary
      React.createElement(Text, { style: styles.section }, 'C · Synthèse'),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Total CA HT (toutes catégories)'),
        React.createElement(Text, { style: styles.cellR }, fmt(bases.ca_ht_total) + ' MUR'),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Total Output Tax (Box 1 + 4)'),
        React.createElement(Text, { style: styles.cellR }, fmt(synthese.tva_collectee)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Total Input Tax (Box 5 + 7 + 8 + 9)'),
        React.createElement(Text, { style: styles.cellR }, fmt(synthese.tva_deductible)),
      ),
      React.createElement(View, { style: styles.row },
        React.createElement(Text, { style: styles.cellL }, 'Crédit reporté période précédente'),
        React.createElement(Text, { style: styles.cellR }, fmt(synthese.credit_reporte)),
      ),
      React.createElement(View, { style: styles.total },
        React.createElement(Text, { style: styles.cellL }, 'TVA NETTE À PAYER (ou crédit si négatif)'),
        React.createElement(Text, { style: styles.cellR }, fmt(synthese.tva_nette) + ' MUR'),
      ),

      synthese.penalites > 0 || synthese.interets > 0
        ? React.createElement(View, {},
            React.createElement(View, { style: styles.row },
              React.createElement(Text, { style: styles.cellL }, 'Pénalités de retard'),
              React.createElement(Text, { style: styles.cellR }, fmt(synthese.penalites)),
            ),
            React.createElement(View, { style: styles.row },
              React.createElement(Text, { style: styles.cellL }, 'Intérêts de retard'),
              React.createElement(Text, { style: styles.cellR }, fmt(synthese.interets)),
            ),
            React.createElement(View, { style: styles.total },
              React.createElement(Text, { style: styles.cellL }, 'TOTAL À RÉGLER'),
              React.createElement(Text, { style: styles.cellR }, fmt(synthese.total_a_payer) + ' MUR'),
            ),
          )
        : null,

      React.createElement(Text, { style: { ...styles.small, marginTop: 18 } },
        `Déclarant : ${societe.mra_declarant_name || '________________________'}`),
      React.createElement(Text, { style: styles.small },
        `Date : ________________________     Signature : ________________________`),
      React.createElement(Text, { style: { ...styles.small, marginTop: 12, fontStyle: 'italic' } },
        `Document généré automatiquement par Lexora — à reporter sur le portail e-Filing MRA (https://eservices1.mra.mu/) avant le ${date_limite}.`),
    ),
  )
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildSalesCsv(factures: any[]): string {
  const header = ['Date', 'Numero', 'Type', 'Tiers', 'Devise', 'Taux', 'HT_devise', 'TVA_devise', 'TTC_devise', 'TTC_MUR', 'Taux_TVA', 'Categorie']
  const rows = factures.map(f => {
    const isExport = (f.devise && f.devise !== 'MUR') || f.client_offshore
    const cat = isExport ? 'Export zero-rated'
      : (Number(f.taux_tva) === 0 ? 'Exonéré'
      : (Number(f.taux_tva) === 15 ? 'Standard 15%' : `Autre ${f.taux_tva}%`))
    // Avoirs (credit notes) : montants signés négativement pour qu'à
    // l'agrégation MRA Schedule B, le CA soit correct (facture - avoir).
    const sign = f.type_document === 'avoir' ? -1 : 1
    return [
      f.date_facture, f.numero_facture, f.type_document || 'facture',
      f.tiers || '', f.devise || 'MUR', f.taux_change || 1,
      sign * (Number(f.montant_ht)  || 0),
      sign * (Number(f.montant_tva) || 0),
      sign * (Number(f.montant_ttc) || 0),
      sign * (Number(f.montant_mur) || 0),
      f.taux_tva || 0, cat
    ].map(csvEscape).join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

function buildPurchasesCsv(factures: any[]): string {
  const header = ['Date', 'Numero', 'Fournisseur', 'BRN_fournisseur', 'Devise', 'Taux', 'HT_devise', 'TVA_devise', 'TTC_devise', 'TTC_MUR', 'Taux_TVA', 'Capital_goods']
  const rows = factures.map(f => [
    f.date_facture, f.numero_facture || '', f.tiers || '', f.brn_tiers || '',
    f.devise || 'MUR', f.taux_change || 1,
    f.montant_ht || 0, f.montant_tva || 0, f.montant_ttc || 0,
    f.montant_mur || 0, f.taux_tva || 0, f.capital_goods ? 'Y' : 'N',
  ].map(csvEscape).join(','))
  return [header.join(','), ...rows].join('\n')
}

export async function GET(request: Request) {
  try {
    // Internal bypass (bot Telegram / cron) ou session normale
    const internal = resolveInternalAuth(request)
    if (!internal) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode    = searchParams.get('periode')
    const format     = (searchParams.get('format') || 'pdf').toLowerCase()

    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'Format periode invalide (YYYY-MM)' }, { status: 400 })
    }

    const date_debut = `${periode}-01`
    const [year, month] = periode.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const date_fin = `${periode}-${String(lastDay).padStart(2, '0')}`

    // Société
    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('nom, brn, numero_tva_mra, statut_tva, tan_societe, registered_office, mra_declarant_name')
      .eq('id', societe_id)
      .maybeSingle()
    if (socErr || !societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

    if (!societe.statut_tva) {
      return NextResponse.json({
        error: `Société "${societe.nom}" non assujettie à la TVA — pas de déclaration à produire.`
      }, { status: 400 })
    }

    if (format === 'sales_csv' || format === 'purchases_csv') {
      const typeFacture = format === 'sales_csv' ? 'client' : 'fournisseur'
      const { data: factures } = await supabase
        .from('factures')
        .select('date_facture, numero_facture, type_document, tiers, devise, taux_change, montant_ht, montant_tva, montant_ttc, montant_mur, taux_tva, client_offshore')
        .eq('societe_id', societe_id)
        .eq('type_facture', typeFacture)
        .gte('date_facture', date_debut)
        .lte('date_facture', date_fin)
        .neq('statut', 'brouillon')
        .order('date_facture')

      const csv = format === 'sales_csv'
        ? buildSalesCsv(factures || [])
        : buildPurchasesCsv(factures || [])

      const filename = `TVA_${format === 'sales_csv' ? 'ventes' : 'achats'}_${societe.nom.replace(/[^a-z0-9]+/gi, '_')}_${periode}.csv`
      return new NextResponse('﻿' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // PDF — relit la dernière TVA calculée
    const { data: tvaRow } = await supabase
      .from('tva_mensuelle')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('periode', periode)
      .maybeSingle()

    if (!tvaRow) {
      return NextResponse.json({
        error: 'Aucune TVA calculée pour cette période. Cliquez d\'abord sur "Calculer".'
      }, { status: 404 })
    }

    // Recalcul des bases HT (depuis factures) pour le PDF — même logique que /calculer
    const { data: facturesPeriode } = await supabase
      .from('factures')
      .select('devise, taux_change, montant_ht, montant_tva, montant_ttc, montant_mur, taux_tva, client_offshore, statut, type_document')
      .eq('societe_id', societe_id).eq('type_facture', 'client')
      .gte('date_facture', date_debut).lte('date_facture', date_fin)
      .neq('statut', 'brouillon')

    let base_export_zr = 0, base_exonere = 0, base_taxable_15 = 0, base_taxable_other = 0
    for (const f of facturesPeriode || []) {
      const ttc = Number(f.montant_ttc) || 0
      const ht  = Number(f.montant_ht)  || 0
      const ttcMur = Number(f.montant_mur) || 0
      const htMur = ttc > 0 ? (ht / ttc) * ttcMur : (ht * (Number(f.taux_change) || 1))
      const sign = f.type_document === 'avoir' ? -1 : 1
      const isExport = (f.devise && f.devise !== 'MUR') || !!f.client_offshore
      const tauxTva = Number(f.taux_tva) || 0
      if (isExport) base_export_zr += sign * htMur
      else if (tauxTva === 0) base_exonere += sign * htMur
      else if (tauxTva === 15) base_taxable_15 += sign * htMur
      else base_taxable_other += sign * htMur
    }

    const date_limite = (tvaRow as any).date_limite || ''

    const props: PdfProps = {
      societe: {
        nom: societe.nom,
        brn: societe.brn,
        numero_tva_mra: societe.numero_tva_mra,
        tan_societe: societe.tan_societe,
        registered_office: societe.registered_office,
        mra_declarant_name: societe.mra_declarant_name,
      },
      periode, date_limite,
      boxes: {
        box1: Number((tvaRow as any).box1_output_standard) || 0,
        box2: Number((tvaRow as any).box2_exports_taxable) || 0,
        box3: Number((tvaRow as any).box3_exempt_supplies) || 0,
        box4: Number((tvaRow as any).box4_reverse_charge_output) || 0,
        box5: Number((tvaRow as any).box5_reverse_charge_input) || 0,
        box6: Number((tvaRow as any).box6_exports_zero_rated) || 0,
        box7: Number((tvaRow as any).box7_capital_goods) || 0,
        box8: Number((tvaRow as any).box8_bad_debt_relief) || 0,
        box9: Number((tvaRow as any).box9_input_other) || 0,
      },
      bases: {
        taxable_15: Math.round(base_taxable_15 * 100) / 100,
        taxable_other: Math.round(base_taxable_other * 100) / 100,
        export_zr: Math.round(base_export_zr * 100) / 100,
        exonere: Math.round(base_exonere * 100) / 100,
        ca_ht_total: Math.round((base_taxable_15 + base_taxable_other + base_export_zr + base_exonere) * 100) / 100,
      },
      synthese: {
        tva_collectee: Number((tvaRow as any).tva_collectee) || 0,
        tva_deductible: Number((tvaRow as any).tva_deductible) || 0,
        credit_reporte: Number((tvaRow as any).credit_reporte) || 0,
        tva_nette: Number((tvaRow as any).tva_nette) || 0,
        penalites: Number((tvaRow as any).penalites_retard) || 0,
        interets: Number((tvaRow as any).interets_retard) || 0,
        total_a_payer: (Number((tvaRow as any).tva_nette) || 0)
                     + (Number((tvaRow as any).penalites_retard) || 0)
                     + (Number((tvaRow as any).interets_retard) || 0),
      },
    }

    const buf = await renderToBuffer(VatReturnPdf(props) as any)
    const filename = `TVA_Return_${societe.nom.replace(/[^a-z0-9]+/gi, '_')}_${periode}.pdf`
    return new NextResponse(buf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: unknown) {
    console.error('[tva/export]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
