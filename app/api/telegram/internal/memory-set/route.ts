import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { memorySet } from '@/lib/telegram/memory'

/**
 * POST /api/telegram/internal/memory-set
 *
 * Outil `memory.set` exposé à l'agent Claude (via n8n).
 * Rôle minimum : employe (chaque user gère sa propre mémoire).
 *
 * Body :
 *   - content     : string (obligatoire, contenu à mémoriser)
 *   - memory_key  : string (optionnel, clé courte pour upsert ; ex "preferred_locale")
 *   - tags        : string[] (optionnel)
 *   - importance  : number 0-100 (défaut 50)
 *   - scope       : 'user' | 'societe' (défaut 'user' ; 'societe' = mémoire commune)
 *   - expires_at  : ISO timestamp (optionnel ; null = permanent)
 *
 * Auth : withTelegramAuth → résout societe_id + user_id du chat_id.
 */
export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'memory.set', async (ctx, body) => {
    const content = String(body?.content || '').trim()
    if (!content) {
      return { result: null, status: 'error', error_msg: 'content requis' }
    }
    if (content.length > 4000) {
      return { result: null, status: 'error', error_msg: 'content trop long (max 4000 chars)' }
    }

    const scope = body?.scope === 'societe' ? 'societe' : 'user'
    const importance = Number(body?.importance ?? 50)
    const tags = Array.isArray(body?.tags) ? body.tags.map((t: any) => String(t)).slice(0, 16) : []
    const memory_key = body?.memory_key ? String(body.memory_key).slice(0, 80) : null
    const expires_at = body?.expires_at ? String(body.expires_at) : null

    try {
      const r = await memorySet({
        societe_id: ctx.societe_id,
        user_id: scope === 'societe' ? null : ctx.user_id,
        memory_key,
        content,
        tags,
        importance: Number.isFinite(importance) ? Math.min(Math.max(importance, 0), 100) : 50,
        source: 'agent',
        expires_at,
        metadata: { chat_id: ctx.chat_id },
      })
      return { result: { id: r.id, updated: r.updated, scope, memory_key } }
    } catch (e: any) {
      return { result: null, status: 'error', error_msg: e.message }
    }
  })
}
