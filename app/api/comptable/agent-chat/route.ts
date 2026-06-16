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

/**
 * Persiste un tour Expert web dans web_chat_history (mig 458) — best-effort.
 * Permet à l'agent Telegram de "voir" ce qui s'est dit sur le web via
 * vw_agent_history_unified + outil recall_other_channel.
 */
async function persistWebChatTurn(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin client local
  admin: any
  user_id: string
  societe_id: string
  user_text: string
  assistant_text: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await args.admin.from('web_chat_history').insert([
      { user_id: args.user_id, societe_id: args.societe_id, role: 'user',
        content: String(args.user_text || '').slice(0, 8_000) },
      { user_id: args.user_id, societe_id: args.societe_id, role: 'assistant',
        content: String(args.assistant_text || '').slice(0, 8_000),
        meta: args.meta || {} },
    ])
  } catch {
    /* mig 458 pas encore appliquée → no-op */
  }
}

function systemPrompt(societeId: string, today: string): string {
  return `Tu es l'EXPERT LEXORA — expert-comptable, RH et fiscaliste mauricien senior. Tu combines :
  • la maîtrise comptable (IFRS for SMEs, Plan Comptable Mauricien 4 chiffres, multi-devises MUR/EUR/USD/GBP/ZAR)
  • le savoir juridique et fiscal mauricien : Workers' Rights Act 2019, Income Tax Act, Companies Act 2001, MRA Guidelines 2024, Finance Act 2024
  • les calculs paie Maurice : PAYE bandes 0–390k/10%/15% (annualisées) ; CSG salarié 1,5% (<50k MUR/mois) ou 3% (≥50k), CSG patronal 6% ; NSF salarié 1%, patronal 2,5% ; PRGF 4,50 MUR/jour ; 13ème mois (EOY) split 75% avant 25/12 + 25% avant 31/12
  • la conformité MRA (PAYE/CSG/NSF/TDS/TVA mensuels, IT Form 3 annuel le 15 août, CIT 15%)
  • le TDS Maurice (Income Tax Act §111A) : loyer 5%, honoraires professionnels 3%, management fees 5%, travaux/contrats 0,75%, royalties 15%, jetons admin 15%, intérêts non-résident 15%, artistes 10%, commissions 3%

Société active : ${societeId}. Date du jour : ${today}.

RÔLE :
- Tu réponds en français, de façon claire et concise, comme un expert qui parle à son client.
- Tu peux CONSULTER librement (comptable : factures/balance/grand livre/comptes PCM/transactions bancaires/comptes bancaires (soldes multi-devises MUR/EUR/USD via list_comptes_bancaires) ; RH/paie : bulletins, employés, soldes congés ; MRA : conformité PAYE/CSG/NSF/TDS/TVA, échéances, montants dus).
- Tu peux CALCULER directement (ex: calc_paye_net pour le net à payer depuis un brut, conforme bandes Maurice 2024).
- Tu cites les textes légaux quand pertinent (WRA, ITA, Companies Act).
- Pour toute ÉCRITURE comptable (créer une écriture, lettrer, reclasser, enregistrer un paiement), tu PROPOSES l'action mais tu NE l'exécutes JAMAIS sans confirmation explicite. Décris précisément (comptes, montants, sens débit/crédit) et demande validation.
- Avant de proposer une affectation, vérifie toujours les comptes réels via list_comptes_pcm et les montants via les outils de lecture. Ne devine pas les numéros de compte.

RÈGLES COMPTABLES :
- PAIEMENT D'UNE FACTURE : si l'utilisateur veut payer / régler / encaisser / marquer payée une facture (ex: "paye la facture Google", "marque la facture INV-001 comme payée"), utilise TOUJOURS l'outil enregistrer_paiement_facture (jamais creer_ecriture). Lui seul met à jour le statut de la facture ("payé"/"partiel") sur l'interface ET crée l'écriture banque au grand livre. Récupère d'abord la facture via list_factures pour obtenir son facture_id. creer_ecriture sert uniquement aux écritures qui ne sont PAS un paiement de facture (OD, avances, comptes courants, reclassements).
- Une écriture doit être équilibrée (somme débits = somme crédits).
- Affecter une avance/compte courant à une facture client = lettrage ou écriture de transfert (ex: D 4191 avance reçue / C 411 client, ou lettrage des deux écritures).
- Si un compte nécessaire n'existe PAS encore (ex: 455 compte courant associé "Stéphane Bach", sous-compte client/fournisseur), NE BLOQUE PAS : ajoute-le dans le champ nouveaux_comptes de creer_ecriture. Il sera créé automatiquement avant l'écriture, en une seule opération. L'utilisateur ne doit jamais avoir à créer un compte manuellement puis revenir.
- Propose TOUTE l'opération d'un coup (comptes à créer + écriture) dans un seul appel creer_ecriture, pour que l'utilisateur confirme une fois et que tout soit écrit.
- FORMAT DES NUMÉROS DE COMPTE (strict) : 3 à 6 CHIFFRES commençant par 1-8, SANS point ni lettres (ex: 455, 4551, 512, 401, 411). Les sous-comptes à point (455.NOM) sont REFUSÉS par la base. Pour distinguer plusieurs associés sur le 455, crée des sous-comptes NUMÉRIQUES : 4551, 4552, 4553… avec le nom de l'associé dans l'intitulé du compte.
- Numérotation PCM mauricien : 455 = comptes courants associés (sous-comptes numériques 4551/4552 par associé), 401 fournisseurs, 411 clients, 4191 avances clients, 512 banque.

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

      // Action déjà exécutée : on répond DIRECTEMENT sans réoutiller Claude.
      // Sinon il revoit la demande initiale, re-propose le write tool et
      // redemande confirmation en boucle (bug observé).
      const confirmResp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: 'Tu es l\'agent comptable Lexora. Une action vient d\'être exécutée avec succès (ou en erreur). Confirme-le à l\'utilisateur en français, brièvement et clairement. Ne propose aucune autre action.',
        messages: [
          ...messages.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(m.content || '') })),
          { role: 'user' as const, content: confirmedResultText },
        ],
      })
      const confirmText = confirmResp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(t => t.text).join('\n').trim()
      const finalText = confirmText || 'Action effectuée.'
      await persistWebChatTurn({
        admin, user_id: user.id, societe_id,
        user_text: String(messages[messages.length - 1]?.content || ''),
        assistant_text: finalText,
        meta: { action_executed: confirmed_action?.name },
      })
      return NextResponse.json({ type: 'message', message: finalText })
    }

    // Construire l'historique pour Claude (messages texte simples)
    const convo: Anthropic.MessageParam[] = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))

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
        const finalText = agentText || '(pas de réponse)'
        await persistWebChatTurn({
          admin, user_id: user.id, societe_id,
          user_text: String(messages[messages.length - 1]?.content || ''),
          assistant_text: finalText,
          meta: { turns: turn + 1 },
        })
        return NextResponse.json({ type: 'message', message: finalText })
      }

      // Vérifier s'il y a un outil WRITE → demander confirmation
      const writeUse = toolUses.find(t => WRITE_TOOLS.has(t.name))
      if (writeUse) {
        const proposalMsg = agentText || `Je vais exécuter : ${writeUse.name}`
        await persistWebChatTurn({
          admin, user_id: user.id, societe_id,
          user_text: String(messages[messages.length - 1]?.content || ''),
          assistant_text: proposalMsg + ` [proposition: ${writeUse.name}]`,
          meta: { proposed_action: writeUse.name },
        })
        return NextResponse.json({
          type: 'confirmation',
          message: proposalMsg,
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
    case 'enregistrer_paiement_facture':
      return `Enregistrer le paiement de la facture${input.montant ? ` (${input.montant})` : ' (solde entier)'} par ${input.mode_paiement || 'virement'} → le statut passera à "payé" et l'écriture banque sera créée`
    case 'lettrer_ecritures':
      return `Lettrer ${(input.ecritures_ids || []).length} écriture(s) ensemble`
    case 'reclasser_ecritures':
      return `Reclasser les écritures ${input.from_compte} → ${input.to_compte}${input.libelle_contains ? ` (libellé contient "${input.libelle_contains}")` : ''}`
    default:
      return name
  }
}
