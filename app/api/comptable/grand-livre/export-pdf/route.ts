import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF Grand-Livre — A4 paysage, groupé par compte.
 *
 * GET /api/comptable/grand-livre/export-pdf
 *   ?societe_id=<uuid>          (requis)
 *   &compte_numero=<numero>     (optionnel — filtre exact compte)
 *   &date_debut=YYYY-MM-DD
 *   &date_fin=YYYY-MM-DD
 *   &exercice=YYYY-YYYY         (raccourci : 2025-2026 → 01/07/25 → 30/06/26)
 *
 * Pendant PDF de l'export Excel (lib/grand-livre/export-xlsx). Multi-devise :
 * tous les montants sont convertis MUR en amont (table ecritures_comptables_v2
 * stocke directement debit_mur / credit_mur), donc une seule colonne montant.
 */

const styles = StyleSheet.create({
  page:       { padding: 24, fontFamily: 'Helvetica', fontSize: 8, color: '#1a1a1a', lineHeight: 1.3 },
  header:     { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 8, marginBottom: 10 },
  company:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 2 },
  title:      { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  subtitle:   { fontSize: 8, color: '#666', marginTop: 1 },
  compteHd:   { marginTop: 10, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 4, backgroundColor: '#f4f4f8', borderLeftWidth: 2, borderLeftColor: '#0B0F2E' },
  compteTtl:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  compteSub:  { fontSize: 7, color: '#666' },
  thead:      { flexDirection: 'row', paddingVertical: 3, backgroundColor: '#eaeaea', borderBottomWidth: 0.5, borderBottomColor: '#999' },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#222' },
  row:        { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.2, borderBottomColor: '#eee' },
  cellDate:   { width: '8%', fontSize: 7 },
  cellPiece:  { width: '10%', fontSize: 7 },
  cellJournal:{ width: '8%', fontSize: 7 },
  cellLib:    { width: '40%', fontSize: 7, paddingRight: 4 },
  cellMnt:    { width: '10%', fontSize: 7, textAlign: 'right' },
  cellSolde:  { width: '14%', fontSize: 7, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalRow:   { flexDirection: 'row', paddingVertical: 4, marginTop: 2, borderTopWidth: 0.5, borderTopColor: '#0B0F2E', backgroundColor: '#fafafa' },
  totalLb:    { width: '66%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  totalMnt:   { width: '10%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right' },
  totalSolde: { width: '14%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 12, left: 24, right: 24, fontSize: 6, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 4 },
})

const fmtMUR = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const compte_numero = searchParams.get('compte_numero')
    const compte_debut = searchParams.get('compte_debut')
    const compte_fin = searchParams.get('compte_fin')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const exercice = searchParams.get('exercice')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e, { societe_id, user_id: user.id })
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    let dDebut = date_debut
    let dFin = date_fin
    if (exercice && !dDebut && !dFin) {
      const m = exercice.match(/^(\d{4})-(\d{4})$/)
      if (m) { dDebut = `${m[1]}-07-01`; dFin = `${m[2]}-06-30` }
    }

    const ecritures = await fetchAllPaginated<any>(() => {
      let q = supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, ref_folio, lettre')
        .eq('societe_id', societe_id)
        .order('numero_compte')
        .order('date_ecriture')
      if (compte_numero) q = q.eq('numero_compte', compte_numero)
      if (compte_debut) q = q.gte('numero_compte', compte_debut)
      if (compte_fin) q = q.lte('numero_compte', compte_fin)
      if (dDebut) q = q.gte('date_ecriture', dDebut)
      if (dFin) q = q.lte('date_ecriture', dFin)
      return q
    })

    const { data: societe } = await supabase
      .from('societes').select('nom, brn').eq('id', societe_id).single()

    // Group by compte (déjà trié)
    const byCompte = new Map<string, { nom: string; rows: any[] }>()
    for (const e of ecritures) {
      const k = (e.numero_compte as string) || '???'
      if (!byCompte.has(k)) {
        byCompte.set(k, { nom: (e.nom_compte as string) || '', rows: [] })
      }
      byCompte.get(k)!.rows.push(e)
    }

    const elt = React.createElement
    const periodeLabel = `${dDebut || 'depuis origine'} → ${dFin || 'à ce jour'}`

    // Render : 1 page par compte (avec page-break automatique si trop long).
    // On stocke chaque section dans un View ; @react-pdf gère le wrap multi-pages.
    const sections: any[] = []
    let nbPages = 0
    for (const [numero, agg] of byCompte) {
      let sumD = 0, sumC = 0, solde = 0
      const rowsEls: any[] = []
      for (const e of agg.rows) {
        const d = Number(e.debit_mur) || 0
        const c = Number(e.credit_mur) || 0
        sumD += d; sumC += c
        solde += d - c
        rowsEls.push(elt(View, { key: `r-${nbPages++}`, style: styles.row, wrap: false },
          elt(Text, { style: styles.cellDate }, fmtDate(e.date_ecriture as string)),
          elt(Text, { style: styles.cellPiece }, (e.ref_folio as string) || ''),
          elt(Text, { style: styles.cellJournal }, (e.journal as string) || ''),
          elt(Text, { style: styles.cellLib }, (e.description as string) || ''),
          elt(Text, { style: styles.cellMnt }, fmtMUR(d)),
          elt(Text, { style: styles.cellMnt }, fmtMUR(c)),
          elt(Text, { style: styles.cellSolde }, fmtMUR(solde)),
        ))
      }
      sections.push(elt(View, { key: `c-${numero}`, wrap: true },
        elt(View, { style: styles.compteHd },
          elt(Text, { style: styles.compteTtl }, `${numero} — ${agg.nom}`),
          elt(Text, { style: styles.compteSub }, `${agg.rows.length} écriture(s) · Période : ${periodeLabel}`),
        ),
        elt(View, { style: styles.thead, fixed: true },
          elt(Text, { style: [styles.cellDate, styles.th] }, 'Date'),
          elt(Text, { style: [styles.cellPiece, styles.th] }, 'Pièce'),
          elt(Text, { style: [styles.cellJournal, styles.th] }, 'Journal'),
          elt(Text, { style: [styles.cellLib, styles.th] }, 'Libellé'),
          elt(Text, { style: [styles.cellMnt, styles.th] }, 'Débit'),
          elt(Text, { style: [styles.cellMnt, styles.th] }, 'Crédit'),
          elt(Text, { style: [styles.cellSolde, styles.th] }, 'Solde'),
        ),
        ...rowsEls,
        elt(View, { style: styles.totalRow },
          elt(Text, { style: styles.totalLb }, `Totaux ${numero}`),
          elt(Text, { style: styles.totalMnt }, fmtMUR(sumD)),
          elt(Text, { style: styles.totalMnt }, fmtMUR(sumC)),
          elt(Text, { style: styles.totalSolde }, fmtMUR(sumD - sumC)),
        ),
      ))
    }

    if (sections.length === 0) {
      sections.push(elt(Text, { style: { fontSize: 10, color: '#666', textAlign: 'center', marginTop: 40 } },
        'Aucune écriture trouvée pour les filtres demandés.'
      ))
    }

    const doc = elt(Document, {},
      elt(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
        elt(View, { style: styles.header, fixed: true },
          elt(Text, { style: styles.company }, societe?.nom || '—'),
          societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn}`),
          elt(Text, { style: styles.title }, 'Grand-Livre comptable'),
          elt(Text, { style: styles.subtitle }, `Période : ${periodeLabel}${compte_numero ? ' · Compte ' + compte_numero : ''} · Devise : MUR (Roupies Mauriciennes)`),
        ),
        ...sections,
        elt(View, { style: styles.footer, fixed: true },
          elt(Text, {}, `${societe?.nom || ''} · Grand-Livre · Exporté le ${new Date().toLocaleDateString('fr-FR')}`),
        ),
      ),
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `grand-livre_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${dDebut || ''}_${dFin || ''}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PDF' }, { status: 500 })
  }
}
