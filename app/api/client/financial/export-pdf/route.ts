import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF du Compte de Résultat (P&L) — format IFRS for SMEs Maurice.
 *
 * Vise les besoins :
 *   • Auditeur externe : document signable avec en-tête société, exercice,
 *     date de génération, source de calcul.
 *   • Dépôt légal (Companies Act 2001 Maurice) : présentation en cascade
 *     produits − charges → résultat avant impôt → IS → résultat net.
 *   • Annexe : rappel référentiel + base de calcul.
 *
 * Récupère les chiffres depuis /api/client/financial (source de vérité partagée
 * avec dashboard et export Excel).
 */

const styles = StyleSheet.create({
  page:       { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', lineHeight: 1.4 },
  header:     { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 12, marginBottom: 16 },
  company:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 4 },
  title:      { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  subtitle:   { fontSize: 9, color: '#666', marginTop: 2 },
  section:    { marginTop: 14, marginBottom: 4 },
  sectionTtl: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:        { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: '#eee' },
  rowLabel:   { flex: 3, fontSize: 9 },
  rowAmount:  { flex: 1, fontSize: 9, textAlign: 'right' },
  subtotal:   { flexDirection: 'row', paddingVertical: 5, marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#999' },
  subtotalLb: { flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  subtotalAm: { flex: 1, fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  result:     { flexDirection: 'row', paddingVertical: 8, marginTop: 8, borderTopWidth: 1.5, borderTopColor: '#0B0F2E', backgroundColor: '#f4f4f8' },
  resultLb:   { flex: 3, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', paddingLeft: 4 },
  resultAm:   { flex: 1, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right', paddingRight: 4 },
  notes:      { marginTop: 24, fontSize: 8, color: '#666', lineHeight: 1.6 },
  footer:     { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 6 },
})

const fmtMUR = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n)) || n === 0) return '—'
  const v = Number(n)
  const abs = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Récupère le P&L source-de-vérité via /api/client/financial
    const url = new URL('/api/client/financial', request.url)
    searchParams.forEach((v, k) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), { headers: { cookie: request.headers.get('cookie') || '' } })
    if (!res.ok) return NextResponse.json({ error: `Erreur P&L: ${res.status}` }, { status: res.status })
    // /api/client/financial renvoie { financial: {...}, exercice_actuel, ... }
    // On unwrap pour accéder directement aux champs P&L.
    const json: any = await res.json()
    const fin: any = json?.financial || json
    const exerciceActuel = json?.exercice_actuel

    const { data: societe } = await supabase
      .from('societes').select('raison_sociale, brn, vat_number, adresse, exercice_debut').eq('id', societe_id).single()

    // Calculs cascade
    const ca = Number(fin.chiffreAffaires) || 0
    const achats = Number(fin.achats) || 0
    const salaires = Number(fin.salaires) || 0
    const chargesSociales = Number(fin.chargesSociales) || 0
    const autresServices = Number(fin.autresServicesExterieurs) || Number(fin.autresCharges) || 0
    const impotsTaxes = Number(fin.impotsEtTaxes) || 0
    const amortissements = Number(fin.amortissements) || 0
    const chargesFin = Number(fin.chargesFinancieres) || 0
    const produitsFin = Number(fin.produitsFinanciers) || 0

    const totalCharges = achats + salaires + chargesSociales + autresServices + impotsTaxes + amortissements
    const resultatExpl = ca - totalCharges
    const resultatFin  = produitsFin - chargesFin
    const resultatAvImpot = resultatExpl + resultatFin
    const impotSociete = Math.max(0, resultatAvImpot) * 0.15
    const resultatNet = resultatAvImpot - impotSociete

    const elt = React.createElement
    const doc = elt(Document, {},
      elt(Page, { size: 'A4', style: styles.page },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe?.raison_sociale || '—'),
          societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn}${societe.vat_number ? ' · VAT : ' + societe.vat_number : ''}`),
          elt(Text, { style: styles.title }, 'Compte de Résultat'),
          elt(Text, { style: styles.subtitle }, `Exercice ${exerciceActuel || fin.exercice || '—'} · Période ${fmtDate(fin.date_debut)} → ${fmtDate(fin.date_fin)}`),
          elt(Text, { style: styles.subtitle }, `Référentiel : IFRS for SMEs · Companies Act 2001 Mauritius · Devise : MUR`),
        ),

        // PRODUITS
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, "Produits d'exploitation"),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, "Chiffre d'affaires (706, 707, 708)"),
            elt(Text, { style: styles.rowAmount }, fmtMUR(ca)),
          ),
          elt(View, { style: styles.subtotal },
            elt(Text, { style: styles.subtotalLb }, "Total produits d'exploitation"),
            elt(Text, { style: styles.subtotalAm }, fmtMUR(ca)),
          ),
        ),

        // CHARGES
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, "Charges d'exploitation"),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Achats consommés (60x)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-achats)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Salaires et traitements (641, 644)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-salaires)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Charges sociales et patronales (645-649)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-chargesSociales)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Autres services extérieurs (621-629)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-autresServices)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Impôts, taxes et versements (63x)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-impotsTaxes)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Dotations aux amortissements (68x)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-amortissements)),
          ),
          elt(View, { style: styles.subtotal },
            elt(Text, { style: styles.subtotalLb }, "Total charges d'exploitation"),
            elt(Text, { style: styles.subtotalAm }, fmtMUR(-totalCharges)),
          ),
        ),

        // RESULTAT EXPLOITATION
        elt(View, { style: styles.result },
          elt(Text, { style: styles.resultLb }, "Résultat d'exploitation"),
          elt(Text, { style: styles.resultAm }, fmtMUR(resultatExpl)),
        ),

        // FINANCIER
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Résultat financier'),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Produits financiers (76x)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(produitsFin)),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Charges financières (66x)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-chargesFin)),
          ),
          elt(View, { style: styles.subtotal },
            elt(Text, { style: styles.subtotalLb }, 'Résultat financier'),
            elt(Text, { style: styles.subtotalAm }, fmtMUR(resultatFin)),
          ),
        ),

        // RESULTAT AVANT IMPOT
        elt(View, { style: styles.result },
          elt(Text, { style: styles.resultLb }, 'Résultat avant impôt'),
          elt(Text, { style: styles.resultAm }, fmtMUR(resultatAvImpot)),
        ),

        // IS + RESULTAT NET
        elt(View, { style: styles.section },
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Impôt sur les bénéfices (15%)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(-impotSociete)),
          ),
        ),

        elt(View, { style: styles.result },
          elt(Text, { style: styles.resultLb }, "Résultat net de l'exercice"),
          elt(Text, { style: styles.resultAm }, fmtMUR(resultatNet)),
        ),

        // NOTES
        elt(View, { style: styles.notes },
          elt(Text, { style: { fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Notes'),
          elt(Text, {}, '• Tous les montants sont exprimés en Roupies Mauriciennes (MUR), arrondis à 2 décimales.'),
          elt(Text, {}, '• La comptabilité respecte le Plan Comptable Mauricien (PCM) et les normes IFRS for SMEs.'),
          elt(Text, {}, "• L'impôt sur les bénéfices est calculé au taux standard de 15 % (Income Tax Act 1995, sec. 44A)."),
          elt(Text, {}, `• Document généré le ${fmtDate(new Date().toISOString())} à partir des écritures comptables enregistrées dans Lexora.`),
        ),

        elt(View, { style: styles.footer },
          elt(Text, {}, `${societe?.raison_sociale || ''} · Compte de Résultat · Exercice ${exerciceActuel || fin.exercice || ''} · Document confidentiel`),
        ),
      )
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `pnl_${(societe?.raison_sociale || 'societe').replace(/\s+/g, '_')}_${exerciceActuel || fin.exercice || ''}.pdf`

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
