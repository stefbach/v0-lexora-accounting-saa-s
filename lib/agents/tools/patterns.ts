import { createClient } from '@supabase/supabase-js'
import type { TransactionClass } from '@/lib/types/reconciliation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function computeFingerprint(tx: { libelle_banque: string; debit: number; credit: number; counterparty_iban?: string | null }): string {
  const label = (tx.libelle_banque || '')
    .toLowerCase()
    .replace(/[0-9]{4,}/g, '') // supprimer les références numériques longues
    .replace(/\d{2}\/\d{2}\/\d{4}/g, '') // supprimer les dates
    .replace(/\s+/g, ' ')
    .trim()
  const amount = Math.max(tx.debit || 0, tx.credit || 0)
  const bucket = amount < 100 ? 'S' : amount < 1000 ? 'M' : amount < 10000 ? 'L' : 'XL'
  const iban = (tx.counterparty_iban || '').substring(0, 8).toUpperCase()
  return `${label}|${bucket}|${iban}`
}

export async function getHistoricalPatterns(societeId: string, fingerprint: string) {
  const supabase = getSupabase()

  // Extraire le label du fingerprint pour le matching
  const labelPart = fingerprint.split('|')[0] || ''

  // 1. Patterns client (priorité)
  const { data: clientPatterns } = await supabase
    .from('client_learning_patterns')
    .select('*')
    .eq('societe_id', societeId)
    .or(`label_pattern.ilike.%${labelPart.substring(0, 20)}%,counterparty_iban.eq.${fingerprint.split('|')[2] || ''}`)
    .order('occurrence_count', { ascending: false })
    .limit(5)

  // 2. Patterns tenant (fallback)
  const { data: tenantPatterns } = await supabase
    .from('tenant_learning_patterns')
    .select('*')
    .order('occurrence_count', { ascending: false })

  // Filtrer les patterns tenant dont le label_pattern matche le libellé
  const matchedTenant = (tenantPatterns || []).filter(p => {
    if (!p.label_pattern) return false
    return labelPart.includes(p.label_pattern.toLowerCase())
  })

  return {
    client_matches: clientPatterns || [],
    tenant_matches: matchedTenant.slice(0, 5),
    fingerprint,
  }
}

export async function recordLearningPattern(
  scope: 'client' | 'tenant',
  pattern: {
    societeId: string
    patternType: 'iban_class' | 'label_class' | 'iban_third_party' | 'label_third_party'
    labelPattern?: string
    counterpartyIban?: string
    predictedClass: TransactionClass
    predictedThirdPartyName?: string
    predictedAccountCode?: string
  }
) {
  const supabase = getSupabase()

  if (scope === 'client') {
    const { error } = await supabase.from('client_learning_patterns').upsert({
      societe_id: pattern.societeId,
      pattern_type: pattern.patternType,
      label_pattern: pattern.labelPattern || null,
      counterparty_iban: pattern.counterpartyIban || null,
      counterparty_name_normalized: pattern.predictedThirdPartyName?.toLowerCase() || null,
      predicted_class: pattern.predictedClass,
      predicted_third_party_name: pattern.predictedThirdPartyName || null,
      predicted_account_code: pattern.predictedAccountCode || null,
      occurrence_count: 1,
      last_seen: new Date().toISOString(),
      source: 'agent_learned',
    }, {
      onConflict: 'societe_id,pattern_type,counterparty_iban,label_pattern',
    })

    if (error) {
      if (error.code === '23505') {
        try {
          await supabase
            .from('client_learning_patterns')
            .update({ occurrence_count: 2, last_seen: new Date().toISOString() })
            .eq('societe_id', pattern.societeId)
            .eq('pattern_type', pattern.patternType)
            .eq('label_pattern', pattern.labelPattern || '')
        } catch { /* best effort */ }
      }
    }
  } else {
    await supabase.from('tenant_learning_patterns').upsert({
      tenant_id: pattern.societeId,
      pattern_type: pattern.patternType,
      label_pattern: pattern.labelPattern || null,
      counterparty_iban: pattern.counterpartyIban || null,
      predicted_class: pattern.predictedClass,
      predicted_account_code: pattern.predictedAccountCode || null,
      occurrence_count: 1,
      last_seen: new Date().toISOString(),
      is_curated: false,
    }, {
      onConflict: 'tenant_id,pattern_type,counterparty_iban,label_pattern',
    })
  }

  return { recorded: true, scope }
}
