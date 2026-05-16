/**
 * Certificat de travail (WRA Art. 22(3)).
 *
 * Deux modes :
 *   - GET  /api/rh/depart/certificat?employe_id=UUID
 *           Mode "officiel" : exige que l'employé soit déjà sorti
 *           (date_depart non null). Le certificat est définitif.
 *
 *   - POST /api/rh/depart/certificat
 *           Body : { employe_id, date_depart, type_depart }
 *           Mode "preview / brouillon" : avant confirmation du
 *           départ. Le PDF porte le watermark BROUILLON.
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

function CertificatPDF({ emp, soc, dateDepart, typeDepart, draft }: {
  emp: any; soc: any; dateDepart: string; typeDepart: string; draft: boolean
}) {
  const typeLabel = TYPE_LABELS[typeDepart] || 'Cessation du contrat'
  const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim() || '________'
  const anc = ancienneteLabel(emp.date_arrivee, dateDepart)
  const docNumber = `CT-${(emp.code || emp.id || '').toString().slice(0, 8).toUpperCase()}-${(dateDepart || '').replace(/-/g, '')}`

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      draft ? React.createElement(PdfWatermark as any, {}) : null,

      React.createElement(PdfHeader as any, { soc, docKind: 'Document RH officiel', docNumber }),

      React.createElement(Text, { style: s.docTitle }, 'Certificat de travail'),
      React.createElement(Text, { style: s.subTitle }, "Workers' Rights Act 2019 — Section 22(3)"),

      React.createElement(View, { style: s.section },
        React.createElement(Text, { style: s.paragraph },
          React.createElement(Text, null, 'Je soussigné(e), représentant légal de la société '),
          React.createElement(Text, { style: s.bold }, soc?.nom || '________'),
          React.createElement(Text, null, ', certifie par la présente que :'),
        ),
      ),

      // Bloc identité
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
            React.createElement(Text, { style: s.infoLabel }, "Département"),
            React.createElement(Text, { style: s.infoValue }, emp.departement || '—'),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date d'entrée"),
            React.createElement(Text, { style: s.infoValue }, fmtDate(emp.date_arrivee)),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date de sortie"),
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

      React.createElement(Text, { style: s.paragraph },
        `Pendant la durée de son emploi, ${fullName} a exercé ses fonctions avec sérieux et professionnalisme. ` +
        `Ce certificat est délivré à l'intéressé(e) pour servir et valoir ce que de droit, conformément à l'article 22(3) du Workers' Rights Act 2019.`
      ),

      React.createElement(SigBlock as any, {
        socName: soc?.nom || '',
        empFullName: fullName,
        dateLieu: `Fait à ${soc?.ville || 'Port-Louis'}, le ${fmtDate(new Date().toISOString().slice(0, 10))}.`,
      }),

      React.createElement(PdfFooter as any, {
        legal: "Certificat de travail — atteste uniquement de la nature et de la durée de l'emploi. WRA 2019 §22(3)."
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
    if (!(await userHasAccessToEmploye(user.id, employe_id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const r = await loadEmpAndSoc(employe_id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { emp, soc } = r

    // Override possible via query (mode preview avant confirmation)
    const dateDepart = searchParams.get('date_depart') || emp.date_depart
    const typeDepart = searchParams.get('type_depart') || emp.date_depart_type || emp.type_depart || ''
    if (!dateDepart) return NextResponse.json({
      error: 'Date de départ manquante — passez ?date_depart=YYYY-MM-DD&type_depart=... pour un brouillon.',
    }, { status: 400 })
    const draft = !emp.date_depart // brouillon si l'employé n'est pas encore marqué sorti

    const buffer = await renderToBuffer(
      React.createElement(CertificatPDF, { emp, soc, dateDepart, typeDepart, draft }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Certificat_Travail_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/certificat] GET', e)
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
    if (!(await userHasAccessToEmploye(user.id, employe_id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const r = await loadEmpAndSoc(employe_id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { emp, soc } = r

    const draft = !emp.date_depart
    const buffer = await renderToBuffer(
      React.createElement(CertificatPDF, { emp, soc, dateDepart: date_depart, typeDepart: type_depart || '', draft }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Certificat_Travail_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/certificat] POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
