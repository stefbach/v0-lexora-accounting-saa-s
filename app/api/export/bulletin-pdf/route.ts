import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const bulletin_id = searchParams.get('id')
    const format = searchParams.get('format') || 'html'

    if (!bulletin_id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: bulletin } = await supabase
      .from('bulletins_paie')
      .select('*, employe:employes(*), societe:societes(nom,adresse,nic_number)')
      .eq('id', bulletin_id)
      .single()

    if (!bulletin) return NextResponse.json({ error: 'Bulletin non trouvé' }, { status: 404 })

    const emp = bulletin.employe as any
    const soc = bulletin.societe as any
    const periode = new Date(bulletin.periode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletin de paie — ${emp?.prenom} ${emp?.nom} — ${periode}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #0B0F2E; margin: 20px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #0B0F2E; padding-bottom: 10px; }
  .logo { font-size: 18px; font-weight: bold; color: #D4AF37; }
  h2 { font-size: 14px; text-align: center; margin: 15px 0; background: #0B0F2E; color: white; padding: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #f0f4ff; text-align: left; padding: 6px; border: 1px solid #ddd; font-size: 10px; }
  td { padding: 5px 6px; border: 1px solid #eee; }
  .total-row { background: #0B0F2E; color: white; font-weight: bold; }
  .net { font-size: 16px; font-weight: bold; color: #22c55e; text-align: right; padding: 10px; background: #f0fff4; border: 2px solid #22c55e; }
  .footer { font-size: 9px; color: #666; text-align: center; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
  .section-title { font-weight: bold; background: #e8ecf8; padding: 4px 6px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div><strong style="font-size:16px;color:#0B0F2E;">${soc?.nom || 'Société'}</strong></div>
      <div>${soc?.adresse || 'Maurice'}</div>
      ${soc?.nic_number ? `<div>BRN: ${soc.nic_number}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div><strong>Bulletin de paie</strong></div>
      <div>Période: <strong>${periode}</strong></div>
      <div>Jours travaillés: ${bulletin.jours_travailles || 26}</div>
    </div>
  </div>

  <table>
    <tr><td><strong>Employé:</strong></td><td>${emp?.prenom} ${emp?.nom}</td><td><strong>Code:</strong></td><td>${emp?.code || '—'}</td></tr>
    <tr><td><strong>Poste:</strong></td><td>${emp?.poste || '—'}</td><td><strong>NIC:</strong></td><td>${emp?.nic_number || '—'}</td></tr>
    <tr><td><strong>Banque:</strong></td><td>${emp?.bank_name || '—'}</td><td><strong>Compte:</strong></td><td>${emp?.bank_account || '—'}</td></tr>
  </table>

  <h2>ÉLÉMENTS DE RÉMUNÉRATION</h2>
  <table>
    <tr class="section-title"><td colspan="2">Rémunération brute</td></tr>
    <tr><td>Salaire de base</td><td style="text-align:right">${Number(bulletin.salaire_base).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    ${Number(bulletin.transport_allowance) > 0 ? `<tr><td>Transport Allowance</td><td style="text-align:right">${Number(bulletin.transport_allowance).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>` : ''}
    ${Number(bulletin.petrol_allowance) > 0 ? `<tr><td>Petrol Allowance</td><td style="text-align:right">${Number(bulletin.petrol_allowance).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>` : ''}
    ${Number(bulletin.heures_sup_montant) > 0 ? `<tr><td>Heures supplémentaires</td><td style="text-align:right">${Number(bulletin.heures_sup_montant).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>` : ''}
    ${Number(bulletin.eoy_bonus) > 0 ? `<tr><td>13ème mois (EOY Bonus)</td><td style="text-align:right">${Number(bulletin.eoy_bonus).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>` : ''}
    <tr class="total-row"><td>SALAIRE BRUT</td><td style="text-align:right">${Number(bulletin.salaire_brut).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
  </table>

  <h2>DÉDUCTIONS SALARIÉ</h2>
  <table>
    <tr><td>CSG salarié (${(Number(bulletin.csg_taux || 0)*100).toFixed(1)}%)</td><td style="text-align:right">- ${Number(bulletin.csg_salarie).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    ${Number(bulletin.csg_bonus) > 0 ? `<tr><td>CSG sur EOY Bonus</td><td style="text-align:right">- ${Number(bulletin.csg_bonus).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>` : ''}
    <tr><td>NSF salarié (1.5%)</td><td style="text-align:right">- ${Number(bulletin.nsf_salarie).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr><td>PAYE</td><td style="text-align:right">- ${Number(bulletin.paye).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr class="total-row"><td>TOTAL DÉDUCTIONS</td><td style="text-align:right">- ${Number(bulletin.total_deductions).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
  </table>

  <div class="net">NET À PAYER : ${Number(bulletin.salaire_net).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</div>

  <h2>CHARGES PATRONALES (information)</h2>
  <table>
    <tr><td>CSG patronal (6%)</td><td style="text-align:right">${Number(bulletin.csg_patronal).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr><td>NSF patronal (2.5%)</td><td style="text-align:right">${Number(bulletin.nsf_patronal).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr><td>Training Levy (1%)</td><td style="text-align:right">${Number(bulletin.training_levy).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr><td>PRGF (${bulletin.jours_travailles || 26}j × 4.50)</td><td style="text-align:right">${Number(bulletin.prgf).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
    <tr class="total-row"><td>COÛT TOTAL EMPLOYEUR</td><td style="text-align:right">${(Number(bulletin.salaire_brut) + Number(bulletin.total_charges_patronales)).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
  </table>

  ${Number(bulletin.montant_refacture_mur) > 0 ? `
  <table>
    <tr style="background:#fff8e1"><td>Refacturation inter-sociétés (${(Number(bulletin.pct_refacturation)*100).toFixed(0)}%)</td><td style="text-align:right;font-weight:bold">${Number(bulletin.montant_refacture_mur).toLocaleString('fr-FR', {minimumFractionDigits:2})} MUR</td></tr>
  </table>` : ''}

  <div class="footer">
    Document généré par le système de paie • Conforme Workers' Rights Act 2019 & MRA Guidelines 2024<br>
    Ce bulletin est un document officiel — conserver pendant 5 ans
  </div>
</body>
</html>`

    if (format === 'json') return NextResponse.json({ bulletin, html })

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="bulletin_${emp?.code}_${bulletin.periode}.html"`,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
