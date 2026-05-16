import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

/**
 * Sprint 16 FIX 4 — Déclaration Workfare TUB (Transition Unemployment Benefit).
 *
 * WRA 2019 + Workfare Programme : pour les licenciements économiques,
 * l'employeur doit déclarer l'employé au Workfare Fund dans les 7 jours.
 * Ce PDF est à soumettre via MRA E-services ou au bureau Workfare.
 */

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}
function fmtMur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/[\u00A0\u202F\u2009]/g, ' ') + ' MUR'
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', lineHeight: 1.5 },
  header: { textAlign: 'center', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#0B0F2E', paddingBottom: 10 },
  company: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  info: { fontSize: 8, color: '#555', marginTop: 2 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginVertical: 15, color: '#c0392b' },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#555', marginBottom: 15 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', padding: '3 0', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  label: { width: 200, fontFamily: 'Helvetica-Bold', color: '#444', fontSize: 10 },
  value: { flex: 1, fontSize: 10 },
  notice: { marginTop: 15, padding: 10, borderWidth: 1, borderColor: '#e74c3c', borderRadius: 4, backgroundColor: '#fdf0f0' },
  noticeText: { fontSize: 9, color: '#c0392b' },
  sigBlock: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox: { width: '45%' },
  sigLabel: { fontSize: 8, color: '#555', marginBottom: 3 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 35, marginBottom: 4 },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  legal: { fontSize: 7, color: '#888', textAlign: 'center', marginTop: 20, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 8 },
})

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })

    const hasAccess = await userHasAccessToEmploye(user.id, employe_id)
    if (!hasAccess) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const supabase = getAdminClient()
    const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
    if (!emp) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })

    // Override possible via query string (mode preview avant confirmation)
    const dateDepartParam = searchParams.get('date_depart') || emp.date_depart
    if (!dateDepartParam) return NextResponse.json({
      error: 'Date de départ manquante — utilisez ?date_depart=YYYY-MM-DD pour un brouillon.',
    }, { status: 400 })
    const draft = !emp.date_depart
    const empForPdf = { ...emp, date_depart: dateDepartParam }

    const { data: soc } = await supabase.from('societes').select('*').eq('id', emp.societe_id).single()

    const { data: lastBulletins } = await supabase.from('bulletins_paie')
      .select('salaire_brut').eq('employe_id', employe_id)
      .order('periode', { ascending: false }).limit(3)
    const avgSalary = (lastBulletins || []).length > 0
      ? Math.round((lastBulletins || []).reduce((s: number, b: any) => s + (Number(b.salaire_brut) || 0), 0) / (lastBulletins || []).length)
      : Number(emp.salaire_base) || 0

    const pdf = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: s.page },
        draft ? React.createElement(Text, {
          style: { position: 'absolute', top: 320, left: 80, width: 440,
                   transform: 'rotate(-22deg)', fontSize: 92, color: 'rgba(212,175,55,0.16)',
                   fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 6 },
          fixed: true,
        } as any, 'BROUILLON') : null,
        React.createElement(View, { style: s.header },
          React.createElement(Text, { style: s.company }, soc?.nom || ''),
          React.createElement(Text, { style: s.info }, `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
          soc?.adresse ? React.createElement(Text, { style: s.info }, soc.adresse) : null,
        ),
        React.createElement(Text, { style: s.title }, 'DÉCLARATION WORKFARE — TUB'),
        React.createElement(Text, { style: s.subtitle }, 'Transition Unemployment Benefit (Workers\' Rights Act 2019 + Workfare Programme)'),

        React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Informations employeur"),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Société :'), React.createElement(Text, { style: s.value }, soc?.nom || '—')),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'ERN :'), React.createElement(Text, { style: s.value }, soc?.ern || '—')),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'BRN :'), React.createElement(Text, { style: s.value }, soc?.brn || '—')),
        ),

        React.createElement(View, { style: s.section },
          React.createElement(Text, { style: s.sectionTitle }, "Informations employé licencié"),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Nom complet :'), React.createElement(Text, { style: s.value }, `${empForPdf.prenom || ''} ${empForPdf.nom || ''}`)),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'NIC :'), React.createElement(Text, { style: s.value }, emp.nic_number || emp.nic || '—')),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Poste :'), React.createElement(Text, { style: s.value }, emp.poste || '—')),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Date de départ :'), React.createElement(Text, { style: s.value }, fmtDate(empForPdf.date_depart))),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Motif :'), React.createElement(Text, { style: s.value }, 'Licenciement pour raison économique')),
          React.createElement(View, { style: s.row }, React.createElement(Text, { style: s.label }, 'Salaire mensuel moyen (3 derniers mois) :'), React.createElement(Text, { style: s.value }, fmtMur(avgSalary))),
        ),

        React.createElement(View, { style: s.notice },
          React.createElement(Text, { style: s.noticeText }, "IMPORTANT : Cette déclaration doit être soumise dans les 7 jours suivant le licenciement via MRA E-services (https://eservices.mra.mu) ou au bureau Workfare le plus proche. L'employé licencié pourra bénéficier du TUB (Transition Unemployment Benefit) conformément au Workfare Programme."),
        ),

        React.createElement(View, { style: s.sigBlock },
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "Signature et cachet employeur"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, soc?.nom || ''),
            React.createElement(Text, { style: { fontSize: 8, color: '#888' } }, `Date : ${fmtDate(new Date().toISOString().slice(0, 10))}`),
          ),
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "Signature employé"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, `${empForPdf.prenom || ''} ${empForPdf.nom || ''}`),
          ),
        ),
        React.createElement(Text, { style: s.legal }, "Workers' Rights Act 2019 + Workfare Programme. À soumettre aux autorités compétentes."),
      )
    )
    const buffer = await renderToBuffer(pdf as any)
    return new NextResponse(buffer as any, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Declaration_Workfare_TUB_${empForPdf.prenom}_${empForPdf.nom}.pdf"` } })
  } catch (e: unknown) {
    console.error('[depart/workfare]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
