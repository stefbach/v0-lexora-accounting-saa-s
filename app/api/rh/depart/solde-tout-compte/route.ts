/**
 * Solde de tout compte — PDF officiel.
 *
 * Mode preview (POST avec breakdown UI complet) :
 *   POST { employe_id, date_depart, type_depart, breakdown }
 *   Génère le PDF EXACTEMENT comme affiché à l'écran (montants éditables
 *   + lignes additionnelles incluses). Watermark BROUILLON si non
 *   confirmé.
 *
 * Mode officiel (GET, après confirmation) :
 *   GET ?employe_id=…
 *   Reconstruit le PDF depuis le bulletin_paie sauvegardé.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text } from '@react-pdf/renderer'
import {
  sharedStyles as s,
  TYPE_LABELS, fmtDate, fmtMur, ancienneteLabel,
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

interface SoldeLine { label: string; detail?: string; montant: number }

function SoldePDF({ emp, soc, dateDepart, typeDepart, lines, total, raison, draft }: {
  emp: any; soc: any; dateDepart: string; typeDepart: string
  lines: SoldeLine[]; total: number; raison?: string; draft: boolean
}) {
  const typeLabel = TYPE_LABELS[typeDepart] || 'Cessation du contrat'
  const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim() || '________'
  const anc = ancienneteLabel(emp.date_arrivee, dateDepart)
  const docNumber = `STC-${(emp.code || emp.id || '').toString().slice(0, 8).toUpperCase()}-${(dateDepart || '').replace(/-/g, '')}`

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      draft ? React.createElement(PdfWatermark as any, {}) : null,
      React.createElement(PdfHeader as any, { soc, docKind: 'Solde de tout compte', docNumber }),

      React.createElement(Text, { style: s.docTitle }, 'Solde de tout compte'),
      React.createElement(Text, { style: s.subTitle }, "Workers' Rights Act 2019 — Indemnité de fin de contrat"),

      // Bloc identité
      React.createElement(View, { style: { backgroundColor: '#F8F9FC', padding: 12, marginBottom: 10, borderRadius: 2 } },
        React.createElement(View, { style: s.infoGrid },
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Salarié(e)"),
            React.createElement(Text, { style: s.infoValue }, fullName),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Code / NIC"),
            React.createElement(Text, { style: s.infoValue }, `${emp.code || '—'} · ${emp.nic_number || emp.nic || '—'}`),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Fonction"),
            React.createElement(Text, { style: s.infoValue }, emp.poste || '—'),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Salaire de base mensuel"),
            React.createElement(Text, { style: s.infoValue }, fmtMur(Number(emp.salaire_base) || 0)),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date d'entrée"),
            React.createElement(Text, { style: s.infoValue }, fmtDate(emp.date_arrivee)),
          ),
          React.createElement(View, { style: s.infoCell },
            React.createElement(Text, { style: s.infoLabel }, "Date de fin de contrat"),
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

      // Tableau breakdown
      React.createElement(View, { style: s.section },
        React.createElement(Text, { style: s.sectionTitle }, 'Détail du solde'),
        React.createElement(View, { style: s.tableHead },
          React.createElement(Text, { style: [s.tableHeadCell, { flex: 5 }] }, 'Élément'),
          React.createElement(Text, { style: [s.tableHeadCell, { flex: 4 }] }, 'Détail / Référence'),
          React.createElement(Text, { style: [s.tableHeadCell, { flex: 2, textAlign: 'right' }] }, 'Montant'),
        ),
        ...lines.map((l, i) => {
          const rowStyle = i % 2 === 1 ? [s.tableRow, s.tableRowAlt] : [s.tableRow]
          const amountStyle = l.montant < 0 ? [s.cellAmount, { color: '#B91C1C' }] : [s.cellAmount]
          return React.createElement(View, { key: String(i), style: rowStyle },
            React.createElement(Text, { style: s.cellLabel }, l.label),
            React.createElement(Text, { style: s.cellDetail }, l.detail || ''),
            React.createElement(Text, { style: amountStyle }, fmtMur(l.montant)),
          )
        }),
        React.createElement(View, { style: s.totalRow },
          React.createElement(Text, { style: s.totalLabel }, 'TOTAL NET DÛ'),
          React.createElement(Text, { style: s.totalValue }, fmtMur(total)),
        ),
      ),

      raison ? React.createElement(View, { style: { marginTop: 10 } },
        React.createElement(Text, { style: { fontSize: 8, color: '#6B7280' } }, 'Motif détaillé :'),
        React.createElement(Text, { style: { fontSize: 9 } }, raison),
      ) : null,

      // Mentions légales
      React.createElement(View, { style: { marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: '#D4AF37', borderRadius: 2 } },
        React.createElement(Text, { style: { fontSize: 8, color: '#374151', lineHeight: 1.4 } },
          "Conformément au Workers' Rights Act 2019 : (i) les congés annuels acquis non pris sont indemnisés à raison du salaire journalier moyen ; " +
          "(ii) le 13ème mois (EOY Bonus) est proratisé selon les mois travaillés dans l'année ; " +
          "(iii) le préavis est dû selon l'ancienneté (1 mois pour 3 mois–3 ans, 3 mois au-delà) — sauf pour licenciement pour faute (1 mois fixe). " +
          "L'indemnité de licenciement WRA S.70 n'est versée qu'en cas de licenciement économique non fautif."
        ),
      ),

      React.createElement(SigBlock as any, {
        socName: soc?.nom || '',
        empFullName: fullName,
        dateLieu: `Reçu en règlement définitif et pour solde de tout compte, à ${soc?.ville || 'Ebène'}, le ${fmtDate(new Date().toISOString().slice(0, 10))}.`,
      }),

      React.createElement(PdfFooter as any, {
        legal: `Solde de tout compte — WRA 2019. Ref ${docNumber}. À conserver 5 ans (WRA S.69).`
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

// Construit la liste de lignes à partir d'un breakdown UI (mode preview)
function linesFromBreakdown(b: any): { lines: SoldeLine[]; total: number } {
  const lines: SoldeLine[] = []
  const add = (label: string, detail: string, montant: number) => {
    if (montant !== 0) lines.push({ label, detail, montant })
  }
  if (b?.salaire_prorata) add(
    'Salaire prorata du dernier mois',
    `${b.salaire_prorata.jours_travailles || 0} / ${b.salaire_prorata.jours_mois || 0} jours travaillés`,
    Number(b.salaire_prorata.montant) || 0,
  )
  if (b?.allocations_prorata?.montant) add(
    'Indemnités proratisées',
    `Transport ${fmtMur(b.allocations_prorata.transport || 0)} · Essence ${fmtMur(b.allocations_prorata.petrol || 0)}`,
    Number(b.allocations_prorata.montant) || 0,
  )
  if (b?.conges_al) add(
    'Congés annuels (AL) non pris',
    `${b.conges_al.restant} j × ${fmtMur(b.conges_al.taux_journalier || 0)} (acquis ${b.conges_al.droit_prorata} — pris ${b.conges_al.pris})`,
    Number(b.conges_al.montant) || 0,
  )
  if (b?.treizieme_mois) add(
    '13ème mois proratisé (EOY Bonus)',
    `${b.treizieme_mois.mois_travailles} mois travaillés / 12`,
    Number(b.treizieme_mois.montant) || 0,
  )
  if (b?.preavis?.applicable) add(
    'Indemnité de préavis',
    `${b.preavis.duree_mois} mois — ${b.preavis.description || ''}`,
    Number(b.preavis.montant) || 0,
  )
  if (b?.indemnite_licenciement?.applicable) add(
    'Indemnité de licenciement (WRA S.70)',
    `${b.indemnite_licenciement.formule} — ${b.indemnite_licenciement.annees_service} an(s)`,
    Number(b.indemnite_licenciement.montant) || 0,
  )
  const extras: Array<{ libelle: string; montant: number; note?: string }> = Array.isArray(b?.lignes_extra) ? b.lignes_extra : []
  for (const ex of extras) {
    add(ex.libelle, ex.note || 'Ajustement manuel', Number(ex.montant) || 0)
  }
  const total = Number(b?.total) || lines.reduce((s, l) => s + l.montant, 0)
  return { lines, total }
}

// Parse les "Ajustements : LIBELLE -1234.56 MUR ; LIBELLE2 +789 MUR (note)"
// stockés dans bulletin.notes. Retourne les lignes_extra reconstruites +
// la somme à déduire du total special_allowance_2 (treizMois pur).
function parseAjustementsFromNotes(notes: string | null | undefined): {
  ajustements: Array<{ libelle: string; montant: number; note?: string }>
  total: number
  rawRaison: string
} {
  const ajustements: Array<{ libelle: string; montant: number; note?: string }> = []
  if (!notes) return { ajustements, total: 0, rawRaison: '' }

  const segments = notes.split('|').map(s => s.trim()).filter(Boolean)
  const ajustSeg = segments.find(s => /^Ajustements\s*:/i.test(s))
  const rest = segments.filter(s => !/^Ajustements\s*:/i.test(s)).join(' — ')

  if (!ajustSeg) return { ajustements, total: 0, rawRaison: rest }

  const body = ajustSeg.replace(/^Ajustements\s*:\s*/i, '')
  // Découpe sur ' ; ' — mais les libellés peuvent contenir des ';' isolés
  // donc on coupe sur ' ; ' (espace-point-virgule-espace) comme à la sérialisation
  const parts = body.split(/\s+;\s+/)

  for (const raw of parts) {
    // Trouve le DERNIER token "[-+]?<nombre> MUR (note optionnelle)"
    // Tolère les espaces/sauts de ligne dans le libellé.
    const m = raw.match(/^([\s\S]*?)\s*([-+]?\d+(?:[.,]\d+)?)\s*MUR\s*(?:\((.+?)\))?\s*$/)
    if (m) {
      const libelle = m[1].trim()
      const montant = Number(m[2].replace(',', '.'))
      const note = m[3]
      ajustements.push({ libelle, montant, note })
    }
  }
  const total = ajustements.reduce((s, a) => s + (a.montant || 0), 0)
  return { ajustements, total, rawRaison: rest }
}

