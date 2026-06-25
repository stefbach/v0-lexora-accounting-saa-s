/**
 * F3 + F6 — Helper canonique pour recalculer les soldes de congés d'un
 * employé pour une PÉRIODE de 12 mois (étape A.3 + A.4-bis, sprint
 * "Années par anniversaire").
 *
 * Signature :
 *   recomputeSoldeCongesAll(supabase, employeId, dateReference?)
 *
 *   dateReference = date ISO (YYYY-MM-DD). Par défaut = today.
 *   On calcule la période de 12 mois qui contient dateReference à partir
 *   de date_arrivee de l'employé, via les fonctions SQL mig 154/157 :
 *     get_conges_period_start(date_arrivee, dateReference)
 *     get_conges_period_end(date_arrivee, dateReference)
 *     get_conges_droits(date_arrivee, date_reference)
 *
 * RÈGLES MÉTIER (WRA 2019 Maurice ss.45 et 47, mig 157 accrual) :
 *   - Ancienneté < 6 mois   : al_droit = 0, sl_droit = 0
 *   - Ancienneté 6-11 mois  : +1/mois, max 6 (période d'acquisition)
 *   - Ancienneté ≥ 12 mois  : al_droit = 22, sl_droit = 15
 *   - Droits calculés à LEAST(dateReference, periode_fin) :
 *     - période courante → droits à la date de référence
 *     - période passée   → droits maxés à fin de période
 *
 *   - al_pris = SUM(AL approuvés + UL-from-AL) dans la période
 *   - sl_pris = SUM(SL approuvés) dans la période
 *
 * IDEMPOTENT (SUM-based). UPSERT sur (employe_id, periode_debut).
 * La colonne legacy `annee` = EXTRACT(YEAR FROM periode_debut) pour
 * rétrocompat étape B.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

interface DemandeConge {
  nb_jours: number | null
  impose_par_societe?: boolean | null
  motif?: string | null
}

export interface SoldeCongesPeriodResult {
  periode_debut: string        // ISO date
  periode_fin: string          // ISO date
  al_droit: number
  sl_droit: number
  al_pris: number
  sl_pris: number
  /** G2 — Vacation Leave (WRA S.47). */
  vl_droit: number
  vl_pris: number
  vl_cycle_debut: string | null
  vl_cycle_fin: string | null
  vl_eligibility_status:
    | 'eligible'
    | 'eligible_via_policy_societe'
    | 'en_acquisition'
    | 'hors_wra_basic_sup_50k'
    | 'migrant_worker_exclu'
    | 'no_date_arrivee'
}

/**
 * Recalcule les soldes AL/SL/MAT/PAT pour la PÉRIODE de 12 mois qui
 * contient dateReference (défaut = today) pour l'employé donné.
 *
 * Retourne les métadonnées de la période calculée, ou null si le helper
 * n'a pas pu aboutir (ex: employé sans date_arrivee, employé introuvable,
 * erreur DB). Ne throw jamais — log warning.
 */
