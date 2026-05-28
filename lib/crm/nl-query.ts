// =============================================================================
// lib/crm/nl-query.ts — Traduction langage naturel -> filtres Apollo
// =============================================================================
// L'utilisateur tape une requête en français/anglais ("hôtels à Grand Baie
// de plus de 50 employés"). On utilise Claude Haiku (modèle le moins cher)
// pour produire des filtres Apollo structurés. La localisation est TOUJOURS
// forcée sur Maurice côté serveur — Claude ne peut pas l'outrepasser.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'

// Modèle volontairement léger : la traduction NL->filtres tient en quelques
// centaines de tokens, inutile de brûler du Sonnet.
const NL_MODEL = process.env.CRM_NL_MODEL || 'claude-haiku-4-5'

// Tranches d'effectifs acceptées par l'API Apollo (organization_num_employees_ranges)
const ALLOWED_EMPLOYEE_RANGES = [
  '1,10',
  '11,50',
  '51,200',
  '201,500',
  '501,1000',
  '1001,5000',
  '5001,10000',
  '10001,1000000',
] as const

export interface ApolloCompanyFilters {
  q_keywords?: string
  organization_num_employees_ranges?: string[]
  person_titles?: string[]
  person_seniorities?: string[]
}

export interface ParsedNlQuery {
  interpretation: string
  filters: ApolloCompanyFilters
}

// Séniorités acceptées par Apollo (person_seniorities).
const ALLOWED_SENIORITIES = [
  'owner',
  'founder',
  'c_suite',
  'partner',
  'vp',
  'head',
  'director',
  'manager',
  'senior',
  'entry',
  'intern',
] as const

const SYSTEM_PROMPT = `Tu convertis une requête de prospection B2B en filtres de recherche Apollo.io.
Le marché est EXCLUSIVEMENT l'île Maurice — n'ajoute jamais d'autre pays.
On recherche des PERSONNES (dirigeants/décideurs) dans des entreprises mauriciennes.

Réponds UNIQUEMENT avec un objet JSON (aucun texte autour) de cette forme :
{
  "interpretation": "<reformulation courte en français de ce que tu as compris>",
  "q_keywords": "<mots-clés secteur/activité/ville à Maurice, séparés par espaces, ou \\"\\">",
  "employee_ranges": ["<valeurs parmi: 1,10 | 11,50 | 51,200 | 201,500 | 501,1000 | 1001,5000 | 5001,10000 | 10001,1000000>"],
  "person_titles": ["<intitulés de poste précis si mentionnés, ex: \\"CEO\\", \\"Directeur Financier\\", \\"CFO\\">"],
  "person_seniorities": ["<valeurs parmi: owner | founder | c_suite | partner | vp | head | director | manager>"]
}

Règles :
- q_keywords : garde l'activité et la localité mauricienne (ex: "hotel Grand Baie", "comptable Port Louis"). N'inclus PAS le mot "Maurice"/"Mauritius" (déjà filtré).
- employee_ranges : déduis la taille si mentionnée ("PME", "grandes entreprises", "+50 salariés"). Sinon [].
- person_titles : seulement si l'utilisateur cite un poste précis. Sinon [].
- person_seniorities : déduis le niveau visé ("dirigeants", "patrons" -> owner/founder/c_suite ; "DAF/CFO" -> c_suite ; "managers" -> manager). Si non précisé, laisse [] (le défaut serveur ciblera les dirigeants).`

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  return new Anthropic({ apiKey })
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('Réponse Claude non-JSON : ' + text.slice(0, 200))
  }
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * Traduit une requête en langage naturel en filtres Apollo.
 * Coût : un seul appel Haiku, quelques centaines de tokens.
 */
export async function parseNaturalQuery(prompt: string): Promise<ParsedNlQuery> {
  const clean = prompt.trim()
  if (!clean) {
    return { interpretation: 'Recherche vide', filters: {} }
  }

  const client = getClient()
  const response = await client.messages.create({
    model: NL_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: clean }],
  })

  const block = response.content[0]
  if (!block || block.type !== 'text') {
    throw new Error('Réponse Claude vide')
  }

  const raw = extractJson(block.text)
  const filters: ApolloCompanyFilters = {}

  const kw = typeof raw.q_keywords === 'string' ? raw.q_keywords.trim() : ''
  if (kw) filters.q_keywords = kw

  if (Array.isArray(raw.employee_ranges)) {
    const ranges = raw.employee_ranges
      .map((r) => String(r).trim())
      .filter((r): r is (typeof ALLOWED_EMPLOYEE_RANGES)[number] =>
        (ALLOWED_EMPLOYEE_RANGES as readonly string[]).includes(r),
      )
    if (ranges.length > 0) filters.organization_num_employees_ranges = ranges
  }

  if (Array.isArray(raw.person_titles)) {
    const titles = raw.person_titles.map((t) => String(t).trim()).filter(Boolean)
    if (titles.length > 0) filters.person_titles = titles
  }

  if (Array.isArray(raw.person_seniorities)) {
    const sen = raw.person_seniorities
      .map((s) => String(s).trim().toLowerCase())
      .filter((s): s is (typeof ALLOWED_SENIORITIES)[number] =>
        (ALLOWED_SENIORITIES as readonly string[]).includes(s),
      )
    if (sen.length > 0) filters.person_seniorities = sen
  }

  return {
    interpretation:
      typeof raw.interpretation === 'string' && raw.interpretation.trim()
        ? raw.interpretation.trim()
        : clean,
    filters,
  }
}
