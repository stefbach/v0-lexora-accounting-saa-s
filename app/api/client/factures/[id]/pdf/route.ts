import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'factures-pdf'

const styles = StyleSheet.create({
  page:        { padding: 48, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', lineHeight: 1.5 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  companyInfo: { fontSize: 8, color: '#555' },
  // Logo : taille volontairement généreuse pour rester lisible une fois
  // l'A4 imprimé. objectFit:contain garantit le respect du ratio source.
  logo:        { width: 160, height: 80, objectFit: 'contain', marginBottom: 10 },
  invoiceTitle:{ fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginBottom: 4 },
  invoiceNum:  { fontSize: 10, textAlign: 'right', color: '#555' },
  sectionTitle:{ fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, color: '#555' },
  billTo:      { marginBottom: 20, padding: 12, backgroundColor: '#f8f8f8', borderRadius: 4 },
  clientName:  { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  clientInfo:  { fontSize: 8, color: '#555' },
  dates:       { flexDirection: 'row', gap: 16, marginBottom: 20 },
  dateBox:     { flex: 1, padding: 8, backgroundColor: '#f8f8f8', borderRadius: 4 },
  dateLabel:   { fontSize: 7, color: '#888', marginBottom: 2 },
  dateValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, marginBottom: 2, borderRadius: 2 },
  tableRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  col_desc:    { flex: 4 },
  col_qty:     { flex: 1, textAlign: 'right' },
  col_pu:      { flex: 1.5, textAlign: 'right' },
  col_tva:     { flex: 1, textAlign: 'right' },
  col_ht:      { flex: 1.5, textAlign: 'right' },
  tableHd:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' },
  tableCell:   { fontSize: 8 },
  // Sous-ligne MUR : MÊME TAILLE que tableCell pour rester aussi lisible
  // que le montant en devise étrangère. Couleur légèrement atténuée et
  // un peu d'espace au-dessus pour bien séparer les 2 valeurs.
  tableCellMur:{ fontSize: 8, color: '#444', textAlign: 'right', marginTop: 2 },
  totals:      { marginTop: 12, alignItems: 'flex-end' },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginBottom: 3, alignItems: 'baseline' },
  totalLabel:  { fontSize: 8, color: '#555', width: 120, textAlign: 'right' },
  totalValue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', width: 100, textAlign: 'right' },
  // Affichage de la contre-valeur en MUR à droite du montant en devise.
  // Plus petit + gris pour bien marquer que c'est l'équivalent informatif.
  totalMurValue:{ fontSize: 7, color: '#777', width: 100, textAlign: 'right' },
  totalTTC:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 6, paddingTop: 6, borderTopWidth: 1.5, alignItems: 'baseline' },
  ttcLabel:    { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 120, textAlign: 'right' },
  ttcValue:    { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 100, textAlign: 'right' },
  ttcMurValue: { fontSize: 9, color: '#555', width: 100, textAlign: 'right' },
  // Bandeau "Taux de change appliqué" affiché si devise étrangère.
  fxNotice:    { fontSize: 8, fontStyle: 'italic', color: '#666', marginTop: 10, padding: 8, backgroundColor: '#fafafa', borderRadius: 4, textAlign: 'right' },
  notes:       { marginTop: 24, padding: 10, backgroundColor: '#f8f8f8', borderRadius: 4 },
  notesTitle:  { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  notesText:   { fontSize: 8, color: '#555' },
  bankInfo:    { marginTop: 12, padding: 10, borderWidth: 0.5, borderColor: '#ddd', borderRadius: 4 },
  footer:      { position: 'absolute', bottom: 24, left: 48, right: 48, borderTopWidth: 0.5, borderTopColor: '#ccc', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#aaa' },
})

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}
function fmtMontant(n: number | null | undefined, devise = 'MUR'): string {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(n) + ' ' + devise
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const admin = getAdminClient()

    // Récupérer la facture
    const { data: facture, error } = await admin
      .from('factures')
      .select('*, societe:societes(nom, brn, vat_number, adresse, telephone, email, banque_nom, banque_compte, banque_iban, banque_swift, logo_url)')
      .eq('id', id)
      .single()

    if (error || !facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    // Tenant isolation unifiée via getAccessibleSocieteIds (user_societes + dossiers + created_by)
    if (facture.societe_id) {
      await assertSocieteAccess(admin, user.id, facture.societe_id)
    }

    // Si PDF déjà stocké → signed URL
    if (facture.pdf_url) {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(facture.pdf_url, 3600)
      if (signed?.signedUrl) {
        return NextResponse.redirect(signed.signedUrl)
      }
    }

    // Générer le PDF
    const soc = facture.societe as any
    const lignes: any[] = facture.lignes || []
    const devise = facture.devise || 'MUR'
    const accentColor = facture.accent_color || '#0B0F2E'

    // ── Double devise : si la facture est en devise étrangère, on affiche
    //    en parallèle l'équivalent en MUR sur chaque ligne de totaux et
    //    on ajoute une mention explicite du cours utilisé. Source de vérité :
    //    facture.taux_change (figé à la création) et facture.montant_mur.
    const taux = Number(facture.taux_change) > 0 ? Number(facture.taux_change) : 1
    const isForeign = devise !== 'MUR' && Math.abs(taux - 1) > 0.0001
    const ttcMur = Number(facture.montant_mur) > 0
      ? Number(facture.montant_mur)
      : Number(facture.montant_ttc) * taux
    // Ratio MUR/devise réel (basé sur ttcMur/ttc) pour préserver les
    // sommes même si l'utilisateur a saisi un montant_mur ajusté à la main.
    const ttcOrig = Number(facture.montant_ttc) || 0
    const murRatio = ttcOrig > 0 ? ttcMur / ttcOrig : taux
    const htMur = Math.round((Number(facture.montant_ht) || 0) * murRatio * 100) / 100
    const tvaMur = Math.round((Number(facture.montant_tva) || 0) * murRatio * 100) / 100
    const tauxAffiche = murRatio.toLocaleString('fr-FR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })

    const doc = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: styles.page },

        // En-tête
        React.createElement(View, { style: styles.header },
          React.createElement(View, {},
            // Logo société (mig 242, bucket societes-logos). On retire le query
            // string de cache-busting éventuel — @react-pdf récupère via fetch
            // serveur côté Vercel donc pas de cache navigateur à invalider.
            soc?.logo_url && React.createElement(Image, {
              src: String(soc.logo_url).split('?')[0],
              style: styles.logo,
            }),
            React.createElement(Text, { style: styles.companyName }, soc?.nom || ''),
            React.createElement(Text, { style: styles.companyInfo }, soc?.adresse || ''),
            soc?.telephone && React.createElement(Text, { style: styles.companyInfo }, `Tél : ${soc.telephone}`),
            soc?.email && React.createElement(Text, { style: styles.companyInfo }, soc.email),
            soc?.vat_number && React.createElement(Text, { style: styles.companyInfo }, `VAT : ${soc.vat_number}`),
            soc?.brn && React.createElement(Text, { style: styles.companyInfo }, `BRN : ${soc.brn}`),
          ),
          React.createElement(View, {},
            React.createElement(Text, { style: { ...styles.invoiceTitle, color: accentColor } },
              facture.type_facture === 'fournisseur' ? 'FACTURE FOURNISSEUR' : 'FACTURE'
            ),
            React.createElement(Text, { style: styles.invoiceNum }, `N° ${facture.numero_facture || '—'}`),
          )
        ),

        // Dates
        React.createElement(View, { style: styles.dates },
          React.createElement(View, { style: styles.dateBox },
            React.createElement(Text, { style: styles.dateLabel }, 'Date de facture'),
            React.createElement(Text, { style: styles.dateValue }, fmtDate(facture.date_facture)),
          ),
          React.createElement(View, { style: styles.dateBox },
            React.createElement(Text, { style: styles.dateLabel }, "Échéance"),
            React.createElement(Text, { style: styles.dateValue },
              // "À réception de facture" si les conditions de paiement sont à 0
              // (ou si l'échéance est égale à la date de facture, fallback robuste).
              Number(facture.conditions_paiement) === 0
                || (facture.date_echeance && facture.date_facture === facture.date_echeance)
                ? 'À réception de facture'
                : fmtDate(facture.date_echeance),
            ),
          ),
          facture.reference && React.createElement(View, { style: styles.dateBox },
            React.createElement(Text, { style: styles.dateLabel }, 'Référence'),
            React.createElement(Text, { style: styles.dateValue }, facture.reference),
          ),
        ),

        // Client
        React.createElement(View, { style: styles.billTo },
          React.createElement(Text, { style: styles.sectionTitle }, 'Facturé à'),
          React.createElement(Text, { style: styles.clientName }, facture.tiers || '—'),
        ),

        // Tableau lignes
        // En devise étrangère : chaque cellule "P.U." et "Montant HT" empile
        // le montant en devise et l'équivalent MUR juste en dessous (gris).
        React.createElement(View, { style: { ...styles.tableHeader, backgroundColor: accentColor } },
          React.createElement(Text, { style: { ...styles.col_desc, ...styles.tableHd } }, 'Description'),
          React.createElement(Text, { style: { ...styles.col_qty, ...styles.tableHd } }, 'Qté'),
          React.createElement(Text, { style: { ...styles.col_pu, ...styles.tableHd } }, isForeign ? `P.U. HT (${devise} / MUR)` : 'P.U. HT'),
          React.createElement(Text, { style: { ...styles.col_tva, ...styles.tableHd } }, 'TVA'),
          React.createElement(Text, { style: { ...styles.col_ht, ...styles.tableHd } }, isForeign ? `Montant HT (${devise} / MUR)` : 'Montant HT'),
        ),

        ...lignes.map((l: any) => {
          const pu = Number(l.prix_unitaire) || 0
          const ht = Number(l.montant_ht) || (Number(l.quantite) || 0) * pu
          const puMur = Math.round(pu * murRatio * 100) / 100
          const htMurLine = Math.round(ht * murRatio * 100) / 100
          return React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: { ...styles.col_desc, ...styles.tableCell } }, l.description || ''),
            React.createElement(Text, { style: { ...styles.col_qty, ...styles.tableCell } }, String(l.quantite || 0)),
            React.createElement(View, { style: styles.col_pu },
              React.createElement(Text, { style: styles.tableCell }, fmtMontant(pu, isForeign ? devise : '')),
              isForeign && React.createElement(Text, { style: styles.tableCellMur }, `≈ ${fmtMontant(puMur, 'MUR')}`),
            ),
            React.createElement(Text, { style: { ...styles.col_tva, ...styles.tableCell } }, `${l.taux_tva || 0}%`),
            React.createElement(View, { style: styles.col_ht },
              React.createElement(Text, { style: styles.tableCell }, fmtMontant(ht, isForeign ? devise : '')),
              isForeign && React.createElement(Text, { style: styles.tableCellMur }, `≈ ${fmtMontant(htMurLine, 'MUR')}`),
            ),
          )
        }),

        // Totaux — affichage double devise quand devise étrangère :
        //   colonne 1 : libellé · colonne 2 : montant en devise · colonne 3 : ≈ MUR
        React.createElement(View, { style: styles.totals },
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, 'Sous-total HT'),
            React.createElement(Text, { style: styles.totalValue }, fmtMontant(facture.montant_ht, devise)),
            isForeign && React.createElement(Text, { style: styles.totalMurValue },
              `≈ ${fmtMontant(htMur, 'MUR')}`),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, `TVA ${facture.client_offshore ? '0%' : '15%'}`),
            React.createElement(Text, { style: styles.totalValue }, fmtMontant(facture.montant_tva, devise)),
            isForeign && React.createElement(Text, { style: styles.totalMurValue },
              `≈ ${fmtMontant(tvaMur, 'MUR')}`),
          ),
          React.createElement(View, { style: { ...styles.totalTTC, borderTopColor: accentColor } },
            React.createElement(Text, { style: { ...styles.ttcLabel, color: accentColor } }, 'TOTAL TTC'),
            React.createElement(Text, { style: { ...styles.ttcValue, color: accentColor } }, fmtMontant(facture.montant_ttc, devise)),
            isForeign && React.createElement(Text, { style: styles.ttcMurValue },
              `≈ ${fmtMontant(ttcMur, 'MUR')}`),
          ),
          // Mention du taux de change utilisé (cohérence comptable + transparence client)
          isForeign && React.createElement(View, { style: styles.fxNotice },
            React.createElement(Text, {},
              `Taux de change appliqué : 1 ${devise} = ${tauxAffiche} MUR (cours du ${fmtDate(facture.date_facture)})`),
          ),
        ),

        // Notes visibles
        facture.notes_visibles && React.createElement(View, { style: styles.notes },
          React.createElement(Text, { style: styles.notesTitle }, 'Conditions & Notes'),
          React.createElement(Text, { style: styles.notesText }, facture.notes_visibles),
        ),

        // Coordonnées bancaires
        soc?.banque_iban && React.createElement(View, { style: styles.bankInfo },
          React.createElement(Text, { style: styles.notesTitle }, 'Coordonnées bancaires'),
          soc.banque_nom && React.createElement(Text, { style: styles.notesText }, `Banque : ${soc.banque_nom}`),
          soc.banque_compte && React.createElement(Text, { style: styles.notesText }, `Compte : ${soc.banque_compte}`),
          soc.banque_iban && React.createElement(Text, { style: styles.notesText }, `IBAN : ${soc.banque_iban}`),
          soc.banque_swift && React.createElement(Text, { style: styles.notesText }, `SWIFT : ${soc.banque_swift}`),
        ),

        // Footer
        React.createElement(View, { style: styles.footer },
          React.createElement(Text, { style: styles.footerText }, soc?.nom || ''),
          React.createElement(Text, { style: styles.footerText }, `N° ${facture.numero_facture || '—'} · ${fmtDate(facture.date_facture)}`),
          soc?.vat_number && React.createElement(Text, { style: styles.footerText }, `VAT : ${soc.vat_number}`),
        )
      )
    )

    const buffer = await renderToBuffer(doc)

    // Stocker dans Supabase Storage si facture finalisée
    if (facture.statut !== 'brouillon') {
      const storagePath = `${facture.societe_id}/${facture.id}.pdf`
      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

      if (!uploadErr) {
        await admin.from('factures').update({
          pdf_url: storagePath,
          pdf_stored_at: new Date().toISOString(),
        }).eq('id', id)
      }
    }

    const nomFichier = `facture_${(facture.numero_facture || id.slice(0, 8)).replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomFichier}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
