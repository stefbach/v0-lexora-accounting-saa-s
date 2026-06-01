/**
 * /api/cerveau — Adapter rétrocompatible vers /api/comptable/agent-chat.
 *
 * Le "Cerveau Lexora" est désormais FUSIONNÉ avec l'agent comptable pour
 * devenir un EXPERT unique (compta + RH + paie + MRA + droit Maurice +
 * outils tool-calling). L'endpoint /api/cerveau est gardé pour la
 * rétrocompatibilité avec le composant CerveauTIBOK (dashboard /direction).
 *
 * Il convertit le format ancien {message, historique, societe_id} vers
 * le format agent-chat {societe_id, messages}, appelle l'endpoint en
 * interne, et renvoie {reply} pour ne rien casser côté UI.
 */
import { NextResponse } from 'next/server'
import { POST as agentChat } from '@/app/api/comptable/agent-chat/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as any
    const message: string = String(body?.message || '')
    const historique: Array<{ role: 'user' | 'assistant'; content: string }> =
      Array.isArray(body?.historique) ? body.historique : []
    const societe_id: string = String(body?.societe_id || '')
    if (!message) return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Construit le body au format agent-chat
    const messages = [
      ...historique.slice(-10).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
      { role: 'user' as const, content: message },
    ]

    // Reforge la Request avec le nouveau body (préserve les headers de session)
    const newReq = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ societe_id, messages }),
    })
    const resp = await agentChat(newReq)
    const json = await resp.json().catch(() => ({} as any))

    // Agent-chat peut renvoyer {type:'message', message} ou {type:'confirmation', message, action}
    // → on aplatit en {reply} pour CerveauTIBOK.
    if (resp.status !== 200) {
      return NextResponse.json({ error: json?.error || `HTTP ${resp.status}` }, { status: resp.status })
    }
    const reply = json?.message
      ? (json.type === 'confirmation'
          ? `${json.message}\n\n⏳ Action proposée : ${json.action?.name || ''}. Confirme-le dans l'interface ou répète-le clairement.`
          : json.message)
      : '(pas de réponse)'
    return NextResponse.json({ reply, fused: true })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

/** GET — suggestions affichées dans la sidebar du Cerveau (inchangé). */
export async function GET() {
  return NextResponse.json({
    suggestions: [
      { categorie: '💰 Paie', questions: ['Calculer le net à payer pour un salaire de 50000 MUR', 'Quel est le taux CSG applicable ce mois ?', 'Comment calculer le 13ème mois ?'] },
      { categorie: '🏖️ Congés', questions: ['Quels sont les droits à congés annuels à Maurice ?', 'Solde de congés de Mélanie ?', 'Préavis de licenciement WRA 2019'] },
      { categorie: '⚖️ Droit', questions: ['Clauses obligatoires CDI Maurice', 'Procédure de licenciement légale', 'PRGF : qui est concerné ?'] },
      { categorie: '📊 Fiscalité', questions: ['Où en est ma conformité MRA ?', 'Détaille ma TDS du mois', 'TVA à reverser ce mois'] },
      { categorie: '📒 Compta', questions: ['Affecte ce virement à la facture INV-001', 'Lance le rapprochement bancaire', 'Solde du compte 411 ?'] },
    ],
  })
}