export async function recomputeSoldeCongesAll(
  supabase: AdminClient,
  employeId: string,
  dateReference?: string,
): Promise<SoldeCongesPeriodResult | null> {
  try {
    // ── 1. Récupérer la date d'arrivée + infos VL (G2) + policy société (G3)
    const { data: emp } = await supabase
      .from('employes')
      .select('date_arrivee, salaire_base, is_migrant_worker, societe_id')
      .eq('id', employeId)
      .maybeSingle()

    if (!emp?.date_arrivee) {
      console.warn(`[soldes-conges] ${employeId} : pas de date_arrivee, recompute skippé`)
      return null
    }

    // G3 — Policy de la société pour les hors_wra (défaut applique_wra_etendu).
    let policyHorsWra: 'applique_wra_etendu' | 'contrat_uniquement' = 'applique_wra_etendu'
    if (emp.societe_id) {
      const { data: soc } = await supabase
        .from('societes')
        .select('policy_conges_hors_wra')
        .eq('id', emp.societe_id)
        .maybeSingle()
      if (soc?.policy_conges_hors_wra === 'contrat_uniquement') {
        policyHorsWra = 'contrat_uniquement'
      }
    }

    const dateRef = dateReference
      ? String(dateReference).slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    // ── 2. Calculer la période (JS, mirror mig 154) ──────────────────
    const { periode_debut, periode_fin } = computePeriodJs(emp.date_arrivee, dateRef)

    // ── 2-bis. Droits via get_conges_droits (mig 157, accrual 6-12m) ─
    //    On applique LEAST(dateRef, periode_fin) : droits à aujourd'hui
    //    pour une période courante, max accrue pour une période passée.
    const droitsRefDate = dateRef < periode_fin ? dateRef : periode_fin
    let alDroit = 0
    let slDroit = 0
    const { data: droitsRow, error: droitsErr } = await supabase
      .rpc('get_conges_droits', {
        date_arrivee: emp.date_arrivee,
        date_reference: droitsRefDate,
      })
      .maybeSingle()

    if (!droitsErr && droitsRow) {
      alDroit = Number((droitsRow as any).al_droit) || 0
      slDroit = Number((droitsRow as any).sl_droit) || 0
    } else {
      // Fallback JS si RPC indisponible (réplique logique mig 157)
      const droits = computeDroitsJs(emp.date_arrivee, droitsRefDate)
      alDroit = droits.al_droit
      slDroit = droits.sl_droit
    }

    // ── 3. Fetch demandes approuvées dans la période ─────────────────
    const { data: rows } = await supabase
      .from('demandes_conges')
      .select('type_conge, nb_jours, impose_par_societe, motif')
      .eq('employe_id', employeId)
      .eq('statut', 'approuve')
      .gte('date_debut', periode_debut)
      .lte('date_debut', periode_fin)

    const all = (rows || []) as Array<DemandeConge & { type_conge: string }>

    // ── 4. Calculs par type (AL + UL-from-AL, SL) ────────────────────
    const isBasculeFromAl = (c: DemandeConge): boolean =>
      typeof c.motif === 'string'
      && c.motif.includes('[Auto-bascule UL]')
      && !/Sick\s+Leave/i.test(c.motif)

    const alRows = all.filter(c =>
      c.type_conge === 'AL'
      || (c.type_conge === 'UL' && isBasculeFromAl(c)),
    )

    let alImposeSociete = 0
    let alImposeEmploye = 0
    for (const c of alRows) {
      const n = Number(c.nb_jours) || 0
      if (c.impose_par_societe === true) alImposeSociete += n
      else alImposeEmploye += n
    }
    const alPrisRaw = alImposeSociete + alImposeEmploye
    const slPrisRaw = all
      .filter(c => c.type_conge === 'SL')
      .reduce((s, c) => s + (Number(c.nb_jours) || 0), 0)

    const alPris = Math.round(alPrisRaw * 100) / 100
    const slPris = Math.round(slPrisRaw * 100) / 100
    alImposeSociete = Math.round(alImposeSociete * 100) / 100
    alImposeEmploye = Math.round(alImposeEmploye * 100) / 100

    // ── 5. Droits déjà calculés via get_conges_droits ─────────────────

    // ── 5-bis. G2 — Vacation Leave (WRA S.47, mig 161) ────────────────
    //    Calcul du droit VL + cycle courant. Les vl_pris sont comptés
    //    depuis demandes_conges type='VL' approuvées dans le cycle.
    let vlDroit = 0
    let vlCycleDebut: string | null = null
    let vlCycleFin: string | null = null
    let vlEligibilityStatus: SoldeCongesPeriodResult['vl_eligibility_status'] = 'no_date_arrivee'

    const { data: vlRow, error: vlErr } = await supabase
      .rpc('get_vacation_leave_droit', {
        p_date_arrivee: emp.date_arrivee,
        p_salaire_base: Number(emp.salaire_base) || 0,
        p_is_migrant: Boolean(emp.is_migrant_worker),
        p_date_reference: dateRef,
        p_policy_hors_wra: policyHorsWra,
      })
      .maybeSingle()

    if (!vlErr && vlRow) {
      vlDroit = Number((vlRow as any).vl_droit) || 0
      vlCycleDebut = (vlRow as any).vl_cycle_debut
        ? String((vlRow as any).vl_cycle_debut).slice(0, 10)
        : null
      vlCycleFin = (vlRow as any).vl_cycle_fin
        ? String((vlRow as any).vl_cycle_fin).slice(0, 10)
        : null
      vlEligibilityStatus = ((vlRow as any).eligibility_status as SoldeCongesPeriodResult['vl_eligibility_status'])
        || 'no_date_arrivee'
    } else {
      // Fallback JS si RPC indisponible
      const vl = computeVlDroitJs(
        emp.date_arrivee,
        Number(emp.salaire_base) || 0,
        Boolean(emp.is_migrant_worker),
        dateRef,
        policyHorsWra,
      )
      vlDroit = vl.vl_droit
      vlCycleDebut = vl.vl_cycle_debut
      vlCycleFin = vl.vl_cycle_fin
      vlEligibilityStatus = vl.eligibility_status
    }

    // vl_pris : somme des demandes type='VL' approuvées dans le cycle courant.
    let vlPris = 0
    if (vlCycleDebut && vlCycleFin) {
      const { data: vlRows } = await supabase
        .from('demandes_conges')
        .select('nb_jours')
        .eq('employe_id', employeId)
        .eq('type_conge', 'VL')
        .eq('statut', 'approuve')
        .gte('date_debut', vlCycleDebut)
        .lte('date_debut', vlCycleFin)
      vlPris = Math.round(
        (vlRows || []).reduce((s: number, r: any) => s + (Number(r.nb_jours) || 0), 0) * 100,
      ) / 100
    }

    // ── 6. UPSERT sur (employe_id, periode_debut) ────────────────────
    //    annee = EXTRACT(YEAR FROM periode_debut) pour rétrocompat.
    //    DEPRECATED (B.4) : à supprimer quand tous les consommateurs
    //    auront migré vers periode_debut/periode_fin.
    const annee = Number(periode_debut.slice(0, 4))

    // Check if row exists pour decider UPDATE vs INSERT
    const { data: existing } = await supabase
      .from('soldes_conges')
      .select('id')
      .eq('employe_id', employeId)
      .eq('periode_debut', periode_debut)
      .maybeSingle()

    if (existing) {
      await supabase.from('soldes_conges').update({
        periode_fin,
        annee,
        al_droit: alDroit,
        al_pris: alPris,
        al_impose_societe: alImposeSociete,
        al_impose_employe: alImposeEmploye,
        sl_droit: slDroit,
        sl_pris: slPris,
        // G2 — Vacation Leave
        vl_droit: vlDroit,
        vl_pris: vlPris,
        vl_cycle_debut: vlCycleDebut,
        vl_cycle_fin: vlCycleFin,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('soldes_conges').insert({
        employe_id: employeId,
        annee,
        periode_debut,
        periode_fin,
        al_droit: alDroit,
        al_pris: alPris,
        al_impose_societe: alImposeSociete,
        al_impose_employe: alImposeEmploye,
        sl_droit: slDroit,
        sl_pris: slPris,
        // G2 — Vacation Leave
        vl_droit: vlDroit,
        vl_pris: vlPris,
        vl_cycle_debut: vlCycleDebut,
        vl_cycle_fin: vlCycleFin,
      })
    }

    // ── 7. MAT + PAT (per-type, per-year dans conges_employes) ──────
    //    Note : on garde l'année civile pour MAT/PAT car la réglementation
    //    ne se base pas sur la période d'anniversaire pour ces congés.
    //    Source : demandes dans la période ci-dessus (simplifié).
    for (const typeConge of ['MAT', 'PAT'] as const) {
      const jours = Math.round(
        all
          .filter(c => c.type_conge === typeConge)
          .reduce((s, c) => s + (Number(c.nb_jours) || 0), 0) * 100,
      ) / 100
      const defaultDroit = typeConge === 'MAT' ? 112 : 28

      const { data: existingMatPat } = await supabase
        .from('conges_employes')
        .select('id')
        .eq('employe_id', employeId)
        .eq('annee', annee)
        .eq('type_conge', typeConge)
        .maybeSingle()

      if (existingMatPat) {
        await supabase.from('conges_employes').update({
          jours_pris: jours,
          updated_at: new Date().toISOString(),
        }).eq('id', existingMatPat.id)
      } else if (jours > 0) {
        await supabase.from('conges_employes').insert({
          employe_id: employeId,
          annee,
          type_conge: typeConge,
          jours_droit: defaultDroit,
          jours_pris: jours,
        })
      }
    }

    console.warn(
      `[soldes-conges] period ${periode_debut}→${periode_fin} `
      + `for ${employeId}: AL=${alPris}/${alDroit} SL=${slPris}/${slDroit}`,
    )

    return {
      periode_debut,
      periode_fin,
      al_droit: alDroit,
      sl_droit: slDroit,
      al_pris: alPris,
      sl_pris: slPris,
      vl_droit: vlDroit,
      vl_pris: vlPris,
      vl_cycle_debut: vlCycleDebut,
      vl_cycle_fin: vlCycleFin,
      vl_eligibility_status: vlEligibilityStatus,
    }
  } catch (err: any) {
    console.warn('[soldes-conges] recomputeSoldeCongesAll failed (non-blocking):', err?.message || err)
    return null
  }
}

function monthsBetween(dateArrivee: string, dateReference: string): number {
  const arr = new Date(String(dateArrivee).slice(0, 10) + 'T12:00:00')
  const ref = new Date(String(dateReference).slice(0, 10) + 'T12:00:00')
  let m = (ref.getFullYear() - arr.getFullYear()) * 12
    + (ref.getMonth() - arr.getMonth())
  if (ref.getDate() < arr.getDate()) m -= 1
  return m
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Fallback JS de la logique SQL (mig 154) — `get_conges_period_start/end`.
 */
function computePeriodJs(dateArrivee: string, dateReference: string): {
  periode_debut: string
  periode_fin: string
} {
  const arr = new Date(String(dateArrivee).slice(0, 10) + 'T12:00:00')
  const monthsElapsed = monthsBetween(dateArrivee, dateReference)
  const periodNumber = Math.max(0, Math.floor(monthsElapsed / 12))
  const debut = new Date(arr)
  debut.setMonth(debut.getMonth() + periodNumber * 12)
  const fin = new Date(debut)
  fin.setMonth(fin.getMonth() + 12)
  fin.setDate(fin.getDate() - 1)
  return { periode_debut: isoDate(debut), periode_fin: isoDate(fin) }
}

/**
 * Fallback JS de la logique SQL (mig 157) — `get_conges_droits`.
 * Règles WRA 2019 : <6m=0/0, 6-11m=+1/mois max 6, ≥12m=22/15.
 */
function computeDroitsJs(dateArrivee: string, dateReference: string): {
  al_droit: number
  sl_droit: number
} {
  if (dateReference < dateArrivee) return { al_droit: 0, sl_droit: 0 }
  const months = monthsBetween(dateArrivee, dateReference)
  if (months < 6) return { al_droit: 0, sl_droit: 0 }
  if (months < 12) {
    const accrued = Math.min(6, months - 5)
    return { al_droit: accrued, sl_droit: accrued }
  }
  return { al_droit: 22, sl_droit: 15 }
}

/**
 * Fallback JS de `get_vacation_leave_droit` (mig 161, WRA S.47).
 * Retourne 30j par cycle de 5 ans pour les workers (basic ≤ 50k, non migrant)
 * avec 5 ans+ d'ancienneté. Cycle de prise = années [5N, 5(N+1)[.
 */
function computeVlDroitJs(
  dateArrivee: string,
  salaireBase: number,
  isMigrant: boolean,
  dateReference: string,
  policyHorsWra: 'applique_wra_etendu' | 'contrat_uniquement' = 'applique_wra_etendu',
): {
  vl_droit: number
  vl_cycle_debut: string | null
  vl_cycle_fin: string | null
  eligibility_status: SoldeCongesPeriodResult['vl_eligibility_status']
} {
  if (!dateArrivee) return { vl_droit: 0, vl_cycle_debut: null, vl_cycle_fin: null, eligibility_status: 'no_date_arrivee' }
  const months = Math.max(0, monthsBetween(dateArrivee, dateReference))
  if (isMigrant) return { vl_droit: 0, vl_cycle_debut: null, vl_cycle_fin: null, eligibility_status: 'migrant_worker_exclu' }

  const isHorsWra = (salaireBase || 0) > 50000
  if (isHorsWra && policyHorsWra === 'contrat_uniquement') {
    return { vl_droit: 0, vl_cycle_debut: null, vl_cycle_fin: null, eligibility_status: 'hors_wra_basic_sup_50k' }
  }

  const arr = new Date(String(dateArrivee).slice(0, 10) + 'T12:00:00')
  if (months < 60) {
    const fin5y = new Date(arr)
    fin5y.setFullYear(fin5y.getFullYear() + 5)
    return { vl_droit: 0, vl_cycle_debut: null, vl_cycle_fin: isoDate(fin5y), eligibility_status: 'en_acquisition' }
  }

  const cycles = Math.floor(months / 60)
  const debut = new Date(arr)
  debut.setFullYear(debut.getFullYear() + cycles * 5)
  const fin = new Date(arr)
  fin.setFullYear(fin.getFullYear() + (cycles + 1) * 5)
  fin.setDate(fin.getDate() - 1)
  return {
    vl_droit: 30,
    vl_cycle_debut: isoDate(debut),
    vl_cycle_fin: isoDate(fin),
    eligibility_status: isHorsWra ? 'eligible_via_policy_societe' : 'eligible',
  }
}
