import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF batch — plusieurs factures concaténées dans un seul PDF.
 *
 * POST /api/client/factures/export-batch
 *   body: { facture_ids: string[], societe_id: string }
 *
 * Document : 1 page récap (table de toutes les factures) + 1 page par facture
 * avec le détail (HT/TVA/TTC, tiers, dates, statut, etc.). Multi-devise :
 * affiche le montant dans la devise d'origine ET la conversion MUR.
 */

const styles = StyleSheet.create({
  page:       { padding: 32, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', lineHeight: 1.4 },
  header:     { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 8, marginBottom: 12 },
  company:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 2 },
  title:      { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  subtitle:   { fontSize: 8, color: '#666', marginTop: 1 },
  recapHd:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 8, marginTop: 6 },
  thead:      { flexDirection: 'row', paddingVertical: 4, backgroundColor: '#f4f4f8', borderBottomWidth: 0.5, borderBottomColor: '#999' },
  th:         { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#444' },
  row:        { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: '#eee' },
  colDate:    { width: '12%', fontSize: 8 },
  colNum:     { width: '14%', fontSize: 8 },
  colType:    { width: '10%', fontSize: 8 },
  colTiers:   { width: '28%', fontSize: 8 },
  colMontant: { width: '14%', fontSize: 8, textAlign: 'right' },
  colDevise:  { width: '8%', fontSize: 8 },
  colStatut:  { width: '14%', fontSize: 8 },
  totRow:     { flexDirection: 'row', paddingVertical: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: '#0B0F2E', backgroundColor: '#fafafa' },
  totLb:      { width: '64%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  totMnt:     { width: '14%', fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right' },
  // Page facture
  facTitle:   { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 4 },
  facMeta:    { flexDirection: 'row', marginBottom: 16, marginTop: 8 },
  facMetaCol: { flex: 1 },
  facMetaLb:  { fontSize: 8, color: '#888', textTransform: 'uppercase' },
  facMetaVal: { fontSize: 10, color: '#1a1a1a', marginTop: 2 },
  amountBox:  { borderWidth: 1, borderColor: '#0B0F2E', padding: 12, marginTop: 12, backgroundColor: '#f8f8fb' },
  amountRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  amountLb:   { fontSize: 9, color: '#444' },
  amountVal:  { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  amountTot:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right' },
  desc:       { fontSize: 9, color: '#444', marginTop: 8, lineHeight: 1.4 },
  footer:     { position: 'absolute', bottom: 18, left: 32, right: 32, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 4 },
})

const fmtMnt = (n: number | null | undefined, dev = 'MUR'): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  const v = Number(n)
  const abs = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '(' + abs + ')' : abs} ${dev}`
}
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const facture_ids: string[] = Array.isArray(body?.facture_ids) ? body.facture_ids : []
    const societe_id: string | null = body?.societe_id || null

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (facture_ids.length === 0) return NextResponse.json({ error: 'facture_ids vide' }, { status: 400 })
    if (facture_ids.length > 200) return NextResponse.json({ error: 'Trop de factures (max 200)' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e, { societe_id, user_id: user.id })
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    const { data: factures } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, description, type_facture, date_facture, date_echeance, devise, taux_change, montant_ht, montant_tva, montant_ttc, montant_mur, statut, notes')
      .in('id', facture_ids)
      .eq('societe_id', societe_id)
      .order('date_facture', { ascending: false })

    if (!factures || factures.length === 0) {
      return NextResponse.json({ error: 'Aucune facture accessible' }, { status: 404 })
    }

    const { data: societe } = await supabase
      .from('societes').select('nom, brn, vat_number').eq('id', societe_id).single()

    const elt = React.createElement

    // Récap totaux MUR (devise pivot)
    let totMUR = 0
    for (const f of factures) totMUR += Number(f.montant_mur) || Number(f.montant_ttc) || 0

    const recapRows = factures.map((f: any) =>
      elt(View, { key: `recap-${f.id}`, style: styles.row },
        elt(Text, { style: styles.colDate }, fmtDate(f.date_facture)),
        elt(Text, { style: styles.colNum }, (f.numero_facture as string) || f.id.slice(0, 8)),
        elt(Text, { style: styles.colType }, f.type_facture === 'client' ? 'Client' : 'Fournisseur'),
        elt(Text, { style: styles.colTiers }, (f.tiers as string) || '—'),
        elt(Text, { style: styles.colMontant }, fmtMnt(f.montant_ttc, f.devise || 'MUR')),
        elt(Text, { style: styles.colDevise }, f.devise || 'MUR'),
        elt(Text, { style: styles.colStatut }, (f.statut as string) || '—'),
      ),
    )

    // 1ère page : récap
    const recapPage = elt(Page, { size: 'A4', style: styles.page, key: 'recap' },
      elt(View, { style: styles.header },
        elt(Text, { style: styles.company }, societe?.nom || '—'),
        societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn}${societe?.vat_number ? ' · TVA : ' + societe.vat_number : ''}`),
        elt(Text, { style: styles.title }, `Export factures (${factures.length})`),
        elt(Text, { style: styles.subtitle }, `Généré le ${new Date().toLocaleDateString('fr-FR')} · Multi-devise — total cumulé en MUR`),
      ),
      elt(Text, { style: styles.recapHd }, 'Récapitulatif'),
      elt(View, { style: styles.thead },
        elt(Text, { style: [styles.colDate, styles.th] }, 'Date'),
        elt(Text, { style: [styles.colNum, styles.th] }, 'N°'),
        elt(Text, { style: [styles.colType, styles.th] }, 'Type'),
        elt(Text, { style: [styles.colTiers, styles.th] }, 'Tiers'),
        elt(Text, { style: [styles.colMontant, styles.th] }, 'Montant TTC'),
        elt(Text, { style: [styles.colDevise, styles.th] }, 'Dev.'),
        elt(Text, { style: [styles.colStatut, styles.th] }, 'Statut'),
      ),
      ...recapRows,
      elt(View, { style: styles.totRow },
        elt(Text, { style: styles.totLb }, `Total cumulé (${factures.length} facture${factures.length > 1 ? 's' : ''})`),
        elt(Text, { style: styles.totMnt }, fmtMnt(totMUR, 'MUR')),
        elt(Text, { style: { width: '22%' } }, ''),
      ),
      elt(View, { style: styles.footer, fixed: true },
        elt(Text, {}, `${societe?.nom || ''} · Export factures batch · ${factures.length} facture(s)`),
      ),
    )

    // Pages détail : 1 par facture
    const detailPages = factures.map((f: any) => {
      const isClient = f.type_facture === 'client'
      return elt(Page, { size: 'A4', style: styles.page, key: `fac-${f.id}` },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe?.nom || '—'),
          elt(Text, { style: styles.title }, `${isClient ? 'Facture client' : 'Facture fournisseur'} · ${f.numero_facture || f.id.slice(0, 8)}`),
          elt(Text, { style: styles.subtitle }, `Statut : ${f.statut || '—'}`),
        ),
        elt(View, { style: styles.facMeta },
          elt(View, { style: styles.facMetaCol },
            elt(Text, { style: styles.facMetaLb }, isClient ? 'Client' : 'Fournisseur'),
            elt(Text, { style: styles.facMetaVal }, (f.tiers as string) || '—'),
          ),
          elt(View, { style: styles.facMetaCol },
            elt(Text, { style: styles.facMetaLb }, 'Date facture'),
            elt(Text, { style: styles.facMetaVal }, fmtDate(f.date_facture)),
          ),
          elt(View, { style: styles.facMetaCol },
            elt(Text, { style: styles.facMetaLb }, 'Date échéance'),
            elt(Text, { style: styles.facMetaVal }, fmtDate(f.date_echeance)),
          ),
        ),
        f.description && elt(Text, { style: styles.desc }, (f.description as string)),
        elt(View, { style: styles.amountBox },
          elt(View, { style: styles.amountRow },
            elt(Text, { style: styles.amountLb }, 'Montant HT'),
            elt(Text, { style: styles.amountVal }, fmtMnt(f.montant_ht, f.devise || 'MUR')),
          ),
          elt(View, { style: styles.amountRow },
            elt(Text, { style: styles.amountLb }, 'TVA'),
            elt(Text, { style: styles.amountVal }, fmtMnt(f.montant_tva, f.devise || 'MUR')),
          ),
          elt(View, { style: [styles.amountRow, { borderTopWidth: 0.5, borderTopColor: '#999', marginTop: 4, paddingTop: 6 }] },
            elt(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold' } }, 'TOTAL TTC'),
            elt(Text, { style: styles.amountTot }, fmtMnt(f.montant_ttc, f.devise || 'MUR')),
          ),
          (f.devise && f.devise !== 'MUR' && f.montant_mur) ? elt(View, { style: [styles.amountRow, { marginTop: 4 }] },
            elt(Text, { style: { fontSize: 8, color: '#888' } }, `Conversion (taux ${f.taux_change || '—'})`),
            elt(Text, { style: { fontSize: 9, color: '#666', textAlign: 'right' } }, fmtMnt(f.montant_mur, 'MUR')),
          ) : null,
        ),
        f.notes && elt(Text, { style: [styles.desc, { marginTop: 16, fontStyle: 'italic' }] }, `Notes : ${f.notes as string}`),
        elt(View, { style: styles.footer, fixed: true },
          elt(Text, {}, `${societe?.nom || ''} · Facture ${f.numero_facture || ''} · Document confidentiel`),
        ),
      )
    })

    const doc = elt(Document, {}, recapPage, ...detailPages)

    const buffer = await renderToBuffer(doc as any)
    const today = new Date().toISOString().slice(0, 10)
    const fname = `factures_batch_${today}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PDF batch' }, { status: 500 })
  }
}
