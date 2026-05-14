/**
 * Récurrences factures — moteur de génération.
 *
 * Modèle :
 *   • Un MODÈLE = facture avec recurrent=true et statut='modele'.
 *     Il n'est jamais comptabilisé.
 *   • À chaque période (mois/trimestre/année), on génère une vraie facture
 *     à partir du modèle : nouvelle id, nouvelle date_facture, statut
 *     'en_attente', recurrence_template_id = modele.id, recurrent=false.
 *   • derniere_generation_date sur le modèle = idempotence.
 *
 * Le cron quotidien appelle runRecurrencesQuotidiennes() qui :
 *   1. Liste les modèles éligibles
 *   2. Calcule la liste des dates à générer (rattrapage si gap)
 *   3. Génère chaque facture
 *   4. Met à jour derniere_generation_date
 */

type SupabaseClient = any

export type Frequence = 'mensuel' | 'trimestriel' | 'annuel'

export const FREQUENCE_MOIS: Record<Frequence, number> = {
  mensuel: 1,
  trimestriel: 3,
  annuel: 12,
}

export interface ModeleRecurrence {
  id: string
  societe_id: string
  numero_facture: string | null
  tiers: string | null
  recurrent_frequence: Frequence
  recurrence_jour_du_mois: number | null
  recurrence_date_debut: string | null
  recurrence_date_fin: string | null
  derniere_generation_date: string | null
}

export interface GenerationPlan {
  modele_id: string
  modele_numero: string | null
  tiers: string | null
  dates_a_generer: string[]   // YYYY-MM-DD
}

/**
 * Retourne la prochaine date de génération à partir d'une date de référence
 * et de la fréquence. Le résultat est ancré sur recurrence_jour_du_mois si
 * fourni, sinon sur le jour de la date de référence.
 */
export function prochaineDateGeneration(
  derniereGenerationOuDebut: string,
  frequence: Frequence,
  jourDuMois?: number | null,
): string {
  const d = new Date(derniereGenerationOuDebut + 'T00:00:00Z')
  const months = FREQUENCE_MOIS[frequence]
  d.setUTCMonth(d.getUTCMonth() + months)
  const jour = jourDuMois && jourDuMois >= 1 && jourDuMois <= 28
    ? jourDuMois
    : d.getUTCDate()
  d.setUTCDate(jour)
  return d.toISOString().slice(0, 10)
}

/**
 * Calcule la liste des dates de génération dues entre la dernière génération
 * (ou date_debut si jamais générée) et today inclus. Rattrape les périodes
 * manquantes si le cron a été interrompu.
 *
 * Limite de sécurité : max 24 itérations (2 ans en mensuel) pour éviter
 * une boucle infinie sur données corrompues.
 */
