/**
 * lib/analytique/link.ts — Liaison objets métier ↔ dimension analytique.
 *
 * Get-or-create d'une section analytique pour un job (chantier) ou un ordre de
 * fabrication (production), et injection du tag `section_analytique_id` sur les
 * lignes d'écriture. Idempotent (une section par job / par OF, cf. index uniques
 * partiels de la mig 500). Côté serveur uniquement (client admin/serveur).
 */

type SupabaseClient = any

/** Section analytique d'un job (get-or-create). Retourne l'id ou null. */
export async function ensureSectionForJob(
  supabase: SupabaseClient,
  societeId: string,
  jobId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('sections_analytiques').select('id')
    .eq('societe_id', societeId).eq('job_id', jobId).maybeSingle()
  if (existing?.id) return existing.id

  const { data: job } = await supabase
    .from('jobs').select('code, libelle, statut, budget_montant, budget_heures')
    .eq('id', jobId).eq('societe_id', societeId).maybeSingle()
  if (!job) return null

  const statut = job.statut === 'cloture' || job.statut === 'annule' ? 'clos' : 'actif'
  const { data: created, error } = await supabase
    .from('sections_analytiques')
    .insert({
      societe_id: societeId, code: job.code, libelle: job.libelle, type: 'chantier',
      statut, budget_montant: job.budget_montant, budget_heures: job.budget_heures, job_id: jobId,
    })
    .select('id').single()
  if (error) {
    const { data: again } = await supabase
      .from('sections_analytiques').select('id')
      .eq('societe_id', societeId).eq('job_id', jobId).maybeSingle()
    return again?.id || null
  }
  return created.id
}

/** Section analytique d'un ordre de fabrication (get-or-create). */
export async function ensureSectionForOf(
  supabase: SupabaseClient,
  societeId: string,
  ofId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('sections_analytiques').select('id')
    .eq('societe_id', societeId).eq('ordre_fabrication_id', ofId).maybeSingle()
  if (existing?.id) return existing.id

  const { data: of } = await supabase
    .from('ordres_fabrication').select('numero_of, statut')
    .eq('id', ofId).eq('societe_id', societeId).maybeSingle()
  if (!of) return null

  const statut = of.statut === 'cloture' || of.statut === 'annule' ? 'clos' : 'actif'
  const { data: created, error } = await supabase
    .from('sections_analytiques')
    .insert({
      societe_id: societeId, code: of.numero_of, libelle: `Production ${of.numero_of}`,
      type: 'production', statut, ordre_fabrication_id: ofId,
    })
    .select('id').single()
  if (error) {
    const { data: again } = await supabase
      .from('sections_analytiques').select('id')
      .eq('societe_id', societeId).eq('ordre_fabrication_id', ofId).maybeSingle()
    return again?.id || null
  }
  return created.id
}

/** Ajoute `section_analytique_id` (et éventuellement les FK bespoke) sur des lignes. */
export function tagLines<T extends object>(
  lignes: T[],
  extra: { section_analytique_id?: string | null; ordre_fabrication_id?: string | null },
): (T & typeof extra)[] {
  return lignes.map((l) => ({ ...l, ...extra }))
}
