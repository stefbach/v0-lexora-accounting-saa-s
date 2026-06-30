import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { callClaude, callClaudeJSON } from '@/lib/claude'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasMessages, isNylasConfigured, type MailMessage } from '@/lib/nylas/client'
import { getAgentSettings, settingsPromptBlock } from '@/lib/nylas/agent-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Analysis = {
  message_id: string
  category: string
  priority: 'haute' | 'moyenne' | 'basse'
  needs_reply: boolean
  summary: string
  suggested_action: string
}

const who = (m: MailMessage) => m.from?.name || m.from?.email || '?'

/**
 * POST /api/nylas/agent/triage
 * Body: { societe_id?, scope?: 'recent'|'unread', limit?, force?: boolean }
 * Analyse les emails récents selon les consignes, met en cache, renvoie le
 * détail par message + un digest « attention du jour ».
 */
export async function POST(req: NextRequest) {
  if (!isNylasConfigured()) return NextResponse.json({ error: 'Nylas non configuré' }, { status: 503 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const b = await req.json().catch(() => ({})) as { societe_id?: string | null; account_id?: string | null; scope?: string; limit?: number; force?: boolean }
  const admin = getAdminClient()
  const account = await resolveNylasAccount(admin, user.id, b.societe_id, b.account_id)
  if (!account) return NextResponse.json({ error: 'Aucune boîte Nylas connectée' }, { status: 404 })

  const settings = await getAgentSettings(admin, user.id, b.societe_id)
  const limit = Math.min(b.limit || 50, 50)

  let messages: MailMessage[]
  try {
    const res = await listNylasMessages(account.grantId, { limit, unread: b.scope === 'unread' ? true : undefined })
    messages = res.data
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur lecture boîte' }, { status: 502 })
  }
  if (messages.length === 0) return NextResponse.json({ analyses: {}, digest: 'Boîte vide pour ce périmètre.', counts: { haute: 0, moyenne: 0, basse: 0, a_repondre: 0 } })

  // Cache existant
  const ids = messages.map((m) => m.id)
  const { data: cached } = await admin
    .from('nylas_message_analysis')
    .select('message_id, category, priority, needs_reply, summary, suggested_action')
    .eq('user_id', user.id)
    .in('message_id', ids)
  const cacheMap = new Map<string, Analysis>((cached || []).map((c: Analysis) => [c.message_id, c]))

  const toAnalyze = b.force ? messages : messages.filter((m) => !cacheMap.has(m.id))

  if (toAnalyze.length > 0) {
    const block = settingsPromptBlock(settings)
    const items = toAnalyze.map((m, i) => `[${i}] id=${m.id}\nDe: ${who(m)}\nObjet: ${m.subject}\nAperçu: ${(m.snippet || '').slice(0, 400)}`).join('\n\n')
    const system = `Tu es l'assistant de direction email d'une entreprise à Maurice. Tu tries la boîte de réception avec rigueur et sans inventer.

${block}

Pour CHAQUE email, renvoie un objet JSON avec :
- "id" : l'id exact fourni
- "category" : une catégorie (parmi les catégories autorisées si la liste est fournie, sinon la plus pertinente)
- "priority" : "haute" | "moyenne" | "basse" (haute = action urgente / direction concernée / échéance proche)
- "needs_reply" : true/false
- "summary" : 1 phrase factuelle (max 140 caractères)
- "suggested_action" : action concrète recommandée (max 100 caractères), "" si aucune

Réponds STRICTEMENT avec un objet JSON {"analyses": [ ... ]} couvrant tous les emails fournis, sans texte autour.`
    try {
      const out = await callClaudeJSON<{ analyses: Array<Partial<Analysis> & { id?: string }> }>(system, items, 4096)
      const byId = new Map(toAnalyze.map((m) => [m.id, m]))
      const rows: Array<Analysis & { user_id: string; analyzed_at: string }> = []
      for (const a of out.analyses || []) {
        if (!a.id || !byId.has(a.id)) continue
        const norm: Analysis = {
          message_id: a.id,
          category: String(a.category || 'Autre').slice(0, 60),
          priority: (['haute', 'moyenne', 'basse'].includes(String(a.priority)) ? a.priority : 'moyenne') as Analysis['priority'],
          needs_reply: !!a.needs_reply,
          summary: String(a.summary || '').slice(0, 200),
          suggested_action: String(a.suggested_action || '').slice(0, 120),
        }
        cacheMap.set(norm.message_id, norm)
        rows.push({ ...norm, user_id: user.id, analyzed_at: new Date().toISOString() })
      }
      if (rows.length) await admin.from('nylas_message_analysis').upsert(rows, { onConflict: 'user_id,message_id' })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur analyse IA' }, { status: 502 })
    }
  }

  // Agrégat + digest
  const analyses: Record<string, Analysis> = {}
  for (const m of messages) { const a = cacheMap.get(m.id); if (a) analyses[m.id] = a }
  const all = Object.values(analyses)
  const counts = {
    haute: all.filter((a) => a.priority === 'haute').length,
    moyenne: all.filter((a) => a.priority === 'moyenne').length,
    basse: all.filter((a) => a.priority === 'basse').length,
    a_repondre: all.filter((a) => a.needs_reply).length,
  }

  let digest = ''
  const urgents = messages
    .map((m) => ({ m, a: analyses[m.id] }))
    .filter((x) => x.a && (x.a.priority === 'haute' || x.a.needs_reply))
    .slice(0, 12)
  if (urgents.length > 0) {
    const lines = urgents.map((x) => `- [${x.a.priority}${x.a.needs_reply ? ', à répondre' : ''}] ${who(x.m)} — ${x.m.subject} : ${x.a.summary}`).join('\n')
    try {
      digest = await callClaude(
        `Tu es l'assistant de direction. Tu produis une synthèse d'attention du jour, ${settings.instructions ? 'en respectant les consignes de la direction' : 'concise et actionnable'}, en français, en 3 à 6 puces priorisées. Pas de blabla.`,
        `Voici les emails prioritaires/à répondre :\n${lines}\n\nProduis la synthèse d'attention du jour (qui demande quoi, quoi faire en premier).`,
        800,
      )
    } catch { digest = `${urgents.length} email(s) prioritaire(s) ou à répondre.` }
  } else {
    digest = 'Rien d\'urgent dans ce périmètre. Boîte sous contrôle. ✅'
  }

  return NextResponse.json({ analyses, digest, counts, analyzed: toAnalyze.length, total: messages.length })
}
