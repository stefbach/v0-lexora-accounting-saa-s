import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { calculerBulletin, PARAMS_MRA_DEFAUT } from '@/lib/rh/paie'
import { getUserSocieteIds, userHasAccessToSociete, userHasAccessToEmploye } from '@/lib/rh/access'
import { calculateWorkingDays, getWorkingDaysForEmploye, getMauritiusPublicHolidays } from '@/lib/rh/calculateWorkingDays'
import { lastDayOfMonth } from '@/lib/rh/period'
import { calculerPeriodePaie, type PeriodePaieCalculee } from '@/lib/rh/periode-paie'
import { lireMontantOTDuMois } from '@/lib/rh/overtime'
import { fetchPaiementsValidesPourBulletin, marquerPaiementPaye } from '@/lib/rh/cash-in-lieu'
import { fetchGrossessePourAllocationBulletin, marquerAllocationPayee } from '@/lib/rh/protection-maternite'

export const dynamic = 'force-dynamic'

/**
 * Count working days (using the employee's working_days pattern + MU
 * public holidays) in the intersection of a leave range and the current
 * pay period. Crucial for leaves that span a month boundary — Sheetal
 * SEKELY's UL from 2026-02-06 to 2026-03-06 must contribute only its
 * March portion when the March 2026 bulletin is computed.
 *
 * `employe.working_days` is consulted (null → Mon-Fri default).
 */
function countLeaveDaysInPeriod(
  leaveStart: string,
  leaveEnd: string,
  periodeStart: string,
  periodeEnd: string,
  emp: { working_days?: any } | null | undefined,
  joursFeries: Set<string>
): number {
  const start = leaveStart > periodeStart ? leaveStart : periodeStart
  const end = leaveEnd < periodeEnd ? leaveEnd : periodeEnd
  if (start > end) return 0
  return calculateWorkingDays(start, end, {
    workingDays: getWorkingDaysForEmploye(emp),
    joursFeries: joursFeries,
  })
}

