import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import { lastDayOfMonth } from '@/lib/rh/period'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

// Sprint 7 FIX 6 — PDF affichait "19/170" au lieu de "19 170".
// Cause : Intl.NumberFormat('fr-FR') utilise par défaut un narrow NBSP
// (U+202F, ou NBSP classique U+00A0 selon la version ICU) comme
// séparateur de milliers. La police Helvetica embarquée par
// @react-pdf/renderer ne sait pas rendre ces caractères Unicode spéciaux
// et les remplace par '/' dans le PDF final. Solution : normaliser
// TOUS les espaces Unicode non-sécables vers un espace ASCII (U+0020)
// juste après le format — garde le format locale, force le rendu propre.
function fmt(n: number | null | undefined): string {
  if (!n && n !== 0) return "0"
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(n)
    // U+00A0 (NBSP), U+202F (narrow NBSP), U+2009 (thin space)
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
}

// ─── Shared data fetcher ──────────────────────────────────────────
async function fetchBulletinData(supabase: any, bulletin: any) {
  const { data: emp } = await supabase.from('employes').select('*').eq('id', bulletin.employe_id).single()
  const { data: soc } = await supabase.from('societes').select('*').eq('id', bulletin.societe_id).single()

  const periodeDate = new Date(bulletin.periode + 'T12:00:00')
  const moisLabel = MOIS_FR[periodeDate.getMonth()] || ''
  const annee = periodeDate.getFullYear()

  // TODO (B.4) — Le bulletin de paie liste encore les congés pris par année
  // civile. Pour être aligné avec la logique période anniversaire (WRA 2019)
  // introduite dans le Sprint "Années par anniversaire", il faudrait lire
  // soldes_conges (where periode_debut <= bulletin.periode <= periode_fin).
  // Refactor différé : impacte le layout PDF, à traiter dans un sprint dédié.
  const { data: congesApprouves } = await supabase
    .from('demandes_conges').select('type_conge, nb_jours')
    .eq('employe_id', bulletin.employe_id).eq('statut', 'approuve')
    .gte('date_debut', `${annee}-01-01`).lte('date_debut', `${annee}-12-31`)
  const alPris = (congesApprouves || []).filter((c: any) => c.type_conge === 'AL').reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
  const slPris = (congesApprouves || []).filter((c: any) => c.type_conge === 'SL').reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)

  const hireDate = emp?.date_arrivee ? new Date(emp.date_arrivee + 'T00:00:00') : null
  const mos = hireDate ? (annee - hireDate.getFullYear()) * 12 + (new Date().getMonth() - hireDate.getMonth()) : 999
  const alDroit = mos < 6 ? 0 : mos < 12 ? Math.min(mos - 6, 6) : 22
  const slDroit = mos < 6 ? 0 : mos < 12 ? Math.min(mos - 6, 6) : 15

  // Primes variables du mois — avec libellé depuis catalogue_primes.
  // Sprint 11 BUG 3 — on ne retient que les primes approuvées (les brouillons
  // ne doivent pas apparaître sur le bulletin).
  const { data: primesMois } = await supabase
    .from('primes_variables_mois').select('*, prime:catalogue_primes(libelle, type_prime)')
    .eq('employe_id', bulletin.employe_id).eq('periode', bulletin.periode)
    .eq('approuve', true)

  // Sprint 11 BUG 7 — frais kilométriques approuvés du mois (mig 037).
  // Affichés comme ligne séparée "Indemnités kilométriques" au lieu d'être
  // noyés dans other_refund.
  let totalFraisKm = 0
  try {
    const { data: fraisKm } = await supabase.from('frais_km_mois')
      .select('montant').eq('employe_id', bulletin.employe_id)
      .eq('periode', bulletin.periode).eq('approuve', true)
    totalFraisKm = (fraisKm || []).reduce(
      (s: number, f: any) => s + (Number(f.montant) || 0), 0
    )
  } catch {}

  // Seniority
  let anciennete = '—'
  if (emp?.date_arrivee) {
    const d = new Date(emp.date_arrivee)
    let y = periodeDate.getFullYear() - d.getFullYear()
    let m = periodeDate.getMonth() - d.getMonth()
    if (m < 0) { y--; m += 12 }
    anciennete = y > 0 ? `${y} an(s) ${m} mois` : `${m} mois`
  }

  return { emp, soc, moisLabel, annee, periodeDate, alPris, slPris, alDroit, slDroit, primesMois: primesMois || [], totalFraisKm, anciennete }
}

