/**
 * F3 + F6 — Helper canonique pour recalculer les soldes de congés d'un
 * employé pour une PÉRIODE de 12 mois (étape A.3, sprint "Années par
 * anniversaire").
 *
 * AVANT (F3, année civile) :
 *   recomputeSoldeCongesAll(supabase, employeId, annee?)
 *
 * APRÈS (F6 / A.3, période 12 mois basée sur date_arrivee) :
 *   recomputeSoldeCongesAll(supabase, employeId, dateReference?)
 *
 *   dateReference = date ISO (YYYY-MM-DD). Par défaut = today.
 *   On calcule la période de 12 mois qui contient dateReference à partir
 *   de date_arrivee de l'employé, via les fonctions SQL mig 154 :
 *     get_conges_period_start(date_arrivee, dateReference)
 *     get_conges_period_end(date_arrivee, dateReference)
 *     is_eligible_conges(date_arrivee, dateReference)
 *
 * RÈGLES MÉTIER (WRA 2019 Maurice ss.45 et 47) :
 *   - Si l'employé n'est pas encore éligible (< 12 mois d'emploi) :
 *     al_droit = 0, sl_droit = 0 (période d'acquisition)
 *   - Sinon :
 *     al_droit = 22, sl_droit = 15
 *     al_pris  = SUM(AL approuvés + UL-from-AL) dans la période
 *     sl_pris  = SUM(SL approuvés) dans la période
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
  eligible: boolean
  al_pris: number
  sl_pris: number
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
    // ── 1. Récupérer la date d'arrivée ───────────────────────────────
    const { data: emp } = await supabase
      .from('employes')
      .select('date_arrivee')
      .eq('id', employeId)
      .maybeSingle()

    if (!emp?.date_arrivee) {
      console.warn(`[soldes-conges] ${employeId} : pas de date_arrivee, recompute skippé`)
      return null
    }

    const dateRef = dateReference
      ? String(dateReference).slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    // ── 2. Calculer la période via les fonctions SQL (mig 154) ───────
    //    On passe par une seule query SELECT avec les 3 helpers.
    const { data: periodRow, error: perErr } = await supabase.rpc('get_conges_period_info', {
      p_date_arrivee: emp.date_arrivee,
      p_date_reference: dateRef,
    }).maybeSingle()

    let periode_debut: string
    let periode_fin: string
    let eligible: boolean

    if (perErr || !periodRow) {
      // Fallback : calcul direct JS si la RPC n'existe pas encore (= pas
      // installée). On reproduit la logique des fonctions SQL.
      const result = computePeriodJs(emp.date_arrivee, dateRef)
      periode_debut = result.periode_debut
      periode_fin = result.periode_fin
      eligible = result.eligible
    } else {
      periode_debut = String((periodRow as any).periode_debut).slice(0, 10)
      periode_fin = String((periodRow as any).periode_fin).slice(0, 10)
      eligible = Boolean((periodRow as any).eligible)
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

    // ── 5. Droits selon éligibilité ──────────────────────────────────
    const alDroit = eligible ? 22 : 0
    const slDroit = eligible ? 15 : 0

    // ── 6. UPSERT sur (employe_id, periode_debut) ────────────────────
    //    annee = EXTRACT(YEAR FROM periode_debut) pour rétrocompat.
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

    console.log(
      `[soldes-conges] period ${periode_debut}→${periode_fin} `
      + `(eligible=${eligible}) for ${employeId}: AL=${alPris}/${alDroit} SL=${slPris}/${slDroit}`,
    )

    return { periode_debut, periode_fin, eligible, al_pris: alPris, sl_pris: slPris }
  } catch (err: any) {
    console.warn('[soldes-conges] recomputeSoldeCongesAll failed (non-blocking):', err?.message || err)
    return null
  }
}

/**
 * Fallback JS de la logique SQL (mig 154) utilisé si la RPC n'est pas
 * accessible. Reproduit exactement `get_conges_period_start/end` +
 * `is_eligible_conges`.
 */
function computePeriodJs(dateArrivee: string, dateReference: string): {
  periode_debut: string
  periode_fin: string
  eligible: boolean
} {
  const arr = new Date(String(dateArrivee).slice(0, 10) + 'T12:00:00')
  const ref = new Date(String(dateReference).slice(0, 10) + 'T12:00:00')

  let monthsElapsed = (ref.getFullYear() - arr.getFullYear()) * 12
    + (ref.getMonth() - arr.getMonth())
  if (ref.getDate() < arr.getDate()) monthsElapsed -= 1

  const periodNumber = Math.max(0, Math.floor(monthsElapsed / 12))
  const debut = new Date(arr)
  debut.setMonth(debut.getMonth() + periodNumber * 12)
  const fin = new Date(debut)
  fin.setMonth(fin.getMonth() + 12)
  fin.setDate(fin.getDate() - 1)

  const eligible = monthsElapsed >= 12

  const iso = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  return { periode_debut: iso(debut), periode_fin: iso(fin), eligible }
}
