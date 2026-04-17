import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

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

const TYPE_LABELS: Record<string, string> = {
  demission: 'Démission volontaire',
  licenciement: 'Licenciement',
  fin_contrat: 'Fin de contrat à durée déterminée',
  retraite: 'Départ à la retraite',
  deces: 'Décès',
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, color: '#1a1a1a', lineHeight: 1.6 },
  header: { textAlign: 'center', marginBottom: 25 },
  company: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  info: { fontSize: 8, color: '#555', marginTop: 2 },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginVertical: 20, textTransform: 'uppercase', color: '#0B0F2E', borderBottomWidth: 2, borderBottomColor: '#D4AF37', paddingBottom: 8 },
  paragraph: { fontSize: 11, marginBottom: 12, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  list: { marginLeft: 15, marginBottom: 12 },
  listItem: { fontSize: 10, marginBottom: 4 },
  sigBlock: { marginTop: 40, flexDirection: 'row', justifyContent: 'space-between' },
  sigBox: { width: '45%' },
  sigLabel: { fontSize: 8, color: '#555', marginBottom: 3 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 40, marginBottom: 4 },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  legal: { fontSize: 7, color: '#888', textAlign: 'center', marginTop: 30, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 8 },
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
    if (!emp.date_depart) return NextResponse.json({ error: 'Employé toujours en poste' }, { status: 400 })
    const { data: soc } = await supabase.from('societes').select('*').eq('id', emp.societe_id).single()

    const typeLabel = TYPE_LABELS[emp.date_depart_type || emp.type_depart] || 'Cessation du contrat'

    const pdf = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: s.page },
        React.createElement(View, { style: s.header },
          React.createElement(Text, { style: s.company }, soc?.nom || ''),
          soc?.adresse ? React.createElement(Text, { style: s.info }, soc.adresse) : null,
          React.createElement(Text, { style: s.info }, `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
        ),
        React.createElement(Text, { style: s.title }, 'ATTESTATION DE FIN DE CONTRAT'),
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, null, 'Je soussigné(e), représentant légal de la société '),
          React.createElement(Text, { style: s.bold }, soc?.nom || '________'),
          React.createElement(Text, null, ', atteste par la présente que :'),
        ),
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, { style: s.bold }, `${emp.prenom || ''} ${emp.nom || ''}`),
          emp.nic_number || emp.nic ? React.createElement(Text, null, ` (NIC: ${emp.nic_number || emp.nic})`) : null,
          React.createElement(Text, null, `, occupant le poste de `),
          React.createElement(Text, { style: s.bold }, emp.poste || '________'),
          React.createElement(Text, null, ', a vu son contrat de travail prendre fin selon les modalités suivantes :'),
        ),
        React.createElement(View, { style: s.list },
          React.createElement(Text, { style: s.listItem }, `• Date d'entrée en fonction : ${fmtDate(emp.date_arrivee)}`),
          React.createElement(Text, { style: s.listItem }, `• Date effective de fin de contrat : ${fmtDate(emp.date_depart)}`),
          React.createElement(Text, { style: s.listItem }, `• Motif de cessation : ${typeLabel}`),
        ),
        React.createElement(Text, { style: s.paragraph },
          'Les droits acquis par l\'employé(e) au titre du contrat de travail (congés annuels non pris, 13ème mois proratisé, indemnités éventuelles) ont été réglés conformément au solde de tout compte établi à la date de fin de contrat.'
        ),
        React.createElement(Text, { style: s.paragraph },
          'Les obligations de confidentialité et de non-concurrence, si elles figurent au contrat de travail initial, restent applicables selon les termes convenus.'
        ),
        React.createElement(Text, { style: s.paragraph },
          `Fait à Port Louis, le ${fmtDate(new Date().toISOString().slice(0, 10))}.`
        ),
        React.createElement(View, { style: s.sigBlock },
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "Pour l'employeur"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, soc?.nom || ''),
          ),
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "L'employé(e)"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, `${emp.prenom || ''} ${emp.nom || ''}`),
          ),
        ),
        React.createElement(Text, { style: s.legal },
          "Attestation générée par Lexora — conformément aux dispositions du Workers' Rights Act 2019."
        ),
      )
    )
    const buffer = await renderToBuffer(pdf as any)
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Attestation_Fin_Contrat_${emp.prenom}_${emp.nom}.pdf"` } })
  } catch (e: unknown) {
    console.error('[depart/attestation]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
