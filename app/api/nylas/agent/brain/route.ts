import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { callClaude } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  description: string          // ce que l'utilisateur décrit de son rôle / ses préférences
  current?: string             // consignes actuelles (pour affiner plutôt que repartir de zéro)
  categories?: string[]        // catégories existantes
}

/**
 * POST /api/nylas/agent/brain
 * Assistant qui transforme une description en langage naturel en consignes
 * structurées + une liste de catégories, pour paramétrer « le cerveau ».
 */
export async function POST(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as Body | null
  if (!b?.description?.trim()) return NextResponse.json({ error: 'Décris ton rôle et tes préférences (champ vide).' }, { status: 400 })

  const system = `Tu aides un dirigeant à Maurice à paramétrer « le cerveau » de son assistant email IA. À partir de sa description, tu produis des CONSIGNES claires, structurées et actionnables que l'assistant suivra pour trier, classer et répondre à ses emails.

Règles :
- Écris à la 2e personne impérative, en français, en sections courtes (priorités, expéditeurs clés, signalements, règles de classement, style de réponse).
- Sois concret et opérationnel, pas de blabla. N'invente pas d'informations non fournies ; si une info manque, formule une règle générique raisonnable.
- Propose aussi une liste de 5 à 12 catégories de classement pertinentes pour ce profil.

Réponds STRICTEMENT en JSON : {"instructions": "<le texte des consignes>", "categories": ["...", "..."]}.`

  const userPrompt = [
    b.current?.trim() ? `Consignes actuelles à améliorer/compléter :\n"""\n${b.current.trim()}\n"""` : '',
    b.categories?.length ? `Catégories actuelles : ${b.categories.join(', ')}` : '',
    `Description fournie par l'utilisateur :\n"""\n${b.description.trim()}\n"""`,
  ].filter(Boolean).join('\n\n')

  try {
    const raw = await callClaude(system, userPrompt, 2048)
    // Extraction JSON robuste (le modèle peut entourer de texte).
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : { instructions: raw, categories: [] }
    return NextResponse.json({
      instructions: String(parsed.instructions || '').slice(0, 8000),
      categories: Array.isArray(parsed.categories) ? parsed.categories.map((c: unknown) => String(c).slice(0, 60)).filter(Boolean).slice(0, 30) : [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur assistant' }, { status: 502 })
  }
}
