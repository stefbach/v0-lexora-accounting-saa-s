import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface PvBody {
  societe_id: string
  type: 'ago' | 'age' | 'ca'
  societe_nom?: string
  date?: string
  lieu?: string
  heure?: string
  exercice?: string
  president?: string
  secretaire?: string
  resultat?: string
  dividendes?: string
  affectation?: string
  ordre_du_jour?: string
  associes?: Array<{ nom: string; pourcentage?: number | null; nb_actions?: number | null }>
  administrateurs?: Array<{ nom: string; type?: string | null }>
  capital?: string
  save_to_db?: boolean
}

const TITRES: Record<string, string> = {
  ago: "Procès-verbal d'Assemblée Générale Ordinaire",
  age: "Procès-verbal d'Assemblée Générale Extraordinaire",
  ca: "Procès-verbal de réunion du Conseil d'administration",
}

const CONSULT_TYPE: Record<string, string> = { ago: 'pv_ago', age: 'pv_age', ca: 'pv_ca' }

function buildPvPrompt(b: PvBody, rag: string): string {
  const isAgo = b.type === 'ago'
  const isCa = b.type === 'ca'
  const associes = (b.associes || []).map((a) => `- ${a.nom}${a.pourcentage != null ? ` (${a.pourcentage}%)` : ''}${a.nb_actions != null ? ` — ${a.nb_actions} actions` : ''}`).join('\n') || '[Associés à compléter]'
  const admins = (b.administrateurs || []).map((a) => `- ${a.nom}${a.type ? ` (${a.type})` : ''}`).join('\n') || '[Administrateurs à compléter]'

  const ordreDefaut = isAgo
    ? `1. Lecture et approbation des comptes annuels de l'exercice clos
2. Affectation du résultat
3. Quitus aux administrateurs
4. Nomination / renouvellement du commissaire aux comptes (le cas échéant)
5. Pouvoirs pour les formalités`
    : isCa
    ? `1. [Décisions du conseil à préciser : nomination/révocation de dirigeants, distribution de dividendes, conventions réglementées, ouverture de compte bancaire, transfert de siège…]
2. Pouvoirs pour les formalités`
    : `1. [Résolutions extraordinaires à préciser : modification des statuts, du capital, de l'objet, du siège…]
2. Pouvoirs pour les formalités`

  const participantsBloc = isCa
    ? `═══ ADMINISTRATEURS PRÉSENTS / REPRÉSENTÉS ═══
${admins}`
    : `═══ ASSOCIÉS / ACTIONNAIRES PRÉSENTS OU REPRÉSENTÉS ═══
${associes}

═══ ADMINISTRATEURS ═══
${admins}`

  return `Tu es un secrétaire juridique (company secretary) expert du droit des sociétés mauricien (Companies Act 2001).

${rag}

Rédige un ${TITRES[b.type]} complet, formel et conforme au Companies Act 2001, en français juridique mauricien.

═══ SOCIÉTÉ ═══
Dénomination : ${b.societe_nom || '[Société]'}
Capital social : ${b.capital || '[Capital]'}
${isCa ? '' : `Exercice concerné : ${b.exercice || '[Exercice]'}`}

═══ ${isCa ? 'RÉUNION DU CONSEIL' : 'ASSEMBLÉE'} ═══
Type : ${isAgo ? 'Assemblée Générale Ordinaire annuelle' : isCa ? "Réunion du Conseil d'administration" : 'Assemblée Générale Extraordinaire'}
Date : ${b.date || '[Date]'}${b.heure ? ` à ${b.heure}` : ''}
Lieu : ${b.lieu || '[Lieu]'}
Président de séance : ${b.president || '[Président]'}
Secrétaire de séance : ${b.secretaire || '[Secrétaire]'}

${participantsBloc}

${isAgo ? `═══ ÉLÉMENTS FINANCIERS ═══
Résultat de l'exercice : ${b.resultat || '[Résultat]'}
Dividendes proposés : ${b.dividendes || 'Néant'}
Affectation proposée : ${b.affectation || 'Report à nouveau'}
` : ''}
═══ ORDRE DU JOUR ═══
${b.ordre_du_jour?.trim() || ordreDefaut}

═══ INSTRUCTIONS ═══
1. Structure : en-tête de séance (constitution du bureau, vérification du quorum ${isCa ? 'du conseil' : 'au regard du capital'} et des présents ci-dessus), rappel de l'ordre du jour, puis une section par ${isCa ? 'décision' : 'résolution'} intitulée « Première résolution », « Deuxième résolution »…
2. Chaque résolution : exposé bref + texte de la résolution + résultat du vote (« adoptée à l'unanimité » par défaut, sauf indication contraire).
3. ${isAgo ? "Pour l'approbation des comptes et l'affectation du résultat, reprends fidèlement les montants fournis." : isCa ? "Rédige les décisions du conseil demandées dans l'ordre du jour." : "Rédige les résolutions extraordinaires demandées dans l'ordre du jour."}
4. Appuie chaque référence légale UNIQUEMENT sur les sources verrouillées ci-dessus, avec citations [S1], [S2]… N'invente aucune référence.
5. Termine le corps par la clôture de séance (heure de levée), PUIS une section « ## Sources » listant les sources citées. N'ajoute NI bloc de signature (ajouté automatiquement), NI mention « projet ».
6. Pas de séparateurs décoratifs (pas de ═, ─, ***).`
}

export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const b = (await request.json().catch(() => null)) as PvBody | null
    if (!b?.societe_id || !b?.type) return NextResponse.json({ error: 'societe_id et type requis' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, b.societe_id)
    } catch (e) {
      if (e instanceof SocieteAccessError) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      throw e
    }

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    let sources: CitationSource[] = []
    let rag = ''
    try {
      const sujet = b.type === 'ago' ? 'approbation comptes affectation résultat quitus' : b.type === 'ca' ? "conseil d'administration pouvoirs des administrateurs conventions réglementées dividendes" : 'modification statuts capital résolution extraordinaire'
      const q = `${TITRES[b.type]} Companies Act 2001 ${b.type === 'ca' ? 'board of directors' : 'assemblée générale'} ${sujet} quorum vote`
      const passages = await retrieveRag(q, { domaines: ['societes', 'commercial'], k: 6 })
      rag = formatContextePrompt(passages)
      sources = formatCitations(passages)
    } catch {
      rag = '## SOURCES VERROUILLÉES (RAG)\nCorpus momentanément indisponible : limite-toi aux dispositions du Companies Act 2001 dont tu es certain et signale les points à vérifier.'
    }

    const text = await callClaude(
      "Tu es un secrétaire juridique mauricien (company secretary). Tu rédiges des procès-verbaux d'assemblée et résolutions conformes au Companies Act 2001, en t'appuyant sur les sources verrouillées fournies.",
      buildPvPrompt(b, rag),
      6000,
    )

    let consultation_id: string | null = null
    if (b.save_to_db) {
      const { data: saved } = await supabase.from('juridique_consultations').insert({
        societe_id: b.societe_id,
        type: CONSULT_TYPE[b.type] || 'pv',
        titre: `${TITRES[b.type]}${b.date ? ` — ${b.date}` : ''}`,
        contenu: { texte: text, meta: { date: b.date, lieu: b.lieu, exercice: b.exercice } },
        sources,
        created_by: user.id,
      }).select('id').single()
      consultation_id = saved?.id || null
    }

    return NextResponse.json({ text, sources, consultation_id })
  } catch (e) {
    console.error('[juridique/societe/pv]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