// ─── PDF Document Component ──────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 30, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 3, borderBottomColor: '#0B0F2E', paddingBottom: 10, marginBottom: 12 },
  headerLeft: { width: '55%' },
  headerRight: { width: '40%', alignItems: 'flex-end' },
  companyName: { fontSize: 13, fontWeight: 'bold', color: '#0B0F2E', fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 15, fontWeight: 'bold', color: '#0B0F2E', fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 13, fontWeight: 'bold', color: '#D4AF37', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  smallGray: { fontSize: 8.5, color: '#555', marginTop: 1 },
  // Employee info box
  infoBox: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 4, padding: 10, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoItem: { width: '50%', fontSize: 8.5, marginBottom: 3 },
  infoLabel: { fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  // Section
  sectionHeader: { backgroundColor: '#0B0F2E', padding: '4 8', borderRadius: 3, marginBottom: 6, marginTop: 10, borderBottomWidth: 2, borderBottomColor: '#D4AF37' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: 'white', fontFamily: 'Helvetica-Bold' },
  // Rows
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 8', borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  rowLabel: { fontSize: 9, flex: 1 },
  rowValue: { fontSize: 9, textAlign: 'right', width: 90 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '5 8', backgroundColor: '#f0f0f0', borderTopWidth: 2, borderTopColor: '#0B0F2E', marginTop: 4 },
  totalLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  totalValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'right', width: 90 },
  deduction: { color: '#c0392b' },
  // Net box
  netBox: { borderWidth: 3, borderColor: '#0B0F2E', borderRadius: 6, padding: 14, marginVertical: 14, alignItems: 'center' },
  netLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 3 },
  netAmount: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  netBank: { fontSize: 9, color: '#555', marginTop: 4 },
  // Leave box
  leaveBox: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 4, padding: 10, marginBottom: 12, backgroundColor: '#f8f9fa' },
  leaveTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', marginBottom: 6 },
  leaveGrid: { flexDirection: 'row', gap: 8 },
  leaveCard: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 3, padding: 6 },
  leaveCardLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 2 },
  leaveCardValue: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  leaveCardSub: { fontSize: 7.5, color: '#888' },
  // Patronal
  patronalBox: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 8, marginBottom: 12 },
  patronalTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', marginBottom: 4 },
  patronalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '2 0' },
  patronalLabel: { fontSize: 8.5, color: '#555' },
  patronalValue: { fontSize: 8.5, color: '#555', width: 80, textAlign: 'right' },
  patronalTotal: { fontFamily: 'Helvetica-Bold', color: '#0B0F2E', borderTopWidth: 1, borderTopColor: '#ccc', marginTop: 3, paddingTop: 3 },
  // Footer
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ddd' },
  footerText: { fontSize: 7.5, color: '#888', lineHeight: 1.5, width: '65%' },
  footerCenter: { fontSize: 7, color: '#bbb', textAlign: 'center', marginTop: 15 },
  primeRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 8', borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  primeLabel: { fontSize: 9, color: '#7c3aed', flex: 1 },
  primeValue: { fontSize: 9, color: '#7c3aed', textAlign: 'right', width: 90 },
  subTotalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 8', backgroundColor: '#faf5ff' },
  subTotalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#7c3aed', flex: 1 },
  subTotalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#7c3aed', textAlign: 'right', width: 90 },
  otSubRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 8', backgroundColor: '#fff7ed' },
  otSubLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ea580c', flex: 1 },
  otSubValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ea580c', textAlign: 'right', width: 90 },
})

