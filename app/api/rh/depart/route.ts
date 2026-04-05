import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Count working days between two dates (exclude Sat/Sun) */
function countWorkingDays(dateDebut: string, dateFin: string): number {
  let count = 0
  const d = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  while (d <= end) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
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

/** Notice period per Mauritius WRA 2019 */
function getNoticePeriod(ancienneteMonths: number): { months: number; description: string } {
  if (ancienneteMonths < 3) return { months: 0, description: 'Aucun préavis (< 3 mois)' }
  if (ancienneteMonths <= 36) return { months: 1, description: '1 mois de préavis (3 mois - 3 ans)' }
  return { months: 3, description: '3 mois de préavis (> 3 ans)' }
}

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

      const { data: departs } = await supabase
        .from('employes')
        .select('id, nom, prenom, poste, date_arrivee, date_depart, date_depart_type, raison_depart, salaire_base, societe_id')
        .in('societe_id', accessibleIds)
        .not('date_depart', 'is', null)
        .order('date_depart', { ascending: false })
        .limit(20)

      // Map date_depart_type → type_depart for frontend consistency
      const mapped = (departs || []).map(d => ({
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
  } catch (e: unknown) {
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

      // 2. Ancienneté
      const anciennete = calculateAnciennete(dateArrivee, date_depart)

      // 3. Prorata salary for last month
      const lastMonth = daysWorkedLastMonth(date_depart)
      const salaryProrata = Math.round((salaireBase / lastMonth.totalDaysInMonth) * lastMonth.days)

      // 4. Prorata AL: (20 x months_worked_this_year / 12) - AL already taken
      const mWorked = monthsWorkedThisYear(dateArrivee, date_depart)
      const alEntitled = Math.round((20 * mWorked) / 12 * 100) / 100
      const currentYear = new Date(date_depart + 'T00:00:00').getFullYear()

      const { data: alTakenData } = await supabase
        .from('demandes_conges')
        .select('nb_jours')
        .eq('employe_id', employe_id)
        .eq('type_conge', 'AL')
        .eq('statut', 'approuve')
        .gte('date_debut', `${currentYear}-01-01`)
        .lte('date_debut', `${currentYear}-12-31`)

      const alTaken = (alTakenData || []).reduce((s: number, c: any) => s + (c.nb_jours || 0), 0)
      const alRemaining = Math.max(0, Math.round((alEntitled - alTaken) * 100) / 100)
      const alPayout = Math.round(alRemaining * dailySalary)

      // 5. Unused SL (15 days/year prorata, Mauritius pays unused SL at departure)
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
      const slPayout = Math.round(slRemaining * dailySalary)

      // 6. Prorata 13th month (EOY bonus)
      const treizMois = Math.round((salaireBase / 12) * mWorked)

      // 7. Notice period
      const notice = getNoticePeriod(anciennete.totalMonths)
      // If employer terminates without notice, notice indemnity is due
      const noticePayout = (type_depart === 'licenciement' || type_depart === 'fin_contrat')
        ? notice.months * salaireBase
        : 0

      // 8. Severance allowance (licenciement only): 3 months salary x years of service
      const severance = type_depart === 'licenciement'
        ? Math.round(3 * salaireBase * anciennete.totalYears)
        : 0

      // 9. Transport/petrol allowances prorata
      const transportAllowance = parseFloat(emp.transport_allowance) || 0
      const petrolAllowance = parseFloat(emp.petrol_allowance) || 0
      const allowancesProrata = Math.round(((transportAllowance + petrolAllowance) / lastMonth.totalDaysInMonth) * lastMonth.days)

      // Total
      const total = salaryProrata + alPayout + slPayout + treizMois + noticePayout + severance + allowancesProrata

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
          taux_journalier: Math.round(dailySalary),
          montant: alPayout,
        },
        conges_sl: {
          droit_prorata: slEntitled,
          pris: slTaken,
          restant: slRemaining,
          taux_journalier: Math.round(dailySalary),
          montant: slPayout,
        },
        treizieme_mois: {
          mois_travailles: mWorked,
          montant: treizMois,
        },
        preavis: {
          duree_mois: notice.months,
          description: notice.description,
          montant: noticePayout,
          applicable: type_depart === 'licenciement' || type_depart === 'fin_contrat',
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
        total,
      }

      return NextResponse.json({ breakdown })
    }

    // ═══════════════════════════════════════════════════════
    // ACTION: confirmer_depart — Process departure
    // ═══════════════════════════════════════════════════════
    if (action === 'confirmer_depart') {
      const { employe_id, date_depart, type_depart, raison_depart, breakdown } = body
      if (!employe_id || !date_depart || !type_depart) {
        return NextResponse.json({ error: 'employe_id, date_depart et type_depart requis' }, { status: 400 })
      }

      // Get employee
      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).maybeSingle()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Check access
      const accessibleIds = await getUserSocieteIds(user.id)
      if (!accessibleIds.includes(emp.societe_id)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
      }

      // 1. Update employee record with departure info
      const { error: updateErr } = await supabase
        .from('employes')
        .update({
          date_depart,
          date_depart_type: type_depart,
          raison_depart: raison_depart || null,
        })
        .eq('id', employe_id)

      if (updateErr) throw updateErr

      // 2. Create final settlement bulletin_paie
      const periodeDate = date_depart.slice(0, 7) + '-01' // YYYY-MM-01
      const totalBrut = breakdown?.total || 0

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
        : type_depart === 'fin_contrat' ? 'Fin de contrat'
        : type_depart === 'retraite' ? 'Retraite'
        : 'Décès'

      const { data: bulletin, error: bulletinErr } = await supabase
        .from('bulletins_paie')
        .upsert({
          employe_id,
          societe_id: emp.societe_id,
          periode: periodeDate,
          salaire_base: salaireBaseBulletin,
          transport_allowance: transportBulletin,
          // AL + SL payouts mapped to special_allowance_1
          special_allowance_1: alPayout + slPayout,
          // 13th month in special_allowance_2
          special_allowance_2: treizBulletin,
          // Notice + severance in departure_notice / special_allowance_3
          departure_notice: preavisBulletin,
          special_allowance_3: severanceBulletin,
          salaire_net: totalBrut,
          total_deductions: 0,
          statut: 'valide',
          notes: `Solde de tout compte — ${typeLabel}`,
        }, { onConflict: 'employe_id,periode' })
        .select()
        .single()

      if (bulletinErr) {
        console.error('Erreur création bulletin:', bulletinErr)
        // Non-blocking: continue even if bulletin creation fails
      }

      // 3. Create accounting entries (journal SAL)
      if (bulletin && totalBrut > 0) {
        try {
          // Look up the dossier for this société (required FK on ecritures_comptables)
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
              ? totalBrut - severanceMontant
              : totalBrut

            const entries: any[] = [
              {
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                compte: '641000',
                libelle: `Solde tout compte — ${emp.prenom} ${emp.nom}`,
                debit: salaireSansIndemnite,
                credit: 0,
                numero_piece: pieceRef,
              },
              {
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                compte: '421000',
                libelle: `Solde tout compte — ${emp.prenom} ${emp.nom}`,
                debit: 0,
                credit: totalBrut,
                numero_piece: pieceRef,
              },
            ]

            // Add specific severance entry if applicable
            if (severanceMontant > 0) {
              entries.push({
                dossier_id: dossier.id,
                societe_id: emp.societe_id,
                date_ecriture: date_depart,
                journal: 'SAL',
                compte: '641700',
                libelle: `Indemnité licenciement — ${emp.prenom} ${emp.nom}`,
                debit: severanceMontant,
                credit: 0,
                numero_piece: pieceRef,
              })
            }

            await supabase.from('ecritures_comptables').insert(entries)
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

      return NextResponse.json({
        success: true,
        message: `Départ de ${emp.prenom} ${emp.nom} confirmé au ${date_depart}`,
        bulletin_id: bulletin?.id || null,
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

    return NextResponse.json({ error: 'Action non reconnue. Utilisez calculer_solde, confirmer_depart ou sortie_manuelle.' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
