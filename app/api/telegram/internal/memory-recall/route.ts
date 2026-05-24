import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { memoryRecall } from '@/lib/telegram/memory'

/**
 * POST /api/telegram/internal/memory-recall
 *
 * Outil `memory.recall` exposé à l'agent Claude.
 * Retourne les top-K mémoires les plus pertinentes pour une query.
 *
 * Body :
 *   - query   : string (optionnel — si présent, embedding + similarité)
 *   - tags    : string[] (optionnel — filtre par tags)
 *   - top_k   : number 1-32 (défaut 8)
 *
 * Auth : withTelegramAuth → societe_id + user_id.
 */
export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'memory.recall', async (ctx, body) => {
    const query = body?.query ? String(body.query).slice(0, 2000) : null
    const tags = Array.isArray(body?.tags) ? body.tags.map((t: any) => String(t)) : null
    const top_k = Number(body?.top_k ?? 8)

    try {
      const memories = await memoryRecall({
        societe_id: ctx.societe_id,
        user_id: ctx.user_id,
        query,
        tags,
        top_k: Number.isFinite(top_k) ? top_k : 8,
      })
      return {
        result: {
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            content: m.content,
            memory_key: m.memory_key,
            tags: m.tags,
            importance: m.importance,
            similarity: Number(m.similarity?.toFixed(3) ?? 0),
            source: m.source,
          })),
        },
      }
    } catch (e: any) {
      return { result: null, status: 'error', error_msg: e.message }
    }
  })
}
