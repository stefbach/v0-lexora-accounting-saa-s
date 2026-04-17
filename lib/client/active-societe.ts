import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getAccessibleSocieteIds,
  SocieteAccessError,
} from "@/lib/supabase/assert-societe-access"

/**
 * Name of the cookie where the client-side Provider persists the active
 * société id. Must stay in sync with ACTIVE_SOCIETE_COOKIE in
 * components/client/SocieteActiveProvider.tsx.
 */
export const ACTIVE_SOCIETE_COOKIE = "active_societe_id"

/**
 * Reads the active société id from the incoming request cookies. Does NOT
 * validate it — the cookie may be stale if the user lost access. Use
 * assertActiveSocieteInCookie when you need a verified id.
 */
export async function getActiveSocieteIdFromCookies(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(ACTIVE_SOCIETE_COOKIE)?.value
  return value && value.length > 0 ? value : null
}

/**
 * Reads the active société id from cookies AND verifies the user can still
 * access it (via getAccessibleSocieteIds). Returns the id on success.
 * Throws SocieteAccessError if the cookie is missing or points to a société
 * the user no longer owns.
 *
 * Admins / super_admins are given the cookie id as-is (they can access
 * everything, so if a comptable / admin session reaches a /client page via
 * the layout, the cookie value is accepted).
 */
export async function assertActiveSocieteInCookie(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const id = await getActiveSocieteIdFromCookies()
  if (!id) throw new SocieteAccessError("Aucune société active sélectionnée")

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  const role = profile?.role ?? ""
  if (["admin", "super_admin"].includes(role)) return id

  const accessible = await getAccessibleSocieteIds(admin, userId)
  if (!accessible.includes(id)) {
    throw new SocieteAccessError()
  }
  return id
}
