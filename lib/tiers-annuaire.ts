// Tiers annuaire helper — lookup and update supplier/client directory
// Used by OCR pipeline (upload route) and manual correction (fournisseurs page)

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TiersAnnuaireRecord {
  id: string
  nom: string
  nom_variants: string[] | null
  est_offshore: boolean
  reverse_charge: boolean
  type_tiers: 'client' | 'fournisseur' | 'both'
  verifie: boolean
  confiance: number
  nb_utilisations: number
  source: string
}

/**
 * Look up a tiers by name (exact match on nom or in nom_variants).
 * Case-insensitive. Returns null if not found.
 */
export async function findTiersInAnnuaire(
  supabase: SupabaseClient,
  nom: string
): Promise<TiersAnnuaireRecord | null> {
  if (!nom || !nom.trim()) return null
  const normalized = nom.trim()
  const lower = normalized.toLowerCase()

  // 1. Exact match on nom (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('tiers_annuaire')
    .select('*')
    .ilike('nom', normalized)
    .limit(1)
    .maybeSingle()
  if (exactMatch) return exactMatch as TiersAnnuaireRecord

  // 2. Match in nom_variants array (any element case-insensitive)
  // Postgres array contains requires exact case, so fetch candidates and filter in JS
  const { data: variantCandidates } = await supabase
    .from('tiers_annuaire')
    .select('*')
    .not('nom_variants', 'is', null)
  if (variantCandidates) {
    for (const c of variantCandidates) {
      const variants = (c as any).nom_variants as string[] | null
      if (variants && variants.some(v => v.toLowerCase() === lower)) {
        return c as TiersAnnuaireRecord
      }
    }
  }

  return null
}

/**
 * Increment the usage counter and update last_used_at for an existing tiers.
 * Fire-and-forget — errors are logged but don't throw.
 */
export async function incrementTiersUsage(
  supabase: SupabaseClient,
  tiersId: string
): Promise<void> {
  try {
    const { data: current } = await supabase
      .from('tiers_annuaire')
      .select('nb_utilisations')
      .eq('id', tiersId)
      .single()
    const newCount = (Number(current?.nb_utilisations) || 0) + 1
    await supabase
      .from('tiers_annuaire')
      .update({
        nb_utilisations: newCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', tiersId)
  } catch (e) {
    console.warn('[tiers-annuaire] increment failed:', e)
  }
}

/**
 * Create a new tiers_annuaire row from OCR extraction.
 * Used when OCR detects a supplier/client not in the directory.
 * Defaults: source='ocr_auto', verifie=false, est_offshore=false.
 */
export async function createTiersFromOcr(
  supabase: SupabaseClient,
  params: {
    nom: string
    type_tiers?: 'client' | 'fournisseur' | 'both'
    confiance?: number
    brn?: string | null
  }
): Promise<TiersAnnuaireRecord | null> {
  const nom = (params.nom || '').trim()
  if (!nom) return null

  try {
    const { data, error } = await supabase
      .from('tiers_annuaire')
      .insert({
        nom,
        type_tiers: params.type_tiers || 'both',
        brn: params.brn || null,
        est_offshore: false,
        reverse_charge: false,
        source: 'ocr_auto',
        verifie: false,
        confiance: params.confiance ?? 50,
        nb_utilisations: 1,
        last_used_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) {
      // Duplicate (race condition) — fetch existing
      if (error.code === '23505') {
        const existing = await findTiersInAnnuaire(supabase, nom)
        if (existing) return existing
      }
      console.warn('[tiers-annuaire] create failed:', error.message)
      return null
    }
    return data as TiersAnnuaireRecord
  } catch (e) {
    console.warn('[tiers-annuaire] create exception:', e)
    return null
  }
}

/**
 * Manually upsert a tiers with human-verified offshore flag.
 * Used by the fournisseurs page toggle.
 */
export async function upsertTiersManual(
  supabase: SupabaseClient,
  params: {
    nom: string
    est_offshore: boolean
    type_tiers?: 'client' | 'fournisseur' | 'both'
    verified_by: string
  }
): Promise<TiersAnnuaireRecord | null> {
  const nom = (params.nom || '').trim()
  if (!nom) return null

  const existing = await findTiersInAnnuaire(supabase, nom)
  if (existing) {
    const { data, error } = await supabase
      .from('tiers_annuaire')
      .update({
        est_offshore: params.est_offshore,
        reverse_charge: params.est_offshore, // assume reverse charge correlates with offshore
        source: 'manuel',
        verifie: true,
        verified_by: params.verified_by,
        confiance: 100,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      console.warn('[tiers-annuaire] update failed:', error.message)
      return null
    }
    return data as TiersAnnuaireRecord
  }

  // Insert new
  const { data, error } = await supabase
    .from('tiers_annuaire')
    .insert({
      nom,
      type_tiers: params.type_tiers || 'fournisseur',
      est_offshore: params.est_offshore,
      reverse_charge: params.est_offshore,
      source: 'manuel',
      verifie: true,
      verified_by: params.verified_by,
      confiance: 100,
      nb_utilisations: 0,
    })
    .select()
    .single()
  if (error) {
    console.warn('[tiers-annuaire] insert failed:', error.message)
    return null
  }
  return data as TiersAnnuaireRecord
}
