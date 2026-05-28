/**
 * POST /api/comptable/agent-chat
 *
 * Agent comptable conversationnel (langage naturel). Boucle de tool-calling :
 *   • Outils LECTURE exécutés directement (consultation libre)
 *   • Outils ÉCRITURE : l'agent PROPOSE, le backend renvoie une demande de
 *     confirmation. L'utilisateur valide → renvoie confirmed_action → exécution.
 *
 * Body :
 *   {
 *     societe_id: string,
 *     messages: [{ role: 'user'|'assistant', content: string }],
 *     confirmed_action?: { name: string, input: any }   // action write validée
 *   }
 *
 * Réponse :
 *   { type: 'message', message: string }                              // réponse finale
 *   { type: 'confirmation', message, action: { name, input, resume } } // attend validation
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { AGENT_TOOLS, READ_TOOLS, WRITE_TOOLS, execReadTool, execWriteTool } from '@/lib/agent/comptable-tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 6

function systemPrompt(societeId: string, today: string): string {
  return `Tu es l'agent comptable de Lexora, expert-comptable mauricien senior (IFRS for SMEs, Plan Comptable Mauricien 4-digits, multi-devises EUR/USD/GBP/ZAR/MUR).

Société active : ${societeId}. Date du jour : ${today}.

RÔLE :
- Tu réponds en français, de façon claire et concise, comme un comptable qui parle à son client.
- Tu peux CONSULTER librement (factures, balance, grand livre, comptes PCM, transactions bancaires) via les outils de lecture.
- Pour toute ÉCRITURE (créer une écriture, lettrer, reclasser), tu PROPOSES l'action mais tu NE l'exécutes JAMAIS sans confirmation explicite de l'utilisateur. Décris précisément ce que tu vas faire (comptes, montants, sens débit/crédit) et demande validation.
- Avant de proposer une affectation, vérifie toujours les comptes réels via list_comptes_pcm et les montants via les outils de lecture. Ne devine pas les numéros de compte.

RÈGLES COMPTABLES :
- Une écriture doit être équilibrée (somme débits = somme crédits).
- Affecter une avance/compte courant à une facture client = lettrage ou écriture de transfert (ex: D 4191 avance reçue / C 411 client, ou lettrage des deux écritures).
- Toujours raisonner sur les comptes existants du PCM de la société.

Sois précis sur les montants et les numéros de compte. En cas de doute, demande des précisions plutôt que d'inventer.`
}

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 500 })

    const body = await request.json()
    const { societe_id, messages, confirmed_action } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages requis' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const ctx = { supabase: admin, societeId: societe_id, userId: user.id, origin: new URL(request.url).origin }
    const anthropic = new Anthropic({ apiKey })
    const today = new Date().toISOString().slice(0, 10)

    // Si une action write a été confirmée par l'utilisateur, on l'exécute
    // d'abord et on l'injecte dans la conversation.
    let confirmedResultText = ''
    if (confirmed_action && WRITE_TOOLS.has(confirmed_action.name)) {
      const result = await execWriteTool(confirmed_action.name, confirmed_action.input, ctx)
      confirmedResultText = `[Action "${confirmed_action.name}" exécutée] Résultat: ${JSON.stringify(result)}`
    }

    // Construire l'historique pour Claude (messages texte simples)
    const convo: Anthropic.MessageParam[] = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))
    if (confirmedResultText) {
      convo.push({ role: 'user', content: confirmedResultText + '\n\nConfirme à l\'utilisateur que l\'action est faite, en français, brièvement.' })
    }

    // Boucle de tool-calling
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt(societe_id, today),
        tools: AGENT_TOOLS as any,
        messages: convo,
      })

      const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
      const textBlocks = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text')
      const agentText = textBlocks.map(t => t.text).join('\n').trim()

      if (toolUses.length === 0) {
        // Réponse finale en langage naturel
        return NextResponse.json({ type: 'message', message: agentText || '(pas de réponse)' })
      }

      // Vérifier s'il y a un outil WRITE → demander confirmation
      const writeUse = toolUses.find(t => WRITE_TOOLS.has(t.name))
      if (writeUse) {
        return NextResponse.json({
          type: 'confirmation',
          message: agentText || `Je vais exécuter : ${writeUse.name}`,
          action: { name: writeUse.name, input: writeUse.input, resume: resumeAction(writeUse.name, writeUse.input) },
        })
      }

      // Sinon : exécuter tous les outils READ et reboucler
      convo.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        if (READ_TOOLS.has(tu.name)) {
          const result = await execReadTool(tu.name, tu.input, ctx)
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Outil inconnu', is_error: true })
        }
      }
      convo.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({ type: 'message', message: 'Je n\'ai pas pu finaliser — reformule ta demande ou découpe-la.' })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

function resumeAction(name: string, input: any): string {
  switch (name) {
    case 'creer_ecriture': {
      const lignes = (input.lignes || []).map((l: any) =>
        `  ${l.compte} : ${l.debit ? `D ${l.debit}` : `C ${l.credit}`}`).join('\n')
      return `Créer écriture ${input.journal || 'OD'} du ${input.date_ecriture} "${input.libelle}" :\n${lignes}`
    }
    case 'lettrer_ecritures':
      return `Lettrer ${(input.ecritures_ids || []).length} écriture(s) ensemble`
    case 'reclasser_ecritures':
      return `Reclasser les écritures ${input.from_compte} → ${input.to_compte}${input.libelle_contains ? ` (libellé contient "${input.libelle_contains}")` : ''}`
    default:
      return name
  }
}