// Construit la liste depuis le bulletin sauvegardé (mode officiel).
// Parse les notes pour ré-éclater les ajustements en lignes individuelles.
async function linesFromBulletin(supabase: any, employe_id: string): Promise<{ lines: SoldeLine[]; total: number; raison?: string }> {
  const { data: bul } = await supabase.from('bulletins_paie')
    .select('salaire_base, transport_allowance, special_allowance_1, special_allowance_2, departure_notice, special_allowance_3, salaire_net, notes')
    .eq('employe_id', employe_id)
    .order('periode', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bul) return { lines: [], total: 0 }

  // 1) Extraire les ajustements du champ notes
  const { ajustements, total: ajustTotal, rawRaison } = parseAjustementsFromNotes(bul.notes)

  // 2) special_allowance_2 = treizMois + ajustementsTotal → on isole le 13e mois pur
  const treizPur = (Number(bul.special_allowance_2) || 0) - ajustTotal

  const lines: SoldeLine[] = []
  const add = (label: string, detail: string, montant: number) => {
    if (montant !== 0) lines.push({ label, detail, montant })
  }
  add('Salaire prorata du dernier mois', 'Dernier mois travaillé', Number(bul.salaire_base) || 0)
  add('Indemnités proratisées',          'Transport + essence proratisés', Number(bul.transport_allowance) || 0)
  add('Congés AL non pris',               'Indemnité compensatrice (AL acquis non utilisés)', Number(bul.special_allowance_1) || 0)
  add('13ème mois proratisé',             'EOY Bonus — proratisé sur mois travaillés / 12', treizPur)
  add('Indemnité de préavis',             'Préavis selon WRA §32 ou règle entreprise', Number(bul.departure_notice) || 0)
  add('Indemnité de licenciement (WRA §70)', 'Severance Allowance — licenciement non fautif', Number(bul.special_allowance_3) || 0)

  // 3) Lignes additionnelles reconstituées
  for (const a of ajustements) {
    add(a.libelle, a.note ? a.note : 'Ajustement manuel', a.montant)
  }

  const total = Number(bul.salaire_net) || lines.reduce((s, l) => s + l.montant, 0)
  return { lines, total, raison: rawRaison || undefined }
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
    if (!dateDepart) return NextResponse.json({ error: 'Date de départ manquante — utilisez POST avec un breakdown.' }, { status: 400 })

    const admin = getAdminClient()

    // 1) Source de vérité prioritaire : breakdown JSONB enregistré sur la
    //    fiche employé au moment de la confirmation (préserve les libellés
    //    des lignes_extra et tous les sous-détails de calcul).
    // 2) Fallback : on reconstruit depuis bulletins_paie (agrégat) si le
    //    breakdown n'a pas été persisté (départs antérieurs à la migration 281).
    let lines: SoldeLine[] = []
    let total = 0
    let raison: string | undefined
    if (emp.breakdown_depart && typeof emp.breakdown_depart === 'object') {
      const r2 = linesFromBreakdown(emp.breakdown_depart)
      lines = r2.lines; total = r2.total
      raison = emp.raison_depart || undefined
    } else {
      const fb = await linesFromBulletin(admin, employe_id)
      lines = fb.lines; total = fb.total; raison = fb.raison
    }

    const draft = !emp.date_depart

    const buffer = await renderToBuffer(
      React.createElement(SoldePDF, { emp, soc, dateDepart, typeDepart, lines, total, raison, draft }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Solde_Tout_Compte_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/solde] GET', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { employe_id, date_depart, type_depart, breakdown, raison_depart } = body
    if (!employe_id || !date_depart) return NextResponse.json({ error: 'employe_id + date_depart requis' }, { status: 400 })
    if (!(await userHasAccessToEmploye(user.id, employe_id))) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const r = await loadEmpAndSoc(employe_id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { emp, soc } = r

    const { lines, total } = breakdown ? linesFromBreakdown(breakdown) : { lines: [], total: 0 }
    const draft = !emp.date_depart

    const buffer = await renderToBuffer(
      React.createElement(SoldePDF, {
        emp, soc,
        dateDepart: date_depart, typeDepart: type_depart || '',
        lines, total, raison: raison_depart, draft,
      }) as any
    )
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Solde_Tout_Compte_${emp.prenom}_${emp.nom}.pdf"`,
      },
    })
  } catch (e: unknown) {
    console.error('[depart/solde] POST', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
