import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import { calculateWorkingDays } from '@/lib/rh/calculateWorkingDays'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Count working days between two dates (Mon–Fri, excluding Mauritius public
 * holidays). Thin wrapper around the shared calculateWorkingDays utility so
 * this file keeps its previous call-site signature.
 *
 * NOTE: the previous version excluded weekends only — no holidays — which
 * slightly overcounted the notice period for any month containing a MU
 * holiday. The shared helper now excludes them, matching Workers' Rights
 * Act Section 23 practice (notice period is "working days").
 */
function countWorkingDays(dateDebut: string, dateFin: string): number {
  return calculateWorkingDays(dateDebut, dateFin)
}

/** Calculate ancienneté between two dates */
function calculateAnciennete(dateArrivee: string, dateDepart: string) {
  const start = new Date(dateArrivee + 'T00:00:00')
  const end = new Date(dateDepart + 'T00:00:00')

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  let days = end.getDate() - start.getDate()

  if (days < 0) {
    months--
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) {
    years--
    months += 12
  }

  const totalMonths = years * 12 + months + (days > 0 ? days / 30 : 0)
  const totalYears = totalMonths / 12

  return { years, months, days, totalMonths: Math.round(totalMonths * 100) / 100, totalYears: Math.round(totalYears * 100) / 100 }
}

/** Calculate months worked in the current year up to dateDepart */
function monthsWorkedThisYear(dateArrivee: string, dateDepart: string): number {
  const departDate = new Date(dateDepart + 'T00:00:00')
  const yearStart = new Date(departDate.getFullYear(), 0, 1)
  const arriveeDate = new Date(dateArrivee + 'T00:00:00')

  // Start counting from Jan 1 or date_arrivee, whichever is later
  const effectiveStart = arriveeDate > yearStart ? arriveeDate : yearStart

  if (effectiveStart > departDate) return 0

  let months = departDate.getMonth() - effectiveStart.getMonth()
  const startYear = effectiveStart.getFullYear()
  const endYear = departDate.getFullYear()
  months += (endYear - startYear) * 12

  // Add partial month: if departure is mid-month, count partial
  const daysFraction = departDate.getDate() / 30
  months += daysFraction > 0.5 ? 1 : daysFraction

  return Math.min(Math.round(months * 100) / 100, 12)
}

/** Days worked in last month up to dateDepart */
function daysWorkedLastMonth(dateDepart: string): { days: number; totalDaysInMonth: number } {
  const d = new Date(dateDepart + 'T00:00:00')
  const totalDaysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { days: d.getDate(), totalDaysInMonth }
}

/** Notice period per Mauritius WRA 2019.
 *  Override : `licenciement_faute` impose 1 mois fixe quel que soit l'ancienneté
 *  (faute simple / négociée). Pour `faute grave` / `faute lourde`, l'employeur
 *  est libre de licencier sans préavis, mais le module Lexora trace au moins
 *  un mois pour permettre la procédure contradictoire. */
function getNoticePeriod(ancienneteMonths: number, typeDepart?: string): { months: number; description: string } {
  if (typeDepart === 'licenciement_faute') {
    return { months: 1, description: '1 mois de préavis (licenciement pour faute)' }
  }
  if (ancienneteMonths < 3) return { months: 0, description: 'Aucun préavis (< 3 mois)' }
  if (ancienneteMonths <= 36) return { months: 1, description: '1 mois de préavis (3 mois - 3 ans)' }
  return { months: 3, description: '3 mois de préavis (> 3 ans)' }
}

/** Liste des types de départ déclenchant une indemnité de préavis */
const TYPES_AVEC_PREAVIS = new Set(['licenciement', 'fin_contrat', 'licenciement_faute'])

