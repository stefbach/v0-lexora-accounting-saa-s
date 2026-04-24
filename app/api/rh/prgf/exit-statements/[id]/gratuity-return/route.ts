/**
 * GET /api/rh/prgf/exit-statements/[id]/gratuity-return — sprint G13.
 * Génère le PDF "Gratuity Return" (MRA form) pour un exit statement.
 * Auth : admin + rh.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { MOTIF_EXIT_LABELS, type MotifExit, formaterMUR, libellePeriode } from '@/lib/rh/declarations-mra'

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
  rowValue: { fontSize: 9, textAlign: 'right', width: 220 },
  box: { borderWidth: 2, borderColor: '#0B0F2E', borderRadius: 6, padding: 12, marginTop: 14, alignItems: 'center' },
  boxLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  boxAmount: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginTop: 3 },
  legal: { fontSize: 8, color: '#555', marginTop: 14, lineHeight: 1.5 },
  footer: { fontSize: 7, color: '#aaa', textAlign: 'center', marginTop: 20 },
})

function GratuityReturnPDF({ exit: ex, emp, soc }: any) {
  const Row = (label: string, value: string) =>
    React.createElement(View, { style: s.row },
      React.createElement(Text, { style: s.rowLabel }, label),
      React.createElement(Text, { style: s.rowValue }, value),
    )
  const dateFmt = (d: string | null) =>
    d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '—'

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.header },
        React.createElement(Text, { style: s.societeName }, soc?.nom || 'Société'),
        soc?.adresse ? React.createElement(Text, { style: s.societeMeta }, soc.adresse) : null,
        React.createElement(Text, { style: s.societeMeta },
          `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
      ),

      React.createElement(Text, { style: s.title }, 'GRATUITY RETURN — PRGF Exit'),
      React.createElement(Text, { style: s.subtitle }, 'Workers\' Rights Act 2019 — PRGF Section'),

      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'EMPLOYEE DETAILS'),
      ),
      Row('Name', `${emp?.prenom || ''} ${emp?.nom || ''}`.trim()),
      Row('NIC', emp?.nic_number || emp?.nic || '—'),
      Row('TAN', emp?.tan_number || emp?.tan || '—'),
      Row('Date of joining', dateFmt(emp?.date_arrivee)),
      Row('Date of exit', dateFmt(ex.date_exit)),
      Row('Reason for exit', MOTIF_EXIT_LABELS[ex.motif_exit as MotifExit] || ex.motif_exit),

      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'FINAL REMUNERATION'),
      ),
      Row('Last month remuneration', formaterMUR(Number(ex.dernier_mois_remuneration) || 0)),
      Row('12-month average', formaterMUR(Number(ex.moyenne_12_mois) || 0)),
      Row('Retained (higher)', formaterMUR(Number(ex.final_remuneration) || 0)),

      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'GRATUITY PAID BY EMPLOYER'),
      ),
      Row('Gratuity amount', formaterMUR(Number(ex.gratuity_paid_mur) || 0)),
      Row('Date of payment', dateFmt(ex.gratuity_date_paiement)),
      Row('Return deadline (15 days)', dateFmt(ex.gratuity_return_deadline)),

      ex.past_services_due_mur > 0
        ? React.createElement(View, {},
            React.createElement(View, { style: s.sectionHeader },
              React.createElement(Text, { style: s.sectionTitle }, 'PAST SERVICES'),
            ),
            Row('Amount due', formaterMUR(Number(ex.past_services_due_mur) || 0)),
            Row('Settled', ex.past_services_settled ? 'YES' : 'NO'),
            Row('Date paid', dateFmt(ex.past_services_date_paiement)),
          )
        : null,

      React.createElement(View, { style: s.box },
        React.createElement(Text, { style: s.boxLabel }, 'TOTAL GRATUITY PAID'),
        React.createElement(Text, { style: s.boxAmount }, formaterMUR(Number(ex.gratuity_paid_mur) || 0)),
      ),

      React.createElement(Text, { style: s.legal },
        'This Gratuity Return must be submitted to the MRA within 15 days ' +
        'of payment in accordance with the Workers\' Rights Act 2019 (PRGF ' +
        'provisions). Keep this document for at least 5 years (WRA S.116).',
      ),

      React.createElement(Text, { style: s.footer },
        `Generated on ${new Date().toLocaleDateString('fr-FR')} — Ref ${String(ex.id).slice(0, 8)}`,
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

    const { data: ex } = await supabase
      .from('prgf_exit_statements')
      .select('*').eq('id', id).maybeSingle()
    if (!ex) return new NextResponse('Exit statement introuvable', { status: 404 })

    const [{ data: emp }, { data: soc }] = await Promise.all([
      supabase.from('employes').select('*').eq('id', (ex as any).employe_id).maybeSingle(),
      supabase.from('societes').select('*').eq('id', (ex as any).societe_id).maybeSingle(),
    ])

    const doc = React.createElement(GratuityReturnPDF, { exit: ex, emp, soc })
    const buffer = await renderToBuffer(doc as any)
    const nomFile = `${(emp as any)?.nom || 'employe'}`.replace(/\s+/g, '_')
    const filename = `gratuity_return_${nomFile}_${(ex as any).date_exit}.pdf`

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

// Silence unused import warning (libellePeriode reserved for future use)
void libellePeriode
