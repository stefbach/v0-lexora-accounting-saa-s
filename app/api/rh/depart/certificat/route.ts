import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

/**
 * Sprint 14 BONUS — Certificat de travail (WRA Art. 22(3)).
 *
 * GET /api/rh/depart/certificat?employe_id=UUID
 *
 * L'employeur DOIT remettre un certificat de travail à tout
 * employé qui quitte l'entreprise. Mentions :
 *   - Nom/prénom employé + NIC
 *   - Poste occupé + département
 *   - Date d'entrée et de sortie
 *   - Type de départ
 *   - Nom société + ERN/BRN
 *   - Date d'émission
 */

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TYPE_LABELS: Record<string, string> = {
  demission: 'Démission',
  licenciement: 'Licenciement',
  fin_contrat: 'Fin de contrat',
  retraite: 'Départ à la retraite',
  deces: 'Décès',
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 11, color: '#1a1a1a', lineHeight: 1.6 },
  header: { textAlign: 'center', marginBottom: 30 },
  companyName: { fontSize: 16, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  companyInfo: { fontSize: 9, color: '#555', marginTop: 3 },
  title: { fontSize: 18, fontWeight: 'bold', fontFamily: 'Helvetica-Bold', textAlign: 'center', marginVertical: 25, textTransform: 'uppercase', color: '#0B0F2E', borderBottomWidth: 2, borderBottomColor: '#D4AF37', paddingBottom: 10 },
  body: { marginTop: 10 },
  paragraph: { fontSize: 11, marginBottom: 12, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  footer: { marginTop: 50, flexDirection: 'row', justifyContent: 'space-between' },
  signatureBlock: { width: '45%' },
  signatureLabel: { fontSize: 9, color: '#555', marginBottom: 5 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 50, marginBottom: 5 },
  signatureName: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  legal: { fontSize: 8, color: '#888', textAlign: 'center', marginTop: 40, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 10 },
})

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function CertificatPDF({ emp, soc }: { emp: any; soc: any }) {
  const typeLabel = TYPE_LABELS[emp.type_depart] || emp.type_depart || 'Départ'

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.header },
        React.createElement(Text, { style: s.companyName }, soc?.nom || 'Société'),
        soc?.adresse ? React.createElement(Text, { style: s.companyInfo }, soc.adresse) : null,
        React.createElement(Text, { style: s.companyInfo },
          `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}${soc?.telephone ? ` | Tél: ${soc.telephone}` : ''}`
        ),
      ),
      React.createElement(Text, { style: s.title }, 'CERTIFICAT DE TRAVAIL'),
      React.createElement(View, { style: s.body },
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, null, 'Je soussigné(e), représentant légal de la société '),
          React.createElement(Text, { style: s.bold }, soc?.nom || '________'),
          React.createElement(Text, null, ', certifie que :'),
        ),
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, { style: s.bold }, `${emp.prenom || ''} ${emp.nom || ''}`),
          emp.nic_number || emp.nic ? React.createElement(Text, null, ` (NIC: ${emp.nic_number || emp.nic})`) : null,
          React.createElement(Text, null, ` a été employé(e) au sein de notre société en qualité de `),
          React.createElement(Text, { style: s.bold }, emp.poste || '________'),
          emp.departement ? React.createElement(Text, null, ` au département ${emp.departement}`) : null,
          React.createElement(Text, null, '.'),
        ),
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, null, "Date d'entrée : "),
          React.createElement(Text, { style: s.bold }, fmtDate(emp.date_arrivee)),
          React.createElement(Text, null, '\nDate de sortie : '),
          React.createElement(Text, { style: s.bold }, fmtDate(emp.date_depart)),
          React.createElement(Text, null, '\nMotif de cessation : '),
          React.createElement(Text, { style: s.bold }, typeLabel),
        ),
        React.createElement(Text, { style: s.paragraph },
          `Ce certificat est délivré à l'intéressé(e) pour servir et valoir ce que de droit, conformément à l'article 22(3) du Workers' Rights Act 2019.`
        ),
        React.createElement(Text, { style: s.paragraph },
          `Fait à Port Louis, le ${fmtDate(new Date().toISOString().slice(0, 10))}.`
        ),
      ),
      React.createElement(View, { style: s.footer },
        React.createElement(View, { style: s.signatureBlock },
          React.createElement(Text, { style: s.signatureLabel }, "Pour l'employeur"),
          React.createElement(View, { style: s.signatureLine }),
          React.createElement(Text, { style: s.signatureName }, soc?.nom || ''),
          React.createElement(Text, { style: { fontSize: 8, color: '#888' } }, 'Signature et cachet'),
        ),
        React.createElement(View, { style: s.signatureBlock },
          React.createElement(Text, { style: s.signatureLabel }, "L'employé(e)"),
          React.createElement(View, { style: s.signatureLine }),
          React.createElement(Text, { style: s.signatureName }, `${emp.prenom || ''} ${emp.nom || ''}`),
          React.createElement(Text, { style: { fontSize: 8, color: '#888' } }, 'Lu et approuvé'),
        ),
      ),
      React.createElement(Text, { style: s.legal },
        "Document généré par Lexora — Workers' Rights Act 2019, Art. 22(3). Ce certificat atteste uniquement des dates d'emploi et de la fonction exercée."
      ),
    )
  )
}

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
    if (!emp.date_depart) return NextResponse.json({ error: 'Employé toujours en poste — le certificat de travail ne peut être généré que pour un employé qui a quitté.' }, { status: 400 })

    const { data: soc } = await supabase.from('societes').select('*').eq('id', emp.societe_id).single()

    const buffer = await renderToBuffer(
      React.createElement(CertificatPDF, { emp, soc }) as any
    )

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Certificat_Travail_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/certificat]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