function BulletinPDF({ bulletin, emp, soc, moisLabel, annee, periodeDate, alPris, slPris, alDroit, slDroit, primesMois, totalFraisKm, anciennete }: any) {
  const csgPct = Number(bulletin.salaire_brut) > 50000 ? '3%' : '1.5%'
  const hasOT = Number(bulletin.heures_sup_montant) > 0

  // Sprint — décomposition des 3 colonnes sa1/sa2/sa3 en lignes labellisées.
  // Distribution effective (cf. app/api/rh/paie/route.ts) :
  //   sa1 = primes variables approuvées + auto-rules + prime_fixe_1
  //   sa2 = phone_allowance + prime_fixe_2
  //   sa3 = (daily_bus_fare × 26) + prime_fixe_3
  //
  // Au rendu PDF on affiche individuellement :
  //   - Primes variables du mois (libellé via catalogue_primes.libelle)
  //   - Phone Allowance (si > 0)
  //   - Bus quotidien (si > 0, avec indication tarif/jour × 26)
  //   - Primes fixes employé (prime_fixe_N_libelle + montant)
  //   - Résidu éventuel par colonne si la somme reconstruite diverge du
  //     montant bulletin (couvre surcharges body / auto-rules non exposées
  //     ligne à ligne ou différences de rounding).
  const sumPrimesVar = (primesMois || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0)
  const primesFixes = [1, 2, 3]
    .map(n => ({
      n,
      libelle: (emp?.[`prime_fixe_${n}_libelle`] || '').toString().trim(),
      montant: Number(emp?.[`prime_fixe_${n}`]) || 0,
    }))
    .filter(p => p.montant > 0)
  const phoneAllowance = Number(emp?.phone_allowance) || 0
  const dailyBusFare = Number(emp?.daily_bus_fare) || 0
  const busMensuel = Math.round(dailyBusFare * 26 * 100) / 100
  const sa1 = Number(bulletin.special_allowance_1 || 0)
  const sa2 = Number(bulletin.special_allowance_2 || 0)
  const sa3 = Number(bulletin.special_allowance_3 || 0)

  // Calcul des résidus par colonne (reste après soustraction des éléments
  // labellisés connus). sa1Résidu couvre auto-rules + body.special_allowance_1.
  const pf1 = primesFixes.find(p => p.n === 1)?.montant || 0
  const pf2 = primesFixes.find(p => p.n === 2)?.montant || 0
  const pf3 = primesFixes.find(p => p.n === 3)?.montant || 0
  const residuSa1 = Math.max(0, Math.round((sa1 - sumPrimesVar - pf1) * 100) / 100)
  const residuSa2 = Math.max(0, Math.round((sa2 - phoneAllowance - pf2) * 100) / 100)
  const residuSa3 = Math.max(0, Math.round((sa3 - busMensuel - pf3) * 100) / 100)

  const hasPrimes = sa1 > 0 || sa2 > 0 || sa3 > 0 || primesMois.length > 0 || primesFixes.length > 0 || phoneAllowance > 0 || busMensuel > 0
  const totalPrimes = sa1 + sa2 + sa3

  const Row = ({ label, value, style: rowStyle }: { label: string; value: string; style?: any }) =>
    React.createElement(View, { style: s.row },
      React.createElement(Text, { style: [s.rowLabel, rowStyle] }, label),
      React.createElement(Text, { style: [s.rowValue, rowStyle] }, value)
    )

  const DeductionRow = ({ label, value }: { label: string; value: string }) =>
    React.createElement(View, { style: s.row },
      React.createElement(Text, { style: [s.rowLabel, s.deduction] }, label),
      React.createElement(Text, { style: [s.rowValue, s.deduction] }, value)
    )

  return React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: s.page },
      // ─── Header ────────────────────────────────
      React.createElement(View, { style: s.header },
        React.createElement(View, { style: s.headerLeft },
          React.createElement(Text, { style: s.companyName }, soc?.nom || 'N/A'),
          React.createElement(Text, { style: s.smallGray }, soc?.adresse || ''),
          React.createElement(Text, { style: s.smallGray }, `BRN: ${soc?.brn || '—'}${soc?.ern ? ` | ERN: ${soc.ern}` : ''}`),
          soc?.paye_number ? React.createElement(Text, { style: s.smallGray }, `PAYE: ${soc.paye_number}${soc?.csg_number ? ` | CSG: ${soc.csg_number}` : ''}${soc?.nsf_number ? ` | NSF: ${soc.nsf_number}` : ''}`) : null,
          soc?.telephone ? React.createElement(Text, { style: s.smallGray }, `Tel: ${soc.telephone}`) : null,
        ),
        React.createElement(View, { style: s.headerRight },
          React.createElement(Text, { style: s.title }, 'BULLETIN DE PAIE'),
          React.createElement(Text, { style: s.subtitle }, `${moisLabel} ${annee}`),
          React.createElement(Text, { style: s.smallGray }, `Ref: BUL-${annee}-${String(periodeDate.getMonth() + 1).padStart(2, '0')}-${emp?.code || '000'}`),
          React.createElement(Text, { style: s.smallGray }, `Emis le: ${new Date().toLocaleDateString('fr-FR')}`),
        )
      ),

      // ─── Employee Info ─────────────────────────
      React.createElement(View, { style: s.infoBox },
        React.createElement(View, { style: s.infoGrid },
          ...[
            ['Employe', `${emp?.prenom || ''} ${emp?.nom || ''}`],
            ['Code', emp?.code || '—'],
            ['Poste', emp?.poste || '—'],
            ['NIC', emp?.nic_number || '—'],
            ['TAN', emp?.tan || '—'],
            ["Date d'entree", emp?.date_arrivee ? new Date(emp.date_arrivee).toLocaleDateString('fr-FR') : '—'],
            ['Anciennete', anciennete],
            ['CSG Categorie', Number(bulletin.salaire_brut) > 50000 ? 'Cat. B (3%)' : 'Cat. A (1.5%)'],
            ...(emp?.adresse || emp?.ville ? [['Adresse', [emp.adresse, emp.adresse2, emp.ville, emp.code_postal].filter(Boolean).join(', ')]] : []),
            ...(emp?.departement ? [['Departement', emp.departement]] : []),
          ].map(([label, val], i) =>
            React.createElement(View, { style: s.infoItem, key: i },
              React.createElement(Text, null,
                React.createElement(Text, { style: s.infoLabel }, `${label} : `),
                String(val)
              )
            )
          )
        )
      ),

      // ─── Remuneration ─────────────────────────
      React.createElement(View, { style: s.sectionHeader },
        React.createElement(Text, { style: s.sectionTitle }, 'ELEMENTS DE REMUNERATION')
      ),
      // Sprint 13 BUG 1 — si le bulletin est prorata-é (premier/dernier mois),
      // bulletin.notes contient `[prorata_premier_mois (14/26j depuis YYYY-MM-DD)]`
      // ou variante. On extrait le libellé parenthèse pour l'afficher à
      // côté du label salaire de base.
      (() => {
        const n = (bulletin.notes || '').toString()
        const m = n.match(/prorata[_a-z]+ \(([^)]+)\)/)
        const label = m ? `Salaire de base (prorata ${m[1]})` : 'Salaire de base'
        return React.createElement(Row, { label, value: `${fmt(bulletin.salaire_base)} MUR` })
      })(),
      // POLICY Lexora — la compensation salariale Finance Act 2024 (635 MUR)
      // est considérée incluse dans le salaire. Plus de ligne "Compensation
      // salariale" sur le bulletin. On affiche uniquement l'incrément
      // contractuel quand il est > 0.
      Number(bulletin.increment_salaire) > 0
        ? React.createElement(Row, { label: 'Increment de salaire', value: `${fmt(bulletin.increment_salaire)} MUR`, key: 'incr' })
        : null,
      hasOT ? React.createElement(Row, { label: 'Heures supplementaires', value: `${fmt(bulletin.heures_sup_montant)} MUR` }) : null,
      hasOT ? React.createElement(View, { style: s.otSubRow },
        React.createElement(Text, { style: s.otSubLabel }, 'Sous-total heures supplementaires'),
        React.createElement(Text, { style: s.otSubValue }, `${fmt(bulletin.heures_sup_montant)} MUR`)
      ) : null,
      // G1 — Cash-in-lieu (WRA S.45 AL / S.47 VL) ligne dediee dans Gains.
      Number(bulletin.montant_cash_in_lieu) > 0
        ? React.createElement(Row, {
            label: `Paiement compensatoire conges (${Number(bulletin.jours_cash_in_lieu) || 0}j ${bulletin.cash_in_lieu_type || ''}) — WRA S.45/S.47`,
            value: `${fmt(Number(bulletin.montant_cash_in_lieu))} MUR`,
          })
        : null,
      // G7 — Allocation naissance WRA S.52 (forfait non-imposable).
      Number(bulletin.allocation_naissance) > 0
        ? React.createElement(Row, {
            label: 'Allocation naissance — WRA S.52 (forfait non-imposable)',
            value: `${fmt(Number(bulletin.allocation_naissance))} MUR`,
          })
        : null,
      // Sprint — allowances & primes détaillées (cf. distribution sa1/sa2/sa3
      // dans app/api/rh/paie/route.ts) :
      // 1) Primes variables approuvées (libellé via catalogue_primes)
      ...primesMois.map((p: any, i: number) =>
        React.createElement(View, { style: s.primeRow, key: `pv${i}` },
          React.createElement(Text, { style: s.primeLabel }, `Prime — ${p.prime?.libelle || p.notes || 'Variable'}${p.quantite > 1 ? ` (x${p.quantite})` : ''}`),
          React.createElement(Text, { style: s.primeValue }, `${fmt(Number(p.montant))} MUR`)
        )
      ),
      // 2) Phone Allowance (fiche employé, mensuel fixe)
      phoneAllowance > 0
        ? React.createElement(Row, { label: 'Téléphone', value: `${fmt(phoneAllowance)} MUR`, key: 'phone' })
        : null,
      // 3) Bus quotidien × 26 jours ouvrés — estimation mensuelle fixe
      busMensuel > 0
        ? React.createElement(Row, { label: `Bus quotidien (${dailyBusFare} × 26)`, value: `${fmt(busMensuel)} MUR`, key: 'bus' })
        : null,
      // 4) Primes fixes récurrentes (libellé libre : ELECTRICITE, LOYER, …)
      ...primesFixes.map((p: any, i: number) =>
        React.createElement(View, { style: s.primeRow, key: `pf${i}` },
          React.createElement(Text, { style: s.primeLabel }, `Prime — ${p.libelle || `Prime fixe ${p.n}`}`),
          React.createElement(Text, { style: s.primeValue }, `${fmt(p.montant)} MUR`)
        )
      ),
      // 5) Résidus par colonne — couvrent auto-rules + surcharges body
      // non exposées ligne à ligne. Affichés seulement si > 0.
      residuSa1 > 0
        ? React.createElement(Row, { label: 'Autres primes du mois', value: `${fmt(residuSa1)} MUR`, key: 'sa1res' })
        : null,
      residuSa2 > 0
        ? React.createElement(Row, { label: 'Allocation spéciale 2 (autres)', value: `${fmt(residuSa2)} MUR`, key: 'sa2res' })
        : null,
      residuSa3 > 0
        ? React.createElement(Row, { label: 'Allocation spéciale 3 (autres)', value: `${fmt(residuSa3)} MUR`, key: 'sa3res' })
        : null,
      hasPrimes ? React.createElement(View, { style: s.subTotalRow },
        React.createElement(Text, { style: s.subTotalLabel }, 'Sous-total primes'),
        React.createElement(Text, { style: s.subTotalValue }, `${fmt(totalPrimes)} MUR`)
      ) : null,
      // Sprint 11 BUG 7 — "Indemnités kilométriques" + résidu "Autres remboursements".
      // bulletin.other_refund = emp.other_refund + frais_km approuvés du mois.
      // On affiche séparément les frais km (montant depuis frais_km_mois) et le
      // résidu = other_refund - totalFraisKm (si > 0, couvre emp.other_refund).
      Number(totalFraisKm) > 0
        ? React.createElement(Row, { label: 'Indemnités kilométriques', value: `${fmt(Number(totalFraisKm))} MUR`, key: 'frais_km' })
        : null,
      (() => {
        const residOther = Math.max(0, Math.round((Number(bulletin.other_refund || 0) - Number(totalFraisKm || 0)) * 100) / 100)
        return residOther > 0
          ? React.createElement(Row, { label: 'Autres remboursements', value: `${fmt(residOther)} MUR`, key: 'other_ref_resid' })
          : null
      })(),
      Number(bulletin.eoy_bonus) > 0 ? React.createElement(Row, { label: '13eme mois (EOY Bonus)', value: `${fmt(bulletin.eoy_bonus)} MUR` }) : null,
      Number(bulletin.departure_notice) > 0 ? React.createElement(Row, { label: 'Preavis de depart', value: `${fmt(bulletin.departure_notice)} MUR` }) : null,
      // BRUT total
      React.createElement(View, { style: s.totalRow },
        React.createElement(Text, { style: s.totalLabel }, 'SALAIRE BRUT'),
        React.createElement(Text, { style: s.totalValue }, `${fmt(bulletin.salaire_brut)} MUR`)
      ),

      // ─── Deductions ────────────────────────────
      React.createElement(View, { style: [s.sectionHeader, { marginTop: 12 }] },
        React.createElement(Text, { style: s.sectionTitle }, 'DEDUCTIONS SALARIE')
      ),
      React.createElement(DeductionRow, { label: `CSG salarie (${csgPct})`, value: `-${fmt(bulletin.csg_salarie)} MUR` }),
      Number(bulletin.csg_bonus) > 0 ? React.createElement(DeductionRow, { label: 'CSG sur 13eme mois (3%)', value: `-${fmt(bulletin.csg_bonus)} MUR` }) : null,
      React.createElement(DeductionRow, { label: 'NSF salarie (1%)', value: `-${fmt(bulletin.nsf_salarie)} MUR` }),
      Number(bulletin.paye) > 0
        ? React.createElement(DeductionRow, { label: 'PAYE', value: `-${fmt(bulletin.paye)} MUR` })
        : React.createElement(View, { style: s.row },
            React.createElement(Text, { style: [s.rowLabel, { color: '#27ae60' }] }, 'PAYE'),
            React.createElement(Text, { style: [s.rowValue, { color: '#27ae60' }] }, 'Exonere')
          ),
      // F6 — Lignes séparées pour UL (Unpaid Leave) et absences injustifiées.
      // Les 2 sont désormais stockées dans des colonnes distinctes
      // (montant_ul / jours_ul vs montant_absence / jours_absence).
      Number(bulletin.montant_ul) > 0
        ? React.createElement(View, { style: [s.row, { backgroundColor: '#fdf0f0' }] },
            React.createElement(Text, { style: [s.rowLabel, { color: '#e74c3c' }] }, `Conges non payes UL (${Number(bulletin.jours_ul) || 0}j)`),
            React.createElement(Text, { style: [s.rowValue, { color: '#e74c3c' }] }, `-${fmt(Number(bulletin.montant_ul))} MUR`)
          )
        : null,
      Number(bulletin.montant_absence) > 0
        ? React.createElement(View, { style: [s.row, { backgroundColor: '#fdf0f0' }] },
            React.createElement(Text, { style: [s.rowLabel, { color: '#e74c3c' }] }, `Absences injustifiees (${Number(bulletin.jours_absence) || 0}j)`),
            React.createElement(Text, { style: [s.rowValue, { color: '#e74c3c' }] }, `-${fmt(Number(bulletin.montant_absence))} MUR`)
          )
        : null,
      React.createElement(View, { style: s.totalRow },
        React.createElement(Text, { style: s.totalLabel }, 'TOTAL DEDUCTIONS'),
        React.createElement(Text, { style: s.totalValue }, `-${fmt(bulletin.total_deductions)} MUR`)
      ),

      // ─── Net Box ───────────────────────────────
      React.createElement(View, { style: s.netBox },
        React.createElement(Text, { style: s.netLabel }, 'NET A PAYER'),
        React.createElement(Text, { style: s.netAmount }, `${fmt(bulletin.salaire_net)} MUR`),
        React.createElement(Text, { style: s.netBank }, `Virement ${emp?.bank_name || ''} — ****${(emp?.bank_account || '').slice(-4)}`)
      ),

      // ─── Leave Balances ─────────────────────────
      React.createElement(View, { style: s.leaveBox },
        React.createElement(Text, { style: s.leaveTitle }, `Soldes Conges — ${annee}`),
        React.createElement(View, { style: s.leaveGrid },
          React.createElement(View, { style: s.leaveCard },
            React.createElement(Text, { style: s.leaveCardLabel }, 'Local Leave (AL)'),
            React.createElement(Text, { style: [s.leaveCardValue, { color: '#059669' }] }, `${alDroit - alPris}j`),
            React.createElement(Text, { style: s.leaveCardSub }, `restants / ${alDroit}j (${alPris}j pris)`)
          ),
          React.createElement(View, { style: s.leaveCard },
            React.createElement(Text, { style: s.leaveCardLabel }, 'Sick Leave (SL)'),
            React.createElement(Text, { style: [s.leaveCardValue, { color: '#ea580c' }] }, `${slDroit - slPris}j`),
            React.createElement(Text, { style: s.leaveCardSub }, `restants / ${slDroit}j (${slPris}j pris)`)
          )
        )
      ),

      // ─── Charges patronales supprimées du PDF employé ──────────
      // Ces données restent visibles dans /rh/paie (admin), exports
      // comptables et dashboard RH — mais ne concernent pas l'employé.

      // ─── Footer ─────────────────────────────────
      React.createElement(View, { style: s.footer },
        React.createElement(Text, { style: s.footerText },
          `Ce bulletin doit etre conserve sans limitation de duree.\nSigne electroniquement le ${new Date().toLocaleDateString('fr-FR')} par RH Manager`
        )
      ),
      React.createElement(Text, { style: s.footerCenter }, `Genere par le systeme de paie — ${soc?.nom || ''}`)
    )
  )
}

