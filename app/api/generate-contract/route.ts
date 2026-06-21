import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'
import { retrieveRag } from '@/lib/juridique/rag/store'
import { formatContextePrompt, formatCitations, type CitationSource } from '@/lib/juridique/rag/retriever'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
// La génération d'un contrat complet (jusqu'à 8000 tokens) + le RAG peuvent
// dépasser 60 s : on relève la limite pour éviter le timeout passerelle Vercel
// (qui renvoyait une page d'erreur HTML non-JSON cassant le client).
export const maxDuration = 300

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CONTRACT_TYPES: Record<string, string> = {
  CDI: "Travail — CDI (Contrat a Duree Indeterminee)",
  CDD: "Travail — CDD (Contrat a Duree Determinee)",
  CDD_partiel: "Travail — Temps partiel",
  prestataire: "Prestataire / Consultant",
  client_saas: "Client SaaS / Abonnement",
  client_service: "Client — Prestation de services",
  nda: "NDA / Confidentialite",
  bail_commercial: "Bail commercial",
}

/** Domaines RAG pertinents selon le type de contrat (verrouillage des sources). */
const CONTRACT_DOMAINES: Record<string, DomaineJuridique[]> = {
  CDI: ['travail', 'fiscal'],
  CDD: ['travail', 'fiscal'],
  CDD_partiel: ['travail', 'fiscal'],
  prestataire: ['commercial', 'civil', 'fiscal'],
  client_saas: ['commercial', 'donnees', 'civil'],
  client_service: ['commercial', 'civil'],
  nda: ['donnees', 'commercial', 'civil'],
  bail_commercial: ['immobilier', 'civil', 'commercial'],
}

const LANG_INSTRUCTIONS: Record<string, string> = {
  fr: "Redige integralement en francais avec terminologie juridique mauricienne.",
  en: "Write entirely in formal English with Mauritian legal terminology.",
  fr_en: "Redige chaque article en francais puis sa traduction en anglais, format bilingue cote a cote.",
}

const JURISDICTIONS: Record<string, string> = {
  mu: "Maurice — droit mauricien",
  mu_fr: "Maurice — droit francais applicable",
  cv: "Cabo Verde",
}

const EMPLOYMENT_TYPES = new Set(['CDI', 'CDD', 'CDD_partiel'])

/** Libellés des deux parties selon le type de contrat. */
function partyLabels(type: string): { a: string; b: string } {
  switch (type) {
    case 'prestataire': return { a: "DONNEUR D'ORDRE / CLIENT", b: 'PRESTATAIRE / CONSULTANT' }
    case 'client_saas': return { a: 'PRESTATAIRE (EDITEUR DU SERVICE)', b: 'CLIENT ABONNE' }
    case 'client_service': return { a: 'PRESTATAIRE DE SERVICES', b: 'CLIENT' }
    case 'nda': return { a: 'PARTIE DIVULGATRICE', b: 'PARTIE RECEPTRICE' }
    case 'bail_commercial': return { a: 'BAILLEUR', b: 'PRENEUR / LOCATAIRE' }
    default: return { a: 'EMPLOYEUR', b: 'EMPLOYE' }
  }
}

