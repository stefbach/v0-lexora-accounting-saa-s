/**
 * Auth helper pour les routes /api/agent/*.
 *
 * Ces routes sont conçues pour être appelées depuis l'extérieur (n8n, scripts,
 * intégrations tierces) sans session navigateur. Elles s'authentifient via un
 * secret partagé (`LEXORA_AGENT_SECRET`) passé en `Authorization: Bearer ...`.
 *
 * ⚠️ Le secret est partagé : chaque appelant peut potentiellement piloter
 * n'importe quelle société. Toutes les routes agent DOIVENT exiger un
 * `societe_id` explicite dans le body et ne JAMAIS deviner le tenant.
 */
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
