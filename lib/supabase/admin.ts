import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns a service-role Supabase client. RLS is bypassed — every caller
 * MUST enforce authorization itself (rôle check + assertSocieteAccess).
 *
 * Centralises what used to be a getAdminClient()/getAdmin() helper duplicated
 * in every API route.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
