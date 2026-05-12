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
  // Largeurs ajustables : en devise étrangère, P.U. et Montant HT
  // s'élargissent pour accueillir 2 sous-colonnes (devise + MUR) côte
  // à côte. col_*_foreign = variante 2 colonnes.
  col_desc:    { flex: 4 },
  col_qty:     { flex: 1, textAlign: 'right' },
  col_pu:      { flex: 1.5, textAlign: 'right' },
  col_tva:     { flex: 1, textAlign: 'right' },
  col_ht:      { flex: 1.5, textAlign: 'right' },
  col_desc_fx: { flex: 2.8 },
  col_qty_fx:  { flex: 0.7, textAlign: 'right' },
  col_pu_fx:   { flex: 2.4, flexDirection: 'row', justifyContent: 'flex-end' },
  col_tva_fx:  { flex: 0.7, textAlign: 'right' },
  col_ht_fx:   { flex: 2.4, flexDirection: 'row', justifyContent: 'flex-end' },
  // Sous-cellule (devise ou MUR) dans P.U./HT en mode double devise.
  // Chaque sous-cellule prend la moitié de la cellule parent.
  col_sub:     { flex: 1, textAlign: 'right', paddingLeft: 4 },
  tableHd:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' },
  tableCell:   { fontSize: 8 },
  // Affichage MUR côte à côte avec le montant en devise : même taille,
  // couleur très légèrement atténuée pour conserver une hiérarchie subtile.
  tableCellMur:{ fontSize: 8, color: '#444', textAlign: 'right', paddingLeft: 4 },
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

export async function GET(request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const admin = getAdminClient()
    // ?refresh=1 force la régénération même si un PDF est déjà en Storage
    // (utile après évolution du gabarit ou changement de logo / taux).
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('refresh') === '1'

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

    // Si PDF déjà stocké → signed URL, SAUF :
    //   • ?refresh=1 force la régénération
    //   • la facture a été modifiée depuis le dernier rendu PDF
    //     (updated_at > pdf_stored_at) → on régénère automatiquement
    //     pour servir la version à jour. Évite que le user voie une
    //     vieille version après édition des lignes / coordonnées banque.
    const pdfStaleByUpdate = facture.pdf_stored_at && facture.updated_at
      && new Date(facture.updated_at).getTime() > new Date(facture.pdf_stored_at).getTime() + 1000
    if (facture.pdf_url && !forceRefresh && !pdfStaleByUpdate) {
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
    //
    // Fix bug "le MUR ne s'affiche pas en EUR" : on retire le filtre
    // sur abs(taux-1) > 0.0001 qui masquait la 2e colonne MUR quand la
    // facture avait été créée avec taux_change=1 par défaut. Désormais
    // dès que devise != MUR on affiche les 2 colonnes — si le taux n'a
    // pas été saisi le MUR sera = devise, l'utilisateur le verra et
    // pourra corriger le taux côté formulaire.
    const taux = Number(facture.taux_change) > 0 ? Number(facture.taux_change) : 1
    const isForeign = devise !== 'MUR'
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
        // En devise étrangère : P.U. et Montant HT sont SPLITTED en 2
        // sous-colonnes côte-à-côte (devise | MUR) au lieu d'être empilées.
        // L'utilisateur voit immédiatement les deux valeurs au même niveau,
        // et les colonnes elles-mêmes sont élargies (col_*_fx).
        React.createElement(View, { style: { ...styles.tableHeader, backgroundColor: accentColor } },
          React.createElement(Text, { style: { ...(isForeign ? styles.col_desc_fx : styles.col_desc), ...styles.tableHd } }, 'Description'),
          React.createElement(Text, { style: { ...(isForeign ? styles.col_qty_fx : styles.col_qty), ...styles.tableHd } }, 'Qté'),
          isForeign
            ? React.createElement(View, { style: styles.col_pu_fx },
                React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableHd } }, `P.U. ${devise}`),
                React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableHd } }, 'P.U. MUR'),
              )
            : React.createElement(Text, { style: { ...styles.col_pu, ...styles.tableHd } }, 'P.U. HT'),
          React.createElement(Text, { style: { ...(isForeign ? styles.col_tva_fx : styles.col_tva), ...styles.tableHd } }, 'TVA'),
          isForeign
            ? React.createElement(View, { style: styles.col_ht_fx },
                React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableHd } }, `Mt HT ${devise}`),
                React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableHd } }, 'Mt HT MUR'),
              )
            : React.createElement(Text, { style: { ...styles.col_ht, ...styles.tableHd } }, 'Montant HT'),
        ),

        ...lignes.map((l: any) => {
          const pu = Number(l.prix_unitaire) || 0
          const ht = Number(l.montant_ht) || (Number(l.quantite) || 0) * pu
          const puMur = Math.round(pu * murRatio * 100) / 100
          const htMurLine = Math.round(ht * murRatio * 100) / 100
          return React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: { ...(isForeign ? styles.col_desc_fx : styles.col_desc), ...styles.tableCell } }, l.description || ''),
            React.createElement(Text, { style: { ...(isForeign ? styles.col_qty_fx : styles.col_qty), ...styles.tableCell } }, String(l.quantite || 0)),
            isForeign
              ? React.createElement(View, { style: styles.col_pu_fx },
                  React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableCell } }, fmtMontant(pu, devise)),
                  React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableCellMur } }, fmtMontant(puMur, 'MUR')),
                )
              : React.createElement(Text, { style: { ...styles.col_pu, ...styles.tableCell } }, fmtMontant(pu, '')),
            React.createElement(Text, { style: { ...(isForeign ? styles.col_tva_fx : styles.col_tva), ...styles.tableCell } }, `${l.taux_tva || 0}%`),
            isForeign
              ? React.createElement(View, { style: styles.col_ht_fx },
                  React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableCell } }, fmtMontant(ht, devise)),
                  React.createElement(Text, { style: { ...styles.col_sub, ...styles.tableCellMur } }, fmtMontant(htMurLine, 'MUR')),
                )
              : React.createElement(Text, { style: { ...styles.col_ht, ...styles.tableCell } }, fmtMontant(ht, '')),
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