export function computeDatesAGenerer(
  modele: ModeleRecurrence,
  today: string,
): string[] {
  if (!modele.recurrence_date_debut) return []
  if (modele.recurrence_date_fin && today > modele.recurrence_date_fin) {
    // Toujours rattraper jusqu'à date_fin si dans le passé
    today = modele.recurrence_date_fin
  }
  const freq = modele.recurrent_frequence
  const jour = modele.recurrence_jour_du_mois ?? null

  const dates: string[] = []
  let curseur: string

  if (modele.derniere_generation_date) {
    curseur = prochaineDateGeneration(modele.derniere_generation_date, freq, jour)
  } else {
    // Première génération : on ancre sur date_debut
    const debut = new Date(modele.recurrence_date_debut + 'T00:00:00Z')
    if (jour && jour >= 1 && jour <= 28) debut.setUTCDate(jour)
    curseur = debut.toISOString().slice(0, 10)
  }

  let safety = 24
  while (curseur <= today && safety > 0) {
    if (modele.recurrence_date_fin && curseur > modele.recurrence_date_fin) break
    if (curseur >= modele.recurrence_date_debut) {
      dates.push(curseur)
    }
    curseur = prochaineDateGeneration(curseur, freq, jour)
    safety -= 1
  }
  return dates
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Liste les modèles éligibles et calcule pour chacun les dates à générer.
 */
export async function findGenerationsAFaire(
  supabase: SupabaseClient,
  options: { societe_id?: string | null; today?: string } = {},
): Promise<GenerationPlan[]> {
  const today = options.today ?? isoToday()

  let query = supabase
    .from('factures')
    .select('id, societe_id, numero_facture, tiers, recurrent_frequence, recurrence_jour_du_mois, recurrence_date_debut, recurrence_date_fin, derniere_generation_date')
    .eq('recurrent', true)
    .eq('statut', 'modele')
  if (options.societe_id) query = query.eq('societe_id', options.societe_id)

  const { data: modeles, error } = await query
  if (error || !modeles) return []

  const plans: GenerationPlan[] = []
  for (const m of modeles) {
    const dates = computeDatesAGenerer(m as ModeleRecurrence, today)
    if (dates.length > 0) {
      plans.push({
        modele_id: m.id,
        modele_numero: m.numero_facture,
        tiers: m.tiers,
        dates_a_generer: dates,
      })
    }
  }
  return plans
}

/**
 * Génère une facture à partir d'un modèle pour une date donnée.
 * - Clone toutes les colonnes pertinentes (lignes, montants, tiers…)
 * - Réinitialise : id, statut='en_attente', recurrent=false,
 *   recurrence_template_id = modele.id
 * - Génère un numero_facture : <modele_numero>-<YYYYMM>
 *   (l'utilisateur peut le modifier manuellement par la suite)
 * - date_echeance = date_facture + conditions_paiement (ou 30j)
 *
 * Pas d'écriture comptable ici — laissée au cron ou à l'utilisateur,
 * qui peut décider de finaliser (statut 'paye') plus tard.
 */
export async function genererFactureDepuisModele(
  supabase: SupabaseClient,
  modele_id: string,
  date_generation: string,
): Promise<{ ok: boolean; facture_id?: string; error?: string }> {
  // Recharge le modèle complet
  const { data: modele, error } = await supabase
    .from('factures')
    .select('*')
    .eq('id', modele_id)
    .maybeSingle()
  if (error || !modele) return { ok: false, error: 'Modèle introuvable' }
  if (!modele.recurrent || modele.statut !== 'modele') {
    return { ok: false, error: "Cette facture n'est pas un modèle récurrent" }
  }

  // Idempotence : vérifie qu'on n'a pas déjà généré pour cette date
  const { data: dejaExistant } = await supabase
    .from('factures')
    .select('id')
    .eq('recurrence_template_id', modele_id)
    .eq('date_facture', date_generation)
    .limit(1)
  if (dejaExistant && dejaExistant.length > 0) {
    return { ok: true, facture_id: dejaExistant[0].id }
  }

  const periode = date_generation.slice(0, 7).replace('-', '') // YYYYMM
  const numero = modele.numero_facture
    ? `${modele.numero_facture}-${periode}`
    : `REC-${periode}-${modele.id.slice(0, 6)}`

  const cp = Number(modele.conditions_paiement) || 30
  const echeance = addDays(date_generation, cp)

  // Champs hérités du modèle (whitelist explicite pour rester safe)
  const insertRow: Record<string, any> = {
    societe_id: modele.societe_id,
    dossier_id: modele.dossier_id,
    numero_facture: numero,
    type_facture: modele.type_facture,
    type_document: modele.type_document || 'facture',
    tiers: modele.tiers,
    description: modele.description,
    date_facture: date_generation,
    date_echeance: echeance,
    devise: modele.devise,
    taux_change: modele.taux_change,
    montant_ht: modele.montant_ht,
    montant_tva: modele.montant_tva,
    montant_ttc: modele.montant_ttc,
    taux_tva: modele.taux_tva,
    montant_mur: modele.montant_mur,
    statut: 'en_attente',
    notes: modele.notes,
    notes_internes: modele.notes_internes,
    termes: modele.termes,
    template: modele.template,
    client_offshore: modele.client_offshore,
    remise_pct: modele.remise_pct,
    remise_montant: modele.remise_montant,
    logo_url: modele.logo_url,
    mode_paiement: modele.mode_paiement,
    contact_id: modele.contact_id,
    lignes: modele.lignes,
    conditions_paiement: cp,
    recurrent: false,
    recurrence_template_id: modele.id,
    solde_non_paye: modele.montant_mur || modele.montant_ttc || 0,
  }

  const { data: created, error: insErr } = await supabase
    .from('factures')
    .insert(insertRow)
    .select('id')
    .single()
  if (insErr || !created) {
    return { ok: false, error: insErr?.message || 'Insert facture' }
  }

  // Met à jour la dernière génération du modèle
  await supabase
    .from('factures')
    .update({ derniere_generation_date: date_generation })
    .eq('id', modele_id)

  return { ok: true, facture_id: created.id }
}

export interface RunOptions {
  societe_id?: string | null
  dry_run?: boolean
  today?: string
}

export interface RunSummary {
  modeles_traites: number
  factures_creees: number
  erreurs: number
  details: Array<{
    modele_id: string
    modele_numero: string | null
    dates: string[]
    crees: string[]
    erreurs: string[]
  }>
}

export async function runRecurrencesQuotidiennes(
  supabase: SupabaseClient,
  options: RunOptions = {},
): Promise<RunSummary> {
  const plans = await findGenerationsAFaire(supabase, {
    societe_id: options.societe_id,
    today: options.today,
  })
  const summary: RunSummary = {
    modeles_traites: plans.length,
    factures_creees: 0,
    erreurs: 0,
    details: [],
  }

  for (const plan of plans) {
    const detail = {
      modele_id: plan.modele_id,
      modele_numero: plan.modele_numero,
      dates: plan.dates_a_generer,
      crees: [] as string[],
      erreurs: [] as string[],
    }
    for (const date of plan.dates_a_generer) {
      if (options.dry_run === true) {
        detail.crees.push(`(dry-run) ${date}`)
        continue
      }
      const r = await genererFactureDepuisModele(supabase, plan.modele_id, date)
      if (r.ok && r.facture_id) {
        detail.crees.push(r.facture_id)
        summary.factures_creees += 1
      } else {
        detail.erreurs.push(`${date}: ${r.error}`)
        summary.erreurs += 1
      }
    }
    summary.details.push(detail)
  }
  return summary
}
