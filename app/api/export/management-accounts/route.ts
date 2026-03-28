import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function fmtNum(n: number | null | undefined) { return Number(n || 0) }

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice') || `${new Date().getFullYear()-1}-${new Date().getFullYear()}`

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const [anneeDebut] = exercice.split('-').map(Number)
    const dateDebut = `${anneeDebut}-07-01`
    const dateFin = `${anneeDebut + 1}-06-30`

    // Charger toutes les données
    const [societeRes, facClRes, facFouRes, ecrituresRes, immoRes, bulletinsRes] = await Promise.all([
      supabase.from('societes').select('*').eq('id', societe_id).single(),
      supabase.from('factures').select('*').eq('societe_id', societe_id).eq('type_facture', 'client').gte('date_facture', dateDebut).lte('date_facture', dateFin),
      supabase.from('factures').select('*').eq('societe_id', societe_id).eq('type_facture', 'fournisseur').gte('date_facture', dateDebut).lte('date_facture', dateFin),
      supabase.from('ecritures_comptables').select('*, dossier:dossiers(societe_id)').gte('date_ecriture', dateDebut).lte('date_ecriture', dateFin),
      supabase.from('immobilisations').select('*, amortissements(*)').eq('societe_id', societe_id),
      supabase.from('bulletins_paie').select('*, employe:employes(nom,prenom,code)').eq('societe_id', societe_id).gte('periode', dateDebut).lte('periode', dateFin),
    ])

    const soc = societeRes.data
    const facCl = facClRes.data || []
    const facFou = facFouRes.data || []
    const ecritures = (ecrituresRes.data || []).filter((e: any) => e.dossier?.societe_id === societe_id)
    const immos = immoRes.data || []
    const bulletins = bulletinsRes.data || []

    const wb = XLSX.utils.book_new()

    // ── ONGLET 1: COVER ──
    const coverData = [
      ['MANAGEMENT ACCOUNTS', ''],
      ['Société', soc?.nom || 'N/A'],
      ['Exercice', exercice],
      ['Période', `1 juillet ${anneeDebut} — 30 juin ${anneeDebut + 1}`],
      ['Généré par', 'LEXORA — Genspark'],
      ['Date génération', new Date().toLocaleDateString('fr-FR')],
      ['', ''],
      ['SOMMAIRE', ''],
      ['SOFP', 'Statement of Financial Position (Bilan)'],
      ['SOPL', 'Statement of Profit & Loss'],
      ['ETB', 'Extended Trial Balance'],
      ['AR', 'Accounts Receivable (Créances clients)'],
      ['AP', 'Accounts Payable (Dettes fournisseurs)'],
      ['VAT', 'VAT Summary'],
      ['FAR', 'Fixed Asset Register'],
      ['SALARY', 'Salary Breakdown'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverData), 'COVER')

    // ── ONGLET 2: AR (Accounts Receivable) ──
    const arHeaders = ['Numéro', 'Tiers', 'Description', 'Date', 'Échéance', 'Devise', 'Montant HT', 'TVA', 'Montant TTC', 'MUR', 'Statut']
    const arRows = facCl.map((f: any) => [f.numero_facture, f.tiers, f.description, f.date_facture, f.date_echeance, f.devise, fmtNum(f.montant_ht), fmtNum(f.montant_tva), fmtNum(f.montant_ttc), fmtNum(f.montant_mur), f.statut])
    const totalAR = facCl.reduce((s: number, f: any) => s + fmtNum(f.montant_mur), 0)
    const arData = [arHeaders, ...arRows, ['', '', '', '', '', 'TOTAL', '', '', '', totalAR, '']]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(arData), 'AR')

    // ── ONGLET 3: AP (Accounts Payable) ──
    const apHeaders = ['Fournisseur', 'Description', 'Date', 'Échéance', 'Devise', 'Montant HT', 'TVA', 'Montant TTC', 'MUR', 'Statut']
    const apRows = facFou.map((f: any) => [f.tiers, f.description, f.date_facture, f.date_echeance, f.devise, fmtNum(f.montant_ht), fmtNum(f.montant_tva), fmtNum(f.montant_ttc), fmtNum(f.montant_mur), f.statut])
    const totalAP = facFou.reduce((s: number, f: any) => s + fmtNum(f.montant_mur), 0)
    const apData = [apHeaders, ...apRows, ['', '', '', '', 'TOTAL', '', '', '', totalAP, '']]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(apData), 'AP')

    // ── ONGLET 4: VAT Summary ──
    const vatByMonth: Record<string, { output: number; input: number }> = {}
    for (const f of [...facCl, ...facFou]) {
      const m = f.date_facture?.slice(0, 7) || 'unknown'
      if (!vatByMonth[m]) vatByMonth[m] = { output: 0, input: 0 }
      if (f.type_facture === 'client') vatByMonth[m].output += fmtNum(f.montant_tva)
      else vatByMonth[m].input += fmtNum(f.montant_tva)
    }
    const vatRows = Object.entries(vatByMonth).sort().map(([m, v]) => [m, v.output, v.input, v.output - v.input, v.output >= v.input ? 'À payer' : 'Crédit TVA'])
    const vatTotOutput = vatRows.reduce((s, r) => s + (r[1] as number), 0)
    const vatTotInput = vatRows.reduce((s, r) => s + (r[2] as number), 0)
    const vatData = [['Mois', 'TVA Collectée (Output)', 'TVA Déductible (Input)', 'Solde Net', 'Statut'], ...vatRows, ['TOTAL', vatTotOutput, vatTotInput, vatTotOutput - vatTotInput, '']]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vatData), 'VAT Summary')

    // ── ONGLET 5: FAR (Fixed Asset Register) ──
    const farHeaders = ['Désignation', 'Catégorie', 'Fournisseur', 'Date Acquisition', 'Coût MUR', 'Taux %', 'Méthode', 'Amort. Cumulé', 'VNC']
    const farRows = immos.map((i: any) => {
      const cumul = (i.amortissements || []).reduce((s: number, a: any) => s + fmtNum(a.dotation), 0)
      return [i.designation, i.categorie, i.fournisseur, i.date_acquisition, fmtNum(i.cout_mur || i.cout_acquisition), i.taux_amortissement, i.methode, cumul, fmtNum(i.cout_mur || i.cout_acquisition) - cumul]
    })
    const farTotCout = farRows.reduce((s, r) => s + (r[4] as number), 0)
    const farTotCumul = farRows.reduce((s, r) => s + (r[7] as number), 0)
    const farTotVNC = farRows.reduce((s, r) => s + (r[8] as number), 0)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([farHeaders, ...farRows, ['TOTAL', '', '', '', farTotCout, '', '', farTotCumul, farTotVNC]]), 'FAR')

    // ── ONGLET 6: Salary Breakdown ──
    const salHeaders = ['Code', 'Nom', 'Prénom', 'Période', 'Base', 'Transport', 'Petrol', 'Brut', 'CSG Sal.', 'NSF Sal.', 'PAYE', 'NET', 'CSG Pat.', 'NSF Pat.', 'Training', 'PRGF', 'Coût Total', 'Refacturé MUR']
    const salRows = bulletins.map((b: any) => [b.employe?.code, b.employe?.nom, b.employe?.prenom, b.periode, fmtNum(b.salaire_base), fmtNum(b.transport_allowance), fmtNum(b.petrol_allowance), fmtNum(b.salaire_brut), fmtNum(b.csg_salarie), fmtNum(b.nsf_salarie), fmtNum(b.paye), fmtNum(b.salaire_net), fmtNum(b.csg_patronal), fmtNum(b.nsf_patronal), fmtNum(b.training_levy), fmtNum(b.prgf), fmtNum(b.salaire_brut) + fmtNum(b.total_charges_patronales), fmtNum(b.montant_refacture_mur)])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([salHeaders, ...salRows]), 'SALARY')

    // ── ONGLET 7: ETB (Extended Trial Balance) ──
    const comptes: Record<string, { debit: number; credit: number }> = {}
    for (const e of ecritures) {
      if (!comptes[e.compte]) comptes[e.compte] = { debit: 0, credit: 0 }
      comptes[e.compte].debit += fmtNum(e.debit)
      comptes[e.compte].credit += fmtNum(e.credit)
    }
    const etbRows = Object.entries(comptes).sort().map(([c, v]) => [c, v.debit, v.credit, v.debit - v.credit, v.debit >= v.credit ? v.debit - v.credit : 0, v.credit > v.debit ? v.credit - v.debit : 0])
    const etbTotD = etbRows.reduce((s, r) => s + (r[1] as number), 0)
    const etbTotC = etbRows.reduce((s, r) => s + (r[2] as number), 0)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Compte', 'Débit', 'Crédit', 'Solde', 'Solde Débiteur', 'Solde Créditeur'], ...etbRows, ['TOTAL', etbTotD, etbTotC, etbTotD - etbTotC, '', '']]), 'ETB')

    // Générer le buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="management_accounts_${soc?.nom?.replace(/\s+/g, '_')}_${exercice}.xlsx"`,
      }
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
