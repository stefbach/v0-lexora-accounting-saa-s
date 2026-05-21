/**
 * Attestation de fin de contrat.
 *
 * GET  /api/rh/depart/attestation?employe_id=…&date_depart=…&type_depart=…
 * POST /api/rh/depart/attestation  { employe_id, date_depart, type_depart }
 *
 * Mode brouillon (watermark) si l'employé n'est pas encore marqué sorti.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text } from '@react-pdf/renderer'
import {
  sharedStyles as s,
  TYPE_LABELS, fmtDate, ancienneteLabel,
  PdfHeader, PdfFooter, PdfWatermark, SigBlock,
} from '@/lib/rh/depart-pdf-shared'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function AttestationPDF({ emp, soc, dateDepart, typeDepart, draft }: {
  emp: any; soc: any; dateDepart: string; typeDepart: string; draft: boolean
}) {
  const typeLabel = TYPE_LABELS[typeDepart] || 'Cessation du contrat'
  const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim() || '________'
  const anc = ancienneteLabel(emp.date_arrivee, dateDepart)
  const docNumber = `AFC-${(emp.code || emp.id || '').toString().slice(0, 8).toUpperCase()}-${(dateDepart || '').replace(/-/g, '')}`

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      draft ? React.createElement(PdfWatermark as any, {}) : null,
      React.createElement(PdfHeader as any, { soc, docKind: 'Attestation officielle', docNumber }),
      React.createElement(Text, { style: s.docTitle }, "Attestation de fin de contrat"),
      React.createElement(Text, { style: s.subTitle }, "Workers' Rights Act 2019"),

      React.createElement(Text, { style: s.paragraph },
        React.createElement(Text, null, 'Je soussigné(e), représentant légal de la société '),
        React.createElement(Text, { style: s.bold }, soc?.nom || '________'),
        React.createElement(Text, null, ', atteste par la présente que :'),
      ),

      React.createElement(View, { style: { backgroundColor: '#F8F9FC', padding: 12, marginVertical: 8, borderRadius: 2 } },
        React.createElement(View, { style: s.infoGrid },
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Nom et prénom"),
            React.createElement(Text, { style: s.infoValue }, fullName),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "N° NIC"),
            React.createElement(Text, { style: s.infoValue }, emp.nic_number || emp.nic || '—'),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Fonction"),
            React.createElement(Text, { style: s.infoValue }, emp.poste || '—'),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Type de contrat"),
            React.createElement(Text, { style: s.infoValue }, emp.type_contrat || 'CDI'),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date d'entrée"),
            React.createElement(Text, { style: s.infoValue }, fmtDate(emp.date_arrivee)),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date effective de fin"),
            React.createElement(Text, { style: s.infoValue }, fmtDate(dateDepart)),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Ancienneté"),
            React.createElement(Text, { style: s.infoValue }, anc),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Motif de cessation"),
            React.createElement(Text, { style: s.infoValue }, typeLabel),
          ),
        ),
      ),

      React.createElement(View, { style: s.section },
        React.createElement(Text, { style: s.sectionTitle }, 'Engagements de fin de contrat'),
        React.createElement(Text, { style: s.paragraph },
          `Les droits acquis par l'employé(e) au titre du contrat de travail — congés annuels non pris, ` +
          `13ème mois proratisé, préavis et indemnités éventuelles — ont été réglés conformément au solde de tout compte ` +
          `établi à la date de fin de contrat.`
        ),
        React.createElement(Text, { style: s.paragraph },
          'Les obligations de confidentialité et de non-concurrence, si elles figurent au contrat de travail initial, ' +
          'restent applicables selon les termes convenus entre les parties.'
        ),
        typeDepart === 'licenciement_faute'
          ? React.createElement(Text, { style: s.paragraph },
              "Cette rupture étant fondée sur un motif disciplinaire, l'employé(e) reçoit l'indemnité de préavis " +
              "due (1 mois). Aucune indemnité de licenciement WRA S.70 n'est versée."
            )
          : null,
      ),

      React.createElement(SigBlock as any, {
        socName: soc?.nom || '',
        empFullName: fullName,
        dateLieu: `Fait à ${soc?.ville || 'Ebène'}, le ${fmtDate(new Date().toISOString().slice(0, 10))}.`,
      }),

      React.createElement(PdfFooter as any, {
        legal: "Attestation de fin de contrat — WRA 2019. Document à conserver par l'employé(e)."
      }),
    )
  )
}

async function loadEmpAndSoc(employe_id: string) {
  const supabase = getAdminClient()
  const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
  if (!emp) return { error: 'Employé introuvable', status: 404 }
  const { data: soc } = await supabase.from('societes').select('*').eq('id', emp.societe_id).single()
  return { emp, soc }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    if (!(await userHasAccessToEmploye(user.id, employe_id))) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const r = await loadEmpAndSoc(employe_id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { emp, soc } = r

    const dateDepart = searchParams.get('date_depart') || emp.date_depart
    const typeDepart = searchParams.get('type_depart') || emp.date_depart_type || emp.type_depart || ''
    if (!dateDepart) return NextResponse.json({ error: 'Date de départ manquante' }, { status: 400 })
    const draft = !emp.date_depart

    const buffer = await renderToBuffer(
      React.createElement(AttestationPDF, { emp, soc, dateDepart, typeDepart, draft }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Attestation_Fin_Contrat_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/attestation] GET', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { employe_id, date_depart, type_depart } = body
    if (!employe_id || !date_depart) return NextResponse.json({ error: 'employe_id + date_depart requis' }, { status: 400 })
    if (!(await userHasAccessToEmploye(user.id, employe_id))) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const r = await loadEmpAndSoc(employe_id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { emp, soc } = r

    const draft = !emp.date_depart
    const buffer = await renderToBuffer(
      React.createElement(AttestationPDF, { emp, soc, dateDepart: date_depart, typeDepart: type_depart || '', draft }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Attestation_Fin_Contrat_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/attestation] POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
