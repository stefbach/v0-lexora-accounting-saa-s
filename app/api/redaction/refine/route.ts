import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/redaction/refine — affine un email/courrier généré selon une
 * instruction en langage naturel (ton, longueur, ajout/retrait…).
 * Body: { current_text, instruction, mode?, langue? }
 */
export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const b = await request.json().catch(() => null) as { current_text?: string; instruction?: string; mode?: string; langue?: string } | null
    if (!b?.current_text || !b?.instruction?.trim()) return NextResponse.json({ error: 'current_text et instruction requis' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    const prompt = `Voici un ${b.mode === 'courrier' ? 'courrier' : 'email'} professionnel existant :

"""
${b.current_text}
"""

DEMANDE DE MODIFICATION (langage naturel) :
"${b.instruction.trim()}"

Applique fidèlement la demande (ton, longueur, ajout, retrait, reformulation) en conservant le format et la langue. Ne renvoie QUE le texte final mis à jour, sans commentaire.`

    const text = await callClaude(
      "Tu es un assistant de rédaction professionnel. Tu révises emails et courriers et renvoies uniquement le texte final mis à jour.",
      prompt,
      3000,
    )

    return NextResponse.json({ text: text.trim(), sources: [] })
  } catch (e) {
    console.error('[redaction/refine]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