// ─── GET: Preview departure calculation ───
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const action = searchParams.get('action')

    // List recent departures
    if (action === 'recent') {
      const accessibleIds = await getUserSocieteIds(user.id)
      if (accessibleIds.length === 0) return NextResponse.json({ departs: [] })

      // Sélection défensive : si les colonnes email / email_personnel ne
      // sont pas présentes sur certains environnements (migrations non
      // appliquées), on retombe sur la sélection minimale plutôt que
      // d'échouer et de masquer toute la liste.
      const baseCols = 'id, nom, prenom, poste, date_arrivee, date_depart, date_depart_type, raison_depart, salaire_base, societe_id'
      const extCols  = `${baseCols}, email, email_personnel`

      let { data: departs, error } = await supabase
        .from('employes')
        .select(extCols)
        .in('societe_id', accessibleIds)
        .not('date_depart', 'is', null)
        .order('date_depart', { ascending: false })
        .limit(20) as { data: any[] | null; error: any }

      if (error) {
        // Fallback : colonnes optionnelles manquantes → on récupère la base
        const fb = await supabase
          .from('employes')
          .select(baseCols)
          .in('societe_id', accessibleIds)
          .not('date_depart', 'is', null)
          .order('date_depart', { ascending: false })
          .limit(20)
        if (fb.error) {
          return NextResponse.json({ error: fb.error.message }, { status: 500 })
        }
        departs = fb.data as any[]
      }

      // Map date_depart_type → type_depart for frontend consistency
      const mapped = (departs || []).map((d: any) => ({
        ...d,
        type_depart: d.date_depart_type,
      }))

      return NextResponse.json({ departs: mapped })
    }

    if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })

    // Get employee
    const { data: emp, error: empErr } = await supabase.from('employes').select('*').eq('id', employe_id).maybeSingle()
    if (empErr || !emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

    return NextResponse.json({ employe: emp })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ─── POST: Calculate or confirm departure ───
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ═══════════════════════════════════════════════════════
    // ACTION: calculer_solde — Compute final settlement
    // ═══════════════════════════════════════════════════════
    if (action === 'calculer_solde') {
      const { employe_id, date_depart, type_depart } = body
      if (!employe_id || !date_depart || !type_depart) {
        return NextResponse.json({ error: 'employe_id, date_depart et type_depart requis' }, { status: 400 })
      }

      // 1. Get employee data
      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Check access
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }

      const salaireBase = parseFloat(emp.salaire_base) || 0
      const dateArrivee = emp.date_arrivee?.split('T')[0] || date_depart
      const dailySalary = salaireBase / 26 // Standard Mauritius: 26 working days/month

      // Helper d'arrondi : conserve 2 décimales pour tous les montants monétaires
      const r2 = (n: number) => Math.round(n * 100) / 100

      // 2. Ancienneté
      const anciennete = calculateAnciennete(dateArrivee, date_depart)

      // 3. Prorata salary for last month
      const lastMonth = daysWorkedLastMonth(date_depart)
      const salaryProrata = r2((salaireBase / lastMonth.totalDaysInMonth) * lastMonth.days)

      // 4. AL restant à payer au départ
      //
      // FIX (mai 2026) — Le calcul ne doit PAS recalculer "from scratch" un
      // prorata 20 j × mois_année_civile : ça ignore les jours reportés
      // d'années antérieures et les droits supérieurs (22 j/an WRA Maurice,
      // ou + selon contrat société). On lit directement `soldes_conges` qui
      // contient la vérité (al_droit + report + al_pris + al_solde).
      //
      // Fallback (si soldes_conges absent) : prorata 22 j × mWorked / 12.
      const mWorked = monthsWorkedThisYear(dateArrivee, date_depart)
      const currentYear = new Date(date_depart + 'T00:00:00').getFullYear()

      const { data: soldeAuDepart } = await supabase
        .from('soldes_conges')
        .select('al_droit, al_pris, al_solde, periode_debut, periode_fin')
        .eq('employe_id', employe_id)
        .lte('periode_debut', date_depart)
        .gte('periode_fin', date_depart)
        .order('periode_debut', { ascending: false })
        .limit(1)
        .maybeSingle()

      let alEntitled: number
      let alTaken: number
      let alRemaining: number

      if (soldeAuDepart) {
        // Source de vérité : la table soldes_conges entretient déjà
        // al_droit (incluant report) - al_pris = al_solde.
        alEntitled = Number(soldeAuDepart.al_droit) || 0
        alTaken = Number(soldeAuDepart.al_pris) || 0
        alRemaining = Math.round((Number(soldeAuDepart.al_solde) || 0) * 100) / 100
      } else {
        // Fallback : prorata 22 j (WRA standard Maurice)
        alEntitled = Math.round((22 * mWorked) / 12 * 100) / 100
        const { data: alTakenData } = await supabase
          .from('demandes_conges')
          .select('nb_jours')
          .eq('employe_id', employe_id)
          .eq('type_conge', 'AL')
          .eq('statut', 'approuve')
          .gte('date_debut', `${currentYear}-01-01`)
          .lte('date_debut', `${currentYear}-12-31`)
        alTaken = (alTakenData || []).reduce((s: number, c: any) => s + (c.nb_jours || 0), 0)
        // WRA s.46 — solde négatif possible (déduction sur solde de tout compte)
        alRemaining = Math.round((alEntitled - alTaken) * 100) / 100
      }
      const alPayout = r2(alRemaining * dailySalary)

      // 5. SL restant — WRA Art. 48(2) : le Sick Leave non pris N'EST PAS
      // payable à la sortie. Seul l'Annual Leave est dû. On garde le calcul
      // (jours restants) pour information RH mais le montant est 0.
      const slEntitled = Math.round((15 * mWorked) / 12 * 100) / 100
      const { data: slTakenData } = await supabase
        .from('demandes_conges')
        .select('nb_jours')
        .eq('employe_id', employe_id)
        .eq('type_conge', 'SL')
        .eq('statut', 'approuve')
        .gte('date_debut', `${currentYear}-01-01`)
        .lte('date_debut', `${currentYear}-12-31`)

      const slTaken = (slTakenData || []).reduce((s: number, c: any) => s + (c.nb_jours || 0), 0)
      const slRemaining = Math.max(0, Math.round((slEntitled - slTaken) * 100) / 100)
      const slPayout = 0 // WRA Art. 48(2) — SL non payable à la sortie

      // 5-bis. VL — WRA s.47 (30 jours / 5 ans d'ancienneté, payable à la sortie)
      //        RPC get_vacation_leave_droit() (mig 161 + lib/rh/soldes-conges.ts)
      let vlDroit = 0
      let vlTaken = 0
      let vlEligibilityStatus = 'no_date_arrivee'
      let vlCycleDebut: string | null = null
      let vlCycleFin: string | null = null

      // ── Debug VL — log de tous les paramètres avant l'appel RPC ─────
      const vlRpcParams = {
        p_date_arrivee: dateArrivee,
        p_salaire_base: salaireBase,
        p_is_migrant: Boolean(emp.is_migrant_worker ?? false),
        p_date_reference: date_depart,
        p_policy_hors_wra: 'applique_wra_etendu',
      }
      console.log('[VL debug] Calling get_vacation_leave_droit with:', vlRpcParams)

      try {
        // ⚠️ La RPC retourne SETOF (TABLE) — il FAUT .maybeSingle() pour
        //    récupérer l'objet (sinon `data` est un array, row.vl_droit
        //    devient undefined → vlDroit = 0 silencieusement).
        const { data: vlRow, error: vlErr } = await supabase
          .rpc('get_vacation_leave_droit', vlRpcParams)
          .maybeSingle()

        console.log('[VL debug] RPC response:', { vlRow, vlErr })

        if (vlRow) {
          const row = vlRow as { vl_droit?: number; eligibility_status?: string; vl_cycle_debut?: string; vl_cycle_fin?: string }
          vlDroit = Number(row.vl_droit) || 0
          vlEligibilityStatus = String(row.eligibility_status) || 'no_date_arrivee'
          vlCycleDebut = row.vl_cycle_debut ? String(row.vl_cycle_debut).slice(0, 10) : null
          vlCycleFin = row.vl_cycle_fin ? String(row.vl_cycle_fin).slice(0, 10) : null
        } else if (vlErr) {
          console.warn('[VL debug] RPC returned error:', vlErr)
        }

        // VL pris dans le cycle courant
        if (vlCycleDebut && vlCycleFin) {
          const { data: vlRows } = await supabase
            .from('demandes_conges')
            .select('nb_jours')
            .eq('employe_id', employe_id)
            .eq('type_conge', 'VL')
            .eq('statut', 'approuve')
            .gte('date_debut', vlCycleDebut)
            .lte('date_debut', vlCycleFin)
          vlTaken = (vlRows || []).reduce((s, r: any) => s + (Number(r.nb_jours) || 0), 0)
        }
      } catch (e) {
        console.warn('[calculer_solde] VL RPC failed:', e instanceof Error ? e.message : String(e))
      }

      // Fallback manuel : si RPC indispo (no_date_arrivee alors qu'on a
      // l'ancienneté), recalculer en JS pour ne pas perdre le droit.
      if (vlDroit === 0 && vlEligibilityStatus === 'no_date_arrivee'
          && dateArrivee && anciennete.totalMonths >= 60
          && salaireBase <= 50000
          && !(emp.is_migrant_worker ?? false)) {
        console.warn('[VL debug] Fallback manuel: ancienneté >= 5 ans + WRA worker, droit 30j')
        vlDroit = 30
        vlEligibilityStatus = 'manual_fallback'
      }

      // WRA s.46 — solde négatif déductible (cf. AL ci-dessus). On garde le signe.
      const vlRemaining = Math.round((vlDroit - vlTaken) * 100) / 100
      const vlPayout = r2(vlRemaining * dailySalary)

      console.log('[VL debug] Final values:', {
        vlDroit, vlTaken, vlRemaining, vlPayout,
        vlEligibilityStatus, vlCycleDebut, vlCycleFin,
        ancienneteMonths: anciennete.totalMonths,
      })

      // 6. Prorata 13th month (EOY bonus)
      const treizMois = r2((salaireBase / 12) * mWorked)

      // 7. Notice period (override 1 mois pour `licenciement_faute`)
      const notice = getNoticePeriod(anciennete.totalMonths, type_depart)
      const noticePayout = TYPES_AVEC_PREAVIS.has(type_depart)
        ? r2(notice.months * salaireBase)
        : 0

      // 8. Severance allowance — UNIQUEMENT licenciement économique standard.
      //    Pour `licenciement_faute`, pas d'indemnité de licenciement (WRA :
      //    faute = pas de severance pay, le préavis seul est versé).
      const severance = type_depart === 'licenciement'
        ? r2(3 * salaireBase * anciennete.totalYears)
        : 0

      // 9. Transport/petrol allowances prorata
      const transportAllowance = parseFloat(emp.transport_allowance) || 0
      const petrolAllowance = parseFloat(emp.petrol_allowance) || 0
      const allowancesProrata = r2(((transportAllowance + petrolAllowance) / lastMonth.totalDaysInMonth) * lastMonth.days)

      // Total
      const total = r2(salaryProrata + alPayout + slPayout + vlPayout + treizMois + noticePayout + severance + allowancesProrata)

      const breakdown = {
        employe: {
          id: emp.id,
          nom: emp.nom,
          prenom: emp.prenom,
          poste: emp.poste,
          code: emp.code,
          salaire_base: salaireBase,
          date_arrivee: dateArrivee,
          transport_allowance: transportAllowance,
          petrol_allowance: petrolAllowance,
        },
        date_depart,
        type_depart,
        anciennete: {
          years: anciennete.years,
          months: anciennete.months,
          days: anciennete.days,
          total_years: anciennete.totalYears,
          total_months: anciennete.totalMonths,
          label: `${anciennete.years} an(s) ${anciennete.months} mois ${anciennete.days} jour(s)`,
        },
        salaire_prorata: {
          jours_travailles: lastMonth.days,
          jours_mois: lastMonth.totalDaysInMonth,
          montant: salaryProrata,
        },
        conges_al: {
          droit_prorata: alEntitled,
          pris: alTaken,
          restant: alRemaining,
          taux_journalier: r2(dailySalary),
          montant: alPayout,
        },
        conges_sl: {
          droit_prorata: slEntitled,
          pris: slTaken,
          restant: slRemaining,
          taux_journalier: r2(dailySalary),
          montant: 0,
          non_payable_wra: true, // WRA Art. 48(2) — info UI
        },
        conges_vl: {
          droit: vlDroit,
          pris: vlTaken,
          restant: vlRemaining,
          taux_journalier: r2(dailySalary),
          montant: vlPayout,
          eligibility_status: vlEligibilityStatus,
          cycle_debut: vlCycleDebut,
          cycle_fin: vlCycleFin,
        },
        treizieme_mois: {
          mois_travailles: mWorked,
          montant: treizMois,
        },
        preavis: {
          duree_mois: notice.months,
          description: notice.description,
          montant: noticePayout,
          applicable: TYPES_AVEC_PREAVIS.has(type_depart),
        },
        indemnite_licenciement: {
          applicable: type_depart === 'licenciement',
          formule: '3 × salaire mensuel × années de service',
          annees_service: anciennete.totalYears,
          montant: severance,
        },
        allocations_prorata: {
          transport: transportAllowance,
          petrol: petrolAllowance,
          montant: allowancesProrata,
        },
        // Lignes additionnelles éditables côté UI (primes, déductions, etc.)
        // chaque entrée : { libelle, montant (signé), note? }
        lignes_extra: [] as Array<{ libelle: string; montant: number; note?: string }>,
        total,
      }

      return NextResponse.json({ breakdown })
    }

    // ═══════════════════════════════════════════════════════
    // ACTION: confirmer_depart — Process departure
    // ═══════════════════════════════════════════════════════
    if (action === 'confirmer_depart') {
      const {
        employe_id,
        date_depart,
        type_depart,
        raison_depart,
        breakdown: breakdownLegacy,
        // FIX-STC-EDITION — édition primante. `breakdown_edite` est la source de
        // vérité (version utilisateur). On ne RE-CALCULE PAS depuis zéro côté
        // serveur — on prend les chiffres confirmés à l'écran. `breakdown_auto`
        // (optionnel) sert au log d'audit (mig 434) pour comparer auto vs édité.
        breakdown_edite,
        breakdown_auto,
        edited_by_user,
      } = body
      if (!employe_id || !date_depart || !type_depart) {
        return NextResponse.json({ error: 'employe_id, date_depart et type_depart requis' }, { status: 400 })
      }

      // breakdown édité prime sur le legacy field `breakdown` (compatibilité
      // ascendante avec d'anciens clients qui n'envoient que `breakdown`).
      const breakdown = breakdown_edite ?? breakdownLegacy

      // FIX-STC-TRIGGER236 — trace ce que le serveur reçoit pour debug.
      // Indispensable car le trigger mig 236 (BEFORE INSERT) écrasait
      // silencieusement salaire_net si brut ≠ net (cas des retenues manuelles).
      try {
        console.log('[confirmer_depart] body received:', JSON.stringify({
          action,
          employe_id,
          date_depart,
          type_depart,
          edited_by_user,
          breakdown_edite_total: breakdown_edite?.total,
          breakdown_auto_total: breakdown_auto?.total,
          breakdown_legacy_total: breakdownLegacy?.total,
          lignes_extra_count: Array.isArray(breakdown?.lignes_extra) ? breakdown.lignes_extra.length : 0,
        }, null, 2))
      } catch { /* noop */ }

      // Get employee
      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Check access
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }

      // 1. Update employee record with departure info
      // Try with all fields first, fallback to minimal if columns don't exist
      let updateErr: any = null
      const { error: err1 } = await supabase
        .from('employes')
        .update({
          date_depart,
          date_depart_type: type_depart,
          raison_depart: raison_depart || null,
          breakdown_depart: breakdown || null,
        })
        .eq('id', employe_id)

      if (err1) {
        console.warn('[depart] Full update failed, trying without breakdown:', err1.message)
        // Fallback : la colonne breakdown_depart n'est pas encore migrée
        const { error: err1b } = await supabase
          .from('employes')
          .update({
            date_depart,
            date_depart_type: type_depart,
            raison_depart: raison_depart || null,
          })
          .eq('id', employe_id)
        if (err1b) {
          console.warn('[depart] Without breakdown still failed, trying minimal:', err1b.message)
          // Fallback final : seulement date_depart (toujours présent)
          const { error: err2 } = await supabase
            .from('employes')
            .update({ date_depart })
            .eq('id', employe_id)
          updateErr = err2
        }
      }

      if (updateErr) throw updateErr

      // 2. Create final settlement bulletin_paie
      const periodeDate = date_depart.slice(0, 7) + '-01' // YYYY-MM-01

      // Lignes additionnelles ajoutées/éditées côté UI (primes, avances, etc.)
      const lignesExtra: Array<{ libelle: string; montant: number; note?: string }> =
        Array.isArray(breakdown?.lignes_extra) ? breakdown.lignes_extra : []

      // FIX-STC-IDENTIQUE — séparer primes (positives) et retenues manuelles
      // (négatives) pour que le bulletin de paie reflète EXACTEMENT le calcul
      // du STC affiché dans /rh/depart. Avant, tout était noyé dans
      // special_allowance_2 ce qui rendait le bulletin incohérent avec le STC.
      const primesExtra = lignesExtra
        .filter(l => Number(l.montant) > 0)
        .reduce((s, l) => s + Number(l.montant), 0)
      // retenuesManuelles : montant POSITIF (les lignes sont négatives côté UI)
      const retenuesManuelles = lignesExtra
        .filter(l => Number(l.montant) < 0)
        .reduce((s, l) => s + Math.abs(Number(l.montant)), 0)

      // Le total éditable côté UI est la source de vérité — il intègre déjà
      // les éventuels ajustements manuels sur les lignes existantes ET les
      // lignes additionnelles (primes + retenues).
      const totalNet = breakdown?.total || 0

      // Build bulletin insert — salaire_brut is GENERATED ALWAYS so must not be included
      // The salaire_base field holds the prorata salary; all other components go into allowance slots
      const salaireBaseBulletin = breakdown?.salaire_prorata?.montant || 0
      const transportBulletin = breakdown?.allocations_prorata?.montant || 0
      const alPayout = breakdown?.conges_al?.montant || 0
      const slPayout = breakdown?.conges_sl?.montant || 0
      const treizBulletin = breakdown?.treizieme_mois?.montant || 0
      const preavisBulletin = breakdown?.preavis?.montant || 0
      const severanceBulletin = breakdown?.indemnite_licenciement?.montant || 0

      const typeLabel = type_depart === 'demission' ? 'Démission'
        : type_depart === 'licenciement' ? 'Licenciement'
        : type_depart === 'licenciement_faute' ? 'Licenciement pour faute'
        : type_depart === 'fin_contrat' ? 'Fin de contrat'
        : type_depart === 'retraite' ? 'Retraite'
        : 'Décès'

      // ── FIX-STC-EDITION — diff serveur entre breakdown auto et édité ──
      // Calculé même si l'UI n'a pas fourni breakdown_auto (cas legacy) : on
      // détecte alors « édité » uniquement via la présence de lignes_extra.
      const r2num = (n: any) => Math.round((Number(n) || 0) * 100) / 100
      const flattenForDiff = (b: any): Record<string, number> => ({
        salaire_prorata:        r2num(b?.salaire_prorata?.montant),
        conges_al:              r2num(b?.conges_al?.montant),
        conges_sl:              r2num(b?.conges_sl?.montant),
        treizieme_mois:         r2num(b?.treizieme_mois?.montant),
        allocations_prorata:    r2num(b?.allocations_prorata?.montant),
        preavis:                r2num(b?.preavis?.montant),
        indemnite_licenciement: r2num(b?.indemnite_licenciement?.montant),
        total:                  r2num(b?.total),
      })
      const modifications: Record<string, { auto: number; edite: number }> = {}
      if (breakdown_auto && breakdown) {
        const fa = flattenForDiff(breakdown_auto)
        const fe = flattenForDiff(breakdown)
        for (const k of Object.keys(fa)) {
          if (fa[k] !== fe[k]) modifications[k] = { auto: fa[k], edite: fe[k] }
        }
      }
      const wasEdited = Boolean(
        edited_by_user ||
        Object.keys(modifications).length > 0 ||
        lignesExtra.length > 0
      )

      // Notes du bulletin : on encode les lignes extra pour traçabilité
      const notesParts = [`Solde de tout compte — ${typeLabel}`]
      if (lignesExtra.length > 0) {
        notesParts.push(
          'Ajustements : ' + lignesExtra
            .map(l => `${l.libelle} ${l.montant >= 0 ? '+' : ''}${l.montant} MUR${l.note ? ` (${l.note})` : ''}`)
            .join(' ; ')
        )
      }
      if (retenuesManuelles > 0) {
        notesParts.push(`Retenues manuelles : ${retenuesManuelles.toFixed(2)} MUR`)
      }
      if (wasEdited) {
        // Marqueur lisible par humain ET pattern fixe `ÉDITÉ par <id> le <date>`
        // que l'UI (badge « ✏️ Édité manuellement ») peut détecter en regex.
        const today = new Date().toISOString().slice(0, 10)
        notesParts.push(`[SOLDE_TOUT_COMPTE ÉDITÉ par user ${user.id} le ${today}]`)
      }
      const bulletinNotes = notesParts.join(' | ')

      // FIX-STC-TRIGGER236 — Le trigger `bulletins_paie_enforce_net` (mig 236)
      // recalcule `salaire_net = salaire_brut(GENERATED) - csg - nsf - paye -
      // montant_absence` à chaque INSERT/UPDATE. Si l'écart entre la valeur
      // qu'on envoie et le calcul du trigger > 1 MUR, le trigger ÉCRASE
      // silencieusement `salaire_net` (et empêche l'édition de persister).
      //
      // Avant ce fix : on posait `total_deductions = retenuesManuelles` —
      // mais `total_deductions` N'EST PAS dans la formule du trigger. Du coup,
      // brut GENERATED = totalNet + retenuesManuelles, le trigger calculait
      // net_attendu = brut > totalNet, et ÉCRASAIT salaire_net := brut.
      // Conséquence visible côté user : « ça ne garde pas mes modifications ».
      //
      // Solution propre sans toucher au schéma SQL : retirer les retenues
      // manuelles d'un composant POSITIF du brut, pour que
      // `salaire_brut GENERATED == totalNet` exactement. On choisit
      // `special_allowance_2` (qui porte déjà le 13e + primes extra) : on lui
      // soustrait les retenues_manuelles. Ainsi le trigger calculera
      //   net_attendu = brut - 0 - 0 - 0 - 0 = brut = totalNet → écart = 0
      // et n'écrasera RIEN. La valeur éditée est préservée.
      //
      // La trace fonctionnelle des retenues manuelles est conservée via la
      // colonne dédiée `retenues_manuelles` (mig 430) + `breakdown_json` +
      // `notes`. La sortie UI (historique-paie, PDF) lit `salaire_net` qui
      // est désormais fidèle au STC affiché.
      const specialAlw2Adjusted = treizBulletin + primesExtra - retenuesManuelles
      const bulletinData: Record<string, any> = {
        employe_id,
        societe_id: emp.societe_id,
        periode: periodeDate,
        salaire_base: salaireBaseBulletin,
        transport_allowance: transportBulletin,
        special_allowance_1: alPayout + slPayout,
        // primes positives — retenues manuelles, pour que brut GENERATED == totalNet
        // (sinon le trigger mig 236 écrase salaire_net).
        special_allowance_2: specialAlw2Adjusted,
        departure_notice: preavisBulletin,
        special_allowance_3: severanceBulletin,
        // total_deductions = 0 : on ne double pas la retenue (elle est déjà
        // soustraite dans special_allowance_2 ci-dessus). retenues_manuelles
        // reste la source de vérité fonctionnelle.
        total_deductions: 0,
        salaire_net: totalNet,
        statut: 'valide',
        notes: bulletinNotes,
        // Colonnes mig 430
        type_bulletin: 'solde_tout_compte',
        retenues_manuelles: retenuesManuelles,
        acomptes: 0, // sous-cat distincte, réservé usage futur
        breakdown_json: breakdown ?? null,
      }

      // FIX-STC-TRIGGER236 — log de la ligne juste avant l'INSERT, pour pouvoir
      // diagnostiquer côté Vercel si un futur changement de schéma re-casse le
      // contrat brut==net. brut_attendu doit être ~= totalNet (écart < 1 MUR).
      try {
        const brutAttendu =
          (Number(salaireBaseBulletin) || 0) +
          (Number(transportBulletin) || 0) +
          (alPayout + slPayout) +
          (Number(specialAlw2Adjusted) || 0) +
          (Number(preavisBulletin) || 0) +
          (Number(severanceBulletin) || 0)
        console.log('[confirmer_depart] bulletin row to insert:', JSON.stringify({
          employe_id,
          periode: periodeDate,
          salaire_base: salaireBaseBulletin,
          transport_allowance: transportBulletin,
          special_allowance_1: alPayout + slPayout,
          special_allowance_2: specialAlw2Adjusted,
          departure_notice: preavisBulletin,
          special_allowance_3: severanceBulletin,
          salaire_net: totalNet,
          retenues_manuelles: retenuesManuelles,
          brut_attendu: Math.round(brutAttendu * 100) / 100,
          ecart_brut_vs_net: Math.round((brutAttendu - totalNet) * 100) / 100,
          wasEdited,
          modifications_keys: Object.keys(modifications),
        }, null, 2))
      } catch { /* noop */ }

      // FIX-SOLDE-STC — Bug Alicia : le bulletin de solde tout compte doit
      //   (a) refuser de remplacer un bulletin comptabilisé (mig 427 — l'UI
      //       admin doit décomptabiliser via /rh/audit-decomptabilisation
      //       avant un nouveau calcul de solde tout compte),
      //   (b) archiver l'ancien actif via mig 425 (is_archived / superseded_by)
      //       plutôt que de l'écraser, pour preserver la version "mois entier"
      //       dans /rh/historique-paie.
      // On ne cherche que les bulletins actifs (is_archived=false OR null).
      let bulletin: any = null
      const { data: existingBul } = await supabase
        .from('bulletins_paie')
        .select('id, comptabilise')
        .eq('employe_id', employe_id)
        .eq('periode', periodeDate)
        .or('is_archived.is.null,is_archived.eq.false')
        .maybeSingle()

      if (existingBul?.comptabilise === true) {
        return NextResponse.json({
          error: 'Bulletin déjà comptabilisé. Décomptabiliser via /rh/audit-decomptabilisation avant de confirmer le départ.',
          bulletin_id: existingBul.id,
          code: 'BULLETIN_COMPTABILISE',
          hint: 'Le bulletin existant pour cette période est verrouillé par la comptabilité. Un admin doit le décomptabiliser pour permettre le solde tout compte.',
        }, { status: 409 })
      }

      // FIX-STC-IDENTIQUE — helper resilient à l'absence des colonnes mig 430.
      // Si la migration n'est pas encore appliquée sur l'env, on retire les
      // nouvelles colonnes et on retente. Ainsi le STC reste fonctionnel même
      // sans la migration, avec dégradation gracieuse (mais alors les retenues
      // manuelles ne sont tracées que dans `notes` et `total_deductions`).
      const COLS_MIG_430 = ['type_bulletin', 'retenues_manuelles', 'acomptes', 'breakdown_json'] as const
      const insertBulletinWithFallback = async (data: Record<string, any>) => {
        const r1 = await supabase.from('bulletins_paie').insert(data).select().single()
        if (!r1.error) return r1
        const msg = r1.error.message || ''
        if (/column.*(type_bulletin|retenues_manuelles|acomptes|breakdown_json)/i.test(msg)) {
          console.warn('[depart] mig 430 not applied, retrying STC insert without new columns:', msg)
          const fallback: Record<string, any> = { ...data }
          for (const c of COLS_MIG_430) delete fallback[c]
          return await supabase.from('bulletins_paie').insert(fallback).select().single()
        }
        return r1
      }
      const updateBulletinWithFallback = async (id: string, data: Record<string, any>) => {
        const r1 = await supabase.from('bulletins_paie').update(data).eq('id', id).select().single()
        if (!r1.error) return r1
        const msg = r1.error.message || ''
        if (/column.*(type_bulletin|retenues_manuelles|acomptes|breakdown_json)/i.test(msg)) {
          console.warn('[depart] mig 430 not applied, retrying STC update without new columns:', msg)
          const fallback: Record<string, any> = { ...data }
          for (const c of COLS_MIG_430) delete fallback[c]
          return await supabase.from('bulletins_paie').update(fallback).eq('id', id).select().single()
        }
        return r1
      }

      if (existingBul) {
        // Étape 1 — archiver l'ancien bulletin (mig 425). Fallback in-place
        // si la mig 425 n'est pas appliquée sur cet environnement.
        const nowIso = new Date().toISOString()
        const { error: archErr } = await supabase
          .from('bulletins_paie')
          .update({
            is_archived: true,
            archived_at: nowIso,
            archive_reason: `Remplacé par solde tout compte (sortie ${date_depart})`,
          })
          .eq('id', existingBul.id)

        if (archErr) {
          // Fallback legacy : mig 425 absente → on UPDATE in-place.
          console.warn('[depart] archivage failed, fallback update in-place:', archErr.message)
          const { data: updated, error: upErr } = await updateBulletinWithFallback(existingBul.id, bulletinData)
          bulletin = updated
          if (upErr) console.error('Erreur update bulletin départ:', upErr.message)
        } else {
          // INSERT du nouveau bulletin STC actif après archivage.
          const { data: inserted, error: insErr } = await insertBulletinWithFallback(bulletinData)
          bulletin = inserted
          if (insErr) {
            console.error('Erreur insert bulletin solde tout compte (post-archive):', insErr.message)
          } else if (bulletin?.id) {
            // Lier l'ancien à la nouvelle version pour traçabilité.
            await supabase
              .from('bulletins_paie')
              .update({ superseded_by: bulletin.id })
              .eq('id', existingBul.id)
          }
        }
      } else {
        const { data: inserted, error: insErr } = await insertBulletinWithFallback(bulletinData)
        bulletin = inserted
        if (insErr) console.error('Erreur insert bulletin départ:', insErr.message)
      }

      // 3. Create accounting entries (journal SAL)
      // FIX-STC-IDENTIQUE — `totalNet` = total côté UI (déjà net des retenues
      // manuelles). On reconstruit le gross = totalNet + retenuesManuelles
      // pour passer en débit, et on crédite 4210 (net à payer) + 4250
      // (retenues manuelles à conserver) séparément. Garantit que les
      // écritures sont équilibrées et reflètent fidèlement le STC.
      const grossStc = totalNet + retenuesManuelles
      if (bulletin && grossStc > 0) {
        try {
          // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on insère direct dans V2.
          // V2 exige societe_id (NOT NULL) et expose dossier_id ; on garde dossier_id pour la traçabilité.
          // Renommage des clés : compte → numero_compte, debit → debit_mur, credit → credit_mur.
          const { data: dossier } = await supabase
            .from('dossiers')
            .select('id')
            .eq('societe_id', emp.societe_id)
            .limit(1)
            .maybeSingle()

          if (dossier) {
            const pieceRef = `STC-${emp.code || employe_id.slice(0, 8)}`
            const severanceMontant = breakdown?.indemnite_licenciement?.montant || 0
            const salaireSansIndemnite = severanceMontant > 0
              ? grossStc - severanceMontant
              : grossStc

            const entries: any[] = [
              {
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                numero_compte: '641', // PCM canonique : parent « Rémunérations du personnel »
                libelle: `Solde tout compte — ${emp.prenom} ${emp.nom}`,
                debit_mur: salaireSansIndemnite,
                credit_mur: 0,
                numero_piece: pieceRef,
              },
              {
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                numero_compte: '4210', // PCM canonique : « Salaires nets à payer »
                libelle: `Solde tout compte — ${emp.prenom} ${emp.nom}`,
                debit_mur: 0,
                credit_mur: totalNet,
                numero_piece: pieceRef,
              },
            ]

            // FIX-STC-IDENTIQUE — retenue manuelle créditée séparément
            // (compte 4250 : retenues sur salaires). Cohérent avec
            // lib/rh/reconstruct-bulletin-from-ecritures.ts qui mappe
            // 4250 → retenues_manuelles.
            if (retenuesManuelles > 0) {
              entries.push({
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                numero_compte: '4250',
                libelle: `Retenues manuelles STC — ${emp.prenom} ${emp.nom}`,
                debit_mur: 0,
                credit_mur: retenuesManuelles,
                numero_piece: pieceRef,
              })
            }

            // Add specific severance entry if applicable
            if (severanceMontant > 0) {
              entries.push({
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                numero_compte: '6417', // PCM canonique : « 13ème mois / Indemnités »
                libelle: `Indemnité licenciement — ${emp.prenom} ${emp.nom}`,
                debit_mur: severanceMontant,
                credit_mur: 0,
                numero_piece: pieceRef,
              })
            }

            await supabase.from('ecritures_comptables_v2').insert(entries)
          }
        } catch (err) {
          console.error('Erreur écritures comptables:', err)
          // Non-blocking
        }
      }

      // 4. Cancel any future leave requests
      const { data: futureLeaves } = await supabase
        .from('demandes_conges')
        .select('id')
        .eq('employe_id', employe_id)
        .eq('statut', 'en_attente')
        .gte('date_debut', date_depart)

      if (futureLeaves && futureLeaves.length > 0) {
        await supabase
          .from('demandes_conges')
          .update({ statut: 'refuse', commentaire_manager: 'Annulé automatiquement — départ de l\'employé' })
          .in('id', futureLeaves.map((l: any) => l.id))
      }

      // 5. Remove from future planning assignments
      try {
        await supabase
          .from('planning_assignments')
          .delete()
          .eq('employe_id', employe_id)
          .gte('date', date_depart)
      } catch {
        // Table may not exist, non-blocking
      }

      // ── FIX-STC-EDITION — Audit log STC édition (mig 434) ────────────────
      // Non-bloquant : si la table n'existe pas (mig 434 pas appliquée), on
      // logge l'erreur en console et on continue. Le bulletin reste valide.
      try {
        const { error: auditErr } = await supabase
          .from('stc_edition_log')
          .insert({
            employe_id,
            societe_id: emp.societe_id,
            user_id: user.id,
            breakdown_auto: breakdown_auto ?? null,
            breakdown_edite: breakdown ?? null,
            modifications: Object.keys(modifications).length > 0 ? modifications : null,
            bulletin_id: bulletin?.id || null,
            edited_by_user: wasEdited,
            notes: `STC ${typeLabel} ${date_depart} — édité=${wasEdited}, lignes_extra=${lignesExtra.length}, retenues_man=${retenuesManuelles.toFixed(2)}`,
          })
        if (auditErr) {
          console.warn('[depart] stc_edition_log insert skipped:', auditErr.message)
        }
      } catch (auditCatch) {
        console.warn('[depart] stc_edition_log insert exception (non-blocking):', auditCatch)
      }

      return NextResponse.json({
        success: true,
        message: `Départ de ${emp.prenom} ${emp.nom} confirmé au ${date_depart}`,
        bulletin_id: bulletin?.id || null,
        edited_by_user: wasEdited,
        modifications_count: Object.keys(modifications).length,
      })
    }

    // === SORTIE MANUELLE — enregistrer un départ sans calcul de solde ===
    if (action === 'sortie_manuelle') {
      const { employe_id, date_depart, type_depart, raison_depart } = body
      if (!employe_id || !date_depart) return NextResponse.json({ error: 'employe_id et date_depart requis' }, { status: 400 })

      const { data: emp } = await supabase.from('employes').select('id, nom, prenom, societe_id').eq('id', employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Check access
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }

      const { error: updateErr } = await supabase.from('employes').update({
        date_depart,
        date_depart_type: type_depart || 'demission',
        raison_depart: raison_depart || null,
      }).eq('id', employe_id)

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        message: `Sortie manuelle enregistrée pour ${emp.prenom} ${emp.nom} au ${date_depart}`,
      })
    }

    // ═══════════════════════════════════════════════════════
    // ACTION: reintegrer — Cancel departure, reinstate employee
    // ═══════════════════════════════════════════════════════
    if (action === 'reintegrer') {
      const { employe_id } = body
      if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })

      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Check access
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }

      if (!emp.date_depart) {
        return NextResponse.json({ error: 'Cet employé n\'est pas en statut de départ' }, { status: 400 })
      }

      // Clear departure fields
      const updateFields: Record<string, any> = { date_depart: null }
      // Try to clear optional fields (may not exist)
      try {
        await supabase.from('employes').update({
          date_depart: null,
          date_depart_type: null,
          raison_depart: null,
        }).eq('id', employe_id)
      } catch {
        // Fallback if columns don't exist
        await supabase.from('employes').update({ date_depart: null }).eq('id', employe_id)
      }

      return NextResponse.json({
        success: true,
        message: `${emp.prenom} ${emp.nom} a été réintégré(e) avec succès`,
      })
    }

    return NextResponse.json({ error: 'Action non reconnue. Utilisez calculer_solde, confirmer_depart, sortie_manuelle ou reintegrer.' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