// ─── GET handler (window.open) ────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return new NextResponse('Non autorise', { status: 401 })

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
      const periodeMonth = periode.substring(0, 7)
      const { data } = await supabase.from('bulletins_paie').select('*')
        .eq('employe_id', employe_id)
        .gte('periode', `${periodeMonth}-01`).lte('periode', lastDayOfMonth(periodeMonth))
        .order('periode', { ascending: false }).limit(1).maybeSingle()
      bulletin = data
    }
    if (!bulletin) return new NextResponse('Bulletin non trouve', { status: 404 })

    const { data: empCheck } = await supabase.from('employes').select('auth_user_id, email').eq('id', bulletin.employe_id).single()
    const isSelf = empCheck && (empCheck.auth_user_id === user.id || empCheck.email === user.email)
    if (!isSelf) {
      const hasAccess = await userHasAccessToEmploye(user.id, bulletin.employe_id)
      if (!hasAccess) return new NextResponse('Acces refuse', { status: 403 })
    }

    const data = await fetchBulletinData(supabase, bulletin)
    const doc = React.createElement(BulletinPDF, { bulletin, ...data })
    const pdfBuffer = await renderToBuffer(doc as any)
    const filename = `bulletin_${data.emp?.code || data.emp?.nom || 'employe'}_${data.annee}-${String(data.periodeDate.getMonth() + 1).padStart(2, '0')}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error('[pdf/GET]', e)
    return new NextResponse(`Erreur: ${e.message}`, { status: 500 })
  }
}

// ─── POST handler ─────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { bulletin_id } = await request.json()
    if (!bulletin_id) return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })

    const { data: bulletin, error } = await supabase.from('bulletins_paie').select('*').eq('id', bulletin_id).single()
    if (error || !bulletin) return NextResponse.json({ error: 'Bulletin non trouve' }, { status: 404 })

    const { data: empCheck } = await supabase.from('employes').select('auth_user_id, email').eq('id', bulletin.employe_id).single()
    const isSelf = empCheck && (empCheck.auth_user_id === user.id || empCheck.email === user.email)
    if (!isSelf) {
      const hasAccess = await userHasAccessToEmploye(user.id, bulletin.employe_id)
      if (!hasAccess) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const data = await fetchBulletinData(supabase, bulletin)
    const doc = React.createElement(BulletinPDF, { bulletin, ...data })
    const pdfBuffer = await renderToBuffer(doc as any)
    const filename = `bulletin_${data.emp?.code || data.emp?.nom || 'employe'}_${data.annee}-${String(data.periodeDate.getMonth() + 1).padStart(2, '0')}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error('[pdf/POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
