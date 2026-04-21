/**
 * F3 — Helper canonique unique pour recalculer les soldes de congés d'un
 * employé pour une année donnée. Source de vérité : demandes_conges.
 *
 * Remplace les 2 copies historiques de recomputeSoldeConges() qui existaient
 * dans app/api/rh/conges/route.ts et .../[id]/route.ts, plus une troisième
 * variante (recomputeALForEmploye) dans .../collectif/route.ts.
 *
 * RÈGLES DE CALCUL (alignées avec l'ancien code pour rétrocompat) :
 *
 *   AL  → soldes_conges.{al_pris, al_impose_societe, al_impose_employe}
 *         al_pris inclut :
 *           - toutes les demandes approuvées avec type_conge='AL'
 *           - + les UL auto-basculés depuis un AL (motif contient
 *             `[Auto-bascule UL]` sans mention "Sick Leave")
 *         Split impose_par_societe vs impose_employe.
 *
 *   SL  → soldes_conges.sl_pris (somme simple des SL approuvés).
 *
 *   MAT → conges_employes row (type_conge='MAT') avec jours_pris.
 *         Default jours_droit = 112 (WRA 2019 §52, 16 semaines calendrier)
 *         à l'INSERT ; UPDATE préserve jours_droit existant.
 *
 *   PAT → conges_employes row (type_conge='PAT') avec jours_pris.
 *         Default jours_droit = 28 (WRA 2019 §53, 4 semaines).
 *
 *   Autres (UL pur, CAR, WI, COM, PH, ABS) → pas de solde tracké.
 *   (UL auto-bascule est compté DANS al_pris — c'est le cas spécial.)
 *
 * IDEMPOTENT par nature : SUM-based. Appels multiples = même résultat.
 * Ne throw JAMAIS : log warning en cas d'erreur DB.
 */
// Type large pour l'Admin Supabase client. Les autres routes RH utilisent
// `ReturnType<typeof getAdminClient>` localement ; comme ce helper est partagé
// par plusieurs routes avec des types inférés différents, on relâche à `any`
// pour éviter la friction d'instanciation générique Postgrest. Sûr car le
// helper ne fait que des lectures/UPSERTs typés côté SQL, pas de TS critique.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

interface DemandeConge {
  nb_jours: number | null
  impose_par_societe?: boolean | null
  motif?: string | null
}

/**
 * Recalcule tous les soldes de congés (AL, SL, MAT, PAT) pour un employé
 * et une année. Source : demandes_conges avec statut='approuve'.
 *
 * @param supabase   Admin Supabase client (service role, bypass RLS)
 * @param employeId  UUID employé
 * @param annee      Année de référence (ex: 2026)
 */
export async function recomputeSoldeCongesAll(
  supabase: AdminClient,
  employeId: string,
  annee: number = new Date().getFullYear(),
): Promise<void> {
  try {
    const yearStart = `${annee}-01-01`
    const yearEnd = `${annee}-12-31`

    // ── Fetch toutes les demandes approuvées de l'année (un seul query) ──
    const { data: rows } = await supabase
      .from('demandes_conges')
      .select('type_conge, nb_jours, impose_par_societe, motif')
      .eq('employe_id', employeId)
      .eq('statut', 'approuve')
      .gte('date_debut', yearStart)
      .lte('date_debut', yearEnd)

    const all = (rows || []) as Array<DemandeConge & { type_conge: string }>

    // ── AL : AL purs + UL auto-basculés depuis un AL ──
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
    const alPris = Math.round((alImposeSociete + alImposeEmploye) * 100) / 100
    alImposeSociete = Math.round(alImposeSociete * 100) / 100
    alImposeEmploye = Math.round(alImposeEmploye * 100) / 100

    // ── SL : somme simple ──
    const slPris = Math.round(
      all
        .filter(c => c.type_conge === 'SL')
        .reduce((s, c) => s + (Number(c.nb_jours) || 0), 0) * 100,
    ) / 100

    // ── UPSERT soldes_conges (AL + SL ensemble pour atomicité) ──
    const { data: existingSolde } = await supabase
      .from('soldes_conges')
      .select('id')
      .eq('employe_id', employeId)
      .eq('annee', annee)
      .maybeSingle()

    if (existingSolde) {
      await supabase.from('soldes_conges').update({
        al_pris: alPris,
        al_impose_societe: alImposeSociete,
        al_impose_employe: alImposeEmploye,
        sl_pris: slPris,
      }).eq('id', existingSolde.id)
    } else {
      // Premier INSERT : défauts WRA 2019 Maurice (AL=22, SL=15)
      await supabase.from('soldes_conges').insert({
        employe_id: employeId,
        annee,
        al_droit: 22,
        al_pris: alPris,
        al_impose_societe: alImposeSociete,
        al_impose_employe: alImposeEmploye,
        sl_droit: 15,
        sl_pris: slPris,
      })
    }

    // ── MAT + PAT dans conges_employes (per-type-per-year) ──
    for (const typeConge of ['MAT', 'PAT'] as const) {
      const jours = Math.round(
        all
          .filter(c => c.type_conge === typeConge)
          .reduce((s, c) => s + (Number(c.nb_jours) || 0), 0) * 100,
      ) / 100
      const defaultDroit = typeConge === 'MAT' ? 112 : 28

      const { data: existing } = await supabase
        .from('conges_employes')
        .select('id')
        .eq('employe_id', employeId)
        .eq('annee', annee)
        .eq('type_conge', typeConge)
        .maybeSingle()

      if (existing) {
        await supabase.from('conges_employes').update({
          jours_pris: jours,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else if (jours > 0) {
        // Ne pas créer une row vide si l'employé n'a jamais pris de MAT/PAT
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
      `[soldes-conges] recompute all for ${employeId} ${annee}: `
      + `AL=${alPris} SL=${slPris} (${alRows.length + all.filter(c => c.type_conge === 'SL').length} demandes)`,
    )
  } catch (err: any) {
    console.warn('[soldes-conges] recomputeSoldeCongesAll failed (non-blocking):', err?.message || err)
  }
}
