import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_CLARA = `Tu es CLARA, assistante RH experte en droit du travail mauricien.
Tu es une assistante neutre et professionnelle au service de toutes les entreprises à Maurice.
Tu maîtrises : Workers' Rights Act 2019, CSG/NSF/PAYE MRA, congés, bulletins de paie, contrats de travail.
Réponds en français, sois précise et cite les textes légaux quand pertinent.
Taux CSG: 1.5% (≤50K MUR) / 3% (>50K). NSF salarié 1.5% patronal 2.5%. PAYE: 0% <390K/an.
PRGF: max entre 4.5% des émoluments et 4.50 MUR/jour travaillé.
Training Levy: 1% masse salariale (HRDC).
Ne mentionne JAMAIS le nom d'une entreprise spécifique dans tes réponses.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { message, conversation_id, employe_id } = await request.json()
    if (!message) return NextResponse.json({ error: 'Message requis' }, { status: 400 })

    // Charger historique
    let messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (conversation_id) {
      const { data: conv } = await supabase.from('chat_conversations').select('messages').eq('id', conversation_id).single()
      messages = conv?.messages || []
    }

    messages.push({ role: 'user', content: message })

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_CLARA,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    messages.push({ role: 'assistant', content: reply })

    // Sauvegarder conversation
    let convId = conversation_id
    if (!convId) {
      const { data } = await supabase.from('chat_conversations').insert({
        employe_id, titre: message.slice(0, 50), messages,
      }).select('id').single()
      convId = data?.id
    } else {
      await supabase.from('chat_conversations').update({ messages, updated_at: new Date().toISOString() }).eq('id', convId)
    }

    return NextResponse.json({ reply, conversation_id: convId })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