function buildPrompt(form: any, ragContexte: string): string {
  const isEmployment = EMPLOYMENT_TYPES.has(form.contractType)
  const labels = partyLabels(form.contractType)

  // Clauses standard : fournies par le client selon le type ; repli employeur.
  const activeClauses: string[] = []
  if (Array.isArray(form.standardClauses) && form.standardClauses.length) {
    activeClauses.push(...form.standardClauses)
  } else {
    activeClauses.push(
      'Identification complete des parties',
      'Objet du contrat',
      'Remuneration / contrepartie financiere',
      'Duree et conditions de resiliation',
      'Confidentialite',
      'Loi applicable et juridiction competente',
    )
  }
  if (Array.isArray(form.clausesRecommended)) activeClauses.push(...form.clausesRecommended)
  if (Array.isArray(form.clausesOptional)) activeClauses.push(...form.clausesOptional)
  if (form.customClause?.trim()) activeClauses.push(`Clause personnalisee : ${form.customClause.trim()}`)

  // Bloc conditions adapté au type de contrat.
  const conditionsBloc = isEmployment
    ? `Poste : ${form.jobTitle || '[INTITULE DU POSTE]'}
Departement : ${form.jobDept || '[DEPARTEMENT]'}
Date de debut : ${form.startDate || '[DATE DE DEBUT]'}
${form.endDate ? `Date de fin : ${form.endDate}` : ''}
Remuneration mensuelle brute : MUR ${form.salary || '[MONTANT]'}
Frequence de paiement : ${form.payFrequency || 'Mensuel'}
Periode d'essai : ${form.probation || '3 mois'}
Preavis : ${form.noticePeriod || '1 mois'}
Heures hebdomadaires : ${form.weeklyHours || '45'}h
Lieu de travail : ${form.workLocation || 'Maurice'}
Conges annuels : ${form.annualLeave || '20 jours (WRA 2019)'}
${form.benefits ? `Avantages complementaires : ${form.benefits}` : ''}`
    : `Objet / mission : ${form.objet || form.jobTitle || '[OBJET A COMPLETER]'}
Date de debut / signature : ${form.startDate || '[DATE]'}
${form.endDate ? `Date de fin / echeance : ${form.endDate}` : 'Duree : [A COMPLETER]'}
${form.montant ? `Contrepartie financiere : MUR ${form.montant}` : 'Contrepartie financiere : [MONTANT A COMPLETER]'}
${form.payFrequency ? `Modalites de facturation : ${form.payFrequency}` : ''}
Lieu : ${form.workLocation || 'Maurice'}`

  return `Tu es un juriste expert en droit mauricien (Workers' Rights Act 2019, Employment Rights Act, Income Tax Act 1995, CSG Act, Data Protection Act 2017, Contract Act).

${ragContexte}

Redige un contrat complet et professionnel selon ces parametres :

TYPE DE CONTRAT : ${CONTRACT_TYPES[form.contractType] || form.contractType}
LANGUE : ${form.language}
JURIDICTION : ${JURISDICTIONS[form.jurisdiction] || form.jurisdiction}

═══ ${labels.a} ═══
Raison sociale / nom : ${form.empName || '[A COMPLETER]'}
N° BRN : ${form.empBrn || '[BRN]'}
Adresse : ${form.empAddr || '[ADRESSE]'}
Representant : ${form.empRep || '[REPRESENTANT]'}, ${form.empTitle || '[TITRE]'}

═══ ${labels.b} ═══
Nom complet / raison sociale : ${form.eeName || '[A COMPLETER]'}
NIC / BRN / Passeport : ${form.eeNic || '[NUMERO ID]'}
Adresse : ${form.eeAddr || '[ADRESSE]'}
Email : ${form.eeEmail || '[EMAIL]'}
Telephone : ${form.eePhone || '[TELEPHONE]'}

═══ CONDITIONS ═══
${conditionsBloc}

═══ CLAUSES A INCLURE ═══
${activeClauses.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

═══ INSTRUCTIONS DE REDACTION ═══
1. Structure formelle avec numerotation des articles. Commence chaque article par une ligne « Article 1 : Intitule » (l'intitule sera mis en valeur). N'utilise PAS de lignes de separation decoratives (pas de ═, ─, ***).
2. Referencer explicitement les textes de loi mauriciens applicables. Appuie-toi EXCLUSIVEMENT sur les sources verrouillees ci-dessus : chaque renvoi a la loi doit porter une citation [S1], [S2]… correspondant a ces sources. N'invente aucune reference, aucun numero d'article de loi qui ne figure pas dans les sources.
3. Format professionnel : preambule (« Entre les soussignes »), corps numerote par articles, section signatures avec date et lieu.
4. Lieu de signature : ${form.workLocation || 'Port-Louis, Republique de Maurice'}
5. Utiliser [A COMPLETER] pour les champs non renseignes.
6. ${LANG_INSTRUCTIONS[form.language] || LANG_INSTRUCTIONS.fr}
7. Inclure une clause de divisibilite et une clause de loi applicable / juridiction competente.
8. N'ajoute NI bloc de signature, NI mention « Lu et approuve », NI clause de non-responsabilite / mention « projet » : ces elements sont ajoutes automatiquement au document. Termine le corps par le dernier article de fond, PUIS une section « ## Sources » listant les sources [S1], [S2]… effectivement citees.
9. N'emploie ni emoji ni symbole decoratif (le document est rendu en PDF Helvetica).

Redige maintenant le contrat complet :`
}

