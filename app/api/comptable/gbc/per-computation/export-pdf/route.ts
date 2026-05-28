import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF — Rapport PER 80% (Partial Exemption Regime) Mauritius GBC.
 *
 * Document destiné :
 *   • Auditeur / FSC : justifie l'application du régime PER 80% + Foreign Tax Credit
 *   • Archive interne : trace exercice par exercice du calcul de l'IS GBC
 *
 * Référentiel : Income Tax Act 1995 (Mauritius), s.2A Foreign Source Income.
 */

const styles = StyleSheet.create({
  page:       { padding: 36, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', lineHeight: 1.4 },
  header:     { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 10, marginBottom: 14 },
  company:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 2 },
  title:      { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  subtitle:   { fontSize: 9, color: '#666', marginTop: 2 },
  section:    { marginTop: 12, marginBottom: 4 },
  sectionTtl: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase' },
  row:        { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: '#eee' },
  rowLabel:   { flex: 3, fontSize: 9 },
  rowAmount:  { flex: 1, fontSize: 9, textAlign: 'right' },
  thead:      { flexDirection: 'row', paddingVertical: 4, backgroundColor: '#f4f4f8', borderBottomWidth: 0.5, borderBottomColor: '#999' },
  th:         { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#444' },
  result:     { flexDirection: 'row', paddingVertical: 6, marginTop: 6, borderTopWidth: 1, borderTopColor: '#0B0F2E', backgroundColor: '#f4f4f8' },
  resultLb:   { flex: 3, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', paddingLeft: 4 },
  resultAm:   { flex: 1, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right', paddingRight: 4 },
  notes:      { marginTop: 18, fontSize: 8, color: '#666', lineHeight: 1.5 },
  footer:     { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 6 },
})

const fmtMUR = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '0,00'
  const abs = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
function today(): string {
  const dt = new Date()
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: result }, { data: categories }, { data: ftcRecords }, { data: societe }] = await Promise.all([
      supabase.rpc('gbc_compute_tax_liability', { p_societe_id: societe_id, p_exercice: exercice }),
      supabase.from('gbc_per_categories').select('*'),
      supabase.from('gbc_foreign_tax_credits').select('*').eq('societe_id', societe_id).eq('exercice', exercice),
      supabase.from('societes').select('nom, brn, vat_number, regime, devise_fonctionnelle').eq('id', societe_id).single(),
    ])

    const tax: any = Array.isArray(result) ? result[0] : result || {}
    const cats: any[] = categories || []
    const ftcs: any[] = ftcRecords || []

    const elt = React.createElement
    const doc = elt(Document, {},
      elt(Page, { size: 'A4', style: styles.page },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe?.nom || '—'),
          societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn}${societe.regime ? ' · Régime : ' + societe.regime.toUpperCase() : ''}`),
          elt(Text, { style: styles.title }, 'Rapport PER 80% — Partial Exemption Regime'),
          elt(Text, { style: styles.subtitle }, `Exercice fiscal : ${exercice} · Devise : ${societe?.devise_fonctionnelle || 'MUR'}`),
          elt(Text, { style: styles.subtitle }, 'Référentiel : Income Tax Act 1995 (Mauritius), s.2A Foreign Source Income · Full IFRS'),
        ),

        // KPI synthèse
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Synthèse fiscale'),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Total revenus de l\'exercice'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.total_revenue_mur) + ' MUR'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Revenus éligibles PER (80% exemptés)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.per_eligible_revenue_mur) + ' MUR'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Revenus non éligibles (taxables à 15%)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.non_eligible_revenue_mur) + ' MUR'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Base imposable après PER 80%'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.taxable_base_mur) + ' MUR'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'IS brut (15%)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.gross_tax_mur) + ' MUR'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Foreign Tax Credit appliqué (-)'),
            elt(Text, { style: styles.rowAmount }, fmtMUR(tax.ftc_applied) + ' MUR'),
          ),
          elt(View, { style: styles.result },
            elt(Text, { style: styles.resultLb }, 'IS net à payer (MUR)'),
            elt(Text, { style: styles.resultAm }, fmtMUR(tax.net_tax_liability_mur)),
          ),
        ),

        // Catégories PER
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Catégories de revenus PER éligibles'),
          elt(View, { style: styles.thead },
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Code'),
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Libellé'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Exemption'),
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Substance ?'),
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Référence légale'),
          ),
          ...cats.map((c: any) => elt(View, { key: c.code, style: styles.row },
            elt(Text, { style: styles.rowLabel }, c.code),
            elt(Text, { style: styles.rowLabel }, c.libelle || '—'),
            elt(Text, { style: styles.rowAmount }, `${c.exemption_pct ?? 0}%`),
            elt(Text, { style: styles.rowLabel }, c.substance_required ? 'Oui' : 'Non'),
            elt(Text, { style: styles.rowLabel }, c.legal_ref || '—'),
          )),
        ),

        // FTC déclarés
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, `Foreign Tax Credits déclarés (${ftcs.length})`),
          ftcs.length === 0
            ? elt(Text, { style: { fontSize: 9, color: '#888', padding: 6 } }, 'Aucun FTC déclaré pour cet exercice.')
            : elt(View, {},
                elt(View, { style: styles.thead },
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Pays source'),
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Type revenu'),
                  elt(Text, { style: [styles.rowAmount, styles.th] }, 'Revenu étranger'),
                  elt(Text, { style: [styles.rowAmount, styles.th] }, 'Impôt étranger'),
                  elt(Text, { style: [styles.rowAmount, styles.th] }, 'FTC appliqué'),
                ),
                ...ftcs.map((r: any) => elt(View, { key: r.id, style: styles.row },
                  elt(Text, { style: styles.rowLabel }, r.source_country || '—'),
                  elt(Text, { style: styles.rowLabel }, r.income_type || '—'),
                  elt(Text, { style: styles.rowAmount }, fmtMUR(r.foreign_income_mur)),
                  elt(Text, { style: styles.rowAmount }, fmtMUR(r.foreign_tax_paid_mur)),
                  elt(Text, { style: styles.rowAmount }, fmtMUR(r.ftc_applied_mur)),
                )),
              ),
        ),

        elt(View, { style: styles.notes },
          elt(Text, { style: { fontFamily: 'Helvetica-Bold', marginBottom: 4 } }, 'Notes méthodologiques'),
          elt(Text, {}, "• PER 80% : exemption de 80% appliquée sur les catégories éligibles (dividendes étrangers, intérêts, royalties, profits commerciaux) sous réserve de respect des Core Income Generating Activities (CIGA)."),
          elt(Text, {}, "• Foreign Tax Credit (FTC) : retenue à la source étrangère, plafonnée à min(impôt étranger payé ; revenu étranger × 15%)."),
          elt(Text, {}, "• Taux d'imposition standard : 15% (Income Tax Act 1995, s.44A)."),
          elt(Text, {}, `• Document généré le ${today()} à partir des données enregistrées dans Lexora.`),
        ),

        elt(View, { style: styles.footer },
          elt(Text, {}, `${societe?.nom || ''} · Rapport PER 80% · Exercice ${exercice} · Document confidentiel`),
        ),
      ),
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `gbc-per_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${exercice}.pdf`
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
