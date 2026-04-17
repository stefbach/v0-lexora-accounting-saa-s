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
function fmtMur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/[\u00A0\u202F\u2009]/g, ' ') + ' MUR'
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', lineHeight: 1.5 },
  header: { textAlign: 'center', marginBottom: 20 },
  company: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  info: { fontSize: 8, color: '#555', marginTop: 2 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginVertical: 20, textTransform: 'uppercase', color: '#0B0F2E', borderBottomWidth: 2, borderBottomColor: '#D4AF37', paddingBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: '4 0', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  label: { fontSize: 10, flex: 1 },
  value: { fontSize: 10, textAlign: 'right', width: 120, fontFamily: 'Helvetica-Bold' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '6 0', borderTopWidth: 2, borderTopColor: '#0B0F2E', marginTop: 8 },
  totalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', flex: 1 },
  totalValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'right', width: 120 },
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

    const salaireBase = Number(emp.salaire_base) || 0
    const dailySalary = salaireBase / 26

    const lines: { label: string; montant: number }[] = []

    const lastBulletin = await supabase.from('bulletins_paie')
      .select('salaire_net, eoy_bonus, departure_notice, special_allowance_3')
      .eq('employe_id', employe_id).order('periode', { ascending: false }).limit(1).maybeSingle()
    const bul = lastBulletin.data

    if (bul?.salaire_net) lines.push({ label: 'Salaire dernier mois (net)', montant: Number(bul.salaire_net) || 0 })

    const currentYear = new Date(emp.date_depart).getFullYear()
    const { data: alTaken } = await supabase.from('demandes_conges').select('nb_jours')
      .eq('employe_id', employe_id).eq('type_conge', 'AL').eq('statut', 'approuve')
      .gte('date_debut', `${currentYear}-01-01`).lte('date_debut', `${currentYear}-12-31`)
    const alUsed = (alTaken || []).reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
    const alRemaining = Math.max(0, 20 - alUsed)
    const alPayout = Math.round(alRemaining * dailySalary)
    if (alPayout > 0) lines.push({ label: `Congés AL non pris (${alRemaining}j × ${Math.round(dailySalary)} MUR)`, montant: alPayout })

    if (bul?.eoy_bonus && Number(bul.eoy_bonus) > 0) lines.push({ label: '13ème mois proratisé', montant: Number(bul.eoy_bonus) })
    if (bul?.departure_notice && Number(bul.departure_notice) > 0) lines.push({ label: 'Indemnité de préavis', montant: Number(bul.departure_notice) })
    if (bul?.special_allowance_3 && Number(bul.special_allowance_3) > 0) lines.push({ label: 'Indemnité de licenciement', montant: Number(bul.special_allowance_3) })

    const total = lines.reduce((s, l) => s + l.montant, 0)

    const pdf = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: s.page },
        React.createElement(View, { style: s.header },
          React.createElement(Text, { style: s.company }, soc?.nom || ''),
          React.createElement(Text, { style: s.info }, `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
        ),
        React.createElement(Text, { style: s.title }, 'SOLDE DE TOUT COMPTE'),
        React.createElement(Text, { style: { marginBottom: 15, fontSize: 10 } },
          `Employé(e) : ${emp.prenom || ''} ${emp.nom || ''}\nPoste : ${emp.poste || '—'}\nDate de départ : ${fmtDate(emp.date_depart)}`
        ),
        ...lines.map((l, i) =>
          React.createElement(View, { style: s.row, key: String(i) },
            React.createElement(Text, { style: s.label }, l.label),
            React.createElement(Text, { style: s.value }, fmtMur(l.montant)),
          )
        ),
        React.createElement(View, { style: s.totalRow },
          React.createElement(Text, { style: s.totalLabel }, 'TOTAL NET DÛ'),
          React.createElement(Text, { style: s.totalValue }, fmtMur(total)),
        ),
        React.createElement(View, { style: s.sigBlock },
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "L'employeur (lu et approuvé)"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, soc?.nom || ''),
          ),
          React.createElement(View, { style: s.sigBox },
            React.createElement(Text, { style: s.sigLabel }, "L'employé(e) (pour solde de tout compte)"),
            React.createElement(View, { style: s.sigLine }),
            React.createElement(Text, { style: s.sigName }, `${emp.prenom || ''} ${emp.nom || ''}`),
          ),
        ),
        React.createElement(Text, { style: s.legal },
          `Fait à Port Louis, le ${fmtDate(new Date().toISOString().slice(0, 10))}. Ce document atteste du règlement intégral des sommes dues au titre du contrat de travail. Généré par Lexora.`
        ),
      )
    )
    const buffer = await renderToBuffer(pdf as any)
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Solde_Tout_Compte_${emp.prenom}_${emp.nom}.pdf"` } })
  } catch (e: unknown) {
    console.error('[depart/solde-tout-compte]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
