import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { callClaude } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Action = 'summarize' | 'reply' | 'classify' | 'actions'

interface Body {
  action: Action
  subject?: string
  from?: string
  body?: string // corps de l'email (HTML ou texte)
  instruction?: string // pour 'reply' : ce que l'utilisateur veut dire
  ton?: string
  langue?: 'fr' | 'en'
}

/** Retire les balises HTML pour alléger le contexte envoyé au modèle. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
}

const LANG: Record<string, string> = { fr: 'en français', en: 'in English' }

function buildPrompt(b: Body): { system: string; user: string } {
  const lang = LANG[b.langue || 'fr'] || LANG.fr
  const corps = stripHtml(b.body || '')
  const meta = `Objet : ${b.subject || '(sans objet)'}\nExpéditeur : ${b.from || '(inconnu)'}\n\nContenu :\n"""\n${corps}\n"""`

  const system = `Tu es un agent email professionnel pour une entreprise à Maurice. Tu réponds ${lang}, de façon concise, factuelle et exploitable. N'invente aucune information absente de l'email.`

  switch (b.action) {
    case 'summarize':
      return { system, user: `Résume cet email en 2-4 puces : qui écrit, pourquoi, ce qui est attendu, et l'échéance éventuelle.\n\n${meta}` }
    case 'classify':
      return { system, user: `Classe cet email. Réponds avec : une catégorie (Client, Fournisseur, Administratif/Fiscal, RH, Banque, Commercial/Prospect, Spam, Autre), une priorité (Haute / Moyenne / Basse), et si une réponse est nécessaire (Oui/Non) — chacun sur une ligne « Champ : valeur ».\n\n${meta}` }
    case 'actions':
      return { system, user: `Extrais la liste des actions concrètes à réaliser suite à cet email (puces, à l'impératif). S'il n'y en a aucune, indique « Aucune action requise ».\n\n${meta}` }
    case 'reply':
    default:
      return {
        system,
        user: `Rédige une réponse à cet email, ${lang}, ton ${b.ton || 'professionnel et courtois'}. Réponds UNIQUEMENT avec le corps de l'email (salutation → formule de politesse), prêt à envoyer, sans ligne « Objet ».${b.instruction ? `\n\nIntention de l'utilisateur (à exprimer proprement) :\n"""\n${b.instruction}\n"""` : ''}\n\nEmail reçu :\n${meta}`,
      }
  }
}

/** POST /api/nylas/agent — actions IA sur un email (résumé, réponse, tri, todo). */
export async function POST(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as Body | null
  if (!b?.action) return NextResponse.json({ error: 'action requise' }, { status: 400 })
  if (!b.body?.trim() && !b.subject?.trim()) return NextResponse.json({ error: 'email vide' }, { status: 400 })

  try {
    const { system, user: userPrompt } = buildPrompt(b)
    const result = await callClaude(system, userPrompt, b.action === 'reply' ? 2048 : 1024)
    return NextResponse.json({ result: result.trim() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur agent IA' }, { status: 502 })
  }
}
