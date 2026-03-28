import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_CERVEAU = `Tu es le Cerveau TIBOK — expert IA en droit du travail mauritien, comptabilité, RH et pilotage d'entreprise.
Tu maîtrises: Workers' Rights Act 2019, Income Tax Act, Companies Act 2001, MRA Guidelines 2024, Finance Act 2024.
CSG: 1.5%/3% salarié (seuil 50K MUR), 6% patronal. NSF: 1.5%+2.5%. PAYE barème 0%/10%/15%.
13ème mois: 75% avant 25/12, 25% avant 31/12. PRGF: 4.50 MUR/jour.
Réponds en français, sois précis, cite les textes légaux. Fournis des calculs concrets quand demandé.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { message, historique = [], societe_id } = await request.json()
    if (!message) return NextResponse.json({ error: 'Message requis' }, { status: 400 })

    const messages = [
      ...historique.slice(-10), // Max 10 messages d'historique
      { role: 'user' as const, content: message }
    ]

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_CERVEAU,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply, tokens: response.usage })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  return NextResponse.json({
    suggestions: [
      { categorie: '💰 Paie', questions: ['Calculer le net à payer pour un salaire de 50000 MUR', 'Quel est le taux CSG applicable ce mois?', 'Comment calculer le 13ème mois?'] },
      { categorie: '🏖️ Congés', questions: ['Quels sont les droits à congés annuels au Maurice?', 'Calcul indemnité congé maternité', 'Préavis de licenciement WRA 2019'] },
      { categorie: '⚖️ Droit', questions: ['Clauses obligatoires CDI Maurice', 'Procédure de licenciement légale', 'PRGF: qui est concerné?'] },
      { categorie: '📊 Fiscalité', questions: ['Seuils PAYE 2024/25', 'Training Levy: calcul et déclaration', 'CSR Fund: obligations'] },
    ]
  })
}
