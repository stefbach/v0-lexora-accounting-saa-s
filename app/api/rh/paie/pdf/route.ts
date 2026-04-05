import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

function fmt(n: number | null | undefined): string {
  if (!n) return "0"
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
}

// GET handler — for window.open() calls
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return new NextResponse('Non autorisé', { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const bulletin_id = searchParams.get('bulletin_id')
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')

    let bulletin: any = null

    if (bulletin_id) {
      const { data } = await supabase.from('bulletins_paie').select('*').eq('id', bulletin_id).single()
      bulletin = data
    } else if (employe_id && periode) {
      // periode can be YYYY-MM or YYYY-MM-DD — search for the month
      const periodeMonth = periode.substring(0, 7) // YYYY-MM
      const startDate = `${periodeMonth}-01`
      const endDate = `${periodeMonth}-31`
      const { data } = await supabase.from('bulletins_paie').select('*')
        .eq('employe_id', employe_id)
        .gte('periode', startDate)
        .lte('periode', endDate)
        .order('periode', { ascending: false })
        .limit(1)
        .maybeSingle()
      bulletin = data
    }

    if (!bulletin) return new NextResponse('Bulletin non trouvé', { status: 404 })

    // Get employee + check access (multi-tenant OR self-service)
    const { data: emp } = await supabase.from('employes').select('*').eq('id', bulletin.employe_id).single()
    const isSelf = emp && (emp.auth_user_id === user.id || emp.email === user.email)
    if (!isSelf) {
      const hasAccess = await userHasAccessToEmploye(user.id, bulletin.employe_id)
      if (!hasAccess) return new NextResponse('Accès refusé à ce bulletin', { status: 403 })
    }
    const { data: soc } = await supabase.from('societes').select('*').eq('id', bulletin.societe_id).single()

    if (!emp) return new NextResponse('Employé non trouvé', { status: 404 })

    const periodeDate = new Date(bulletin.periode)
    const moisLabel = MOIS_FR[periodeDate.getMonth()] || ''
    const annee = periodeDate.getFullYear()

    return generatePDFResponse(bulletin, emp, soc, moisLabel, annee)
  } catch (e: any) {
    return new NextResponse(`Erreur: ${e.message}`, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { bulletin_id } = await request.json()
    if (!bulletin_id) return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })

    // Récupérer bulletin complet + employé + société
    const { data: bulletin, error } = await supabase
      .from('bulletins_paie')
      .select(`
        *,
        employe:employes(
          code, nom, prenom, poste, nic_number, date_arrivee, email,
          salaire_base, transport_allowance, petrol_allowance,
          devise_salaire, taux_change_eur, bank_account, bank_name,
          societe:societes(nom, brn, adresse, telephone)
        )
      `)
      .eq('id', bulletin_id)
      .single()

    if (error || !bulletin) return NextResponse.json({ error: 'Bulletin non trouvé' }, { status: 404 })

    // Multi-tenant OR self-service access check
    const emp = bulletin.employe
    const isSelfPost = emp && (emp.auth_user_id === user.id || emp.email === user.email)
    if (!isSelfPost) {
      const hasAccessPost = await userHasAccessToEmploye(user.id, bulletin.employe_id)
      if (!hasAccessPost) return NextResponse.json({ error: 'Accès refusé à ce bulletin' }, { status: 403 })
    }
    const soc = emp?.societe
    const periodeDate = new Date(bulletin.periode + 'T12:00:00')
    const moisLabel = `${MOIS_FR[periodeDate.getMonth()]} ${periodeDate.getFullYear()}`

    // Récupérer les primes individuelles de la période (intégrées dans ce bulletin)
    const { data: primesMois } = await supabase
      .from('primes_variables_mois')
      .select('*, prime:catalogue_primes(libelle, type_prime)')
      .eq('employe_id', bulletin.employe_id)
      .eq('periode', bulletin.periode)

    // Récupérer les détails OT depuis les pointages du mois
    const periodeStr = bulletin.periode.slice(0, 7)
    const { data: pointagesMois } = await supabase
      .from('pointages')
      .select('heure_entree, heure_sortie, date_pointage')
      .eq('employe_id', bulletin.employe_id)
      .gte('date_pointage', `${periodeStr}-01`)
      .lte('date_pointage', `${periodeStr}-31`)

    const JOURS_FERIES_MU = ["01-01","02-01","12-03","01-05","09-05","15-08","02-11","25-12"]
    function isFeriePdf(dateStr: string): boolean { return JOURS_FERIES_MU.includes(dateStr.slice(5)) }
    function calcOTPdf(hEntree: string, hSortie: string, ferieDay: boolean) {
      if (!hEntree || !hSortie) return { ot15: 0, ot2: 0 }
      const debut = new Date(`1970-01-01T${hEntree}`)
      const fin = new Date(`1970-01-01T${hSortie}`)
      let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1
      if (totalH <= 0) totalH = 0
      if (ferieDay) return { ot15: 0, ot2: totalH }
      const reste = Math.max(totalH - 9, 0)
      return { ot15: Math.min(reste, 2), ot2: Math.max(reste - 2, 0) }
    }

    let totalH15 = 0, totalH2 = 0
    const taux_horaire = Number(emp?.salaire_base || 0) / (45 * 52 / 12)
    for (const pt of pointagesMois || []) {
      if (!pt.heure_entree) continue
      const ot = calcOTPdf(pt.heure_entree, pt.heure_sortie || '', isFeriePdf(pt.date_pointage))
      totalH15 += ot.ot15
      totalH2 += ot.ot2
    }
    const montant15 = Math.round(totalH15 * taux_horaire * 1.5)
    const montant2 = Math.round(totalH2 * taux_horaire * 2)

    const csg_taux_pct = ((Number(bulletin.csg_taux) || 0) * 100).toFixed(1)

    const conditionalRow = (condition: boolean, label: string, value: number) =>
      condition ? `<div class="row"><span>${label}</span><span>${fmt(value)} MUR</span></div>` : ''

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bulletin de paie — ${emp?.prenom} ${emp?.nom} — ${moisLabel}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0B0F2E; padding-bottom: 12px; margin-bottom: 15px; }
    .header-left { }
    .header-right { text-align: right; }
    .employe-info { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; margin-bottom: 15px; }
    .employe-info .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .employe-info p { font-size: 11px; }
    .employe-info strong { color: #0B0F2E; }
    .section { margin-bottom: 15px; }
    .section h3 { font-size: 12px; font-weight: bold; color: white; background: #0B0F2E; padding: 5px 10px; border-radius: 4px; margin-bottom: 8px; border-bottom: 2px solid #D4AF37; }
    .row { display: flex; justify-content: space-between; padding: 3px 10px; border-bottom: 1px solid #f0f0f0; }
    .row:last-child { border-bottom: none; }
    .row.total { font-weight: bold; background: #f0f0f0; border-top: 2px solid #0B0F2E; padding: 5px 10px; border-bottom: none; margin-top: 4px; }
    .row.deduction { color: #c0392b; }
    .row.absence { color: #e74c3c; background: #fdf0f0; }
    .patronal-section { background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 15px; }
    .patronal-section h3 { font-size: 11px; font-weight: bold; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .patronal-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; color: #555; }
    .patronal-row.total { font-weight: bold; color: #0B0F2E; border-top: 1px solid #ccc; margin-top: 3px; padding-top: 3px; }
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
      <div style="width:60mm;max-height:20mm;margin-bottom:8px;">
        <img src="${soc?.logo_url || ''}" style="max-width:100%;max-height:20mm;display:${soc?.logo_url ? 'block' : 'none'}" />
        ${!soc?.logo_url ? `<div style="font-size:18px;font-weight:800;color:#0B0F2E;letter-spacing:0.04em;">LE<span style="color:#D4AF37">X</span>ORA</div>` : ''}
      </div>
      <p style="font-weight:700;color:#0B0F2E;font-size:14px;">${soc?.nom || 'N/A'}</p>
      <p style="color:#555;font-size:11px;">${soc?.adresse || ''}</p>
      <p style="color:#555;font-size:11px;">BRN: ${soc?.brn || '—'}</p>
    </div>
    <div class="header-right">
      <p style="font-size:16px;font-weight:800;color:#0B0F2E;">BULLETIN DE PAIE</p>
      <p style="font-size:14px;font-weight:600;color:#D4AF37;">${moisLabel}</p>
      <p style="color:#555;font-size:11px;">Réf: BUL-${periodeDate.getFullYear()}-${String(periodeDate.getMonth()+1).padStart(2,'0')}-${emp?.code || '000'}</p>
      <p style="color:#555;font-size:11px;">Émis le: ${new Date().toLocaleDateString('fr-FR')}</p>
    </div>
  </div>

  <div class="employe-info">
    <div class="grid">
      <p><strong>Employé :</strong> ${emp?.prenom || ''} ${emp?.nom || ''}</p>
      <p><strong>Code :</strong> ${emp?.code || '—'}</p>
      <p><strong>Poste :</strong> ${emp?.poste || '—'}</p>
      <p><strong>NIC :</strong> ${emp?.nic_number || '—'}</p>
      <p><strong>TAN :</strong> ${emp?.tan || '—'}</p>
      <p><strong>Date d'entrée :</strong> ${emp?.date_arrivee ? new Date(emp.date_arrivee).toLocaleDateString('fr-FR') : '—'}</p>
      <p><strong>Ancienneté :</strong> ${emp?.date_arrivee ? (() => { const d = new Date(emp.date_arrivee); const now = periodeDate; let y = now.getFullYear() - d.getFullYear(); let m = now.getMonth() - d.getMonth(); if (m < 0) { y--; m += 12; } return y > 0 ? y + ' an(s) ' + m + ' mois' : m + ' mois'; })() : '—'}</p>
      <p><strong>CSG Catégorie :</strong> ${Number(bulletin.salaire_brut) > 50000 ? 'Cat. B (3%)' : 'Cat. A (1.5%)'}</p>
      ${emp?.departement ? `<p><strong>Département :</strong> ${emp.departement}</p>` : ''}
      ${emp?.devise_salaire === 'EUR' ? `<p><strong>Devise :</strong> <span class="badge badge-blue">EUR</span> Taux: ${Number(emp.taux_change_eur) || 46.50} MUR</p>` : ''}
    </div>
  </div>

  <div class="section">
    <h3>ÉLÉMENTS DE RÉMUNÉRATION</h3>
    ${emp?.devise_salaire === 'EUR' ? `
    <div class="row" style="background:#eff6ff; border-left:3px solid #3b82f6; padding-left:12px;">
      <span>Salaire EUR → MUR</span>
      <span style="color:#1d4ed8; font-size:11px;">
        EUR ${new Intl.NumberFormat('fr-FR').format(Math.round(Number(emp?.salaire_base || 0)))} × ${Number(emp?.taux_change_eur) || 46.50} = ${fmt(bulletin.salaire_base)} MUR
      </span>
    </div>
    ` : ''}
    <div class="row"><span>Salaire de base</span><span>${fmt(bulletin.salaire_base)} MUR</span></div>
    ${conditionalRow(Number(bulletin.transport_allowance) > 0, 'Transport Allowance', bulletin.transport_allowance)}
    ${conditionalRow(Number(bulletin.petrol_allowance) > 0, 'Petrol Allowance', bulletin.petrol_allowance)}
    ${conditionalRow(Number(bulletin.increment_salaire) > 0, 'Incrément de salaire', bulletin.increment_salaire)}
    ${totalH15 > 0 ? `<div class="row"><span>Heures sup (1.5×) — ${totalH15.toFixed(1)}h</span><span>${fmt(montant15)} MUR</span></div>` : ''}
    ${totalH2 > 0 ? `<div class="row"><span>Heures sup (2×) — ${totalH2.toFixed(1)}h (férié/nuit)</span><span>${fmt(montant2)} MUR</span></div>` : ''}
    ${totalH15 === 0 && totalH2 === 0 && Number(bulletin.heures_sup_montant) > 0 ? `<div class="row"><span>Heures supplémentaires</span><span>${fmt(bulletin.heures_sup_montant)} MUR</span></div>` : ''}
    ${(primesMois && primesMois.length > 0)
      ? primesMois.map((p: any) => `<div class="row" style="color:#7c3aed"><span>Prime — ${p.prime?.libelle || p.notes || 'Variable'}${p.quantite > 1 ? ` (×${p.quantite})` : ''}</span><span>${fmt(Number(p.montant))} MUR</span></div>`).join('')
      : conditionalRow(Number(bulletin.special_allowance_1) > 0, 'Primes du mois', bulletin.special_allowance_1)}
    ${conditionalRow(Number(bulletin.special_allowance_2) > 0, 'Allocation spéciale 2', bulletin.special_allowance_2)}
    ${conditionalRow(Number(bulletin.special_allowance_3) > 0, 'Allocation spéciale 3', bulletin.special_allowance_3)}
    ${conditionalRow(Number(bulletin.other_refund) > 0, 'Autres remboursements', bulletin.other_refund)}
    ${conditionalRow(Number(bulletin.eoy_bonus) > 0, '13ème mois (EOY Bonus)', bulletin.eoy_bonus)}
    ${conditionalRow(Number(bulletin.departure_notice) > 0, 'Préavis de départ', bulletin.departure_notice)}
    ${(totalH15 > 0 || totalH2 > 0 || Number(bulletin.heures_sup_montant) > 0) ? `<div class="row" style="font-weight:600;color:#ea580c;background:#fff7ed;"><span>Sous-total heures supplémentaires</span><span>${fmt(totalH15 > 0 || totalH2 > 0 ? montant15 + montant2 : Number(bulletin.heures_sup_montant))} MUR</span></div>` : ''}
    ${((primesMois && primesMois.length > 0) || Number(bulletin.special_allowance_1) > 0) ? `<div class="row" style="font-weight:600;color:#7c3aed;background:#faf5ff;"><span>Sous-total primes</span><span>${fmt(primesMois && primesMois.length > 0 ? primesMois.reduce((s: number, p: any) => s + Number(p.montant || 0), 0) : Number(bulletin.special_allowance_1))} MUR</span></div>` : ''}
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

  <div style="border:3px solid #0B0F2E;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;background:linear-gradient(135deg,#0B0F2E08,#D4AF3708);">
    <p style="font-size:13px;font-weight:700;color:#0B0F2E;margin-bottom:4px;">NET À PAYER</p>
    <p style="font-size:24px;font-weight:800;color:#0B0F2E;">${fmt(bulletin.salaire_net)} MUR</p>
    <p style="font-size:11px;color:#555;margin-top:6px;">Virement ${emp?.bank_name || ''} — ****${(emp?.bank_account || '').slice(-4)}</p>
  </div>

  <div style="margin:15px 0;padding:10px;border:1px solid #e0e0e0;border-radius:6px;">
    <h3 style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:8px;">Soldes Congés</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:11px;">
      <div>AL (Congé annuel): --j</div>
      <div>SL (Congé maladie): --j</div>
      <div>MAT/PAT: --j</div>
    </div>
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

  <div style="display:flex;justify-content:space-between;margin-top:30px;padding-top:15px;border-top:1px solid #ddd;">
    <div style="width:65%;">
      <p style="font-size:10px;color:#888;line-height:1.5;">
        Ce bulletin doit être conservé sans limitation de durée.<br>
        Généré par Lexora — Logiciel de paie Maurice<br>
        Signé électroniquement le ${new Date().toLocaleDateString('fr-FR')} par RH Manager
      </p>
    </div>
    <div style="width:30%;text-align:center;">
      <div style="width:80px;height:80px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:9px;color:#999;">
        QR Code<br>Vérification
      </div>
      <p style="font-size:9px;color:#999;margin-top:4px;">lexora.finance/verify</p>
    </div>
  </div>

  <p style="font-size:9px;color:#bbb;text-align:center;margin-top:20px;">
    LEXORA — Comptabilité intelligente pilotée par l'IA — lexora.finance
  </p>
</body>
</html>`

    const filename = `bulletin_${emp?.code || emp?.nom}_${periodeDate.getFullYear()}-${String(periodeDate.getMonth() + 1).padStart(2, '0')}.html`
    return NextResponse.json({ html, filename, mois: moisLabel })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// Simple HTML bulletin for GET requests
function generatePDFResponse(bulletin: any, emp: any, soc: any, moisLabel: string, annee: number) {
  const periodeDate = new Date(`${annee}-${String(MOIS_FR.indexOf(moisLabel) + 1).padStart(2, '0')}-15`)

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bulletin ${emp.prenom} ${emp.nom} — ${moisLabel} ${annee}</title>
<style>
@page { size: A4; margin: 15mm; }
body{font-family:'Inter',Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;font-size:11px;color:#1a1a1a}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #0B0F2E;padding-bottom:12px;margin-bottom:15px}
.box{border:1px solid #ddd;padding:12px;border-radius:6px;margin-bottom:15px;background:#f8f9fa}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{background:#0B0F2E;color:white;padding:8px;text-align:left;font-size:11px;border-bottom:2px solid #D4AF37}
td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
.right{text-align:right}
.bold{font-weight:bold}
.section{font-weight:bold;color:#0B0F2E;margin-top:15px;padding:4px 0;border-bottom:2px solid #D4AF37}
@media print{body{margin:0;padding:10px}}
</style></head><body>
<div class="header">
  <div>
    <div style="width:60mm;max-height:20mm;margin-bottom:8px;">
      <img src="${soc?.logo_url || ''}" style="max-width:100%;max-height:20mm;display:${soc?.logo_url ? 'block' : 'none'}" />
      ${!soc?.logo_url ? `<div style="font-size:18px;font-weight:800;color:#0B0F2E;letter-spacing:0.04em;">LE<span style="color:#D4AF37">X</span>ORA</div>` : ''}
    </div>
    <p style="font-weight:700;color:#0B0F2E;font-size:14px;">${soc?.nom || 'N/A'}</p>
    <p style="color:#555;font-size:11px;">${soc?.adresse || '—'}</p>
    <p style="color:#555;font-size:11px;">BRN: ${soc?.brn || '—'}</p>
  </div>
  <div style="text-align:right">
    <p style="font-size:16px;font-weight:800;color:#0B0F2E;">BULLETIN DE PAIE</p>
    <p style="font-size:14px;font-weight:600;color:#D4AF37;">${moisLabel} ${annee}</p>
    <p style="color:#555;font-size:11px;">Réf: BUL-${annee}-${String(MOIS_FR.indexOf(moisLabel) + 1).padStart(2,'0')}-${emp?.code || '000'}</p>
    <p style="color:#555;font-size:11px;">Émis le: ${new Date().toLocaleDateString('fr-FR')}</p>
  </div>
</div>
<div class="box">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
    <p><strong>Employé :</strong> ${emp.prenom} ${emp.nom}</p>
    <p><strong>Code :</strong> ${emp.code || '—'}</p>
    <p><strong>Poste :</strong> ${emp.poste || '—'}</p>
    <p><strong>NIC :</strong> ${emp.nic_number || emp.nic_number || '—'}</p>
    <p><strong>TAN :</strong> ${emp.tan || '—'}</p>
    <p><strong>Date d'entrée :</strong> ${emp.date_arrivee ? new Date(emp.date_arrivee).toLocaleDateString('fr-FR') : '—'}</p>
    <p><strong>Ancienneté :</strong> ${emp.date_arrivee ? (() => { const d = new Date(emp.date_arrivee); const now = periodeDate; let y = now.getFullYear() - d.getFullYear(); let m = now.getMonth() - d.getMonth(); if (m < 0) { y--; m += 12; } return y > 0 ? y + ' an(s) ' + m + ' mois' : m + ' mois'; })() : '—'}</p>
    <p><strong>CSG Catégorie :</strong> ${Number(bulletin.salaire_brut) > 50000 ? 'Cat. B (3%)' : 'Cat. A (1.5%)'}</p>
    ${emp.departement ? `<p><strong>Département :</strong> ${emp.departement}</p>` : ''}
  </div>
</div>
<div class="section">REVENUS</div>
<table><tr><th>Libellé</th><th class="right">Montant (MUR)</th></tr>
<tr><td>Salaire de base</td><td class="right">${fmt(bulletin.salaire_base)}</td></tr>
${bulletin.transport_allowance > 0 ? `<tr><td>Transport Allowance</td><td class="right">${fmt(bulletin.transport_allowance)}</td></tr>` : ''}
${bulletin.petrol_allowance > 0 ? `<tr><td>Petrol Allowance</td><td class="right">${fmt(bulletin.petrol_allowance)}</td></tr>` : ''}
${bulletin.heures_sup_montant > 0 ? `<tr><td>Heures supplémentaires</td><td class="right">${fmt(bulletin.heures_sup_montant)}</td></tr>` : ''}
${bulletin.special_allowance_1 > 0 ? `<tr><td>Primes</td><td class="right">${fmt(bulletin.special_allowance_1)}</td></tr>` : ''}
<tr class="bold"><td>TOTAL BRUT</td><td class="right">${fmt(bulletin.salaire_brut)}</td></tr></table>
<div class="section">DEDUCTIONS SALARIE</div>
<table><tr><th>Libellé</th><th class="right">Montant (MUR)</th></tr>
<tr><td>CSG (${bulletin.salaire_brut > 50000 ? '3%' : '1.5%'})</td><td class="right">${fmt(bulletin.csg_salarie)}</td></tr>
<tr><td>NSF (1.5%)</td><td class="right">${fmt(bulletin.nsf_salarie)}</td></tr>
<tr><td>PAYE (Impôt sur le revenu)</td><td class="right">${fmt(bulletin.paye)}</td></tr>
${bulletin.montant_absence > 0 ? `<tr><td>Déduction absence</td><td class="right">${fmt(bulletin.montant_absence)}</td></tr>` : ''}
<tr class="bold"><td>TOTAL DEDUCTIONS</td><td class="right">${fmt(bulletin.total_deductions)}</td></tr></table>

<div style="border:3px solid #0B0F2E;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;background:linear-gradient(135deg,#0B0F2E08,#D4AF3708);">
  <p style="font-size:13px;font-weight:700;color:#0B0F2E;margin-bottom:4px;">NET À PAYER</p>
  <p style="font-size:24px;font-weight:800;color:#0B0F2E;">${fmt(bulletin.salaire_net)} MUR</p>
  <p style="font-size:11px;color:#555;margin-top:6px;">Virement ${emp.bank_name || emp.bank_name || ''} — ****${(emp.bank_account || emp.bank_account || '').slice(-4)}</p>
</div>

<div style="margin:15px 0;padding:10px;border:1px solid #e0e0e0;border-radius:6px;">
  <h3 style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:8px;">Soldes Congés</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:11px;">
    <div>AL (Congé annuel): --j</div>
    <div>SL (Congé maladie): --j</div>
    <div>MAT/PAT: --j</div>
  </div>
</div>

<div class="section">CHARGES PATRONALES</div>
<table><tr><th>Libellé</th><th class="right">Montant (MUR)</th></tr>
<tr><td>CSG Patronal (6%)</td><td class="right">${fmt(bulletin.csg_patronal)}</td></tr>
<tr><td>NSF Patronal (2.5%)</td><td class="right">${fmt(bulletin.nsf_patronal)}</td></tr>
<tr><td>Training Levy HRDC (1%)</td><td class="right">${fmt(bulletin.training_levy)}</td></tr>
<tr><td>PRGF</td><td class="right">${fmt(bulletin.prgf)}</td></tr>
<tr class="bold"><td>TOTAL CHARGES PATRONALES</td><td class="right">${fmt(bulletin.total_charges_patronales)}</td></tr></table>

<div style="display:flex;justify-content:space-between;margin-top:30px;padding-top:15px;border-top:1px solid #ddd;">
  <div style="width:65%;">
    <p style="font-size:10px;color:#888;line-height:1.5;">
      Ce bulletin doit être conservé sans limitation de durée.<br>
      Généré par Lexora — Logiciel de paie Maurice<br>
      Signé électroniquement le ${new Date().toLocaleDateString('fr-FR')} par RH Manager
    </p>
  </div>
  <div style="width:30%;text-align:center;">
    <div style="width:80px;height:80px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:9px;color:#999;">
      QR Code<br>Vérification
    </div>
    <p style="font-size:9px;color:#999;margin-top:4px;">lexora.finance/verify</p>
  </div>
</div>

<p style="font-size:9px;color:#bbb;text-align:center;margin-top:20px;">
  LEXORA — Comptabilité intelligente pilotée par l'IA — lexora.finance
</p>
</body></html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
