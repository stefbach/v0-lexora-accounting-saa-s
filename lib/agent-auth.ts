/**
 * Auth helper pour les routes /api/agent/*.
 *
 * Deux modes d'authentification supportés :
 *
 * 1. Bearer secret (`LEXORA_AGENT_SECRET`) — appelants externes :
 *    n8n, cron, scripts, intégrations server-to-server.
 *    Le secret donne accès à TOUTES les sociétés ; les routes DOIVENT
 *    exiger un `societe_id` explicite dans le body.
 *
 * 2. Session navigateur (Supabase Auth) — utilisateur connecté qui clique
 *    "Lancer Lex Banque" depuis le front. Dans ce cas la route doit
 *    vérifier l'accès à la société via assertSocieteAccess(user.id, societe_id).
 *
 * Cette fonction ne fait que vérifier le bearer ; l'auth de session est
 * gérée par chaque route via createClient() + assertSocieteAccess.
 */
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import { assertSocieteAccess } from "@/lib/supabase/assert-societe-access"
import { getAdminClient } from "@/lib/supabase/admin"

export function verifyAgentSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || ""
  const secret = process.env.LEXORA_AGENT_SECRET
  if (!secret) return false
  const expected = `Bearer ${secret}`
  if (authHeader.length !== expected.length) return false
  // Comparaison constante pour éviter le timing attack
  let diff = 0
  for (let i = 0; i < authHeader.length; i++) {
    diff |= authHeader.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Authentifie une requête agent : accepte EITHER le bearer secret EITHER
 * une session Supabase navigateur (avec vérif d'accès à la société).
 *
 * Retourne :
 *  - { ok: true, mode: "bearer" }   → secret valide, accès total
 *  - { ok: true, mode: "session" }  → user authentifié + a accès à societe_id
 *  - { ok: false, error, status }   → 401 ou 403
 */
export async function authenticateAgentRequest(
  request: Request,
  societeId: string
): Promise<{ ok: true; mode: "bearer" | "session" } | { ok: false; error: string; status: number }> {
  // 1. Bearer secret prioritaire (server-to-server)
  if (verifyAgentSecret(request)) {
    return { ok: true, mode: "bearer" }
  }
  // 2. Sinon, session navigateur
  try {
    const supabaseAuth = await createServerSupabase()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return { ok: false, error: "Non autorisé", status: 401 }
    }
    // Vérifie que l'utilisateur a accès à la société
    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societeId)
    return { ok: true, mode: "session" }
  } catch (e: any) {
    const msg = e?.message || "Accès refusé"
    return { ok: false, error: msg, status: 403 }
  }
}
