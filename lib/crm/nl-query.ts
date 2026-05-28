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
  // Localité mauricienne précise (ex: "Grand Baie", "Port Louis"). Mappée
  // côté connecteur sur organization_locations — le verrou Maurice reste serveur.
  city?: string
  // Mots-clés secteur/activité — mappés sur q_organization_keyword_tags
  // (le SEUL champ que la recherche d'organisations Apollo filtre réellement ;
  // q_keywords est ignoré par /mixed_companies/search).
  keyword_tags?: string[]
  organization_num_employees_ranges?: string[]
}

export interface ParsedNlQuery {
  interpretation: string
  filters: ApolloCompanyFilters
}

const SYSTEM_PROMPT = `Tu convertis une requête de prospection B2B en filtres de recherche Apollo.io.
Le marché est EXCLUSIVEMENT l'île Maurice — n'ajoute jamais d'autre pays.

Réponds UNIQUEMENT avec un objet JSON (aucun texte autour) de cette forme :
{
  "interpretation": "<reformulation courte en français de ce que tu as compris>",
  "city": "<localité mauricienne précise si mentionnée (ex: Grand Baie, Port Louis, Ebène, Curepipe, Quatre Bornes), sinon \\"\\">",
  "keywords": ["<mot-clé secteur/activité en anglais de préférence (ex: hotel, restaurant, accounting, construction, fintech)>"],
  "employee_ranges": ["<une ou plusieurs valeurs parmi: 1,10 | 11,50 | 51,200 | 201,500 | 501,1000 | 1001,5000 | 5001,10000 | 10001,1000000>"]
}

Règles IMPORTANTES :
- city : UNIQUEMENT la localité/ville mauricienne, sans le pays. N'écris JAMAIS "Maurice"/"Mauritius" ici (déjà filtré côté serveur). Si aucune ville précise n'est mentionnée, mets "".
- keywords : un ou plusieurs mots-clés décrivant le SECTEUR/ACTIVITÉ uniquement (pas la ville, pas la taille). Préfère l'anglais (Apollo indexe en anglais) : "hôtel"->"hotel", "comptable"->"accounting", "construction"->"construction", "informatique"->"IT software". Sépare les concepts distincts en plusieurs entrées. Si rien de sectoriel, tableau vide [].
- employee_ranges : déduis la taille si l'utilisateur la mentionne ("PME", "grandes entreprises", "+50 salariés"...). Sinon tableau vide [].`

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

  const city = typeof raw.city === 'string' ? raw.city.trim() : ''
  // Garde-fou : Claude ne doit jamais réinjecter le pays dans la ville.
  if (city && !/^(maurice|mauritius)$/i.test(city)) filters.city = city

  if (Array.isArray(raw.keywords)) {
    const tags = raw.keywords
      .map((k) => String(k).trim())
      .filter((k) => k.length > 0 && !/^(maurice|mauritius)$/i.test(k))
    if (tags.length > 0) filters.keyword_tags = tags
  } else if (typeof raw.keywords === 'string' && raw.keywords.trim()) {
    filters.keyword_tags = [raw.keywords.trim()]
  }

  if (Array.isArray(raw.employee_ranges)) {
    const ranges = raw.employee_ranges
      .map((r) => String(r).trim())
      .filter((r): r is (typeof ALLOWED_EMPLOYEE_RANGES)[number] =>
        (ALLOWED_EMPLOYEE_RANGES as readonly string[]).includes(r),
      )
    if (ranges.length > 0) filters.organization_num_employees_ranges = ranges
  }

  return {
    interpretation:
      typeof raw.interpretation === 'string' && raw.interpretation.trim()
        ? raw.interpretation.trim()
        : clean,
    filters,
  }
}
