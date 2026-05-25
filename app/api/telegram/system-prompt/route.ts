import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { buildSystemPrompt } from '@/lib/telegram/knowledge-base'

/**
 * GET /api/telegram/system-prompt?locale=fr|en
 *   &first_name=...&role=...&role_label=...&societe_name=...&capabilities=cap1,cap2,...
 *
 * Sert le system prompt complet à jour pour le bot Telegram + INTERPOLE les
 * variables (first_name, role, societe_name, etc.) avant retour.
 *
 * Pourquoi : la KB contient des placeholders {{ $json.body.X }} qui étaient
 * résolus par n8n quand le prompt était statique dans le node. Maintenant que
 * le prompt est fetché à l'extérieur, n8n ne ré-évalue plus ces expressions
 * → Claude les voit littéralement et les recopie dans ses réponses.
 *
 * Solution : on accepte les valeurs en query params et on substitue les
 * placeholders côté Lexora avant de servir.
 *
 * Auth : header X-Internal-Token.
 */
export const dynamic = 'force-dynamic'

function fillTemplate(prompt: string, ctx: Record<string, string>): string {
  // Capture {{ $json.body.X }} ou {{ $json.body.X || 'default' }}
  // ou {{ ($json.body.foo || []).join(', ') }} pour les arrays
  return prompt.replace(
    /\{\{\s*\(?\$json\.body\.(\w+)\)?\s*(?:\|\|\s*\[[^\]]*\])?\s*(?:\.\s*join\s*\([^)]*\))?\s*\}\}/g,
    (_match, key: string) => ctx[key] ?? '',
  ).replace(
    // Reste : capture les {{ $json.body.X || 'default' }}
    /\{\{\s*\$json\.body\.(\w+)\s*\|\|\s*'([^']*)'\s*\}\}/g,
    (_match, key: string, fallback: string) => ctx[key] ?? fallback ?? '',
  )
}

export async function GET(req: NextRequest) {
  const expected = process.env.INTERNAL_API_TOKEN
  const token = req.headers.get('x-internal-token')
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const locale = sp.get('locale') === 'en' ? 'en' : 'fr'

  // Valeurs à interpoler dans la KB
  const ctx: Record<string, string> = {
    chat_id:       sp.get('chat_id')       || '(masqué)',
    user_id:       sp.get('user_id')       || '(masqué)',
    societe_id:    sp.get('societe_id')    || '(masqué)',
    societe_name:  sp.get('societe_name')  || (locale === 'en' ? 'your company' : 'votre société'),
    first_name:    sp.get('first_name')    || (locale === 'en' ? 'there'        : 'à toi'),
    role:          sp.get('role')          || 'employe',
    role_label:    sp.get('role_label')    || (locale === 'en' ? 'Employee' : 'Employé'),
    locale,
    capabilities:  sp.get('capabilities')  || '',
  }

  const rawPrompt = buildSystemPrompt(locale)
  const prompt = fillTemplate(rawPrompt, ctx)

  const version = createHash('sha1').update(prompt).digest('hex').slice(0, 12)

  return NextResponse.json({
    prompt,
    version,
    locale,
    interpolated: Object.keys(ctx).filter(k => ctx[k]),
    generated_at: new Date().toISOString(),
    char_count: prompt.length,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}
