/**
 * Helper d'écriture dans audit_log_pcm.
 *
 * Append-only. Best-effort : un échec d'audit ne doit jamais faire échouer
 * l'opération métier (mais est loggé en console).
 */

export type AuditAction =
  | 'apply_template'
  | 'activate_module'
  | 'create_compte'
  | 'update_compte'
  | 'archive_compte'
  | 'reclass_ecritures'
  | 'create_journal_entry'
  | 'lettrer_ecritures'
  | 'cloturer'
  | 'decloturer'
  | 'legacy_migration'

export type AuditEntityType = 'compte' | 'ecriture' | 'template' | 'module' | 'periode'
export type AuditActorType = 'user' | 'mcp_llm' | 'system' | 'migration'

export interface AuditEntry {
  societe_id: string
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string
  before_state?: unknown
  after_state?: unknown
  actor_id?: string | null
  actor_type?: AuditActorType
  reason?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(
  supabase: { from: (t: string) => any },
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log_pcm').insert({
      societe_id: entry.societe_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
      actor_id: entry.actor_id ?? null,
      actor_type: entry.actor_type ?? 'user',
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    })
    if (error) {
      console.warn(JSON.stringify({ event: 'audit_log_pcm_failed', action: entry.action, error: error.message }))
    }
  } catch (e) {
    console.warn(JSON.stringify({ event: 'audit_log_pcm_exception', action: entry.action, error: String(e) }))
  }
}

/** Insère plusieurs entrées d'audit en une fois (best-effort). */
export async function writeAuditLogBatch(
  supabase: { from: (t: string) => any },
  entries: AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return
  try {
    const rows = entries.map(entry => ({
      societe_id: entry.societe_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
      actor_id: entry.actor_id ?? null,
      actor_type: entry.actor_type ?? 'user',
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    }))
    const { error } = await supabase.from('audit_log_pcm').insert(rows)
    if (error) {
      console.warn(JSON.stringify({ event: 'audit_log_pcm_batch_failed', count: entries.length, error: error.message }))
    }
  } catch (e) {
    console.warn(JSON.stringify({ event: 'audit_log_pcm_batch_exception', error: String(e) }))
  }
}
