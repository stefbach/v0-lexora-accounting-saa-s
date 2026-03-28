import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

function fmt(n: number | null | undefined): string {
  if (!n) return "0"
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { bulletin_id } = await request.json()
    if (!bulletin_id) return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })

    // Récupérer bulletin complet + employé + société
    const { data: bulletin, error } = await supabase
      .from('bulletins_paie')
      .select(`
        *,
        employe:employes(
          code, nom, prenom, poste, nic, date_entree, email,
          salaire_base, transport_allowance, petrol_allowance,
          devise_salaire, taux_change_eur, num_compte_banque, banque,
          societe:societes(nom, brn, adresse, telephone)
        )
      `)
      .eq('id', bulletin_id)
      .single()

    if (error || !bulletin) return NextResponse.json({ error: 'Bulletin non trouvé' }, { status: 404 })

    const emp = bulletin.employe
    const soc = emp?.societe
    const periodeDate = new Date(bulletin.periode + 'T12:00:00')
    const moisLabel = `${MOIS_FR[periodeDate.getMonth()]} ${periodeDate.getFullYear()}`

    const csg_taux_pct = ((Number(bulletin.csg_taux) || 0) * 100).toFixed(1)

    const conditionalRow = (condition: boolean, label: string, value: number) =>
      condition ? `<div class="row"><span>${label}</span><span>${fmt(value)} MUR</span></div>` : ''

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bulletin de paie — ${emp?.prenom} ${emp?.nom} — ${moisLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1E2A4A; padding-bottom: 12px; margin-bottom: 15px; }
    .header-left h2 { font-size: 18px; color: #1E2A4A; font-weight: bold; }
    .header-left .societe { font-size: 14px; font-weight: bold; color: #1E2A4A; margin-top: 4px; }
    .header-left .adresse { color: #555; margin-top: 2px; }
    .header-right { text-align: right; }
    .header-right .periode { font-size: 14px; font-weight: bold; color: #1E2A4A; }
    .employe-info { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; margin-bottom: 15px; }
    .employe-info .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .employe-info p { font-size: 12px; }
    .employe-info strong { color: #1E2A4A; }
    .section { margin-bottom: 15px; }
    .section h3 { font-size: 13px; font-weight: bold; color: white; background: #1E2A4A; padding: 5px 10px; border-radius: 4px; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; padding: 3px 10px; border-bottom: 1px solid #f0f0f0; }
    .row:last-child { border-bottom: none; }
    .row.total { font-weight: bold; background: #f0f0f0; border-top: 2px solid #1E2A4A; padding: 5px 10px; border-bottom: none; margin-top: 4px; }
    .row.deduction { color: #c0392b; }
    .row.absence { color: #e74c3c; background: #fdf0f0; }
    .net-box { border: 3px solid #1E2A4A; border-radius: 8px; padding: 14px 18px; margin: 18px 0; background: #1E2A4A08; }
    .net-box .net-amount { font-size: 22px; font-weight: bold; color: #1E2A4A; }
    .net-box .net-label { font-size: 13px; font-weight: bold; color: #1E2A4A; margin-bottom: 4px; }
    .net-box .net-bank { font-size: 11px; color: #555; margin-top: 6px; }
    .patronal-section { background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 15px; }
    .patronal-section h3 { font-size: 11px; font-weight: bold; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .patronal-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; color: #555; }
    .patronal-row.total { font-weight: bold; color: #1E2A4A; border-top: 1px solid #ccc; margin-top: 3px; padding-top: 3px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; }
    .signature-box { width: 45%; }
    .signature-box .label { font-size: 11px; color: #555; margin-bottom: 30px; }
    .signature-box .line { border-bottom: 1px solid #333; height: 1px; }
    .no-print { display: none; }
    @media print {
      body { padding: 10px; }
      .no-print { display: none !important; }
    }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h2>BULLETIN DE PAIE</h2>
      <p class="societe">${soc?.nom || 'N/A'}</p>
      ${soc?.brn ? `<p class="adresse">BRN: ${soc.brn}</p>` : ''}
      ${soc?.adresse ? `<p class="adresse">${soc.adresse}</p>` : ''}
    </div>
    <div class="header-right">
      <p class="periode">Période : ${moisLabel}</p>
      <p style="color:#555; margin-top:4px;">Date d'émission : ${new Date().toLocaleDateString('fr-FR')}</p>
      ${soc?.telephone ? `<p style="color:#555; font-size:11px;">Tél: ${soc.telephone}</p>` : ''}
    </div>
  </div>

  <div class="employe-info">
    <div class="grid">
      <p><strong>Employé :</strong> ${emp?.prenom || ''} ${emp?.nom || ''}</p>
      <p><strong>Code :</strong> ${emp?.code || '—'}</p>
      <p><strong>Poste :</strong> ${emp?.poste || '—'}</p>
      <p><strong>NIC :</strong> ${emp?.nic || '—'}</p>
      <p><strong>Date d'entrée :</strong> ${emp?.date_entree ? new Date(emp.date_entree).toLocaleDateString('fr-FR') : '—'}</p>
      ${emp?.devise_salaire === 'EUR' ? `<p><strong>Devise :</strong> <span class="badge badge-blue">EUR</span> Taux: ${Number(emp.taux_change_eur) || 46.50} MUR</p>` : ''}
    </div>
  </div>

  <div class="section">
    <h3>ÉLÉMENTS DE RÉMUNÉRATION</h3>
    <div class="row"><span>Salaire de base</span><span>${fmt(bulletin.salaire_base)} MUR</span></div>
    ${conditionalRow(Number(bulletin.transport_allowance) > 0, 'Transport Allowance', bulletin.transport_allowance)}
    ${conditionalRow(Number(bulletin.petrol_allowance) > 0, 'Petrol Allowance', bulletin.petrol_allowance)}
    ${conditionalRow(Number(bulletin.increment_salaire) > 0, 'Incrément de salaire', bulletin.increment_salaire)}
    ${conditionalRow(Number(bulletin.heures_sup_montant) > 0, 'Heures supplémentaires', bulletin.heures_sup_montant)}
    ${conditionalRow(Number(bulletin.special_allowance_1) > 0, 'Primes du mois', bulletin.special_allowance_1)}
    ${conditionalRow(Number(bulletin.special_allowance_2) > 0, 'Allocation spéciale 2', bulletin.special_allowance_2)}
    ${conditionalRow(Number(bulletin.special_allowance_3) > 0, 'Allocation spéciale 3', bulletin.special_allowance_3)}
    ${conditionalRow(Number(bulletin.other_refund) > 0, 'Autres remboursements', bulletin.other_refund)}
    ${conditionalRow(Number(bulletin.eoy_bonus) > 0, '13ème mois (EOY Bonus)', bulletin.eoy_bonus)}
    ${conditionalRow(Number(bulletin.departure_notice) > 0, 'Préavis de départ', bulletin.departure_notice)}
    <div class="row total"><span>SALAIRE BRUT</span><span>${fmt(bulletin.salaire_brut)} MUR</span></div>
  </div>

  <div class="section">
    <h3>DÉDUCTIONS SALARIÉ</h3>
    <div class="row deduction"><span>CSG salarié (${csg_taux_pct}% × ${fmt(bulletin.salaire_base)})</span><span>-${fmt(bulletin.csg_salarie)} MUR</span></div>
    ${Number(bulletin.csg_bonus) > 0 ? `<div class="row deduction"><span>CSG sur 13ème mois (3%)</span><span>-${fmt(bulletin.csg_bonus)} MUR</span></div>` : ''}
    <div class="row deduction"><span>NSF salarié (1.5%)</span><span>-${fmt(bulletin.nsf_salarie)} MUR</span></div>
    ${Number(bulletin.paye) > 0 ? `<div class="row deduction"><span>PAYE</span><span>-${fmt(bulletin.paye)} MUR</span></div>` : '<div class="row" style="color:#27ae60"><span>PAYE</span><span>Exonéré</span></div>'}
    ${Number(bulletin.montant_absence) > 0 ? `<div class="row absence"><span>Absence injustifiée (${bulletin.jours_absence} jour(s))</span><span>-${fmt(bulletin.montant_absence)} MUR</span></div>` : ''}
    <div class="row total"><span>TOTAL DÉDUCTIONS</span><span>-${fmt(bulletin.total_deductions)} MUR</span></div>
  </div>

  <div class="net-box">
    <p class="net-label">NET À PAYER</p>
    <p class="net-amount">${fmt(bulletin.salaire_net)} MUR</p>
    ${emp?.banque || emp?.num_compte_banque ? `<p class="net-bank">Virement : ${emp.banque || ''}${emp.num_compte_banque ? ` — ${emp.num_compte_banque}` : ''}</p>` : ''}
  </div>

  <div class="patronal-section">
    <h3>Charges patronales (information)</h3>
    <div class="patronal-row"><span>CSG patronal (6%)</span><span>${fmt(bulletin.csg_patronal)} MUR</span></div>
    ${Number(bulletin.csg_patronal_bonus) > 0 ? `<div class="patronal-row"><span>CSG patronal sur bonus (6%)</span><span>${fmt(bulletin.csg_patronal_bonus)} MUR</span></div>` : ''}
    <div class="patronal-row"><span>NSF patronal (2.5%)</span><span>${fmt(bulletin.nsf_patronal)} MUR</span></div>
    <div class="patronal-row"><span>Training Levy (1%)</span><span>${fmt(bulletin.training_levy)} MUR</span></div>
    <div class="patronal-row"><span>PRGF (4.50 MUR × ${bulletin.jours_travailles || 26} jours)</span><span>${fmt(bulletin.prgf)} MUR</span></div>
    <div class="patronal-row total"><span>Total charges patronales</span><span>${fmt(bulletin.total_charges_patronales)} MUR</span></div>
    <div class="patronal-row total"><span>COÛT TOTAL EMPLOYEUR</span><span>${fmt(Number(bulletin.salaire_brut) + Number(bulletin.total_charges_patronales))} MUR</span></div>
  </div>

  <div class="signatures">
    <div class="signature-box">
      <p class="label">Signature employeur :</p>
      <div class="line"></div>
    </div>
    <div class="signature-box" style="text-align:right">
      <p class="label">Date :</p>
      <div class="line"></div>
    </div>
  </div>

  <div class="no-print" style="display:none">
    <p style="font-size:10px;color:#999;text-align:center;margin-top:15px;">Généré par LEXORA — Logiciel de paie Maurice</p>
  </div>
</body>
</html>`

    const filename = `bulletin_${emp?.code || emp?.nom}_${periodeDate.getFullYear()}-${String(periodeDate.getMonth() + 1).padStart(2, '0')}.html`
    return NextResponse.json({ html, filename, mois: moisLabel })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
