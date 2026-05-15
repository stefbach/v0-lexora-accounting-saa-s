import { NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt } from '@/lib/telegram/knowledge-base'

/**
 * GET /api/telegram/system-prompt?locale=fr|en
 *
 * Sert le system prompt complet (KB + intro + style) à jour pour le bot
 * Telegram. n8n appelle cet endpoint au début de chaque conversation au
 * lieu d'avoir un prompt statique copié-collé dans le workflow.
 *
 * Avantage : tout update du KB côté code (lib/telegram/knowledge-base.ts)
 * est immédiatement disponible au bot sans toucher n8n.
 *
 * Auth : header X-Internal-Token (le workflow n8n l'envoie) — empêche un
 * tiers de scraper le system prompt complet (qui contient les URLs des
 * tools et leur format).
 *
 * Réponse :
 *   { prompt: string, version: string, generated_at: string }
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth interne pour éviter le scraping public
  const expected = process.env.INTERNAL_API_TOKEN
  const token = req.headers.get('x-internal-token')
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const localeRaw = req.nextUrl.searchParams.get('locale')
  const locale = localeRaw === 'en' ? 'en' : 'fr'

  const prompt = buildSystemPrompt(locale)

  // Version = hash court pour permettre à n8n de cacher si pas changé
  const version = require('crypto').createHash('sha1').update(prompt).digest('hex').slice(0, 12)

  return NextResponse.json({
    prompt,
    version,
    locale,
    generated_at: new Date().toISOString(),
    char_count: prompt.length,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=60',  // côté n8n peut cacher 1 min
    },
  })
}
