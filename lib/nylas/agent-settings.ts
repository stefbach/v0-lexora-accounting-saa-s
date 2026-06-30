/**
 * Consignes de l'agent IA email : lecture/écriture par utilisateur (et société
 * optionnelle). Ces consignes pilotent l'analyse, le classement et la rédaction.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentSettings = {
  instructions: string
  categories: string[]
  signature: string
  tone: string
  auto_triage: boolean
}

export const DEFAULT_SETTINGS: AgentSettings = {
  instructions: '',
  categories: [],
  signature: '',
  tone: 'professionnel et courtois',
  auto_triage: false,
}

export async function getAgentSettings(
  admin: SupabaseClient,
  userId: string,
  societeId?: string | null,
): Promise<AgentSettings> {
  // On cherche d'abord la consigne spécifique à la société, sinon la globale.
  const { data } = await admin
    .from('nylas_agent_settings')
    .select('instructions, categories, signature, tone, auto_triage, societe_id')
    .eq('user_id', userId)
  const rows = (data || []) as Array<AgentSettings & { societe_id: string | null }>
  const chosen = (societeId && rows.find((r) => r.societe_id === societeId)) || rows.find((r) => !r.societe_id) || rows[0]
  if (!chosen) return { ...DEFAULT_SETTINGS }
  return {
    instructions: chosen.instructions || '',
    categories: chosen.categories || [],
    signature: chosen.signature || '',
    tone: chosen.tone || DEFAULT_SETTINGS.tone,
    auto_triage: !!chosen.auto_triage,
  }
}

export async function upsertAgentSettings(
  admin: SupabaseClient,
  userId: string,
  societeId: string | null,
  patch: Partial<AgentSettings>,
): Promise<void> {
  const row = {
    user_id: userId,
    societe_id: societeId,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  await admin.from('nylas_agent_settings').upsert(row, { onConflict: 'user_id,societe_id' })
}

/** Fragment de prompt commun injectant les consignes utilisateur. */
export function settingsPromptBlock(s: AgentSettings): string {
  const cats = s.categories.length ? s.categories.join(', ') : '(à toi de proposer une catégorie pertinente)'
  return [
    s.instructions ? `CONSIGNES DE LA DIRECTION (à respecter en priorité absolue) :\n"""\n${s.instructions.trim()}\n"""` : '',
    `Catégories de classement autorisées : ${cats}.`,
  ].filter(Boolean).join('\n\n')
}
