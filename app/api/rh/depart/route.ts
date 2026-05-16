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

      // Helper d'arrondi : conserve 2 décimales pour tous les montants monétaires
      const r2 = (n: number) => Math.round(n * 100) / 100

      // 2. Ancienneté
      const anciennete = calculateAnciennete(dateArrivee, date_depart)

      // 3. Prorata salary for last month
      const lastMonth = daysWorkedLastMonth(date_depart)
      const salaryProrata = r2((salaireBase / lastMonth.totalDaysInMonth) * lastMonth.days)

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
      const total = r2(salaryProrata + alPayout + slPayout + treizMois + noticePayout + severance + allowancesProrata)

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
      const lignesExtraTotal = lignesExtra.reduce((s, l) => s + (Number(l.montant) || 0), 0)

      // Le total éditable côté UI est la source de vérité — il intègre déjà
      // les éventuels ajustements manuels sur les lignes existantes ET les
      // lignes additionnelles.
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
        : type_depart === 'licenciement_faute' ? 'Licenciement pour faute'
        : type_depart === 'fin_contrat' ? 'Fin de contrat'
        : type_depart === 'retraite' ? 'Retraite'
        : 'Décès'

      // Notes du bulletin : on encode les lignes extra pour traçabilité
      const notesParts = [`Solde de tout compte — ${typeLabel}`]
      if (lignesExtra.length > 0) {
        notesParts.push(
          'Ajustements : ' + lignesExtra
            .map(l => `${l.libelle} ${l.montant >= 0 ? '+' : ''}${l.montant} MUR${l.note ? ` (${l.note})` : ''}`)
            .join(' ; ')
        )
      }
      const bulletinNotes = notesParts.join(' | ')

      // Create or update final settlement bulletin
      const bulletinData = {
        employe_id,
        societe_id: emp.societe_id,
        periode: periodeDate,
        salaire_base: salaireBaseBulletin,
        transport_allowance: transportBulletin,
        // Les ajustements positifs s'ajoutent à treizBulletin, les négatifs
        // se déduisent. Le total_deductions reste à 0 — c'est `salaire_net`
        // qui reflète le total final éditable côté UI.
        special_allowance_1: alPayout + slPayout,
        special_allowance_2: treizBulletin + lignesExtraTotal,
        departure_notice: preavisBulletin,
        special_allowance_3: severanceBulletin,
        salaire_net: totalBrut,
        total_deductions: 0,
        statut: 'valide',
        notes: bulletinNotes,
      }

      let bulletin: any = null
      const { data: existingBul } = await supabase.from('bulletins_paie')
        .select('id').eq('employe_id', employe_id).eq('periode', periodeDate).maybeSingle()

      if (existingBul) {
        const { data: updated, error: upErr } = await supabase.from('bulletins_paie')
          .update(bulletinData).eq('id', existingBul.id).select().single()
        bulletin = updated
        if (upErr) console.error('Erreur update bulletin départ:', upErr.message)
      } else {
        const { data: inserted, error: insErr } = await supabase.from('bulletins_paie')
          .insert(bulletinData).select().single()
        bulletin = inserted
        if (insErr) console.error('Erreur insert bulletin départ:', insErr.message)
      }

      // 3. Create accounting entries (journal SAL)
      if (bulletin && totalBrut > 0) {
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
              ? totalBrut - severanceMontant
              : totalBrut

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
                credit_mur: totalBrut,
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
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
