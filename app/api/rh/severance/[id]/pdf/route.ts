/**
 * GET /api/rh/severance/[id]/pdf — sprint G12.5.
 *
 * Télécharge le document officiel PDF "Calcul d'indemnité de
 * licenciement (Severance Allowance)" pour une simulation sauvegardée.
 *
 * Auth : admin / rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { getSimulation, formaterSeverance, formaterAnciennete, MOTIF_LABELS } from '@/lib/rh/severance'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { borderBottomWidth: 2, borderBottomColor: '#0B0F2E', paddingBottom: 8, marginBottom: 12 },
  societeName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  societeMeta: { fontSize: 9, color: '#555', marginTop: 2 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginTop: 12, textAlign: 'center' },
  subtitle: { fontSize: 10, color: '#D4AF37', fontFamily: 'Helvetica-Bold', marginTop: 3, textAlign: 'center' },
  sectionHeader: { backgroundColor: '#0B0F2E', padding: '4 8', borderRadius: 3, marginBottom: 6, marginTop: 12 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: 'white' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 8', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' },
  rowLabel: { fontSize: 9, flex: 1 },
  rowValue: { fontSize: 9, textAlign: 'right', width: 150 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '6 8', backgroundColor: '#f0f0f0', borderTopWidth: 2, borderTopColor: '#0B0F2E', marginTop: 4 },
  totalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', flex: 1 },
  totalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', width: 150, color: '#0B0F2E' },
  netBox: { borderWidth: 2, borderColor: '#0B0F2E', borderRadius: 6, padding: 12, marginTop: 14, alignItems: 'center' },
  netLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  netAmount: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginTop: 3 },
  legal: { fontSize: 8, color: '#555', marginTop: 14, lineHeight: 1.5 },
  signBox: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, gap: 20 },
  signCell: { flex: 1, borderTopWidth: 1, borderTopColor: '#888', paddingTop: 6 },
  signLabel: { fontSize: 8, color: '#555' },
  signName: { fontSize: 9, marginTop: 2 },
  footer: { fontSize: 7, color: '#aaa', textAlign: 'center', marginTop: 20 },
})

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(n))
    .replace(/[   ]/g, ' ')
}

function SeverancePDF({ sim, soc }: any) {
  const dateFmt = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '—'
  const brutFmt = `${fmt(sim.severance_brut)} MUR`
  const netFmt = `${fmt(sim.severance_net)} MUR`
  const deductionFmt = `${fmt(sim.deduction_total)} MUR`
  const empNom = sim.employe_nom || '—'

  const Row = ({ label, value }: any) =>
    React.createElement(View, { style: s.row },
      React.createElement(Text, { style: s.rowLabel }, label),
      React.createElement(Text, { style: s.rowValue }, value),
    )

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.header },
        React.createElement(Text, { style: s.societeName }, soc?.nom || 'Société'),
        soc?.adresse ? React.createElement(Text, { style: s.societeMeta }, soc.adresse) : null,
        React.createElement(Text, { style: s.societeMeta },
          `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
        soc?.telephone ? React.createElement(Text, { style: s.societeMeta }, `Tél: ${soc.telephone}`) : null,
      ),

      React.createElement(Text, { style: s.title }, "CALCUL D'INDEMNITÉ DE LICENCIEMENT"),
      React.createElement(Text, { style: s.subtitle }, "Workers' Rights Act 2019 — Section 70"),

      // Infos employé
      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'INFORMATIONS EMPLOYÉ'),
      ),
      React.createElement(Row, { label: 'Nom et prénom', value: empNom }),
      React.createElement(Row, { label: "Poste", value: sim.employes?.poste || '—' }),
      React.createElement(Row, { label: 'NIC', value: sim.employes?.nic_number || '—' }),
      React.createElement(Row, { label: "Date d'arrivée", value: dateFmt(sim.date_arrivee) }),
      React.createElement(Row, { label: 'Date de licenciement', value: dateFmt(sim.date_licenciement) }),
      React.createElement(Row, {
        label: 'Ancienneté',
        value: `${formaterAnciennete(sim.anciennete_annees, sim.anciennete_mois_additionnels)}  (${Number(sim.anciennete_total_mois).toFixed(2)} mois)`,
      }),
      React.createElement(Row, {
        label: 'Motif du licenciement',
        value: sim.motif_licenciement ? MOTIF_LABELS[sim.motif_licenciement as keyof typeof MOTIF_LABELS] : '—',
      }),

      // Base de calcul
      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'BASE DE CALCUL'),
      ),
      React.createElement(Row, { label: 'Dernier mois complet', value: `${fmt(sim.dernier_mois_remuneration)} MUR` }),
      React.createElement(Row, { label: 'Moyenne des 12 derniers mois', value: `${fmt(sim.moyenne_12_mois)} MUR` }),
      React.createElement(Row, {
        label: `Base retenue (${sim.base_mois_retenue === 'dernier_mois' ? 'dernier mois' : 'moyenne 12 mois'})`,
        value: `${fmt(sim.mois_remuneration_retenu)} MUR`,
      }),

      // Calcul severance brut
      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'CALCUL SEVERANCE (WRA S.70)'),
      ),
      React.createElement(Row, {
        label: `Formule : 3 × ${fmt(sim.mois_remuneration_retenu)} × (${Number(sim.anciennete_total_mois).toFixed(2)} / 12)`,
        value: brutFmt,
      }),
      React.createElement(View, { style: s.totalRow },
        React.createElement(Text, { style: s.totalLabel }, 'SEVERANCE BRUT'),
        React.createElement(Text, { style: s.totalValue }, brutFmt),
      ),

      // Déductions
      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'DÉDUCTIONS'),
      ),
      React.createElement(Row, { label: 'Gratifications versées', value: `− ${fmt(sim.deduction_gratifications)} MUR` }),
      React.createElement(Row, { label: 'Pension privée', value: `− ${fmt(sim.deduction_pension_privee)} MUR` }),
      React.createElement(Row, { label: 'PRGF', value: `− ${fmt(sim.deduction_prgf)} MUR` }),
      React.createElement(View, { style: s.totalRow },
        React.createElement(Text, { style: s.totalLabel }, 'TOTAL DÉDUCTIONS'),
        React.createElement(Text, { style: s.totalValue }, `− ${deductionFmt}`),
      ),

      // Net
      React.createElement(View, { style: s.netBox },
        React.createElement(Text, { style: s.netLabel }, 'SEVERANCE NET À PAYER'),
        React.createElement(Text, { style: s.netAmount }, netFmt),
      ),

      // Mentions + signatures
      React.createElement(Text, { style: s.legal },
        "Ce document est un calcul d'indemnité de licenciement établi conformément à la Section 70 du Workers' Rights Act 2019 de Maurice. " +
        "Le montant dû est égal à 3 fois la rémunération mensuelle retenue (plus favorable entre le dernier mois complet et la moyenne des 12 mois précédents), " +
        "multiplié par le ratio d'ancienneté (mois / 12). L'éligibilité requiert au moins 12 mois d'ancienneté continue et un licenciement non justifié " +
        "ou une redundancy injustifiée. Ce document est à conserver 5 ans minimum (WRA S.116).",
      ),
      React.createElement(View, { style: s.signBox },
        React.createElement(View, { style: s.signCell },
          React.createElement(Text, { style: s.signLabel }, "Signature de l'employeur"),
          React.createElement(Text, { style: s.signName }, soc?.nom || ''),
        ),
        React.createElement(View, { style: s.signCell },
          React.createElement(Text, { style: s.signLabel }, "Signature de l'employé"),
          React.createElement(Text, { style: s.signName }, empNom),
        ),
      ),

      React.createElement(Text, { style: s.footer },
        `Généré le ${new Date().toLocaleDateString('fr-FR')} — Réf. severance ${sim.id.slice(0, 8)}`,
      ),
    ),
  )
}

export async function GET(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return new NextResponse('Non autorisé', { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (!['admin', 'rh'].includes(role)) return new NextResponse('Accès refusé', { status: 403 })

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return new NextResponse('id requis', { status: 400 })

    const sim = await getSimulation(supabase, id)
    if (!sim) return new NextResponse('Simulation introuvable', { status: 404 })

    const { data: soc } = await supabase
      .from('societes').select('*').eq('id', sim.societe_id).maybeSingle()

    const doc = React.createElement(SeverancePDF, { sim, soc })
    const buffer = await renderToBuffer(doc as any)
    const filename = `severance_${(sim.employe_nom || 'employe').replace(/\s+/g, '_')}_${sim.date_licenciement}.pdf`

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return new NextResponse(`Erreur: ${e?.message || 'serveur'}`, { status: 500 })
  }
}

// Suppress unused warning for helper
void formaterSeverance
