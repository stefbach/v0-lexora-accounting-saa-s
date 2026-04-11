import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

function buildPrompt(form: any): string {
  const activeClauses: string[] = []
  // Required clauses (always present)
  activeClauses.push(
    "Identification complete des parties (WRA s.11)",
    "Duree et type de contrat (WRA s.12)",
    "Remuneration et modalites de paiement (WRA s.24)",
    "Heures de travail 45h/semaine max (WRA s.36)",
    "Conges annuels 20 jours min (WRA s.47)",
    "Conges maladie 15 jours/an (WRA s.49)",
    "Cotisations sociales CSG/NSF",
    "Retenue PAYE a la source (ITA 1995)",
    "Conditions de rupture et preavis (WRA s.38-40)",
  )
  if (Array.isArray(form.clausesRecommended)) activeClauses.push(...form.clausesRecommended)
  if (Array.isArray(form.clausesOptional)) activeClauses.push(...form.clausesOptional)
  if (form.customClause?.trim()) activeClauses.push(`Clause personnalisee : ${form.customClause.trim()}`)

  return `Tu es un juriste expert en droit mauricien (Workers' Rights Act 2019, Employment Rights Act, Income Tax Act 1995, CSG Act, Data Protection Act 2017, Contract Act).

Redige un contrat complet et professionnel selon ces parametres :

TYPE DE CONTRAT : ${CONTRACT_TYPES[form.contractType] || form.contractType}
LANGUE : ${form.language}
JURIDICTION : ${JURISDICTIONS[form.jurisdiction] || form.jurisdiction}

═══ EMPLOYEUR / PRESTATAIRE ═══
Raison sociale : ${form.empName || '[EMPLOYEUR A COMPLETER]'}
N° BRN : ${form.empBrn || '[BRN]'}
Adresse : ${form.empAddr || '[ADRESSE]'}
Representant legal : ${form.empRep || '[REPRESENTANT]'}, ${form.empTitle || '[TITRE]'}

═══ EMPLOYE / COCONTRACTANT ═══
Nom complet : ${form.eeName || '[NOM COMPLET]'}
NIC / Passeport : ${form.eeNic || '[NUMERO ID]'}
Adresse : ${form.eeAddr || '[ADRESSE]'}
Email : ${form.eeEmail || '[EMAIL]'}
Telephone : ${form.eePhone || '[TELEPHONE]'}

═══ CONDITIONS ═══
Poste : ${form.jobTitle || '[INTITULE DU POSTE]'}
Departement : ${form.jobDept || '[DEPARTEMENT]'}
Date de debut : ${form.startDate || '[DATE DE DEBUT]'}
${form.endDate ? `Date de fin : ${form.endDate}` : ''}
Remuneration mensuelle brute : MUR ${form.salary || '[MONTANT]'}
Frequence de paiement : ${form.payFrequency || 'Mensuel'}
Periode d'essai : ${form.probation || '3 mois'}
Preavis : ${form.noticePeriod || '1 mois'}
Heures hebdomadaires : ${form.weeklyHours || '45'}h
Lieu de travail : ${form.workLocation || 'Mauritius'}
Conges annuels : ${form.annualLeave || '20 jours (WRA 2019)'}
${form.benefits ? `Avantages complementaires : ${form.benefits}` : ''}

═══ CLAUSES A INCLURE ═══
${activeClauses.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

═══ INSTRUCTIONS DE REDACTION ═══
1. Structure formelle avec numerotation des articles (Article 1, Article 2...)
2. Referencer explicitement les textes de loi mauriciens applicables
3. Format professionnel : en-tete, corps numerote, section signatures avec date et lieu
4. Lieu de signature : ${form.signLocation || 'Flic en Flac, Republique de Maurice'}
5. Utiliser [A COMPLETER] pour les champs non renseignes
6. ${LANG_INSTRUCTIONS[form.language] || LANG_INSTRUCTIONS.fr}
7. Inclure une clause de divisibilite
8. Terminer par les blocs de signature : employeur + employe + mention "Lu et approuve"

Redige maintenant le contrat complet :`
}

// POST /api/generate-contract
// Body: { form, save_to_db?: boolean, societe_id?: string }
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
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

    const prompt = buildPrompt(form)
    if (prompt.length > 8000) {
      return NextResponse.json({ error: 'Parametres trop longs' }, { status: 400 })
    }

    // Generate with Claude
    const text = await callClaude(
      "Tu es un juriste expert en droit mauricien. Tu rediges des contrats professionnels, complets et conformes au Workers' Rights Act 2019 et aux autres lois mauriciennes applicables.",
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

    return NextResponse.json({ text, contract_id })
  } catch (e: any) {
    console.error('[generate-contract]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
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