// INTÉGRATION 2 — liste les DATES de jours ouvrés entre deux bornes,
// en respectant le pattern working_days de l'employé et les jours
// fériés. Sert au calcul des absences injustifiées : on veut traiter
// chaque jour ouvré (pas chaque pointage), sinon un jour SANS pointage
// du tout n'est jamais compté comme absent.
function listWorkingDaysInPeriod(
  periodeStart: string,
  periodeEnd: string,
  emp: { working_days?: any } | null | undefined,
  joursFeries: Set<string>,
): string[] {
  const dayKeys: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> =
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const wd = getWorkingDaysForEmploye(emp)
  const result: string[] = []
  const [ys, ms, ds] = periodeStart.split('-').map(n => parseInt(n, 10))
  const [ye, me, de] = periodeEnd.split('-').map(n => parseInt(n, 10))
  const cursor = new Date(ys, (ms || 1) - 1, ds || 1, 12, 0, 0)
  const end = new Date(ye, (me || 1) - 1, de || 1, 12, 0, 0)
  while (cursor <= end) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const key = dayKeys[cursor.getDay()]
    if (wd[key] && !joursFeries.has(iso)) result.push(iso)
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Sprint 13 BUG 1 — Prorata premier / dernier mois.
 *
 * Retourne { ratio, joursTravailles, joursOuvrables, motif } pour un employé
 * sur une période donnée :
 *   - Premier mois (date_arrivee dans la période)
 *       joursTravailles = workingDays(date_arrivee → periodeEnd)
 *   - Dernier mois (date_depart dans la période)
 *       joursTravailles = workingDays(periodeStart → date_depart)
 *   - Les DEUX (entrée/sortie même mois, rare)
 *       joursTravailles = workingDays(date_arrivee → date_depart)
 *   - Aucun des deux → ratio = 1 (pas de prorata)
 *
 * joursOuvrables = workingDays(periodeStart → periodeEnd) — dénominateur
 * basé sur les jours ouvrés réels de la société (working_days employé +
 * jours fériés), pas sur une approximation 26 jours.
 *
 * Le ratio est appliqué AU SEUL salaire de base (salaire_base_mur).
 * Les allowances (transport, petrol, phone, primes fixes) restent non
 * prorata-ées par défaut — policy à affiner par société si demandé.
 */
function computeProrataFirstLastMonth(
  emp: { date_arrivee?: string | null; date_depart?: string | null; working_days?: any } | null | undefined,
  periodeStart: string,
  periodeEnd: string,
  joursFeries: Set<string>,
): { ratio: number; joursTravailles: number; joursOuvrables: number; motif: string | null } {
  const dateArrivee = emp?.date_arrivee ? String(emp.date_arrivee).slice(0, 10) : null
  const dateDepart = emp?.date_depart ? String(emp.date_depart).slice(0, 10) : null
  const isFirstMonth = !!(dateArrivee && dateArrivee >= periodeStart && dateArrivee <= periodeEnd)
  const isLastMonth = !!(dateDepart && dateDepart >= periodeStart && dateDepart <= periodeEnd)

  const joursOuvrables = calculateWorkingDays(periodeStart, periodeEnd, {
    workingDays: getWorkingDaysForEmploye(emp),
    joursFeries,
  })

  if (!isFirstMonth && !isLastMonth) {
    return { ratio: 1, joursTravailles: joursOuvrables, joursOuvrables, motif: null }
  }

  const startEffectif = isFirstMonth && dateArrivee ? dateArrivee : periodeStart
  const endEffectif = isLastMonth && dateDepart ? dateDepart : periodeEnd
  const joursTravailles = calculateWorkingDays(startEffectif, endEffectif, {
    workingDays: getWorkingDaysForEmploye(emp),
    joursFeries,
  })

  // Éviter division par zéro si la société n'a aucun jour ouvré pour cet
  // employé (cas limite : working_days tous à false). Retourne ratio=0 +
  // motif explicite plutôt que NaN.
  if (joursOuvrables <= 0) {
    return { ratio: 0, joursTravailles: 0, joursOuvrables: 0, motif: 'aucun_jour_ouvre' }
  }

  const ratio = Math.min(1, Math.max(0, joursTravailles / joursOuvrables))
  const motif = isFirstMonth && isLastMonth
    ? `prorata_entree_sortie_meme_mois (${joursTravailles}/${joursOuvrables}j)`
    : isFirstMonth
      ? `prorata_premier_mois (${joursTravailles}/${joursOuvrables}j depuis ${dateArrivee})`
      : `prorata_dernier_mois (${joursTravailles}/${joursOuvrables}j jusqu'à ${dateDepart})`
  return { ratio, joursTravailles, joursOuvrables, motif }
}

// G9bis.2 — suppression de la liste hardcodée JOURS_FERIES_MU (2025 obsolète).
// La détection férié passe désormais par `joursFeriesSet.has(date)` construit
// depuis la table `jours_feries` (chargement par action paie).
function isWeekend(dateStr: string): boolean { const d = new Date(dateStr + "T12:00:00"); return d.getDay() === 0 || d.getDay() === 6 }

// ═══ OT Calculation — Workers' Rights Act 2019 ═══
// Rates:
//   - Weekday OT (>45h/week): 150% du taux horaire
//   - Rest day / unplanned day: 200% for first 8h, 300% beyond
//   - Public holiday: 200% for first 8h, 300% beyond 8h
// Night shift: +15% of base for night hours (21h-6h) — separate from OT

// Compute night hours (21:00–06:00) for a shift that may cross midnight.
// Iterates minute by minute to handle all cases robustly:
// - 18:00-23:00 -> 2h night (21-23)
// - 05:00-14:00 -> 1h night (5-6)
// - 22:00-07:00 -> 8h night (22-6)
// - 20:00-02:00 -> 5h night (21-24 + 0-2)
function computeNightHours(hEntree: string, hSortie: string): number {
  if (!hEntree || !hSortie) return 0
  const [sh, sm] = hEntree.split(':').map(Number)
  const [eh, em] = hSortie.split(':').map(Number)
  const startMinutes = sh * 60 + sm
  let endMinutes = eh * 60 + em
  if (endMinutes <= startMinutes) endMinutes += 24 * 60 // crosses midnight
  let nightMinutes = 0
  for (let m = startMinutes; m < endMinutes; m++) {
    const hourOfDay = Math.floor(m / 60) % 24
    if (hourOfDay >= 21 || hourOfDay < 6) nightMinutes++
  }
  return nightMinutes / 60
}

function calcOT(hEntree: string, hSortie: string, ferieDay: boolean, planningHours: number = 9, isPlannedWorkDay: boolean = true, isRestDay: boolean = false, pauseMinutes: number = 60) {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0, ot3: 0, heuresNuit: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  // Support shifts crossing midnight: if end <= start, assume next day
  let rawMs = fin.getTime() - debut.getTime()
  if (rawMs <= 0) rawMs += 24 * 3600 * 1000
  let totalH = rawMs / 3600000 - (pauseMinutes / 60) // subtract pause (default 1h lunch)
  if (totalH <= 0) totalH = 0

  // Calculate night hours (21h-6h) using robust minute-by-minute algorithm
  const heuresNuit = computeNightHours(hEntree, hSortie)

  // Public holiday: 200% first 8h, 300% beyond
  if (ferieDay) {
    const ot2 = Math.min(totalH, 8)
    const ot3 = Math.max(totalH - 8, 0)
    return { normales: 0, ot15: 0, ot2, ot3, heuresNuit }
  }
  // Rest day (day off / unplanned): 200% first 8h, 300% beyond
  if (isRestDay || !isPlannedWorkDay) {
    const ot2 = Math.min(totalH, 8)
    const ot3 = Math.max(totalH - 8, 0)
    return { normales: 0, ot15: 0, ot2, ot3, heuresNuit }
  }
  // Normal planned work day: OT at 150% after planningHours
  const normales = Math.min(totalH, planningHours)
  const ot15 = Math.max(totalH - planningHours, 0)
  return { normales, ot15, ot2: 0, ot3: 0, heuresNuit }
}

// ═══ G9bis.4 — Night Shift Allowance WRA S.20 STRICT ══════════════════
// Un shift est "complet nuit" si heure_entree >= 21:00 ET heure_sortie
// <= 05:00 le lendemain (donc session qui démarre au plus tôt à 21h et
// se termine au plus tard à 5h du matin). Une session partiellement
// nocturne ne déclenche PAS la S.20 allowance — elle peut en revanche
// déclencher la disturbance allowance S.17A (G9) si la société l'a
// activée.
//
// Montant = salaire_base × 0.15 × (nb_shifts_nuit_complets /
//                                  nb_jours_travailles_du_mois)
// Sur employé qui fait que des shifts nuit, le ratio ≈ 1 -> allocation
// = 15% du salaire. Sur employé nuit partielle, ratio = 0.
function compterShiftsNuitComplets(
  pointagesMois: Array<{ heure_entree: string | null; heure_sortie: string | null }>,
): number {
  let n = 0
  for (const pt of pointagesMois || []) {
    if (!pt.heure_entree || !pt.heure_sortie) continue
    const entree = String(pt.heure_entree).slice(0, 5)
    const sortie = String(pt.heure_sortie).slice(0, 5)
    // Normalisation : HH:MM string compare fonctionne pour le seuil 21:00.
    if (entree >= '21:00' && sortie <= '05:00') n++
  }
  return n
}

function calculerNightShiftS20(
  salaireBase: number,
  pointagesMois: Array<{ heure_entree: string | null; heure_sortie: string | null }>,
  nbJoursTravailles: number,
  nightShiftPct: number = 0.15,
): { allowance: number; nbShiftsNuit: number } {
  const nbShiftsNuit = compterShiftsNuitComplets(pointagesMois)
  if (nbShiftsNuit === 0 || nbJoursTravailles <= 0) return { allowance: 0, nbShiftsNuit }
  const allowance = Math.round(salaireBase * nightShiftPct * (nbShiftsNuit / nbJoursTravailles))
  return { allowance, nbShiftsNuit }
}

export async function GET(request: Request) {
  // Sprint 5 BUG A — traçabilité étape par étape pour identifier la
  // ligne qui provoque le 500. Les logs apparaissent dans Vercel Functions.
  const step = (label: string, extra?: any) =>
    console.log(`[paie GET] ${label}`, extra !== undefined ? extra : '')
  try {
    step('START')
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    step('step1: auth OK', { userId: user.id })
    const supabase = getAdminClient()

    const { searchParams } = new URL(request.url)
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')
    const societe_id = searchParams.get('societe_id')
    // Pagination — opt-in : seulement actif si ?page=N fourni. Sans ?page,
    // comportement legacy (toutes les lignes, pas de champs pagination).
    const pageParam = searchParams.get('page')
    const limitParam = searchParams.get('limit')
    const paginated = pageParam !== null
    const page = Math.max(1, Number(pageParam) || 1)
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 10))
    step('step2: params', { periode, societe_id, employe_id, paginated, page, limit })

    // Multi-tenant: verify access — wrap in try/catch pour éviter 500 si
    // une table de mapping (profiles/dossiers/user_societes/...) manque.
    // En cas d'exception, on refuse l'accès plutôt que de casser la page.
    if (societe_id) {
      let hasAccess = false
      try {
        hasAccess = await userHasAccessToSociete(user.id, societe_id)
      } catch (e: any) {
        console.error('[paie GET] userHasAccessToSociete exception:', e?.message || e)
        return NextResponse.json({ error: `Erreur contrôle d'accès : ${e?.message || 'inconnue'}` }, { status: 500 })
      }
      step('step3: userHasAccessToSociete', { societe_id, hasAccess })
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
    }
    if (employe_id && !societe_id) {
      let hasAccess = false
      try {
        hasAccess = await userHasAccessToEmploye(user.id, employe_id)
      } catch (e: any) {
        console.error('[paie GET] userHasAccessToEmploye exception:', e?.message || e)
        return NextResponse.json({ error: `Erreur contrôle d'accès : ${e?.message || 'inconnue'}` }, { status: 500 })
      }
      step('step3b: userHasAccessToEmploye', { employe_id, hasAccess })
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
    }
    // If neither societe_id nor employe_id, restrict to accessible societes
    let accessibleIds: string[] = []
    if (!societe_id && !employe_id) {
      try {
        accessibleIds = await getUserSocieteIds(user.id)
      } catch (e: any) {
        console.error('[paie GET] getUserSocieteIds exception:', e?.message || e)
        accessibleIds = []
      }
    }
    step('step4: accessibleIds count', accessibleIds.length)
    if (!societe_id && !employe_id && accessibleIds.length === 0) {
      return NextResponse.json({ bulletins: [], totaux: {}, nb: 0 })
    }

    // Query bulletins (NO FK join — avoids schema cache issues)
    // Pagination opt-in : on demande `count: 'exact'` uniquement si paginé,
    // sinon on évite le surcoût du COUNT() côté Postgres.
    let query = supabase
      .from('bulletins_paie')
      .select('*', paginated ? { count: 'exact' } : undefined)
      .order('periode', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (periode) query = query.gte('periode', `${periode}-01`).lte('periode', lastDayOfMonth(periode!))
    if (societe_id) {
      query = query.eq('societe_id', societe_id)
    } else if (!employe_id && accessibleIds.length > 0) {
      query = query.in('societe_id', accessibleIds)
    }

    if (paginated) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      query = query.range(from, to)
    }

    step('step5: bulletins query starting')
    const { data, error, count } = await query
    if (error) {
      // Sprint 5 BUG A — renvoyer tous les détails Postgres pour debug
      // (code SQL, hint, details) au lieu juste du message tronqué.
      console.error('[paie GET] bulletins_paie query error:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      })
      return NextResponse.json({
        error: `Erreur bulletins_paie: ${error.message}${error.hint ? ` (${error.hint})` : ''}`,
        code: error.code,
        hint: error.hint,
      }, { status: 500 })
    }
    step('step6: bulletins fetched', { count: (data || []).length })

    // Enrich with employee names (separate query)
    // Sprint 5 FIX 4 — lecture defensive : si `code_employe` ou
    // `devise_salaire` manquent (anciens envs sans migration 039/044), on
    // retombe sur une requête minimale. Évite un 500 au chargement de la
    // page /rh/paie juste pour un enrichissement cosmétique.
    const empIds = [...new Set((data || []).map(b => b.employe_id))]
    step('step7: enrich employees starting', { empIds: empIds.length })
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      try {
        const { data: emps, error: empErr } = await supabase.from('employes')
          .select('id, code_employe, nom, prenom, poste, devise_salaire').in('id', empIds)
        if (empErr) {
          console.warn('[paie GET] enrich employes failed (full select):', empErr.message)
          // Fallback minimal
          const { data: empsFb } = await supabase.from('employes')
            .select('id, nom, prenom, poste').in('id', empIds)
          for (const e of empsFb || []) empMap[e.id] = { code: null, nom: e.nom, prenom: e.prenom, poste: e.poste, devise_salaire: 'MUR' }
        } else {
          for (const e of emps || []) empMap[e.id] = { code: e.code_employe, nom: e.nom, prenom: e.prenom, poste: e.poste, devise_salaire: e.devise_salaire }
        }
      } catch (e: any) {
        console.warn('[paie GET] enrich employes exception:', e?.message || e)
      }
    }

    step('step8: enrichment done', { empMapSize: Object.keys(empMap).length })

    // salaire_brut is a GENERATED column in PostgreSQL:
    // = salaire_base + increment + OT + transport + petrol + special_1 + special_2 + special_3 + other + eoy + departure
    // So it's ALWAYS correct as long as its components are correct.
    // We just need to ensure display values make sense.
    const enriched = (data || []).map(b => {
      const salaire_brut = Number(b.salaire_brut) || 0
      const salaire_net = Number(b.salaire_net) || 0
      const salaire_base = Number(b.salaire_base) || 0
      const ot = Number(b.heures_sup_montant) || 0
      const csg_s = Number(b.csg_salarie) || 0
      const nsf_s = Number(b.nsf_salarie) || 0
      const paye_v = Number(b.paye) || 0
      const absence = Number(b.montant_absence) || 0
      const total_deductions = Number(b.total_deductions) || (csg_s + nsf_s + paye_v + absence)

      // Recalculate primes if missing: primes = brut - base - OT - other components
      let primes = Number(b.special_allowance_1) || 0
      if (primes === 0 && salaire_brut > salaire_base + ot) {
        primes = Math.round(salaire_brut - salaire_base - ot
          - (Number(b.transport_allowance) || 0) - (Number(b.petrol_allowance) || 0)
          - (Number(b.increment_salaire) || 0) - (Number(b.special_allowance_2) || 0)
          - (Number(b.special_allowance_3) || 0) - (Number(b.other_refund) || 0)
          - (Number(b.eoy_bonus) || 0) - (Number(b.departure_notice) || 0))
        if (primes < 0) primes = 0
      }

      const csg_p = Number(b.csg_patronal) || 0
      const nsf_p = Number(b.nsf_patronal) || 0
      const levy = Number(b.training_levy) || 0
      const prgf = Number(b.prgf) || 0
      const total_charges = Number(b.total_charges_patronales) || (csg_p + nsf_p + levy + prgf)
      const cout_total = salaire_brut + total_charges

      return {
        ...b,
        special_allowance_1: primes,
        total_deductions,
        total_charges_patronales: total_charges,
        cout_total_employeur: cout_total,
        employe: empMap[b.employe_id] || null,
      }
    })

    step('step9: computing totaux')
    const totaux = {
      masse_salariale_brute: enriched.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0),
      masse_salariale_nette: enriched.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0),
      total_charges_patronales: enriched.reduce((s, b) => s + (Number(b.total_charges_patronales) || 0), 0),
      cout_total_employeur: enriched.reduce((s, b) => s + (Number(b.cout_total_employeur) || 0), 0),
      total_refacture: enriched.reduce((s, b) => s + (Number(b.montant_refacture_mur) || 0), 0),
    }

    console.log(`[paie GET] ${enriched.length} bulletins, periode=${periode}, societe=${societe_id || 'all'}`)

    // Migration 135 — exposer pointage_actif au client pour qu'il puisse
    // afficher le bandeau d'info correspondant. Lecture defensive :
    // si la colonne n'existe pas (mig 135 pas déployée partout) ou si
    // PostgREST a un cache schema obsolète, on log + retourne null
    // au lieu de propager l'erreur (régression /rh/paie 500).
    let pointage_actif: boolean | null = null
    if (societe_id) {
      try {
        const { data: socData, error: socErr } = await supabase
          .from('societes').select('pointage_actif').eq('id', societe_id).maybeSingle()
        if (socErr) {
          console.warn('[paie GET] pointage_actif lookup failed (col missing?):', socErr.message)
        } else {
          pointage_actif = (socData as any)?.pointage_actif === true
        }
      } catch (e: any) {
        console.warn('[paie GET] pointage_actif exception:', e?.message || e)
      }
    }

    step('step10: DONE', { bulletins: enriched.length, pointage_actif })
    // Pagination : si ?page fourni, on enrichit la réponse avec les champs
    // {data, total, page, limit, totalPages}. Sans ?page, on garde la forme
    // legacy pour ne pas casser les callers existants (UI /rh/paie, PDF).
    if (paginated) {
      const total = count ?? enriched.length
      const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1
      return NextResponse.json({
        data: enriched,
        total,
        page,
        limit,
        totalPages,
        bulletins: enriched,
        totaux,
        nb: enriched.length,
        pointage_actif,
      })
    }
    return NextResponse.json({ bulletins: enriched, totaux, nb: enriched.length, pointage_actif })
  } catch (e: any) {
    // Sprint 5 BUG A — logger la stack complète + le nom de l'erreur pour
    // identifier la ligne qui throw. Renvoyer aussi stack dans la réponse
    // (dev only) pour aider au debug depuis les devtools.
    console.error('[paie GET] EXCEPTION caught', {
      name: e?.name,
      message: e?.message,
      code: e?.code,
      hint: e?.hint,
      details: e?.details,
      stack: e?.stack?.split('\n').slice(0, 5).join(' | '),
    })
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur',
      code: e?.code,
      hint: e?.hint,
      details: e?.details,
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()

    const body = await request.json()
    const { action, employe_id, societe_id, periode } = body

    // Récupérer paramètres MRA
    const { data: paramsDB } = await supabase.from('parametres_paie_mra').select('*').order('annee', { ascending: false }).limit(1).maybeSingle()
    const params = paramsDB ? {
      csg_seuil_taux_reduit: Number(paramsDB.csg_seuil_taux_reduit),
      csg_salarie_taux_reduit: Number(paramsDB.csg_salarie_taux_reduit),
      csg_salarie_taux_plein: Number(paramsDB.csg_salarie_taux_plein),
      csg_patronal: Number(paramsDB.csg_patronal),
      csg_patronal_taux_reduit: Number(paramsDB.csg_patronal_taux_reduit ?? 0.030),
      nsf_salarie: Number(paramsDB.nsf_salarie),
      nsf_patronal: Number(paramsDB.nsf_patronal),
      // F9 — Plafond insurable NSF (28 600 MUR en 2025-2026, mig 159).
      nsf_plafond_mensuel: Number(paramsDB.nsf_plafond_mensuel ?? 28600),
      training_levy: Number(paramsDB.training_levy),
      prgf_patronal_par_jour: Number(paramsDB.prgf_patronal_par_jour ?? 4.50),
      prgf_taux_emoluments: Number(paramsDB.prgf_taux_emoluments ?? 0.045),
      paye_seuil_exoneration: Number(paramsDB.paye_seuil_exoneration ?? 500000),
      paye_taux_1: Number(paramsDB.paye_taux_1 ?? 0.10),
      paye_seuil_taux_2: Number(paramsDB.paye_seuil_taux_2 ?? 1000000),
      paye_taux_2: Number(paramsDB.paye_taux_2 ?? 0.20),
      // Sprint 2 — night shift majoration paramétrable (defaut 15%).
      // PE1 BUG 2 — normalisation défensive : si la valeur stockée est
      // > 1, on suppose qu'elle est en pourcentage (15) au lieu du
      // décimal attendu (0.15) et on divise par 100.
      night_shift_pct: (() => {
        const raw = Number(paramsDB.night_shift_pct ?? 0.15)
        return raw > 1 ? raw / 100 : raw
      })(),
      // POLICY Lexora — compensation 635 MUR considérée incluse dans le
      // salaire. Forcé à 0 peu importe la valeur DB (paramsDB legacy).
      salary_compensation: 0,
      salary_compensation_seuil: Number(paramsDB.salary_compensation_seuil ?? 50000),
    } : PARAMS_MRA_DEFAUT

    const periodeDate = periode ? `${periode}-01` : `${new Date().toISOString().slice(0, 7)}-01`
    const periodeStr = periodeDate.slice(0, 7)

    // ══════════════════════════════════════════════════════
    // ACTION : calculer (employé unique)
    // ══════════════════════════════════════════════════════
    if (action === 'calculer') {
      // Multi-tenant: verify access to the target société
      const targetSocieteId = societe_id || null
      if (targetSocieteId) {
        const hasAccess = await userHasAccessToSociete(user.id, targetSocieteId)
        if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      } else if (employe_id) {
        const hasAccess = await userHasAccessToEmploye(user.id, employe_id)
        if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
      }

      const { data: emp } = await supabase.from('employes').select('*').eq('id', employe_id).single()
      if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Migration 135 — toggle pointage_actif par société. Si OFF (défaut),
      // pas de déduction auto des absences depuis pointages : comportement
      // legacy préservé (les absences viennent de body.absences ou 0).
      let pointageActifSingle = false
      {
        const sid = targetSocieteId || emp.societe_id
        if (sid) {
          // Hotfix régression — defensive : si la colonne n'existe pas
          // (mig 135 incomplète) on retombe sur false (legacy).
          try {
            const { data: soc, error: socErr } = await supabase
              .from('societes').select('pointage_actif').eq('id', sid).maybeSingle()
            if (socErr) console.warn('[paie calculer] pointage_actif lookup failed:', socErr.message)
            else pointageActifSingle = (soc as any)?.pointage_actif === true
          } catch (e: any) {
            console.warn('[paie calculer] pointage_actif exception:', e?.message || e)
          }
        }
      }

      // PE1 — période paie paramétrable. En mode 'calendaire' (défaut),
      // periodeStartSingle/periodeEndSingle = 1er/dernier du mois de
      // `periodeStr`. En mode 'cut_off_jour', ce sera par ex. 25/03 → 24/04.
      const sidForPeriode = targetSocieteId || emp.societe_id
      const periodeInfo: PeriodePaieCalculee = await calculerPeriodePaie(
        supabase, sidForPeriode, `${periodeStr}-01`,
      )
      const periodeStartSingle = periodeInfo.periode_debut
      const periodeEndSingle = periodeInfo.periode_fin

      // G9bis.2 — charger les jours fériés de la période (override société
      // OR global) pour la détection au calcul OT. Remplace la liste
      // hardcodée JOURS_FERIES_MU. Réutilisé plus bas pour les
      // working-days math.
      const periodeYearSingle = parseInt(periodeStr.slice(0, 4), 10)
      let joursFeriesSetSingle = new Set<string>()
      {
        const sidForFeries = targetSocieteId || emp.societe_id
        const { data: feriesRowsSingle } = await supabase
          .from('jours_feries')
          .select('date, travail_autorise, societe_id')
          .gte('date', `${periodeYearSingle}-01-01`)
          .lte('date', `${periodeYearSingle}-12-31`)
        joursFeriesSetSingle = new Set(
          (feriesRowsSingle || [])
            .filter((r: any) => !r.travail_autorise)
            .filter((r: any) => r.societe_id === null || r.societe_id === sidForFeries)
            .map((r: any) => String(r.date).slice(0, 10)),
        )
        if (joursFeriesSetSingle.size === 0) {
          joursFeriesSetSingle = getMauritiusPublicHolidays(periodeYearSingle)
        }
      }

      // 1. Récupérer OT de la période depuis les pointages
      const { data: pointagesMois } = await supabase.from('pointages')
        .select('*').eq('employe_id', employe_id)
        .gte('date_pointage', periodeStartSingle)
        .lte('date_pointage', periodeEndSingle)

      // Bug 4 fix: fetch planning assignments for this employee+period to determine planned hours
      const { data: planAssignments } = await supabase.from('planning_assignments')
        .select('date, shift_code, heures_prevues, est_repos')
        .eq('employe_id', employe_id)
        .gte('date', periodeStartSingle)
        .lte('date', periodeEndSingle)
      const planMap: Record<string, { heures_prevues: number; est_repos: boolean }> = {}
      for (const pa of planAssignments || []) {
        planMap[pa.date] = { heures_prevues: Number(pa.heures_prevues) || 8, est_repos: pa.est_repos }
      }

      let total_ot_montant = 0
      let total_heures_nuit_single = 0
      const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
      let jours_travailles = 0

      for (const pt of pointagesMois || []) {
        if (!pt.heure_entree) continue
        jours_travailles++
        // G9bis.2 — détection férié via Set depuis DB.
        const ferie = joursFeriesSetSingle.has(pt.date_pointage)
        const plan = planMap[pt.date_pointage]
        // If planning exists, use planned hours as OT threshold; default to 9 (standard)
        const planningHours = plan ? plan.heures_prevues : 9
        // Work day is "planned" if planning says it's a work day (not repos)
        // If no planning exists, fall back to weekday=planned, weekend=unplanned
        const isPlannedWorkDay = plan ? !plan.est_repos : !isWeekend(pt.date_pointage)
        // G9bis.3 — rest day détecté (plan.est_repos OR weekend sans planning).
        const isRestDaySingle = plan ? Boolean(plan.est_repos) : isWeekend(pt.date_pointage)
        // Compute actual pause from pointage (fallback to 60 min = 1h lunch)
        let pauseMinutes = 60
        if (pt.heure_pause_debut && pt.heure_pause_fin) {
          const [psh, psm] = pt.heure_pause_debut.split(':').map(Number)
          const [peh, pem] = pt.heure_pause_fin.split(':').map(Number)
          pauseMinutes = (peh * 60 + pem) - (psh * 60 + psm)
          if (pauseMinutes < 0) pauseMinutes = 60
        }
        // G9bis.3 — passe isRestDaySingle (était forcé à false) + additionne
        // ot3 × 3 qui était calculé par calcOT mais jamais consommé dans
        // le path single. Comportement aligné sur le path batch.
        const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie, planningHours, isPlannedWorkDay, isRestDaySingle, pauseMinutes)
        const montant15 = ot.ot15 * taux_horaire * 1.5
        const montant2 = ot.ot2 * taux_horaire * 2
        const montant3 = ot.ot3 * taux_horaire * 3
        total_ot_montant += montant15 + montant2 + montant3
        total_heures_nuit_single += ot.heuresNuit || 0
      }

      // Bug 6 — Override depuis heures_travaillees si saisie manuelle
      // existante (cas DDS sans pointeuse + cas OCC où la saisie OT
      // explicite remplace le calcul automatique). La saisie manuelle
      // est l'expression d'une décision RH explicite et prime sur le
      // calcul auto depuis pointages. Le night shift S.20 (ajouté plus
      // bas) reste cumulé — c'est une allowance distincte de l'OT.
      {
        const otFromHeuresTravaillees = await lireMontantOTDuMois(
          supabase, emp.id, periodeStartSingle, periodeEndSingle,
        )
        if (otFromHeuresTravaillees > 0) {
          console.log(
            `[paie/recalcul] OT-override employe=${emp.id} nom=${emp.nom} ` +
            `montant=${otFromHeuresTravaillees} (source=heures_travaillees, ignore pointages)`,
          )
          total_ot_montant = otFromHeuresTravaillees
        }
      }

      // G9bis.4 — Night Shift Allowance WRA S.20 STRICT (harmonisé avec
      // le batch). Compte les shifts complets 21h→05h du mois et calcule
      // l'allocation = salaire_base × 15% × (shifts_nuit / jours_travailles).
      const nightShiftPctSingle = Number((params as any).night_shift_pct ?? 0.15)
      const nightShiftResSingle = calculerNightShiftS20(
        Number(emp.salaire_base) || 0,
        (pointagesMois || []).map(pt => ({
          heure_entree: pt.heure_entree,
          heure_sortie: pt.heure_sortie,
        })),
        jours_travailles,
        nightShiftPctSingle,
      )
      total_ot_montant += nightShiftResSingle.allowance

      // INTÉGRATION 4 — Primes de la période : on ne compte QUE celles
      // qui sont approuvées (approuve=true) ET pas encore intégrées
      // à un bulletin (integre_paie=false). Ancienne version incluait
      // les primes en attente de validation (sur-paie) et pouvait
      // double-compter entre deux runs du calcul.
      let primesMois: any[] = []
      {
        const { data, error } = await supabase.from('primes_variables_mois')
          .select('*')
          .eq('employe_id', employe_id)
          .eq('periode', periodeDate)
          .eq('approuve', true)
          .eq('integre_paie', false)
        if (error) {
          // Fallback si la colonne integre_paie n'a pas encore été
          // backfillée en env hors-prod : on retire le filtre et on se
          // contente de approuve=true (risque de double-compter, mais
          // moins pire que de ne rien compter).
          console.warn('[paie calculer] primes fetch with integre_paie filter failed — fallback:', error.message)
          const retry = await supabase.from('primes_variables_mois')
            .select('*').eq('employe_id', employe_id).eq('periode', periodeDate).eq('approuve', true)
          primesMois = retry.data || []
        } else {
          primesMois = data || []
        }
      }
      const total_primes = primesMois.reduce((s, p) => s + Number(p.montant || 0), 0)

      // Sprint 11 BUG 7 — intégrer les frais kilométriques approuvés (mig 037).
      // On somme les montants (colonne GENERATED km_parcourus*tarif_applique)
      // pour la période et on les ajoute à other_refund.
      // Si la table est absente en dev, best-effort (0).
      let total_frais_km_single = 0
      try {
        const { data: fraisKm } = await supabase.from('frais_km_mois')
          .select('montant').eq('employe_id', employe_id)
          .eq('periode', periodeDate).eq('approuve', true)
        total_frais_km_single = (fraisKm || []).reduce(
          (s: number, f: any) => s + (Number(f.montant) || 0), 0
        )
      } catch (e: any) {
        console.warn('[paie calculer] frais_km fetch failed (table absente ?):', e?.message || e)
      }

      // 3. Congés approuvés qui CHEVAUCHENT le mois (cf. fix de calculer_batch).
      // periodeStartSingle/periodeEndSingle définis plus haut (PE1).
      const { data: congesApprouves } = await supabase.from('demandes_conges')
        .select('*').eq('employe_id', employe_id).eq('statut', 'approuve')
        .lte('date_debut', periodeEndSingle).gte('date_fin', periodeStartSingle)

      // G9bis.2 — joursFeriesSetSingle déjà chargé plus haut (avant OT loop).

      // Leave-type counters intersected with this month — used below for
      // UL deduction AND for the conges_details object returned with the
      // response (Commit 11).
      let joursAlEmploye = 0
      let joursAlImpose = 0
      let joursSickLeaveSingle = 0
      let joursUnpaidLeaveSingle = 0
      for (const c of congesApprouves || []) {
        const n = countLeaveDaysInPeriod(
          c.date_debut, c.date_fin, periodeStartSingle, periodeEndSingle,
          emp, joursFeriesSetSingle
        )
        if (n <= 0) continue
        // INTÉGRATION 3 — normalisation defensive trim + upper (idem batch).
        const tc = String(c.type_conge || '').trim().toUpperCase()
        if (tc === 'AL') {
          if (c.impose_par_societe === true) joursAlImpose += n
          else joursAlEmploye += n
        } else if (tc === 'SL') {
          joursSickLeaveSingle += n
        } else if (tc === 'UL') {
          joursUnpaidLeaveSingle += n
        }
      }
      if (joursUnpaidLeaveSingle > 0) {
        console.log(`[paie] UL detected (single) — ${emp.prenom} ${emp.nom} ${periodeStr}: ${joursUnpaidLeaveSingle}j`)
      }

      // INTÉGRATION 2 + Migration 135 — Absences injustifiées par JOUR
      // OUVRÉ. UNIQUEMENT si la société a pointage_actif=true (toggle
      // dans /rh/societe). Sinon : comportement legacy, jours_absence=0
      // sauf si l'opérateur a saisi body.absences ou body.jours_absence.
      const anomaliesPointage: string[] = []
      let jours_absence_injust = 0
      if (pointageActifSingle) {
        const pointageByDate = new Map<string, any>()
        for (const pt of pointagesMois || []) {
          pointageByDate.set(pt.date_pointage, pt)
        }
        const workingDaysList = listWorkingDaysInPeriod(
          periodeStartSingle, periodeEndSingle, emp, joursFeriesSetSingle,
        )
        // F2 — date de référence "aujourd'hui" en ISO. Les jours du mois
        // qui sont dans le futur ne sont NI absents NI présents : ils
        // n'existent pas encore. Les exclure du compteur d'absences.
        // Mois passé : today > fin de mois → aucune exclusion (tous comptent).
        // Mois futur : today < début de mois → tous exclus (jours_absence=0).
        const today = new Date().toISOString().slice(0, 10)
        for (const day of workingDaysList) {
          const pt = pointageByDate.get(day)
          // G-leaves-fix (debug+fix) : normaliser les bornes du congé
          //   en "YYYY-MM-DD". Supabase-js peut renvoyer les colonnes
          //   DATE en Date object OU string ISO complète selon la
          //   version — la comparaison lexicographique échouait.
          const enConge = (congesApprouves || []).some((c: any) => {
            const debut = String(c.date_debut ?? '').slice(0, 10)
            const fin = String(c.date_fin ?? '').slice(0, 10)
            return debut && fin && day >= debut && day <= fin
          })
          // G-leaves-fix : si le jour est couvert par un congé approuvé,
          //   on le traite TOUJOURS comme congé (AL/SL/UL) — jamais
          //   comme absence, peu importe la date courante. Le check
          //   enConge doit PRÉCÉDER le skip "jour futur".
          if (enConge) {
            if (pt?.heure_entree) {
              anomaliesPointage.push(`Pointage enregistré le ${day} alors que l'employé était en congé (le congé prévaut)`)
            }
            continue
          }
          // F2 : skip les jours dans le futur (sans congé approuvé)
          if (day > today) continue
          if (!pt || (!pt.heure_entree && pt.absent_justifie !== true)) {
            jours_absence_injust++
            anomaliesPointage.push(`Absence non justifiée le ${day}`)
          } else if (pt.heure_entree && !pt.heure_sortie) {
            anomaliesPointage.push(`Oubli de pointage sortie le ${day}`)
          }
        }
      } else {
        // Toggle OFF — saisie manuelle uniquement
        jours_absence_injust = Number(body.absences || body.jours_absence || 0) || 0
      }
      const montant_absence = Math.round(jours_absence_injust * (Number(emp.salaire_base) / 26) * 100) / 100

      // 4. Conversion EUR si applicable
      let salaire_base_mur = Number(emp.salaire_base)
      if (emp.devise_salaire === 'EUR') {
        const taux = Number(emp.taux_change_eur) || 46.50
        salaire_base_mur = Math.round(salaire_base_mur * taux)
      }

      // Sprint 13 BUG 1 — Prorata premier/dernier mois (WRA 2019).
      // Un employé arrivé le 17 avril doit toucher salaire × jours_travaillés
      // / jours_ouvrables du mois. Même logique symétrique pour le départ.
      // Le prorata s'applique uniquement au salaire_base — les allowances
      // (transport, petrol, phone, primes fixes) restent en montant plein
      // par défaut (policy company à affiner si demandé).
      const prorataSingle = computeProrataFirstLastMonth(
        emp, periodeStartSingle, periodeEndSingle, joursFeriesSetSingle,
      )
      if (prorataSingle.ratio < 1) {
        const originalBase = salaire_base_mur
        salaire_base_mur = Math.round(salaire_base_mur * prorataSingle.ratio * 100) / 100
        console.log(`[paie calculer] PRORATA ${emp.prenom} ${emp.nom} — ${prorataSingle.motif}, base ${originalBase} → ${salaire_base_mur}`)
      }

      // Sprint 10 BUG 4 — inclure les primes fixes récurrentes (mig 117)
      // stockées sur employes.prime_fixe_1/2/3. Avant : action `calculer`
      // (unitaire) ne les lisait PAS alors que `calculer_batch` oui →
      // incohérence entre les deux paths + CSG sous-évaluée (calculée sur
      // salaire_brut_base incomplet, restait sous le seuil 50K donc taux
      // réduit 1.5% au lieu de 3%). Les primes fixes sont des allocations
      // mensuelles stables (prime fonction, ancienneté, électricité, etc.)
      // qui s'ajoutent au brut TOUS LES MOIS.
      //
      // Sprint — distribution explicite des allowances dans les colonnes
      // bulletin (toutes imposables, cf. note MRA plus bas) :
      //   special_allowance_1 = primes variables du mois + prime_fixe_1
      //   special_allowance_2 = phone_allowance        + prime_fixe_2
      //   special_allowance_3 = daily_bus_fare × 26    + prime_fixe_3
      // Le brut bulletin (GENERATED column, mig 016) somme tous ces éléments
      // → CSG/NSF/PAYE et exports MRA intègrent naturellement le tout.
      const phoneAllowance = Number(emp.phone_allowance) || 0
      // daily_bus_fare est un tarif par jour ouvré → × 26 pour l'estimation
      // mensuelle fixe (nb jours ouvrés standard Maurice, cohérent avec le
      // taux horaire WRA salaire_base / (45h × 52 / 12) ≈ base/195 par heure).
      const busAllowanceMensuel = Math.round((Number(emp.daily_bus_fare) || 0) * 26 * 100) / 100
      const pf1 = Number(emp.prime_fixe_1) || 0
      const pf2 = Number(emp.prime_fixe_2) || 0
      const pf3 = Number(emp.prime_fixe_3) || 0

      // G9 — Disturbance Allowance (S.17A FMPA 2024).
      // Si la société active cette option, on calcule en amont le montant
      // mensuel + on le sauvegarde dans elements.disturbance_allowance (qui
      // rejoindra ensuite salaire_brut_base -> CSG/NSF/PAYE).
      let disturbanceMontantSingle = 0
      let disturbanceHeuresSingle = 0
      let disturbanceRecapSingle: any = null
      try {
        const { data: socDist } = await supabase
          .from('societes')
          .select('disturbance_allowance_active, disturbance_hourly_multiplier')
          .eq('id', targetSocieteId || emp.societe_id)
          .maybeSingle()
        if ((socDist as any)?.disturbance_allowance_active === true) {
          const { calculerDisturbanceEmploye } = await import('@/lib/rh/disturbance-allowance')
          disturbanceRecapSingle = await calculerDisturbanceEmploye(
            supabase, employe_id, periodeStartSingle, periodeEndSingle,
            {
              multiplier: Number((socDist as any).disturbance_hourly_multiplier) || 1.0,
              salaireBase: Number(emp.salaire_base) || 0,
            },
          )
          disturbanceMontantSingle = disturbanceRecapSingle.montant_total
          disturbanceHeuresSingle = disturbanceRecapSingle.heures_total
        }
      } catch (e: any) {
        console.warn('[paie calculer] disturbance allowance skip:', e?.message || e)
      }

      const elements = {
        salaire_base: salaire_base_mur,
        transport_allowance: Number(emp.transport_allowance) || 0,
        petrol_allowance: Number(emp.petrol_allowance) || 0,
        increment_salaire: body.increment_salaire || 0,
        heures_sup_montant: Math.round(total_ot_montant) + (body.heures_sup_montant || 0),
        // special_allowance_1 = primes variables du mois + prime_fixe_1 + surcharge body
        special_allowance_1: total_primes + pf1 + (body.special_allowance_1 || 0),
        // special_allowance_2 = phone_allowance + prime_fixe_2 + surcharge body
        special_allowance_2: phoneAllowance + pf2 + (body.special_allowance_2 || 0),
        // special_allowance_3 = bus mensuel (daily × 26) + prime_fixe_3 + surcharge body
        special_allowance_3: busAllowanceMensuel + pf3 + (body.special_allowance_3 || 0),
        // Sprint 11 BUG 7 — frais km approuvés inclus dans other_refund
        other_refund: (body.other_refund || 0) + total_frais_km_single,
        eoy_bonus: body.eoy_bonus || 0,
        departure_notice: body.departure_notice || 0,
        // G9 — disturbance allowance (0 si société n'active pas).
        disturbance_allowance: disturbanceMontantSingle,
      }

      const joursTravailles = jours_travailles > 0 ? jours_travailles : (body.jours_travailles || 26)

      // F10 — Pré-calcul du salaire_brut_base (hors EOY bonus) pour pouvoir
      // calculer l'UL AVANT calculerBulletin. CSG/NSF/PAYE seront ensuite
      // calculés sur salaire_imposable = brut_base - total_absence.
      const salaireBrutBaseSingle =
        Number(elements.salaire_base)
        + (Number(elements.transport_allowance) || 0)
        + (Number(elements.petrol_allowance) || 0)
        + (Number(elements.heures_sup_montant) || 0)
        + (Number(elements.special_allowance_1) || 0)
        + (Number(elements.special_allowance_2) || 0)
        + (Number(elements.special_allowance_3) || 0)
        + (Number(elements.increment_salaire) || 0)
        // G9 — disturbance assimilé à du salary normal : il entre dans
        // la base brut utilisée pour calculer UL et proratas.
        + (Number(elements.disturbance_allowance) || 0)
        + (Number(elements.other_refund) || 0)
        + (Number(elements.departure_notice) || 0)

      // UL deduction: days in-period × salaire_brut_base / nb_jours_ouvres_mois.
      let montant_ul_single = 0
      if (joursUnpaidLeaveSingle > 0) {
        const nbJoursOuvresMoisSingle = calculateWorkingDays(periodeStartSingle, periodeEndSingle, {
          workingDays: getWorkingDaysForEmploye(emp),
          joursFeries: joursFeriesSetSingle,
        })
        if (nbJoursOuvresMoisSingle > 0 && salaireBrutBaseSingle > 0) {
          montant_ul_single = Math.round(joursUnpaidLeaveSingle * (salaireBrutBaseSingle / nbJoursOuvresMoisSingle) * 100) / 100
          console.log(`[paie] UL OK (single) ${emp.prenom} ${emp.nom} — ${joursUnpaidLeaveSingle}j × (${salaireBrutBaseSingle} / ${nbJoursOuvresMoisSingle}) = ${montant_ul_single} MUR`)
        } else {
          console.warn(`[paie] UL SKIP zero-guard (single) — ${emp.prenom} ${emp.nom} joursOuvres=${nbJoursOuvresMoisSingle} salaireBrut=${salaireBrutBaseSingle}`)
        }
      }

      // POLICY Lexora — cumul absences + UL plafonné au salaire_brut_base.
      const totalAbsenceRaw = montant_absence + montant_ul_single
      const totalDeductionAbsence = Math.min(totalAbsenceRaw, salaireBrutBaseSingle)

      // F6 — Split UL / injustifiées pour stockage séparé. Si le cap
      // plafond a été touché (raw > brut), on prorate les 2 montants
      // proportionnellement pour que leur somme = totalDeductionAbsence.
      let montantInjustFinal = montant_absence
      let montantUlFinal = montant_ul_single
      if (totalAbsenceRaw > salaireBrutBaseSingle && totalAbsenceRaw > 0) {
        const scale = salaireBrutBaseSingle / totalAbsenceRaw
        montantInjustFinal = Math.round(montant_absence * scale * 100) / 100
        montantUlFinal = Math.round(montant_ul_single * scale * 100) / 100
      }

      // G1 — Cash-in-lieu (WRA S.45/S.47) : injecter les paiements compensation
      // valides pour cette periode_bulletin. Le montant s'ajoute au brut et a
      // la base CSG/NSF/PAYE (assimile a du salary normal).
      const periodeBulletinSingle = periodeDate.slice(0, 10)
      const cilPaiementsSingle = await fetchPaiementsValidesPourBulletin(supabase, employe_id, periodeBulletinSingle)
      const cilMontantSingle = cilPaiementsSingle.reduce((s, p) => s + Number(p.montant_total || 0), 0)
      const cilJoursSingle = cilPaiementsSingle.reduce((s, p) => s + Number(p.jours_payes_compensation || 0), 0)
      const cilTypesSingle = new Set(cilPaiementsSingle.map(p => p.type_conge))
      const cilTypeSingle: 'AL' | 'VL' | 'mixte' | null = cilTypesSingle.size === 0
        ? null
        : cilTypesSingle.size > 1 ? 'mixte' : (Array.from(cilTypesSingle)[0] as 'AL' | 'VL')

      // G7 — Allocation naissance 3 000 MUR (WRA S.52). Forfait social
      // NON soumis a CSG/NSF/PAYE : on NE l'ajoute PAS a calculerBulletin,
      // on l'ecrit directement sur le bulletin en colonne dediee.
      const allocNaissanceSingle = await fetchGrossessePourAllocationBulletin(
        supabase, employe_id, periodeBulletinSingle.slice(0, 7),
      )
      const allocMontantSingle = allocNaissanceSingle?.montant || 0

      // F10 + G1 — calculerBulletin recoit totalDeductionAbsence ET cilMontant.
      const resultat = calculerBulletin(
        elements,
        params as any,
        joursTravailles,
        Number(emp.pct_refacturation) || 0,
        undefined,
        undefined,
        totalDeductionAbsence,
        cilMontantSingle,
      )

      // G7 — Allocation naissance s'ajoute au net (non-imposable, hors cotisations).
      const salaire_net_final = Math.max(
        0,
        Math.round((resultat.salaire_net - totalDeductionAbsence + allocMontantSingle) * 100) / 100,
      )

      const bulletin: Record<string, any> = {
        employe_id, societe_id: societe_id || emp.societe_id,
        periode: periodeDate,
        salaire_base: elements.salaire_base,
        // salaire_brut is GENERATED ALWAYS — do NOT include
        salaire_net: salaire_net_final,
        csg_salarie: resultat.csg_salarie,
        csg_patronal: resultat.csg_patronal,
        nsf_salarie: resultat.nsf_salarie,
        nsf_patronal: resultat.nsf_patronal,
        paye: resultat.paye,
        training_levy: resultat.training_levy,
        prgf: resultat.prgf,
        total_deductions: Math.round((resultat.total_deductions + totalDeductionAbsence) * 100) / 100,
        total_charges_patronales: resultat.total_charges_patronales,
        heures_sup_montant: elements.heures_sup_montant || 0,
        special_allowance_1: elements.special_allowance_1 || 0,
        special_allowance_2: elements.special_allowance_2 || 0,
        special_allowance_3: elements.special_allowance_3 || 0,
        transport_allowance: elements.transport_allowance || 0,
        petrol_allowance: elements.petrol_allowance || 0,
        other_refund: elements.other_refund || 0,
        // F6 — Colonnes séparées :
        //   montant_absence / jours_absence = absences INJUSTIFIÉES uniquement
        //   montant_ul / jours_ul           = Unpaid Leave approuvés uniquement
        // CSG/NSF/PAYE basés sur la SOMME des deux (cf. totalDeductionAbsence).
        montant_absence: Math.round(montantInjustFinal * 100) / 100,
        jours_absence: jours_absence_injust || 0,
        montant_ul: Math.round(montantUlFinal * 100) / 100,
        jours_ul: joursUnpaidLeaveSingle || 0,
        // G1 — Cash-in-lieu (WRA S.45/S.47)
        montant_cash_in_lieu: Math.round(cilMontantSingle * 100) / 100,
        jours_cash_in_lieu: cilJoursSingle,
        cash_in_lieu_type: cilTypeSingle,
        // G7 — Allocation naissance 3 000 MUR (WRA S.52, forfait non-imposable)
        allocation_naissance: Math.round(allocMontantSingle * 100) / 100,
        // G9 — Disturbance Allowance S.17A FMPA 2024 (heures unsocial).
        disturbance_allowance: Math.round(disturbanceMontantSingle * 100) / 100,
        disturbance_heures: Math.round(disturbanceHeuresSingle * 100) / 100,
        // Sprint 13 BUG 1 — trace prorata dans les notes pour l'UI
        notes: prorataSingle.ratio < 1 ? `[${prorataSingle.motif}]` : null,
        statut: 'brouillon',
      }

      // F14 — force updated_at pour que le recalcul soit visible cote UI.
      const bulletinAvecTs = { ...bulletin, updated_at: new Date().toISOString() }
      const { data, error } = await supabase.from('bulletins_paie').upsert(bulletinAvecTs, { onConflict: 'employe_id,periode' }).select().single()
      if (error) {
        console.error('[paie calculer]', error.message, error.details, error.hint)
        return NextResponse.json({ error: `Erreur bulletin: ${error.message}`, details: error.details, hint: error.hint }, { status: 500 })
      }

      // G9 — Sauvegarde des détails disturbance (si présents) liés au bulletin.
      if (data?.id && disturbanceRecapSingle && disturbanceRecapSingle.details.length > 0) {
        try {
          const { sauvegarderDisturbanceBulletin } = await import('@/lib/rh/disturbance-allowance')
          await sauvegarderDisturbanceBulletin(supabase, data.id, employe_id, disturbanceRecapSingle)
        } catch (e: any) {
          console.warn('[paie calculer] sauvegarde disturbance détail skip:', e?.message || e)
        }
      }

      // G1 — Marquer les paiements compensation comme 'paye' avec bulletin_paie_id.
      if (data?.id && cilPaiementsSingle.length > 0) {
        for (const pcc of cilPaiementsSingle) {
          await marquerPaiementPaye(supabase, pcc.id, data.id)
        }
      }

      // G7 — Marquer l'allocation naissance payee avec reference bulletin.
      if (data?.id && allocNaissanceSingle) {
        await marquerAllocationPayee(supabase, allocNaissanceSingle.id, data.id)
      }

      // Marquer les primes comme intégrées (colonne integre_paie + date_integration ajoutées en migration 028)
      if (primesMois && primesMois.length > 0) {
        await supabase.from('primes_variables_mois')
          .update({ integre_paie: true, date_integration: new Date().toISOString() })
          .in('id', primesMois.map(p => p.id))
      }

      return NextResponse.json({
        bulletin: data,
        simulation: {
          ...resultat,
          total_ot_montant,
          total_primes,
          montant_absence,
          montant_ul: montant_ul_single,
          jours_ul: joursUnpaidLeaveSingle,
          jours_travailles,
        },
        // Commit 11 — bulletin leave breakdown for the UI and PDF.
        conges_details: {
          al_jours: Math.round((joursAlEmploye + joursAlImpose) * 100) / 100,
          al_impose_jours: Math.round(joursAlImpose * 100) / 100,
          al_employe_jours: Math.round(joursAlEmploye * 100) / 100,
          sl_jours: Math.round(joursSickLeaveSingle * 100) / 100,
          ul_jours: Math.round(joursUnpaidLeaveSingle * 100) / 100,
          ul_deduction_mur: montant_ul_single,
          anomalies_pointage: anomaliesPointage,
        },
      })
    }

    // ══════════════════════════════════════════════════════
    // ACTION : calculer_batch (tous les employés de la société)
    // ══════════════════════════════════════════════════════
    if (action === 'calculer_batch') {
      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis pour calculer_batch', bulletins: [], nb: 0 }, { status: 400 })
      }

      // F14 — audit trail : start timer + track counters
      const auditStart = Date.now()
      const auditRaisonsSkip: Record<string, number> = {}
      let auditNbUpdates = 0
      let auditNbInserts = 0
      let auditNbErreurs = 0

      // Multi-tenant: verify access to this société
      const hasAccess = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccess) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })

      // LOCK GUARD: check if period is locked
      const { data: existingLocked } = await supabase.from('bulletins_paie')
        .select('id').eq('societe_id', societe_id)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
        .eq('verrouille', true).limit(1)
      if (existingLocked && existingLocked.length > 0) {
        return NextResponse.json({ error: 'Période verrouillée — impossible de recalculer. Déverrouillez d\'abord.', bulletins: [], nb: 0 }, { status: 403 })
      }

      // Get all employees for this société
      const { data: allEmps, error: empError } = await supabase.from('employes').select('*').eq('societe_id', societe_id)

      if (empError) {
        console.error('[paie batch] Error fetching employees:', empError.message)
        return NextResponse.json({ error: `Erreur employes: ${empError.message}`, bulletins: [], nb: 0 }, { status: 500 })
      }

      if (!allEmps || allEmps.length === 0) {
        return NextResponse.json({ error: `Aucun employe trouve pour societe_id=${societe_id}`, bulletins: [], nb: 0, debug: { societe_id, periode: periodeStr } }, { status: 400 })
      }

      // Filter out departed employees — only include if still active during this period
      // Use both `actif` field (GENERATED from date_depart IS NULL) and date_depart comparison
      const employes = allEmps.filter(e => {
        // If no date_depart set → active
        if (!e.date_depart && e.actif !== false) return true
        // If explicitly inactive with no date
        if (e.actif === false && !e.date_depart) return false
        // If date_depart exists, include only if they departed during or after this period
        if (e.date_depart) {
          const depart = String(e.date_depart).slice(0, 10)
          const periodeDebut = `${periodeStr}-01`
          return depart >= periodeDebut
        }
        return true
      })
      // Optional: filter to specific employees (for single recalculation)
      const employe_ids_filter = body.employe_ids as string[] | undefined
      const finalEmployes = (employe_ids_filter && employe_ids_filter.length > 0)
        ? employes.filter(e => employe_ids_filter.includes(e.id))
        : employes

      // Log filtered-out employees for debugging
      const excluded = allEmps.filter(e => !employes.includes(e))
      for (const e of excluded) {
        console.log(`[paie batch] EXCLU: ${e.prenom} ${e.nom} — date_depart=${e.date_depart}, actif=${e.actif}`)
      }
      // Log all employees with their depart status for debugging
      for (const e of allEmps) {
        if (e.nom && (e.nom.toLowerCase().includes('godder') || e.nom.toLowerCase().includes('haggoo'))) {
          console.log(`[paie batch] DEBUG ${e.prenom} ${e.nom}: date_depart=${JSON.stringify(e.date_depart)}, actif=${JSON.stringify(e.actif)}, exclure_mra=${JSON.stringify(e.exclure_mra)}, included=${employes.includes(e)}`)
        }
      }
      console.log(`[paie batch] ${employes.length} employes actifs sur ${allEmps.length} total pour societe=${societe_id}, periode=${periodeStr}`)

      // Migration 135 — fetch pointage_actif UNE FOIS pour tout le batch
      // (toutes les écritures partagent la même société). Si OFF (défaut),
      // les absences sont saisies manuellement ; aucune déduction auto.
      // Hotfix régression — defensive : si la colonne n'existe pas, on
      // retombe sur false plutôt que de 500 tout le batch.
      let pointageActifBatch = false
      if (societe_id) {
        try {
          const { data: socData, error: socErr } = await supabase
            .from('societes').select('pointage_actif').eq('id', societe_id).maybeSingle()
          if (socErr) console.warn('[paie batch] pointage_actif lookup failed:', socErr.message)
          else pointageActifBatch = (socData as any)?.pointage_actif === true
        } catch (e: any) {
          console.warn('[paie batch] pointage_actif exception:', e?.message || e)
        }
      }
      console.log(`[paie batch] pointage_actif=${pointageActifBatch} pour societe=${societe_id}`)

      // Get variables from request body if provided
      const requestVariables: Record<string, any> = {}
      if (body.variables && Array.isArray(body.variables)) {
        body.variables.forEach((v: any) => { requestVariables[v.employe_id] = v })
      }
      const bulletinsSauvegardes = []
      const erreurs: string[] = []

      // PE1 — Période paie paramétrable. Tous les employés d'un batch
      // partagent `societe_id`, donc on résout la période une seule fois.
      const periodeInfoBatch: PeriodePaieCalculee = await calculerPeriodePaie(
        supabase, societe_id || null, `${periodeStr}-01`,
      )
      const periodeStartBatch = periodeInfoBatch.periode_debut
      const periodeEndBatch = periodeInfoBatch.periode_fin

      // G9bis.2 — charge jours fériés de l'année une fois pour tout le
      // batch (override société OR global). Utilisé par le calcul OT
      // + les working-days math plus bas (réutilisation).
      const periodeYearBatch = parseInt(periodeStr.slice(0, 4), 10)
      let joursFeriesSetBatch = new Set<string>()
      {
        const { data: feriesRowsBatch } = await supabase
          .from('jours_feries')
          .select('date, travail_autorise, societe_id')
          .gte('date', `${periodeYearBatch}-01-01`)
          .lte('date', `${periodeYearBatch}-12-31`)
        joursFeriesSetBatch = new Set(
          (feriesRowsBatch || [])
            .filter((r: any) => !r.travail_autorise)
            .filter((r: any) => r.societe_id === null || r.societe_id === societe_id)
            .map((r: any) => String(r.date).slice(0, 10)),
        )
        if (joursFeriesSetBatch.size === 0) {
          joursFeriesSetBatch = getMauritiusPublicHolidays(periodeYearBatch)
        }
      }

      // Fetch auto-prime rules for this société (once for all employees)
      let autoRegles: any[] = []
      try {
        const { data: reglesData } = await supabase.from('regles_primes')
          .select('*').eq('societe_id', societe_id).eq('actif', true)
        autoRegles = reglesData || []
      } catch {} // table may not exist

      for (const emp of finalEmployes || []) {
        // 1. OT depuis pointages
        const { data: pointagesMois } = await supabase.from('pointages')
          .select('*').eq('employe_id', emp.id)
          .gte('date_pointage', periodeStartBatch).lte('date_pointage', periodeEndBatch)

        // Bug 4 fix: fetch planning assignments for this employee+period
        const { data: planAssignments } = await supabase.from('planning_assignments')
          .select('date, shift_code, heures_prevues, est_repos')
          .eq('employe_id', emp.id)
          .gte('date', periodeStartBatch)
          .lte('date', periodeEndBatch)
        const planMap: Record<string, { heures_prevues: number; est_repos: boolean }> = {}
        for (const pa of planAssignments || []) {
          planMap[pa.date] = { heures_prevues: Number(pa.heures_prevues) || 8, est_repos: pa.est_repos }
        }

        let total_ot_montant = 0
        let total_heures_nuit = 0
        const taux_horaire = Number(emp.salaire_base) / (45 * 52 / 12)
        let jours_travailles = 0

        for (const pt of pointagesMois || []) {
          if (!pt.heure_entree) continue
          jours_travailles++
          const ferie = joursFeriesSetBatch.has(pt.date_pointage)
          const weekend = isWeekend(pt.date_pointage)
          const plan = planMap[pt.date_pointage]
          const planningHours = plan ? plan.heures_prevues : 9
          const isPlannedWorkDay = plan ? !plan.est_repos : !weekend
          const isRestDay = plan ? plan.est_repos : weekend
          // Compute actual pause from pointage (fallback to 60 min = 1h lunch)
          let pauseMinutes = 60
          if (pt.heure_pause_debut && pt.heure_pause_fin) {
            const [psh, psm] = pt.heure_pause_debut.split(':').map(Number)
            const [peh, pem] = pt.heure_pause_fin.split(':').map(Number)
            pauseMinutes = (peh * 60 + pem) - (psh * 60 + psm)
            if (pauseMinutes < 0) pauseMinutes = 60
          }
          const ot = calcOT(pt.heure_entree, pt.heure_sortie || '', ferie, planningHours, isPlannedWorkDay, isRestDay, pauseMinutes)
          // WRA 2019 rates: 150% weekday OT, 200% rest/holiday, 300% holiday >8h
          total_ot_montant += ot.ot15 * taux_horaire * 1.5
            + ot.ot2 * taux_horaire * 2
            + ot.ot3 * taux_horaire * 3
          total_heures_nuit += ot.heuresNuit
        }

        // G9bis.4 — Night Shift Allowance WRA S.20 STRICT.
        // Ancien calcul (prorata horaire heures 21h-6h) remplacé par :
        //   allowance = salaire_base × pct × (shifts_nuit_complets /
        //              nb_jours_travailles), avec shift "complet nuit" =
        //              entrée >= 21:00 ET sortie <= 05:00.
        // Un shift partiellement nocturne (ex: 18h-2h) ne déclenche pas
        // la S.20 — il déclenche la disturbance S.17A (G9) si active.
        const nightShiftPct = Number((params as any).night_shift_pct ?? 0.15)
        const { allowance: nightShiftAllowance, nbShiftsNuit: nbShiftsNuitBatch } =
          calculerNightShiftS20(
            Number(emp.salaire_base) || 0,
            (pointagesMois || []).map(pt => ({
              heure_entree: pt.heure_entree,
              heure_sortie: pt.heure_sortie,
            })),
            jours_travailles,
            nightShiftPct,
          )
        // Laisse total_heures_nuit inchangé pour les logs existants.

        // INTÉGRATION 4 — Primes de la période : approuve=true ET
        // integre_paie=false uniquement (cf. calculer pour rationale).
        let primesMois: any[] = []
        {
          const { data, error } = await supabase.from('primes_variables_mois')
            .select('*')
            .eq('employe_id', emp.id)
            .eq('periode', periodeDate)
            .eq('approuve', true)
            .eq('integre_paie', false)
          if (error) {
            console.warn('[paie batch] primes fetch with integre_paie filter failed — fallback:', error.message)
            const retry = await supabase.from('primes_variables_mois')
              .select('*').eq('employe_id', emp.id).eq('periode', periodeDate).eq('approuve', true)
            primesMois = retry.data || []
          } else {
            primesMois = data || []
          }
        }
        let total_primes = primesMois.reduce((s, p) => s + Number(p.montant || 0), 0)

        // Sprint 11 BUG 7 — intégrer les frais kilométriques approuvés du mois.
        // Somme des montants (colonne GENERATED) pour la période/employé.
        let total_frais_km = 0
        try {
          const { data: fraisKm } = await supabase.from('frais_km_mois')
            .select('montant').eq('employe_id', emp.id)
            .eq('periode', periodeDate).eq('approuve', true)
          total_frais_km = (fraisKm || []).reduce(
            (s: number, f: any) => s + (Number(f.montant) || 0), 0
          )
        } catch (e: any) {
          console.warn('[paie batch] frais_km fetch failed (table absente ?):', e?.message || e)
        }

        // 2b. Primes fixes + autres allowances de la fiche employé (récurrentes).
        //
        // Sprint — distribution explicite dans les colonnes bulletin :
        //   special_allowance_1 = primes variables + auto-rules + prime_fixe_1
        //   special_allowance_2 = phone_allowance  + prime_fixe_2
        //   special_allowance_3 = bus_mensuel      + prime_fixe_3
        //
        // Avant, toutes les primes fixes étaient lumped dans total_primes
        // (→ special_allowance_1). Problèmes :
        //   - phone_allowance et daily_bus_fare n'étaient pas lus du tout
        //     (pas de ligne de code qui les référence avant ce commit).
        //   - Le PDF "Primes du mois" mélangeait variables + fixes sans
        //     détail individuel (cf. Sprint 11 BUG 3 qui a partiellement
        //     corrigé via un decomposition PDF, mais la distribution en DB
        //     restait lumpy).
        const primeFixe1 = Number(emp.prime_fixe_1) || 0
        const primeFixe2 = Number(emp.prime_fixe_2) || 0
        const primeFixe3 = Number(emp.prime_fixe_3) || 0
        const phoneAllowance = Number(emp.phone_allowance) || 0
        const busAllowanceMensuel = Math.round((Number(emp.daily_bus_fare) || 0) * 26 * 100) / 100
        // total_primes reste utilisé pour les logs/notes — représente la
        // somme des primes variables du mois + auto-rules (hors primes fixes
        // qui sont désormais distribuées dans les colonnes sa2/sa3).
        // total_primes conserve prime_fixe_1 (qui va dans sa1 avec les variables).
        const totalPrimesFixes = primeFixe1 + primeFixe2 + primeFixe3
        // Note : on garde totalPrimesFixes pour la note résumé mais on ne
        // l'ajoute PAS à total_primes (les primes fixes vont dans sa1/sa2/sa3
        // directement, pas via total_primes).

        // 2c. Auto-rules (meal allowance, call allowance, etc.)
        // Declare here (computed later after leave/pointage analysis) so they're available in auto-rules
        let totalHeuresTravaillees = 0
        let seuilAjuste = 234 // default: 26 days × 9h, recalculated after sick leave analysis
        let totalAutoRules = 0
        const autoRulesApplied: string[] = []
        for (const regle of autoRegles) {
          // Check scope
          if (regle.scope === 'groupe' && regle.scope_value && (emp.groupe || '').toLowerCase() !== regle.scope_value.toLowerCase()) continue
          if (regle.scope === 'departement' && regle.scope_value && (emp.departement || '').toLowerCase() !== regle.scope_value.toLowerCase()) continue
          if (regle.scope === 'individuel' && regle.scope_value && emp.id !== regle.scope_value) continue

          const montantRegle = Number(regle.montant) || 0
          const conditions = regle.conditions || {}

          if (regle.type === 'meal_allowance') {
            // Auto if employee has OT >= ot_min_heures
            const otMinH = Number(conditions.ot_min_heures) || 1
            if (total_ot_montant > 0 && totalHeuresTravaillees > seuilAjuste + otMinH) {
              totalAutoRules += montantRegle
              autoRulesApplied.push(`${regle.nom}: ${montantRegle}`)
            }
          } else if (regle.type === 'call_allowance' || regle.type === 'astreinte') {
            // Applied if rule is active and scope matches — manual assignment via rule activation
            totalAutoRules += montantRegle
            autoRulesApplied.push(`${regle.nom}: ${montantRegle}`)
          } else if (regle.type === 'fixe') {
            totalAutoRules += montantRegle
            autoRulesApplied.push(`${regle.nom}: ${montantRegle}`)
          } else if (regle.type === 'par_jour') {
            const jt2 = jours_travailles > 0 ? jours_travailles : 26
            totalAutoRules += montantRegle * jt2
            autoRulesApplied.push(`${regle.nom}: ${montantRegle} x ${jt2}j = ${montantRegle * jt2}`)
          } else if (regle.type === 'pourcentage') {
            const pct = Number(regle.taux) || Number(regle.montant) || 0
            const montPct = Math.round(Number(emp.salaire_base) * pct / 100)
            totalAutoRules += montPct
            autoRulesApplied.push(`${regle.nom}: ${pct}% = ${montPct}`)
          }
        }
        total_primes += totalAutoRules

        // 3. Congés approuvés qui CHEVAUCHENT le mois.
        // Previously the filter was .gte(date_debut, periodeStart).lte(date_fin, periodeEnd)
        // which silently missed leaves that started before the month and
        // extended into it (e.g. Sheetal SEKELY UL 2026-02-06 → 2026-03-06
        // was invisible when computing the March 2026 bulletin). Correct
        // "overlaps" filter: leave.date_debut <= periodeEnd AND
        // leave.date_fin >= periodeStart.
        // PE1 — utilise periodeStartBatch/periodeEndBatch résolus en haut.
        const periodeStart = periodeStartBatch
        const periodeEnd = periodeEndBatch
        const { data: congesApprouves } = await supabase.from('demandes_conges')
          .select('*').eq('employe_id', emp.id).eq('statut', 'approuve')
          .lte('date_debut', periodeEnd).gte('date_fin', periodeStart)

        // G9bis.2 — joursFeriesSetBatch déjà chargé une fois avant la boucle
        // employés (optimisation + source unique). On aliase pour préserver
        // les références existantes plus bas.
        const joursFeriesSet = joursFeriesSetBatch

        // Count leave days (working-days only) intersected with the period.
        // SL reduces the OT threshold; AL does not; UL triggers a deduction
        // on the net; MAT/PAT are tracked for reporting (no deduction).
        // INTÉGRATION 3 — normalisation defensive type_conge (trim + upper)
        // pour encaisser les données DB où un espace ou une casse
        // inattendue empêchait le match strict 'UL' → 0 déduction en prod.
        let joursSickLeave = 0
        let joursLocalLeave = 0
        let joursAlImposeBatch = 0     // subset of joursLocalLeave
        let joursAlEmployeBatch = 0    // complement of joursAlImposeBatch
        let joursUnpaidLeave = 0
        let joursMatPat = 0
        for (const c of congesApprouves || []) {
          const n = countLeaveDaysInPeriod(
            c.date_debut, c.date_fin, periodeStart, periodeEnd,
            emp, joursFeriesSet
          )
          if (n <= 0) continue
          const tc = String(c.type_conge || '').trim().toUpperCase()
          if (tc === 'SL') joursSickLeave += n
          else if (tc === 'AL') {
            joursLocalLeave += n
            if (c.impose_par_societe === true) joursAlImposeBatch += n
            else joursAlEmployeBatch += n
          }
          else if (tc === 'UL') joursUnpaidLeave += n
          else if (tc === 'MAT' || tc === 'PAT') joursMatPat += n
        }
        if (joursUnpaidLeave > 0) {
          console.log(`[paie] UL detected — ${emp.prenom} ${emp.nom} ${periodeStr}: ${joursUnpaidLeave}j (${(congesApprouves || []).filter(c => String(c.type_conge || '').trim().toUpperCase() === 'UL').map(c => `${c.date_debut}→${c.date_fin}`).join(', ')})`)
        }

        // Monthly OT threshold: standard hours minus sick leave hours
        // Sick Leave reduces the expected hours (employee was sick, can't make it up with OT)
        // Local Leave does NOT reduce the threshold (employee chose to take leave)
        const heuresParJour = 9 // standard daily hours
        const joursTravailMois = 26 // standard working days per month
        const seuilMensuelStandard = joursTravailMois * heuresParJour // 234h standard
        seuilAjuste = (joursTravailMois - joursSickLeave) * heuresParJour
        // Note: joursLocalLeave do NOT reduce the threshold

        // Calculate total hours worked from pointages
        totalHeuresTravaillees = 0
        for (const pt of pointagesMois || []) {
          if (!pt.heure_entree || !pt.heure_sortie) continue
          const debut = new Date(`1970-01-01T${pt.heure_entree}`)
          const fin = new Date(`1970-01-01T${pt.heure_sortie}`)
          let h = (fin.getTime() - debut.getTime()) / 3600000 - 1 // minus 1h lunch
          if (h < 0) h = 0
          totalHeuresTravaillees += h
        }

        // OT is still calculated per-day for the rate breakdown (1.5x vs 2x)
        // but the monthly total is capped by the adjusted threshold
        // If total worked <= adjusted threshold, no OT even if some days were long
        const otMensuelBrut = Math.max(0, totalHeuresTravaillees - seuilAjuste)

        // Scale the daily OT proportionally if monthly OT is less than sum of daily OT
        const dailyOtSum = total_ot_montant / taux_horaire // approximate hours from daily calc
        const otScaleFactor = dailyOtSum > 0 && otMensuelBrut < dailyOtSum ? otMensuelBrut / dailyOtSum : 1
        total_ot_montant = Math.round(total_ot_montant * otScaleFactor)

        // Bug 6 — Override depuis heures_travaillees si saisie manuelle
        // existante (cas DDS sans pointeuse + cas OCC où la saisie OT
        // explicite remplace le calcul auto). DOIT venir APRÈS le scaling
        // cap (line ↑) qui sinon écraserait l'override à 0 quand
        // totalHeuresTravaillees=0 (cas DDS sans pointages → cap=0). Le
        // night shift S.20 (ajouté plus bas) reste cumulé — c'est une
        // allowance distincte de l'OT.
        {
          const otFromHeuresTravaillees = await lireMontantOTDuMois(
            supabase, emp.id, periodeStartBatch, periodeEndBatch,
          )
          if (otFromHeuresTravaillees > 0) {
            console.log(
              `[paie/recalcul] OT-override employe=${emp.id} nom=${emp.nom} ` +
              `montant=${otFromHeuresTravaillees} (source=heures_travaillees, ignore pointages)`,
            )
            total_ot_montant = otFromHeuresTravaillees
          }
        }

        // INTÉGRATION 2 + Migration 135 — Absences injustifiées par
        // JOUR OUVRÉ. Conditionnel sur pointageActifBatch.
        // OFF (défaut)  → jours_absence_injust=0 (saisie manuelle via
        //                  reqVar.absences plus bas).
        // ON            → boucle complète sur les jours ouvrés.
        let jours_absence_injust = 0
        const anomaliesPointageBatch: string[] = []
        if (pointageActifBatch) {
          const pointageByDateBatch = new Map<string, any>()
          for (const pt of pointagesMois || []) {
            pointageByDateBatch.set(pt.date_pointage, pt)
          }
          const workingDaysListBatch = listWorkingDaysInPeriod(
            periodeStart, periodeEnd, emp, joursFeriesSet,
          )
          // F2 — date de référence "aujourd'hui". Les jours futurs ne sont
          // NI absents NI présents : ils n'existent pas encore. Même règle
          // que dans le chemin SINGLE (cf. action='calculer').
          const todayBatch = new Date().toISOString().slice(0, 10)
          for (const day of workingDaysListBatch) {
            const pt = pointageByDateBatch.get(day)
            // G-leaves-fix (debug+fix) : normalisation défensive des
            //   bornes du congé (idem single path).
            const enConge = (congesApprouves || []).some((c: any) => {
              const debut = String(c.date_debut ?? '').slice(0, 10)
              const fin = String(c.date_fin ?? '').slice(0, 10)
              return debut && fin && day >= debut && day <= fin
            })
            // G-leaves-fix : un jour couvert par un congé approuvé est
            //   TOUJOURS traité comme congé (jamais absence), même pour
            //   une date future. Check enConge AVANT le skip "futur".
            if (enConge) {
              if (pt?.heure_entree) {
                anomaliesPointageBatch.push(`Pointage le ${day} alors que l'employé était en congé`)
              }
              continue
            }
            // F2 : skip les jours dans le futur (sans congé approuvé)
            if (day > todayBatch) continue
            if (!pt || (!pt.heure_entree && pt.absent_justifie !== true)) {
              jours_absence_injust++
              anomaliesPointageBatch.push(`Absence non justifiée le ${day}`)
            } else if (pt.heure_entree && !pt.heure_sortie) {
              anomaliesPointageBatch.push(`Oubli de pointage sortie le ${day}`)
            }
          }
        }
        // 4. Override with request variables if provided
        const reqVar = requestVariables[emp.id]
        if (reqVar) {
          if (reqVar.jours_travailles) jours_travailles = reqVar.jours_travailles
          if (reqVar.absences) jours_absence_injust = reqVar.absences
          if (reqVar.primes) total_primes += Number(reqVar.primes) || 0
          if (reqVar.heures_sup_150) total_ot_montant += (Number(reqVar.heures_sup_150) || 0) * (Number(emp.salaire_base) / (45 * 52 / 12)) * 1.5
          if (reqVar.heures_sup_200) total_ot_montant += (Number(reqVar.heures_sup_200) || 0) * (Number(emp.salaire_base) / (45 * 52 / 12)) * 2
        }
        // Add night shift allowance to OT total
        total_ot_montant += nightShiftAllowance

        const montant_absence_final = Math.round(jours_absence_injust * (Number(emp.salaire_base) / 26) * 100) / 100

        // 5. Conversion EUR
        let salaire_base_mur = Number(emp.salaire_base)
        if (emp.devise_salaire === 'EUR') {
          const taux = Number(emp.taux_change_eur) || 46.50
          salaire_base_mur = Math.round(salaire_base_mur * taux)
        }

        // Sprint 13 BUG 1 — Prorata premier/dernier mois (WRA 2019).
        // Réduit le salaire de base au prorata des jours ouvrables
        // effectivement travaillés sur la période quand date_arrivee tombe
        // dans le mois (arrivée en cours de mois) ou date_depart (départ
        // en cours de mois). Les allowances restent non prorata-ées.
        const prorataBatch = computeProrataFirstLastMonth(
          emp, periodeStart, periodeEnd, joursFeriesSet,
        )
        if (prorataBatch.ratio < 1) {
          const originalBase = salaire_base_mur
          salaire_base_mur = Math.round(salaire_base_mur * prorataBatch.ratio * 100) / 100
          console.log(`[paie batch] PRORATA ${emp.prenom} ${emp.nom} — ${prorataBatch.motif}, base ${originalBase} → ${salaire_base_mur}`)
        }

        // Sprint 14 FIX 5 — Bonus 13ème mois complet (WRA Art. 52 + Finance Act).
        //
        // Ancienne logique : eoy_bonus = salaire_base seul.
        //   → Problèmes : (1) pas d'inclusion transport/phone/primes fixes
        //                  (2) pas de prorata ancienneté
        //                  (3) pas d'exclusion < 3 mois
        //
        // WRA Art. 52 : "émoluments" = base + allowances + primes récurrentes.
        // Éligibilité : ≥ 8 mois → bonus plein ; 3-7 mois → prorata ; < 3 mois → 0.
        let eoy_bonus_montant = 0
        if (body.include_eoy_bonus && periodeStr.endsWith("-12")) {
          const totalEmoluments = salaire_base_mur
            + (Number(emp.transport_allowance) || 0)
            + (Number(emp.petrol_allowance) || 0)
            + phoneAllowance
            + busAllowanceMensuel
            + primeFixe1 + primeFixe2 + primeFixe3
          const hireDate = emp.date_arrivee ? new Date(String(emp.date_arrivee) + 'T00:00:00') : null
          const periodeDate = new Date(periodeStr + '-15')
          const moisService = hireDate
            ? Math.max(0,
                (periodeDate.getFullYear() - hireDate.getFullYear()) * 12
                + (periodeDate.getMonth() - hireDate.getMonth())
              )
            : 99
          const moisDansAnnee = Math.min(moisService, 12)
          let bonusFactor = 0
          if (moisDansAnnee >= 8) bonusFactor = 1
          else if (moisDansAnnee >= 3) bonusFactor = moisDansAnnee / 12
          eoy_bonus_montant = Math.round(totalEmoluments * bonusFactor)
          console.log(`[paie batch] EOY BONUS ${emp.prenom} ${emp.nom}: emoluments=${totalEmoluments} moisService=${moisService} moisDansAnnee=${moisDansAnnee} factor=${bonusFactor} bonus=${eoy_bonus_montant}`)
        }

        const isHorsMRA = emp.exclure_mra === true

        // Hors champs MRA : salaire brut = salaire de base uniquement
        // Pas de transport, petrol, OT, primes
        const elements = isHorsMRA ? {
          salaire_base: salaire_base_mur,
          transport_allowance: 0,
          petrol_allowance: 0,
          heures_sup_montant: 0,
          special_allowance_1: 0,
          special_allowance_2: 0,
          special_allowance_3: 0,
          increment_salaire: 0,
          other_refund: 0,
          departure_notice: 0,
          commission: 0,
          eoy_bonus: 0,
        } : {
          salaire_base: salaire_base_mur,
          transport_allowance: Number(emp.transport_allowance) || 0,
          petrol_allowance: Number(emp.petrol_allowance) || 0,
          heures_sup_montant: Math.round(total_ot_montant),
          // Sprint — distribution des allowances dans les 3 colonnes sa1/2/3.
          // sa1 = primes variables + auto-rules + prime_fixe_1
          // sa2 = phone_allowance + prime_fixe_2
          // sa3 = bus_fare × 26 + prime_fixe_3
          special_allowance_1: Math.round(total_primes + primeFixe1),
          special_allowance_2: Math.round((phoneAllowance + primeFixe2) * 100) / 100,
          special_allowance_3: Math.round((busAllowanceMensuel + primeFixe3) * 100) / 100,
          // Sprint 11 BUG 7 — frais km approuvés inclus dans le brut via other_refund
          other_refund: (Number(emp.other_refund) || 0) + total_frais_km,
          eoy_bonus: eoy_bonus_montant,
        }

        const jt = jours_travailles > 0 ? jours_travailles : 26

        // F10 — Pré-calcul du salaire_brut_base (hors EOY) pour calculer
        // l'UL AVANT calculerBulletin, et passer le total absence comme
        // base de cotisation.
        const salaireBrutBaseBatch =
          Number(elements.salaire_base)
          + (Number(elements.transport_allowance) || 0)
          + (Number(elements.petrol_allowance) || 0)
          + (Number(elements.heures_sup_montant) || 0)
          + (Number(elements.special_allowance_1) || 0)
          + (Number(elements.special_allowance_2) || 0)
          + (Number(elements.special_allowance_3) || 0)
          + (Number((elements as any).increment_salaire) || 0)
          + (Number(elements.other_refund) || 0)
          + (Number((elements as any).departure_notice) || 0)

        // ── UL (Unpaid Leave) deduction ─────────────────────────────────
        // Formula: deduction_ul = nb_jours_ul × (salaire_brut_base / nb_jours_ouvres_mois)
        // INTÉGRATION 3 + Sprint 3 BUG 3 — UL deduction TOUJOURS appliquée
        // (même pour isHorsMRA). Le flag isHorsMRA ne contrôle QUE
        // l'inclusion dans les déclarations CSG/NSF/PAYE, pas le calcul net.
        let montant_ul = 0
        let ul_skip_reason: string | null = null
        if (joursUnpaidLeave > 0) {
          const nbJoursOuvresMois = calculateWorkingDays(periodeStart, periodeEnd, {
            workingDays: getWorkingDaysForEmploye(emp),
            joursFeries: joursFeriesSet,
          })
          if (nbJoursOuvresMois > 0 && salaireBrutBaseBatch > 0) {
            montant_ul = Math.round(joursUnpaidLeave * (salaireBrutBaseBatch / nbJoursOuvresMois) * 100) / 100
            const tag = isHorsMRA ? ' [hors MRA — déduction net seule]' : ''
            console.log(`[paie] UL OK ${emp.prenom} ${emp.nom} — ${joursUnpaidLeave}j × (${salaireBrutBaseBatch} / ${nbJoursOuvresMois}) = ${montant_ul} MUR${tag}`)
          } else {
            ul_skip_reason = `joursOuvres=${nbJoursOuvresMois} salaireBrut=${salaireBrutBaseBatch}`
            console.warn(`[paie] UL SKIP zero-guard — ${emp.prenom} ${emp.nom} ${ul_skip_reason}`)
          }
        }

        // POLICY Lexora — cumul absences + UL plafonné au salaire_brut_base.
        const totalAbsenceRawBatch = montant_absence_final + montant_ul
        const totalDeductionAbsence = Math.min(totalAbsenceRawBatch, salaireBrutBaseBatch)

        // F6 — Split UL / injustifiées pour stockage séparé. Si le cap
        // plafond a été touché, on prorate les 2 montants proportionnellement.
        let montantInjustFinalBatch = montant_absence_final
        let montantUlFinalBatch = montant_ul
        if (totalAbsenceRawBatch > salaireBrutBaseBatch && totalAbsenceRawBatch > 0) {
          const scale = salaireBrutBaseBatch / totalAbsenceRawBatch
          montantInjustFinalBatch = Math.round(montant_absence_final * scale * 100) / 100
          montantUlFinalBatch = Math.round(montant_ul * scale * 100) / 100
        }

        // G1 — Cash-in-lieu (WRA S.45/S.47) : injecter paiements compensation
        // valides pour cette periode_bulletin (= 1er du mois).
        const periodeBulletinBatch = `${periodeStr}-01`
        const cilPaiementsBatch = isHorsMRA
          ? []
          : await fetchPaiementsValidesPourBulletin(supabase, emp.id, periodeBulletinBatch)
        const cilMontantBatch = cilPaiementsBatch.reduce((s, p) => s + Number(p.montant_total || 0), 0)
        const cilJoursBatch = cilPaiementsBatch.reduce((s, p) => s + Number(p.jours_payes_compensation || 0), 0)
        const cilTypesBatch = new Set(cilPaiementsBatch.map(p => p.type_conge))
        const cilTypeBatch: 'AL' | 'VL' | 'mixte' | null = cilTypesBatch.size === 0
          ? null
          : cilTypesBatch.size > 1 ? 'mixte' : (Array.from(cilTypesBatch)[0] as 'AL' | 'VL')

        // G7 — Allocation naissance 3 000 MUR (WRA S.52). Injectee directement
        // sur le bulletin (hors CSG/NSF/PAYE, forfait social non-imposable).
        const allocNaissanceBatch = await fetchGrossessePourAllocationBulletin(
          supabase, emp.id, periodeStr,
        )
        const allocMontantBatch = allocNaissanceBatch?.montant || 0

        // F10 + G1 — calculerBulletin avec totalDeductionAbsence + cilMontant.
        const resultat = calculerBulletin(
          elements,
          params as any,
          jt,
          Number(emp.pct_refacturation) || 0,
          undefined,
          undefined,
          isHorsMRA ? 0 : totalDeductionAbsence,
          cilMontantBatch,
        )

        // Hors champs MRA : pas de CSG, NSF, PAYE, pas de charges patronales
        if (isHorsMRA) {
          resultat.csg_salarie = 0
          resultat.csg_patronal = 0
          resultat.csg_bonus = 0
          resultat.csg_patronal_bonus = 0
          resultat.nsf_salarie = 0
          resultat.nsf_patronal = 0
          resultat.paye = 0
          resultat.training_levy = 0
          resultat.prgf = 0
          resultat.total_deductions = 0
          resultat.total_charges_patronales = 0
          resultat.salaire_net = salaire_base_mur // net = base pour hors MRA
        }

        // Sprint 15 FIX 1 — Avance sur salaire (WRA Art. 29).
        // Déduire la mensualité de l'avance active du salaire net.
        // Max = 50% du net. Après déduction, mettre à jour solde_restant.
        // Si solde atteint 0 → statut = 'rembourse'.
        let avanceDeduction = 0
        try {
          const { data: avanceActive } = await supabase.from('avances_salaire')
            .select('id, mensualite, solde_restant')
            .eq('employe_id', emp.id).eq('statut', 'actif')
            .order('date_octroi', { ascending: true }).limit(1).maybeSingle()
          if (avanceActive && Number(avanceActive.mensualite) > 0) {
            const netAvantAvance = isHorsMRA
              ? (salaire_base_mur - totalDeductionAbsence)
              : (resultat.salaire_net - totalDeductionAbsence)
            const maxDeduction = Math.round(netAvantAvance * 0.5 * 100) / 100
            const mensualite = Math.min(Number(avanceActive.mensualite), maxDeduction, Number(avanceActive.solde_restant))
            if (mensualite > 0) {
              avanceDeduction = Math.round(mensualite * 100) / 100
              const newSolde = Math.round((Number(avanceActive.solde_restant) - avanceDeduction) * 100) / 100
              await supabase.from('avances_salaire').update({
                solde_restant: Math.max(0, newSolde),
                statut: newSolde <= 0 ? 'rembourse' : 'actif',
              }).eq('id', avanceActive.id)
              console.log(`[paie batch] AVANCE ${emp.prenom} ${emp.nom}: -${avanceDeduction} MUR (solde restant: ${Math.max(0, newSolde)})`)
            }
          }
        } catch (e: any) {
          console.warn('[paie batch] avance check failed (table absente ?):', e?.message || e)
        }

        // POLICY Lexora — salaire_net final plafonné à 0.
        // G7 — Allocation naissance s'ajoute au net (hors cotisations).
        const salaire_net_final = Math.max(
          0,
          isHorsMRA
            ? Math.round((salaire_base_mur - totalDeductionAbsence - avanceDeduction + allocMontantBatch) * 100) / 100
            : Math.round((resultat.salaire_net - totalDeductionAbsence - avanceDeduction + allocMontantBatch) * 100) / 100,
        )

        // Résumé notes pour le bulletin
        const transportAlloc = isHorsMRA ? 0 : (Number(emp.transport_allowance) || 0)
        const petrolAlloc = isHorsMRA ? 0 : (Number(emp.petrol_allowance) || 0)
        const phoneAlloc = isHorsMRA ? 0 : phoneAllowance
        const busAlloc = isHorsMRA ? 0 : busAllowanceMensuel
        const mraTag = isHorsMRA ? ' [HORS MRA - Brut=Base]' : ''
        // Sprint — total_primes ne contient plus les primes_fixes (désormais
        // distribuées dans sa1/sa2/sa3 directement). Il vaut : primes
        // variables approuvées du mois + auto-rules. Les primes fixes sont
        // résumées séparément via primesFixesDetail.
        const primesVariables = Math.round(total_primes - totalAutoRules)
        const primesFixesDetail = totalPrimesFixes > 0
          ? `, Primes fixes: ${totalPrimesFixes} (pf1=${primeFixe1}+pf2=${primeFixe2}+pf3=${primeFixe3})`
          : ''
        const phoneDetail = phoneAlloc > 0 ? `, Phone: ${phoneAlloc}` : ''
        const busDetail = busAlloc > 0 ? `, Bus: ${busAlloc} (${emp.daily_bus_fare}×26)` : ''
        const autoRulesDetail = autoRulesApplied.length > 0 ? `, Auto: ${autoRulesApplied.join('; ')}` : ''
        const nightDetail = nightShiftAllowance > 0 ? `, Night shift +${(nightShiftPct * 100).toFixed(0)}%: ${nightShiftAllowance} (${Math.round(total_heures_nuit)}h nuit)` : ''
        const ulDetail = joursUnpaidLeave > 0 ? `, UL: ${joursUnpaidLeave}j = -${montant_ul}` : ''
        // Sprint 13 BUG 1 — trace prorata dans les notes pour que le RH
        // voie immédiatement pourquoi la base diffère du salaire brut
        // contractuel (premier/dernier mois).
        const prorataDetail = prorataBatch.ratio < 1
          ? ` [${prorataBatch.motif}]`
          : ''
        const notesResume = isHorsMRA
          ? `Base: ${salaire_base_mur} [HORS MRA - Brut=Net=Base]${prorataDetail}`
          : `Base: ${salaire_base_mur}${prorataDetail}, Transport: ${transportAlloc}, Petrol: ${petrolAlloc}${phoneDetail}${busDetail}, OT: ${Math.round(total_ot_montant)}${nightDetail}, Primes var: ${primesVariables}${primesFixesDetail}${autoRulesDetail}, Absences: ${jours_absence_injust}j${ulDetail}`
        console.log(`[paie] ${emp.prenom} ${emp.nom}: base=${salaire_base_mur} transport=${transportAlloc} petrol=${petrolAlloc} phone=${phoneAlloc} bus=${busAlloc} OT=${Math.round(total_ot_montant)} primesVar=${primesVariables} primesFixes=${totalPrimesFixes} abs=${jours_absence_injust}j ul=${joursUnpaidLeave}j${mraTag}`)

        const bulletin: Record<string, any> = {
          employe_id: emp.id,
          societe_id,
          periode: periodeDate,
          salaire_base: salaire_base_mur,
          // salaire_brut is GENERATED ALWAYS — do NOT include it
          salaire_net: salaire_net_final,
          csg_salarie: resultat.csg_salarie,
          csg_patronal: resultat.csg_patronal,
          nsf_salarie: resultat.nsf_salarie,
          nsf_patronal: resultat.nsf_patronal,
          paye: resultat.paye,
          training_levy: resultat.training_levy,
          prgf: resultat.prgf,
          total_deductions: Math.round((resultat.total_deductions + totalDeductionAbsence) * 100) / 100,
          total_charges_patronales: resultat.total_charges_patronales,
          heures_sup_montant: isHorsMRA ? 0 : Math.round(total_ot_montant),
          // Sprint — distribution des allowances (sa1/sa2/sa3) pour que le
          // brut GENERATED inclue naturellement phone + bus + primes fixes.
          special_allowance_1: isHorsMRA ? 0 : Math.round(total_primes + primeFixe1),
          special_allowance_2: isHorsMRA ? 0 : Math.round((phoneAllowance + primeFixe2) * 100) / 100,
          special_allowance_3: isHorsMRA ? 0 : Math.round((busAllowanceMensuel + primeFixe3) * 100) / 100,
          transport_allowance: isHorsMRA ? 0 : (Number(emp.transport_allowance) || 0),
          petrol_allowance: isHorsMRA ? 0 : (Number(emp.petrol_allowance) || 0),
          // POLICY Lexora — plus de salary compensation (635 MUR) ajoutée.
          // increment_salaire = valeur fiche employé pure, rien d'autre.
          increment_salaire: isHorsMRA ? 0 : (Number(emp.increment_salaire) || 0),
          // Sprint 11 BUG 7 — other_refund = refund fiche employé + frais km approuvés du mois
          other_refund: isHorsMRA ? 0 : ((Number(emp.other_refund) || 0) + total_frais_km),
          eoy_bonus: isHorsMRA ? 0 : eoy_bonus_montant,
          // F6 — Colonnes séparées pour la traçabilité :
          //   montant_absence / jours_absence = absences INJUSTIFIÉES uniquement
          //   montant_ul / jours_ul           = Unpaid Leave approuvés uniquement
          // CSG/NSF/PAYE basés sur la SOMME des deux (cf. totalDeductionAbsence).
          montant_absence: isHorsMRA ? 0 : Math.round(montantInjustFinalBatch * 100) / 100,
          jours_absence: isHorsMRA ? 0 : (jours_absence_injust || 0),
          montant_ul: isHorsMRA ? 0 : Math.round(montantUlFinalBatch * 100) / 100,
          jours_ul: isHorsMRA ? 0 : (joursUnpaidLeave || 0),
          // G1 — Cash-in-lieu (WRA S.45/S.47)
          montant_cash_in_lieu: Math.round(cilMontantBatch * 100) / 100,
          jours_cash_in_lieu: cilJoursBatch,
          cash_in_lieu_type: cilTypeBatch,
          // G7 — Allocation naissance 3 000 MUR (WRA S.52, non-imposable)
          allocation_naissance: Math.round(allocMontantBatch * 100) / 100,
          notes: notesResume,
          statut: 'brouillon',
        }

        // Remove fields that may not exist in DB schema (ResultatPaie extras)
        const fieldsToRemove = [
          'salary_compensation_montant', 'total_emoluments', 'prgf_pct_emoluments',
          'prgf_par_jour', 'montant_refacture_mur', 'csg_taux', 'csg_bonus',
          'salaire_brut_base', 'resultat_net', 'salaire_brut', 'cout_total_employeur',
          'jours_travailles', 'csg_patronal_bonus'
        ]
        for (const f of fieldsToRemove) delete (bulletin as any)[f]
        console.log(`[paie batch] ${emp.nom} ${emp.prenom}: base=${salaire_base_mur}, brut=${resultat.salaire_brut}, net=${salaire_net_final}`)

        // Try upsert first, fallback to select+update/insert if UNIQUE constraint is missing
        let saved: any = null
        let error: any = null

        // F14 — Check if bulletin already exists + ses flags verrouille/paiement
        //        (pour compter les skip precis dans l'audit).
        const { data: existing } = await supabase.from('bulletins_paie')
          .select('id, verrouille, date_paiement')
          .eq('employe_id', emp.id).eq('periode', periodeDate).maybeSingle()

        if (existing) {
          // F14 — skip si bulletin verrouille ou deja paye (immuables).
          if (existing.verrouille === true) {
            auditRaisonsSkip['verrouille'] = (auditRaisonsSkip['verrouille'] || 0) + 1
            console.log(`[paie batch F14] SKIP ${emp.prenom} ${emp.nom} — bulletin verrouille`)
            continue
          }
          if (existing.date_paiement) {
            auditRaisonsSkip['paye'] = (auditRaisonsSkip['paye'] || 0) + 1
            console.log(`[paie batch F14] SKIP ${emp.prenom} ${emp.nom} — bulletin paye (${existing.date_paiement})`)
            continue
          }
          // F14 — force updated_at pour que le recalcul soit visible cote UI.
          const bulletinAvecTs = { ...bulletin, updated_at: new Date().toISOString() }
          const { data: updated, error: upErr } = await supabase.from('bulletins_paie')
            .update(bulletinAvecTs).eq('id', existing.id).select().single()
          saved = updated
          error = upErr
          if (!upErr) auditNbUpdates++
        } else {
          // INSERT new bulletin
          const { data: inserted, error: insErr } = await supabase.from('bulletins_paie')
            .insert(bulletin).select().single()
          saved = inserted
          error = insErr
          if (!insErr) auditNbInserts++
        }

        if (error) {
          auditNbErreurs++
          const errMsg = `${emp.nom} ${emp.prenom}: ${error.message}${error.details ? ' — ' + error.details : ''}${error.hint ? ' (hint: ' + error.hint + ')' : ''}`
          console.error(`[paie batch] SAVE FAILED:`, errMsg)
          erreurs.push(errMsg)
        }
        if (!error && saved) {
          // Commit 11 — attach conges_details so the UI can show a
          // "Congés du mois" section in the bulletin preview without
          // re-fetching demandes_conges client-side.
          const congesDetailsForBulletin = {
            al_jours: Math.round(joursLocalLeave * 100) / 100,
            al_impose_jours: Math.round(joursAlImposeBatch * 100) / 100,
            al_employe_jours: Math.round(joursAlEmployeBatch * 100) / 100,
            sl_jours: Math.round(joursSickLeave * 100) / 100,
            ul_jours: Math.round(joursUnpaidLeave * 100) / 100,
            ul_deduction_mur: Math.round(montant_ul * 100) / 100,
            // Sprint 3 BUG 3 — flag pour l'UI : UL appliqué hors MRA ?
            // Permet d'afficher l'alerte "X j UL ce mois — Rs Y appliqués
            // hors déclaration MRA" dans la liste des bulletins.
            ul_hors_mra: isHorsMRA && montant_ul > 0,
            mat_pat_jours: Math.round(joursMatPat * 100) / 100,
            anomalies_pointage: anomaliesPointageBatch,
          }
          bulletinsSauvegardes.push({
            ...saved,
            nom: emp.nom,
            prenom: emp.prenom,
            employe: { id: emp.id, code: emp.code_employe, nom: emp.nom, prenom: emp.prenom, poste: emp.poste },
            conges_details: congesDetailsForBulletin,
          })
          // G1 — Marquer les paiements compensation comme 'paye' avec bulletin_paie_id.
          if (saved?.id && cilPaiementsBatch.length > 0) {
            for (const pcc of cilPaiementsBatch) {
              await marquerPaiementPaye(supabase, pcc.id, saved.id)
            }
          }

          // G7 — Marquer l'allocation naissance payee avec reference bulletin.
          if (saved?.id && allocNaissanceBatch) {
            await marquerAllocationPayee(supabase, allocNaissanceBatch.id, saved.id)
          }
          // Marquer primes intégrées (colonne integre_paie + date_integration ajoutées en migration 028)
          if (primesMois && primesMois.length > 0) {
            await supabase.from('primes_variables_mois')
              .update({ integre_paie: true, date_integration: new Date().toISOString() })
              .in('id', primesMois.map((p: any) => p.id))
          }
        }
      }

      const totaux = {
        masse_salariale_brute: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_brut || 0), 0),
        masse_salariale_nette: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_net || 0), 0),
        total_charges_patronales: bulletinsSauvegardes.reduce((s, b) => s + Number(b.total_charges_patronales || 0), 0),
        cout_total_employeur: bulletinsSauvegardes.reduce((s, b) => s + Number(b.salaire_brut || 0) + Number(b.total_charges_patronales || 0), 0),
      }

      // F14 — Audit trail : insertion d'une ligne par appel calculer_batch.
      //   action = 'recalcul_batch' si au moins 1 UPDATE, sinon 'calcul_initial'.
      //   nb_skip = bulletins verrouilles/payes non modifies.
      const auditAction = auditNbUpdates > 0 ? 'recalcul_batch' : 'calcul_initial'
      const auditNbSkip = Object.values(auditRaisonsSkip).reduce((a, b) => a + b, 0)
      try {
        await supabase.from('audit_recalcul_paie').insert({
          societe_id,
          periode: `${periodeStr}-01`,
          action: auditAction,
          nb_bulletins_cibles: (finalEmployes || []).length,
          nb_bulletins_modifies: auditNbUpdates + auditNbInserts,
          nb_bulletins_skip: auditNbSkip,
          nb_bulletins_erreur: auditNbErreurs,
          raisons_skip: Object.keys(auditRaisonsSkip).length > 0 ? auditRaisonsSkip : null,
          erreurs: erreurs.length > 0 ? erreurs : null,
          declenche_par: user.id,
          duree_ms: Date.now() - auditStart,
        })
      } catch (auditErr: any) {
        console.warn('[paie batch F14] audit insert failed (non-blocking):', auditErr?.message || auditErr)
      }

      console.log(`[paie batch F14] ${auditAction} — cibles=${(finalEmployes || []).length} updates=${auditNbUpdates} inserts=${auditNbInserts} skip=${auditNbSkip} erreurs=${auditNbErreurs} duree=${Date.now() - auditStart}ms`)

      return NextResponse.json({
        bulletins: bulletinsSauvegardes,
        totaux,
        nb: bulletinsSauvegardes.length,
        nb_employes: employes.length,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        // F14 — detail du recalcul pour feedback UI precis
        recalcul: {
          action: auditAction,
          nb_cibles: (finalEmployes || []).length,
          nb_modifies: auditNbUpdates + auditNbInserts,
          nb_updates: auditNbUpdates,
          nb_inserts: auditNbInserts,
          nb_skip: auditNbSkip,
          nb_erreurs: auditNbErreurs,
          raisons_skip: auditRaisonsSkip,
          duree_ms: Date.now() - auditStart,
        },
        debug: { societe_id, periode: periodeStr, nb_employes_total: allEmps.length, nb_actifs: employes.length, nb_bulletins: bulletinsSauvegardes.length, nb_erreurs: erreurs.length }
      })
    }

    // ══════════════════════════════════════════════════════════════
    // Mark employee as hors MRA or set departure date
    // ══════════════════════════════════════════════════════════════
    if (action === 'modifier_employe') {
      const { employe_id: eid, champs: empChamps } = body
      if (!eid || !empChamps) return NextResponse.json({ error: 'employe_id et champs requis' }, { status: 400 })
      const allowedEmp = ['exclure_mra', 'date_depart', 'actif',
        'prime_fixe_1', 'prime_fixe_1_libelle', 'prime_fixe_2', 'prime_fixe_2_libelle',
        'prime_fixe_3', 'prime_fixe_3_libelle', 'transport_allowance', 'petrol_allowance']
      const empUpdates: Record<string, any> = {}
      for (const [k, v] of Object.entries(empChamps)) {
        if (allowedEmp.includes(k)) empUpdates[k] = v
      }
      // Can't set actif directly (GENERATED), use date_depart instead
      if ('actif' in empUpdates && empUpdates.actif === false && !empUpdates.date_depart) {
        empUpdates.date_depart = new Date().toISOString().slice(0, 10)
        delete empUpdates.actif
      }
      if ('actif' in empUpdates) delete empUpdates.actif // can't write GENERATED column
      if (Object.keys(empUpdates).length === 0) return NextResponse.json({ error: 'Aucun champ modifiable' }, { status: 400 })
      const { error: empErr } = await supabase.from('employes').update(empUpdates).eq('id', eid)
      if (empErr) {
        console.error('[modifier_employe] error:', empErr.message)
        return NextResponse.json({ error: empErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // Delete a specific bulletin
    // ══════════════════════════════════════════════════════════════
    if (action === 'supprimer_bulletin') {
      const { bulletin_id: bid } = body
      if (!bid) return NextResponse.json({ error: 'bulletin_id requis' }, { status: 400 })
      const { data: bul } = await supabase.from('bulletins_paie').select('id, verrouille').eq('id', bid).single()
      if (!bul) return NextResponse.json({ error: 'Bulletin non trouve' }, { status: 404 })
      if (bul.verrouille) return NextResponse.json({ error: 'Bulletin verrouille' }, { status: 403 })
      const { error: dErr } = await supabase.from('bulletins_paie').delete().eq('id', bid)
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // Manual edit of a single bulletin
    // ══════════════════════════════════════════════════════════════
    if (action === 'modifier_bulletin') {
      const { bulletin_id, champs } = body
      if (!bulletin_id || !champs) return NextResponse.json({ error: 'bulletin_id et champs requis' }, { status: 400 })

      // Check lock
      const { data: existing } = await supabase.from('bulletins_paie').select('id, verrouille, statut').eq('id', bulletin_id).single()
      if (!existing) return NextResponse.json({ error: 'Bulletin non trouve' }, { status: 404 })
      if (existing.verrouille) return NextResponse.json({ error: 'Bulletin verrouille — modification impossible' }, { status: 403 })

      // Only allow these fields to be manually edited
      const allowed = ['salaire_base', 'heures_sup_montant', 'special_allowance_1', 'special_allowance_2', 'special_allowance_3',
        'transport_allowance', 'petrol_allowance', 'increment_salaire', 'other_refund', 'eoy_bonus', 'departure_notice',
        'jours_absence', 'montant_absence', 'paye', 'notes']
      const updates: Record<string, any> = {}
      for (const [k, v] of Object.entries(champs)) {
        if (allowed.includes(k)) updates[k] = v
      }
      if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Aucun champ modifiable' }, { status: 400 })

      // Recalculate deductions if salary fields changed
      const base = Number(updates.salaire_base ?? (await supabase.from('bulletins_paie').select('salaire_base').eq('id', bulletin_id).single()).data?.salaire_base ?? 0)
      // Update
      const { data: updated, error: uErr } = await supabase.from('bulletins_paie')
        .update({ ...updates, statut: 'brouillon' }) // reset to brouillon on edit
        .eq('id', bulletin_id).select().single()
      if (uErr) throw uErr
      return NextResponse.json({ bulletin: updated })
    }

    if (action === 'valider') {
      // Find bulletin — try exact match first, then ilike for period flexibility
      let bulletin: any = null
      const { data: exact } = await supabase.from('bulletins_paie')
        .select('id, verrouille').eq('employe_id', employe_id).eq('periode', periodeDate).maybeSingle()
      if (exact) {
        if (exact.verrouille) return NextResponse.json({ error: 'Bulletin verrouillé — modification impossible' }, { status: 403 })
        const { data, error } = await supabase.from('bulletins_paie')
          .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id }).eq('id', exact.id).select().single()
        if (error) throw error
        bulletin = data
      } else {
        const { data: fuzzy } = await supabase.from('bulletins_paie')
          .select('id, verrouille').eq('employe_id', employe_id).gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr)).maybeSingle()
        if (fuzzy) {
          if (fuzzy.verrouille) return NextResponse.json({ error: 'Bulletin verrouillé — modification impossible' }, { status: 403 })
          const { data, error } = await supabase.from('bulletins_paie')
            .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id }).eq('id', fuzzy.id).select().single()
          if (error) throw error
          bulletin = data
        }
      }
      if (!bulletin) return NextResponse.json({ error: `Aucun bulletin trouvé pour ${employe_id} en ${periodeStr}` }, { status: 404 })
      return NextResponse.json({ bulletin })
    }

    // ══════════════════════════════════════════════════════════════
    // Validate ALL bulletins for the period
    // ══════════════════════════════════════════════════════════════
    if (action === 'valider_tous') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { data: buls, error: bErr } = await supabase.from('bulletins_paie')
        .select('id, verrouille, statut')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
      if (bErr) throw bErr
      const toValidate = (buls || []).filter(b => b.statut === 'brouillon' && !b.verrouille)
      if (toValidate.length === 0) return NextResponse.json({ error: 'Aucun bulletin brouillon à valider', nb: 0 })
      const { error: uErr } = await supabase.from('bulletins_paie')
        .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: user.id })
        .in('id', toValidate.map(b => b.id))
      if (uErr) throw uErr
      // Audit log
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'validation',
        user_id: user.id, user_email: user.email,
        details: { nb_bulletins: toValidate.length }
      })
      return NextResponse.json({ success: true, nb: toValidate.length })
    }

    // ══════════════════════════════════════════════════════════════
    // LOCK (verrouiller) all validated bulletins for the period
    // ══════════════════════════════════════════════════════════════
    if (action === 'verrouiller') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { data: buls } = await supabase.from('bulletins_paie')
        .select('id, statut, verrouille')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
      const nonValides = (buls || []).filter(b => b.statut !== 'valide' && !b.verrouille)
      if (nonValides.length > 0) {
        return NextResponse.json({ error: `${nonValides.length} bulletin(s) non validé(s). Validez tous les bulletins avant de verrouiller.` }, { status: 400 })
      }
      const toLock = (buls || []).filter(b => !b.verrouille)
      if (toLock.length === 0) return NextResponse.json({ error: 'Tous les bulletins sont déjà verrouillés', nb: 0 })
      const { error: lErr } = await supabase.from('bulletins_paie')
        .update({ verrouille: true, date_verrouillage: new Date().toISOString(), verrouille_par: user.id })
        .in('id', toLock.map(b => b.id))
      if (lErr) throw lErr
      // Upsert period lock record
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        bulletins_valides: true, verrouille: true,
        date_verrouillage: new Date().toISOString(), verrouille_par: user.id,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      // Audit log
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'verrouillage',
        user_id: user.id, user_email: user.email,
        details: { nb_bulletins: toLock.length }
      })
      return NextResponse.json({ success: true, nb: toLock.length })
    }

    // ══════════════════════════════════════════════════════════════
    // UNLOCK (déverrouiller) — admin only, with audit trail
    // ══════════════════════════════════════════════════════════════
    if (action === 'deverrouiller') {
      const sid = body.societe_id
      const motif = body.motif || 'Correction demandée'
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      const { error: uErr } = await supabase.from('bulletins_paie')
        .update({ verrouille: false, date_verrouillage: null, verrouille_par: null, statut: 'brouillon' })
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
      if (uErr) throw uErr
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        verrouille: false, bulletins_valides: false,
        virements_generes: false, mra_declare: false, comptabilise: false,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`, action: 'deverrouillage',
        user_id: user.id, user_email: user.email,
        details: { motif }
      })
      return NextResponse.json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════
    // GET workflow status for a period
    // ══════════════════════════════════════════════════════════════
    if (action === 'workflow_status') {
      const sid = body.societe_id
      if (!sid) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      // Bulletins stats
      const { data: buls } = await supabase.from('bulletins_paie')
        .select('id, statut, verrouille, comptabilise')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
      const total = (buls || []).length
      const brouillons = (buls || []).filter(b => b.statut === 'brouillon').length
      const valides = (buls || []).filter(b => b.statut === 'valide').length
      const verrouilles = (buls || []).filter(b => b.verrouille).length
      const comptabilises = (buls || []).filter(b => b.comptabilise).length
      // Planning published?
      const { data: plan } = await supabase.from('plannings')
        .select('id, published').eq('societe_id', sid).eq('periode', `${periodeStr}-01`).maybeSingle()
      // Pointage count for the month
      const { count: pointageCount } = await supabase.from('pointages')
        .select('id', { count: 'exact', head: true })
        .gte('date_pointage', `${periodeStr}-01`).lte('date_pointage', lastDayOfMonth(periodeStr))
      // OT: check if any bulletin has heures_sup_montant > 0 (OT computed)
      const { data: bulsFull } = await supabase.from('bulletins_paie')
        .select('id, heures_sup_montant, special_allowance_1')
        .eq('societe_id', sid)
        .gte('periode', `${periodeStr}-01`).lte('periode', lastDayOfMonth(periodeStr))
      const hasOT = (bulsFull || []).some(b => Number(b.heures_sup_montant) > 0)
      const hasPrimes = (bulsFull || []).some(b => Number(b.special_allowance_1) > 0)
      // Primes count for the month
      const { count: primesCount } = await supabase.from('primes_variables_mois')
        .select('id', { count: 'exact', head: true })
        .eq('periode', `${periodeStr}-01`)
      // Period lock record (table may not exist yet — catch error)
      let lockRecord: any = null
      let auditLog: any[] = []
      try {
        const { data: lr } = await supabase.from('paie_periodes_lock')
          .select('*').eq('societe_id', sid).eq('periode', `${periodeStr}-01`).maybeSingle()
        lockRecord = lr
      } catch {}
      try {
        const { data: al } = await supabase.from('paie_audit_log')
          .select('*').eq('societe_id', sid).eq('periode', `${periodeStr}-01`)
          .order('created_at', { ascending: false }).limit(10)
        auditLog = al || []
      } catch {}

      return NextResponse.json({
        workflow: {
          planning_publie: plan?.published || false,
          pointage_valide: (pointageCount || 0) > 0,
          pointage_count: pointageCount || 0,
          ot_valide: hasOT || lockRecord?.ot_valide || total > 0,
          ot_present: hasOT,
          primes_validees: hasPrimes || (primesCount || 0) > 0 || lockRecord?.primes_validees || total > 0,
          primes_count: primesCount || 0,
          bulletins_generes: total > 0,
          bulletins_total: total,
          bulletins_brouillon: brouillons,
          bulletins_valides: valides,
          bulletins_verrouilles: verrouilles,
          bulletins_comptabilises: comptabilises,
          tous_valides: total > 0 && brouillons === 0,
          tous_verrouilles: total > 0 && verrouilles === total,
          tous_comptabilises: total > 0 && comptabilises === total,
          virements_generes: lockRecord?.virements_generes || false,
          mra_declare: lockRecord?.mra_declare || false,
          lock_record: lockRecord || null,
        },
        audit: auditLog || [],
      })
    }

    // ══════════════════════════════════════════════════════════════
    // Mark post-lock steps done (virements, MRA, compta)
    // ══════════════════════════════════════════════════════════════
    if (action === 'mark_step') {
      const sid = body.societe_id
      const step = body.step // 'virements_generes' | 'mra_declare' | 'comptabilise'
      if (!sid || !step) return NextResponse.json({ error: 'societe_id et step requis' }, { status: 400 })
      const allowed = ['virements_generes', 'mra_declare', 'comptabilise']
      if (!allowed.includes(step)) return NextResponse.json({ error: 'Step invalide' }, { status: 400 })
      await supabase.from('paie_periodes_lock').upsert({
        societe_id: sid, periode: `${periodeStr}-01`,
        [step]: true,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'societe_id,periode' })
      await supabase.from('paie_audit_log').insert({
        societe_id: sid, periode: `${periodeStr}-01`,
        action: step === 'virements_generes' ? 'export_banque' : step === 'mra_declare' ? 'export_mra' : 'comptabilisation',
        user_id: user.id, user_email: user.email,
        details: { step }
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
