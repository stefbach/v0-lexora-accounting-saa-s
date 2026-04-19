import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptPii, decryptPii, maskPii, isEncrypted } from '@/lib/crypto/pii'

export interface EmployePiiData {
  nic_number: string | null
  npf_number: string | null
  bank_account: string | null
  iban: string | null
}

export interface EmployePiiMasked {
  nic_number_masked: string | null
  npf_number_masked: string | null
  bank_account_masked: string | null
  iban_masked: string | null
}

/** Lit et déchiffre les PII d'un employé. Utiliser uniquement côté server. */
export async function getEmployePii(
  supabase: SupabaseClient,
  employeId: string,
): Promise<EmployePiiData | null> {
  const { data, error } = await supabase
    .from('employes')
    .select('nic_number, nic_number_encrypted, npf_number, npf_number_encrypted, bank_account, bank_account_encrypted, iban, iban_encrypted')
    .eq('id', employeId)
    .maybeSingle()

  if (error || !data) return null

  return {
    nic_number: data.nic_number_encrypted ? decryptPii(data.nic_number_encrypted) : (data.nic_number ?? null),
    npf_number: data.npf_number_encrypted ? decryptPii(data.npf_number_encrypted) : (data.npf_number ?? null),
    bank_account: data.bank_account_encrypted ? decryptPii(data.bank_account_encrypted) : (data.bank_account ?? null),
    iban: data.iban_encrypted ? decryptPii(data.iban_encrypted) : (data.iban ?? null),
  }
}

/** Retourne une version masquée pour affichage UI (ex: listes, tableaux). */
export async function getEmployePiiMasked(
  supabase: SupabaseClient,
  employeId: string,
): Promise<EmployePiiMasked | null> {
  const pii = await getEmployePii(supabase, employeId)
  if (!pii) return null
  return {
    nic_number_masked: maskPii(pii.nic_number),
    npf_number_masked: maskPii(pii.npf_number),
    bank_account_masked: maskPii(pii.bank_account),
    iban_masked: maskPii(pii.iban),
  }
}

/** Upsert les PII pour un employé, chiffre avant persistence. */
export async function setEmployePii(
  supabase: SupabaseClient,
  employeId: string,
  data: Partial<EmployePiiData>,
): Promise<{ ok: boolean; error?: string }> {
  const updates: Record<string, string | null> = {}
  if ('nic_number' in data) {
    updates.nic_number_encrypted = encryptPii(data.nic_number)
    updates.nic_number = null  // vide la colonne clear
  }
  if ('npf_number' in data) {
    updates.npf_number_encrypted = encryptPii(data.npf_number)
    updates.npf_number = null
  }
  if ('bank_account' in data) {
    updates.bank_account_encrypted = encryptPii(data.bank_account)
    updates.bank_account = null
  }
  if ('iban' in data) {
    updates.iban_encrypted = encryptPii(data.iban)
    updates.iban = null
  }

  const { error } = await supabase.from('employes').update(updates).eq('id', employeId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export { isEncrypted, maskPii }
