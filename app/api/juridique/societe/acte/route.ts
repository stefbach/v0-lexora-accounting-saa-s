import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ActeBody {
  societe_id: string
  type: string
  societe_nom?: string
  capital?: string
  objet?: string
  signataire?: string
  date?: string
  lieu?: string
  save_to_db?: boolean
}

const ACTES: Record<string, { label: string; instr: string }> = {
  statuts: { label: "Statuts de société", instr: "Rédige des statuts complets de société privée mauricienne (private company limited by shares) : dénomination, siège, objet, capital et actions, organes (directeurs, assemblées), exercice social, distribution, dissolution. Structure en articles." },
  convocation_ago: { label: "Convocation — Assemblée Générale Ordinaire", instr: "Rédige une lettre de convocation à l'AGO annuelle : date, heure, lieu, ordre du jour standard (comptes, affectation, quitus, auditeur), modalités de représentation (proxy)." },
  convocation_age: { label: "Convocation — Assemblée Générale Extraordinaire", instr: "Rédige une lettre de convocation à l'AGE : date, heure, lieu, ordre du jour extraordinaire indiqué, rappel du quorum renforcé et des modalités de procuration." },
  pouvoir: { label: "Pouvoir / Procuration (proxy)", instr: "Rédige un pouvoir (proxy form) permettant à un mandataire de représenter et voter à une assemblée : identification mandant/mandataire, étendue des pouvoirs, assemblée concernée, durée." },
  certificat_actions: { label: "Certificat d'actions", instr: "Rédige un certificat d'actions (share certificate) : société, titulaire, nombre et catégorie d'actions, valeur nominale, numéro de certificat, mention du registre." },
  nomination_dirigeant: { label: "Acte de nomination d'un dirigeant", instr: "Rédige l'acte/lettre de nomination d'un directeur ou dirigeant : identité, fonction, date d'effet, pouvoirs, acceptation, formalités ROC (s.163)." },
  demission_administrateur: { label: "Lettre de démission d'administrateur", instr: "Rédige une lettre de démission d'un administrateur : identité, fonction, date d'effet, accusé de réception et formalités de notification au ROC." },
  transfert_siege: { label: "Décision de transfert de siège social", instr: "Rédige la décision de transfert du siège social : ancienne et nouvelle adresse, date d'effet, organe décisionnaire et formalités ROC." },
  attestation: { label: "Attestation de la société", instr: "Rédige une attestation officielle de la société sur l'objet indiqué, signée par un dirigeant habilité." },
}

function buildPrompt(b: ActeBody, rag: string): string {
  const a = ACTES[b.type]
  return `Tu es un secrétaire juridique (company secretary) expert du droit des sociétés mauricien (Companies Act 2001).

${rag}

Rédige le document suivant, formel et conforme au Companies Act 2001, en français juridique mauricien : ${a.label}.

═══ SOCIÉTÉ ═══
Dénomination : ${b.societe_nom || '[Société]'}
Capital social : ${b.capital || '[Capital]'}

═══ PARAMÈTRES ═══
Objet / détails fournis : ${b.objet?.trim() || '[à préciser — utilise des champs [À COMPLETER] si besoin]'}
Signataire : ${b.signataire || '[Signataire]'}
Lieu : ${b.lieu || 'Port-Louis'}
Date : ${b.date || "date d'émission"}

═══ INSTRUCTIONS ═══
1. ${a.instr}
2. Structure claire (titres / articles / paragraphes). Utilise [À COMPLETER] pour toute donnée manquante.
3. Appuie chaque référence légale UNIQUEMENT sur les SOURCES VERROUILLÉES ci-dessus, avec citations [S1], [S2]… ; n'invente aucune référence.
4. N'ajoute NI bloc de signature (ajouté automatiquement), NI mention « projet ». Termine par une section « ## Sources ».
5. Pas de séparateurs décoratifs (═, ─, ***).`
}

export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const b = await request.json().catch(() => null) as ActeBody | null
    if (!b?.societe_id || !b?.type || !ACTES[b.type]) return NextResponse.json({ error: 'societe_id et type valides requis' }, { status: 400 })

    const supabase = getAdminClient()
    try { await assertSocieteAccess(supabase, user.id, b.societe_id) }
    catch (e) { if (e instanceof SocieteAccessError) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 }); throw e }

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

    let sources: CitationSource[] = []
    let rag = ''
    try {
      const passages = await retrieveRag(`${ACTES[b.type].label} ${b.objet || ''} Companies Act 2001 société Maurice`, { domaines: ['societes', 'commercial'], k: 6 })
      rag = formatContextePrompt(passages)
      sources = formatCitations(passages)
    } catch {
      rag = '## SOURCES VERROUILLÉES (RAG)\nCorpus momentanément indisponible : limite-toi aux dispositions sûres du Companies Act 2001 et signale les points à vérifier.'
    }

    const text = await callClaude(
      "Tu es un secrétaire juridique mauricien. Tu rédiges des actes et documents de société conformes au Companies Act 2001, ancrés sur les sources verrouillées fournies.",
      buildPrompt(b, rag),
      6000,
    )

    let consultation_id: string | null = null
    if (b.save_to_db) {
      const { data: saved } = await supabase.from('juridique_consultations').insert({
        societe_id: b.societe_id, type: 'acte_societe',
        titre: `${ACTES[b.type].label}${b.date ? ` — ${b.date}` : ''}`,
        contenu: { texte: text, acte_type: b.type }, sources, created_by: user.id,
      }).select('id').single()
      consultation_id = saved?.id || null
    }

    return NextResponse.json({ text, sources, consultation_id, label: ACTES[b.type].label })
  } catch (e) {
    console.error('[juridique/societe/acte]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