// POST /api/generate-contract
// Body: { form, save_to_db?: boolean, societe_id?: string }
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 })
    const { form, save_to_db = false, societe_id } = body

    if (!form || !form.contractType) {
      return NextResponse.json({ error: 'form.contractType requis' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY manquant',
        text: 'Le generateur de contrats necessite ANTHROPIC_API_KEY cote serveur.',
      }, { status: 503 })
    }

    // RAG — verrouillage des sources juridiques mauriciennes (corpus Supabase).
    const typeLabel = CONTRACT_TYPES[form.contractType] || form.contractType
    const domaines = CONTRACT_DOMAINES[form.contractType]
    const ragQuery = `${typeLabel} ${form.jobTitle || ''} clauses obligatoires droit mauricien remuneration preavis rupture confidentialite donnees`
    let sources: CitationSource[] = []
    let ragContexte = ''
    try {
      const passages = await retrieveRag(ragQuery, { domaines, k: 6 })
      ragContexte = formatContextePrompt(passages)
      sources = formatCitations(passages)
    } catch (ragErr) {
      console.error('[generate-contract] RAG indisponible:', ragErr instanceof Error ? ragErr.message : ragErr)
      ragContexte = '## SOURCES VERROUILLÉES (RAG)\nCorpus momentanément indisponible : limite-toi aux dispositions générales du droit mauricien dont tu es certain et signale explicitement les points à faire vérifier par un avocat.'
    }

    const prompt = buildPrompt(form, ragContexte)
    if (prompt.length > 16000) {
      return NextResponse.json({ error: 'Parametres trop longs' }, { status: 400 })
    }

    // Generate with Claude
    const text = await callClaude(
      "Tu es un juriste expert en droit mauricien. Tu rediges des contrats professionnels, complets et conformes au Workers' Rights Act 2019 et aux autres lois mauriciennes applicables. Tu fondes chaque renvoi legal sur les sources verrouillees fournies et ne cites jamais une reference absente de ces sources.",
      prompt,
      8000
    )

    // Optional: save to DB
    let contract_id: string | null = null
    if (save_to_db && societe_id) {
      const admin = getAdminClient()
      const { data: saved } = await admin.from('contracts').insert({
        societe_id,
        created_by: user.id,
        contract_type: form.contractType,
        language: form.language || 'fr',
        jurisdiction: form.jurisdiction || 'mu',
        status: 'draft',
        party_employer: {
          name: form.empName, brn: form.empBrn,
          addr: form.empAddr, rep: form.empRep, rep_title: form.empTitle,
        },
        party_employee: {
          name: form.eeName, nic: form.eeNic,
          addr: form.eeAddr, email: form.eeEmail, phone: form.eePhone,
        },
        conditions: {
          job_title: form.jobTitle, dept: form.jobDept,
          start_date: form.startDate, end_date: form.endDate,
          salary: form.salary, pay_frequency: form.payFrequency,
          probation: form.probation, notice: form.noticePeriod,
          hours: form.weeklyHours, location: form.workLocation,
          leave: form.annualLeave, benefits: form.benefits,
        },
        clauses_active: [
          ...(form.clausesRecommended || []),
          ...(form.clausesOptional || []),
        ],
        custom_clause: form.customClause || null,
        generated_text: text,
      }).select('id').single()
      contract_id = saved?.id || null
    }

    return NextResponse.json({ text, contract_id, sources })
  } catch (e: any) {
    console.error('[generate-contract]', e)
    return NextResponse.json({ error: e.message || 'Erreur lors de la generation' }, { status: 500 })
  }
}

// GET /api/generate-contract?societe_id=...
// List existing contracts
export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    let query = supabase.from('contracts').select('*').order('created_at', { ascending: false }).limit(100)
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ contracts: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/generate-contract?id=...
export async function DELETE(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { error } = await supabase.from('contracts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
