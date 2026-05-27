// =============================================================================
// lib/crm/ingest.ts — Ingestion + déduplication + opt-out check
// =============================================================================

import { getAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CrmIngestPayload, CrmCompany, CrmContact } from './types'

export interface IngestResult {
  companies_created: number
  companies_updated: number
  contacts_created: number
  contacts_updated: number
  contacts_skipped_opt_out: number
  errors: string[]
}

/**
 * Vérifie si un identifiant (email/tel/linkedin) figure dans le registre opt-out.
 */
async function isOptedOut(
  admin: SupabaseClient,
  { email, telephone, linkedin_url }: { email?: string | null; telephone?: string | null; linkedin_url?: string | null },
): Promise<boolean> {
  if (!email && !telephone && !linkedin_url) return false
  const filters: string[] = []
  if (email) filters.push(`email.eq.${email.toLowerCase()}`)
  if (telephone) filters.push(`telephone.eq.${telephone}`)
  if (linkedin_url) filters.push(`linkedin_url.eq.${linkedin_url}`)
  const { data, error } = await admin
    .from('crm_opt_outs')
    .select('id')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle()
  if (error) return false
  return !!data
}

/**
 * Upsert une société (clé : brn > linkedin_url > nom+ville).
 * Retourne l'id, et un booléen "created".
 */
async function upsertCompany(
  admin: SupabaseClient,
  data: Partial<CrmCompany> & { nom: string },
  createdBy?: string | null,
): Promise<{ id: string; created: boolean }> {
  let existing: { id: string } | null = null

  if (data.brn) {
    const { data: row } = await admin
      .from('crm_companies')
      .select('id')
      .eq('brn', data.brn)
      .maybeSingle()
    existing = row
  }
  if (!existing && data.linkedin_url) {
    const { data: row } = await admin
      .from('crm_companies')
      .select('id')
      .eq('linkedin_url', data.linkedin_url)
      .maybeSingle()
    existing = row
  }
  if (!existing) {
    const { data: row } = await admin
      .from('crm_companies')
      .select('id')
      .ilike('nom', data.nom)
      .eq('pays', 'Mauritius')
      .limit(1)
      .maybeSingle()
    existing = row
  }

  if (existing) {
    const patch: Record<string, unknown> = {}
    // On enrichit avec les nouvelles données, sans écraser ce qui existe.
    for (const [k, v] of Object.entries(data)) {
      if (v == null || v === '') continue
      if (['id', 'created_at', 'updated_at', 'created_by'].includes(k)) continue
      patch[k] = v
    }
    if (Object.keys(patch).length > 0) {
      await admin.from('crm_companies').update(patch).eq('id', existing.id)
    }
    return { id: existing.id, created: false }
  }

  const insertRow = {
    ...data,
    pays: 'Mauritius',
    created_by: createdBy ?? null,
  }
  const { data: created, error } = await admin
    .from('crm_companies')
    .insert(insertRow)
    .select('id')
    .single()
  if (error || !created) {
    throw new Error(`upsertCompany failed: ${error?.message ?? 'no row'}`)
  }
  return { id: created.id, created: true }
}

async function upsertContact(
  admin: SupabaseClient,
  data: Partial<CrmContact>,
  companyId: string,
  createdBy?: string | null,
): Promise<{ id: string; created: boolean; skippedOptOut: boolean }> {
  // Opt-out check (avant tout)
  if (await isOptedOut(admin, {
    email: data.email,
    telephone: data.telephone,
    linkedin_url: data.linkedin_url,
  })) {
    return { id: '', created: false, skippedOptOut: true }
  }

  let existing: { id: string } | null = null

  if (data.linkedin_url) {
    const { data: row } = await admin
      .from('crm_contacts')
      .select('id')
      .eq('linkedin_url', data.linkedin_url)
      .maybeSingle()
    existing = row
  }
  if (!existing && data.email) {
    const { data: row } = await admin
      .from('crm_contacts')
      .select('id')
      .ilike('email', data.email)
      .maybeSingle()
    existing = row
  }
  if (!existing && data.prenom && data.nom) {
    const { data: row } = await admin
      .from('crm_contacts')
      .select('id')
      .eq('company_id', companyId)
      .ilike('prenom', data.prenom)
      .ilike('nom', data.nom)
      .maybeSingle()
    existing = row
  }

  if (existing) {
    const patch: Record<string, unknown> = { company_id: companyId }
    for (const [k, v] of Object.entries(data)) {
      if (v == null || v === '') continue
      if (['id', 'created_at', 'updated_at', 'created_by', 'opt_out', 'opt_out_at'].includes(k)) continue
      patch[k] = v
    }
    await admin.from('crm_contacts').update(patch).eq('id', existing.id)
    return { id: existing.id, created: false, skippedOptOut: false }
  }

  const { data: created, error } = await admin
    .from('crm_contacts')
    .insert({
      ...data,
      company_id: companyId,
      created_by: createdBy ?? null,
    })
    .select('id')
    .single()
  if (error || !created) {
    throw new Error(`upsertContact failed: ${error?.message ?? 'no row'}`)
  }
  return { id: created.id, created: true, skippedOptOut: false }
}

export async function ingestPayloads(
  payloads: CrmIngestPayload[],
  createdBy?: string | null,
): Promise<IngestResult> {
  const admin = getAdminClient()
  const result: IngestResult = {
    companies_created: 0,
    companies_updated: 0,
    contacts_created: 0,
    contacts_updated: 0,
    contacts_skipped_opt_out: 0,
    errors: [],
  }

  for (const payload of payloads) {
    try {
      const companyRes = await upsertCompany(
        admin,
        { ...payload.company, source: payload.source, raw_data: payload.raw ?? payload.company.raw_data },
        createdBy,
      )
      if (companyRes.created) result.companies_created++
      else result.companies_updated++

      // Activité d'ingestion (audit)
      await admin.from('crm_activities').insert({
        company_id: companyRes.id,
        type: 'ingest',
        sujet: `Ingestion depuis ${payload.source}`,
        metadata: { source: payload.source, raw_preview: JSON.stringify(payload.raw ?? {}).slice(0, 500) },
        created_by: createdBy ?? null,
      })

      for (const contact of payload.contacts ?? []) {
        try {
          const contactRes = await upsertContact(
            admin,
            { ...contact, source: payload.source },
            companyRes.id,
            createdBy,
          )
          if (contactRes.skippedOptOut) result.contacts_skipped_opt_out++
          else if (contactRes.created) result.contacts_created++
          else result.contacts_updated++
        } catch (err) {
          result.errors.push(`contact ${contact.email ?? contact.linkedin_url ?? '?'}: ${(err as Error).message}`)
        }
      }
    } catch (err) {
      result.errors.push(`company ${payload.company.nom}: ${(err as Error).message}`)
    }
  }

  return result
}
