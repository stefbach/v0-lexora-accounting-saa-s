/**
 * Helper — provisions congés IAS 19 (préparation sprint G8, utile dès G5).
 *
 * Principe : comptablement, chaque jour d'AL acquis mais non pris
 * représente une dette de l'employeur envers le salarié. On provisionne :
 *   provision_employé = (al_acquis - al_pris) × (salaire_base / 22)
 *
 * Le total par société permet de passer une écriture de régul mensuelle
 * (dette sociale / charge de personnel) au compte 4282 par exemple.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface ProvisionEmploye {
  employe_id: string
  prenom: string | null
  nom: string | null
  al_acquis: number
  al_pris: number
  al_solde_acquis: number
  salaire_base: number
  provision_mur: number
}

export interface ProvisionTotaux {
  total_provision_mur: number
  nb_employes: number
  details_par_employe: ProvisionEmploye[]
  date_reference: string
  societe_id: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcule la provision totale pour une société (ou toutes si societeId null).
 *
 * Utilise la vue `v_soldes_conges_detail` qui expose déjà al_solde_acquis +
 * compensation_estimee_mur (calculés côté DB). On filtre sur les soldes
 * ACTIFS à dateRef (periode_debut <= dateRef <= periode_fin).
 */
export async function calculerProvisionConges(
  supabase: SupabaseLike,
  societeId: string | null = null,
  dateRef: string = new Date().toISOString().slice(0, 10),
): Promise<ProvisionTotaux> {
  let q = supabase
    .from('v_soldes_conges_detail')
    .select('employe_id, prenom, nom, al_acquis, al_pris, al_solde_acquis, salaire_base, compensation_estimee_mur, periode_debut, periode_fin')
    .lte('periode_debut', dateRef)
    .gte('periode_fin', dateRef)

  if (societeId) {
    // Filtre via jointure indirecte : on récupère les employe_id de la
    // société d'abord puis on les passe au .in().
    const { data: emps } = await supabase
      .from('employes')
      .select('id')
      .eq('societe_id', societeId)
      .is('date_depart', null)
    const ids = (emps || []).map((e: any) => e.id)
    if (ids.length === 0) {
      return {
        total_provision_mur: 0, nb_employes: 0,
        details_par_employe: [], date_reference: dateRef, societe_id: societeId,
      }
    }
    q = q.in('employe_id', ids)
  }

  const { data } = await q
  const rows = (data || []) as any[]

  const details: ProvisionEmploye[] = rows.map(r => ({
    employe_id: String(r.employe_id),
    prenom: r.prenom ?? null,
    nom: r.nom ?? null,
    al_acquis: Number(r.al_acquis) || 0,
    al_pris: Number(r.al_pris) || 0,
    al_solde_acquis: Number(r.al_solde_acquis) || 0,
    salaire_base: Number(r.salaire_base) || 0,
    provision_mur: round2(Number(r.compensation_estimee_mur) || 0),
  }))

  // Garde uniquement les provisions strictement positives dans le total
  // (si al_pris > al_acquis, l'écart négatif est dû à un congé pris
  // anticipé — pas une dette).
  const total = details.reduce((s, d) => s + Math.max(0, d.provision_mur), 0)

  return {
    total_provision_mur: round2(total),
    nb_employes: details.length,
    details_par_employe: details,
    date_reference: dateRef,
    societe_id: societeId,
  }
}
