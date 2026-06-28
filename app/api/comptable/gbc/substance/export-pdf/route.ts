import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF — Substance Report (annuel, dépôt FSC).
 *
 * Atteste pour l'exercice :
 *   • Activité principale + ressources allouées (premises, employés, dépenses)
 *   • Core Income Generating Activities (CIGA) tracés
 *   • Auto-assessment compliance vs. exigences FSC
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
  badge:      { fontSize: 9, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, fontFamily: 'Helvetica-Bold' },
  notes:      { marginTop: 18, fontSize: 8, color: '#666', lineHeight: 1.5 },
  footer:     { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 6 },
  attest:     { marginTop: 30, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: '#999' },
  attestRow:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  sigBox:     { width: 200, borderTopWidth: 0.5, borderTopColor: '#444', paddingTop: 4, fontSize: 8, textAlign: 'center', color: '#666' },
})

const fmtN = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: tracking }, { data: requirements }, { data: assessment }, { data: societe }] = await Promise.all([
      supabase.from('gbc_substance_tracking').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle(),
      supabase.from('gbc_substance_requirements').select('*'),
      supabase.rpc('gbc_assess_substance', { p_societe_id: societe_id, p_exercice: exercice }),
      supabase.from('societes').select('nom, brn, regime, devise_fonctionnelle').eq('id', societe_id).single(),
    ])

    const tr: any = tracking || {}
    const ass: any = Array.isArray(assessment) ? assessment[0] : assessment || {}
    const reqs: any[] = requirements || []
    const cigas: any[] = tr.ciga_activities || []

    const statusLabel = ass.overall_status || 'pending'
    const statusBg = statusLabel === 'compliant' ? '#d1fae5' : statusLabel === 'at_risk' ? '#fef3c7' : statusLabel === 'non_compliant' ? '#fee2e2' : '#e5e7eb'
    const statusColor = statusLabel === 'compliant' ? '#065f46' : statusLabel === 'at_risk' ? '#92400e' : statusLabel === 'non_compliant' ? '#991b1b' : '#374151'

    const elt = React.createElement
    const doc = elt(Document, {},
      elt(Page, { size: 'A4', style: styles.page },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe?.nom || '—'),
          societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn} · Régime : ${(societe?.regime || 'GBC').toUpperCase()}`),
          elt(Text, { style: styles.title }, 'Rapport de Substance Économique'),
          elt(Text, { style: styles.subtitle }, `Exercice : ${exercice} · Référentiel : FSC Mauritius — Income Tax (Foreign Source Income) Regulations 2019`),
        ),

        // Status compliance
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Statut compliance global'),
          elt(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } },
            elt(Text, { style: [styles.badge, { backgroundColor: statusBg, color: statusColor }] }, statusLabel.toUpperCase()),
            elt(Text, { style: { fontSize: 9, color: '#666' } }, `Activité : ${tr.activity_code || '—'}`),
          ),
        ),

        // Indicateurs vs exigences
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Indicateurs vs. exigences FSC'),
          elt(View, { style: styles.thead },
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Indicateur'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Requis'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Réel'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Conforme'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Dépenses opérationnelles (MUR)'),
            elt(Text, { style: styles.rowAmount }, fmtN(ass.required_expenditure_mur)),
            elt(Text, { style: styles.rowAmount }, fmtN(ass.actual_expenditure_mur)),
            elt(Text, { style: styles.rowAmount }, ass.expenditure_compliant ? 'Oui' : 'Non'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Employés qualifiés (FTE)'),
            elt(Text, { style: styles.rowAmount }, fmtN(ass.required_employees)),
            elt(Text, { style: styles.rowAmount }, fmtN(ass.actual_employees)),
            elt(Text, { style: styles.rowAmount }, ass.employees_compliant ? 'Oui' : 'Non'),
          ),
          elt(View, { style: styles.row },
            elt(Text, { style: styles.rowLabel }, 'Premises (bureaux à Maurice)'),
            elt(Text, { style: styles.rowAmount }, 'Vérifié'),
            elt(Text, { style: styles.rowAmount }, tr.premises_verified ? 'Oui' : 'Non'),
            elt(Text, { style: styles.rowAmount }, tr.premises_verified ? 'Oui' : 'Non'),
          ),
        ),

        // Premises
        tr.premises_address && elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Locaux à Maurice'),
          elt(Text, { style: { fontSize: 9 } }, tr.premises_address),
        ),

        // CIGA log
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, `Core Income Generating Activities — CIGA (${cigas.length})`),
          cigas.length === 0
            ? elt(Text, { style: { fontSize: 9, color: '#888', padding: 6 } }, 'Aucune CIGA tracée pour cet exercice.')
            : elt(View, {},
                elt(View, { style: styles.thead },
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Date'),
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Type'),
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Lieu'),
                  elt(Text, { style: [styles.rowLabel, styles.th] }, 'Description'),
                ),
                ...cigas.map((c: any, i: number) => elt(View, { key: i, style: styles.row },
                  elt(Text, { style: styles.rowLabel }, c.date || '—'),
                  elt(Text, { style: styles.rowLabel }, c.activity_type || '—'),
                  elt(Text, { style: styles.rowLabel }, c.location || '—'),
                  elt(Text, { style: styles.rowLabel }, (c.description || '').slice(0, 80)),
                )),
              ),
        ),

        // Exigences réglementaires
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Exigences réglementaires de référence'),
          elt(View, { style: styles.thead },
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Code activité'),
            elt(Text, { style: [styles.rowLabel, styles.th] }, 'Libellé'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Min. dépense'),
            elt(Text, { style: [styles.rowAmount, styles.th] }, 'Min. emp.'),
          ),
          ...reqs.map((r: any) => elt(View, { key: r.activity_code, style: styles.row },
            elt(Text, { style: styles.rowLabel }, r.activity_code),
            elt(Text, { style: styles.rowLabel }, r.libelle || '—'),
            elt(Text, { style: styles.rowAmount }, fmtN(r.min_expenditure_mur) + ' MUR'),
            elt(Text, { style: styles.rowAmount }, fmtN(r.min_employees)),
          )),
        ),

        tr.notes && elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Notes'),
          elt(Text, { style: { fontSize: 9 } }, tr.notes),
        ),

        elt(View, { style: styles.attest },
          elt(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold' } }, 'Attestation'),
          elt(Text, { style: { fontSize: 9, marginTop: 4 } }, `Nous certifions que les informations ci-dessus reflètent fidèlement la substance économique de ${societe?.nom || 'la société'} pour l'exercice ${exercice}, conformément aux exigences du Financial Services Commission de Maurice.`),
          elt(View, { style: styles.attestRow },
            elt(View, { style: styles.sigBox },
              elt(Text, {}, 'Directeur / Représentant autorisé'),
            ),
            elt(View, { style: styles.sigBox },
              elt(Text, {}, `Date : ${today()}`),
            ),
          ),
        ),

        elt(View, { style: styles.notes },
          elt(Text, {}, `• Document généré le ${today()} à partir des données Lexora.`),
          elt(Text, {}, '• Référentiel : Income Tax (Foreign Source Income) Regulations 2019 — FSC Circular Substance Requirements.'),
        ),

        elt(View, { style: styles.footer },
          elt(Text, {}, `${societe?.nom || ''} · Substance Report · Exercice ${exercice} · Confidentiel — FSC`),
        ),
      ),
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `gbc-substance_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${exercice}.pdf`
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
