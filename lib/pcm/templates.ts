/**
 * Chargement et validation des templates PCM.
 *
 * Les templates sont stockés en JSON dans /pcm-templates/*.json et peuvent
 * aussi être chargés depuis la table `pcm_templates` (Supabase). Le module
 * privilégie la table en prod (source de vérité), avec fallback fichier.
 */

import { z } from 'zod'
import { PCMError } from './errors'
import type { PCMTemplate, TemplateCompte } from './types'

const NUMERO_REGEX = /^[0-9]{1,8}(\.[A-Z0-9_]{1,16})?$/

const templateCompteSchema = z.object({
  numero: z.string().regex(NUMERO_REGEX, 'Numéro de compte invalide'),
  intitule: z.string().min(1),
  classe: z.number().int().min(1).max(8),
  type: z.enum(['actif', 'passif', 'charge', 'produit', 'mixte', 'tresorerie']),
  nature: z.string().optional(),
  sens_normal: z.enum(['debit', 'credit', 'mixte']),
  lettrable: z.boolean(),
  obligatoire: z.boolean(),
  tags: z.array(z.string()).optional(),
  sous_comptes_pattern: z.string().optional(),
})

const templateSchema = z.object({
  code: z.string().min(1),
  nom: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['core', 'module']),
  juridiction_code: z.string().default('MU'),
  version: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
  comptes: z.array(templateCompteSchema).min(1),
})

/**
 * Valide la structure d'un template. Vérifie aussi la cohérence
 * classe ↔ premier chiffre du numéro (ex: compte 4xx → classe 4).
 */
export function validateTemplate(raw: unknown): PCMTemplate {
  const parsed = templateSchema.safeParse(raw)
  if (!parsed.success) {
    throw new PCMError('PCM_008', 'Template JSON invalide', parsed.error.issues)
  }
  const tpl = parsed.data

  // Cohérence classe / numéro
  for (const c of tpl.comptes) {
    const firstDigit = Number(c.numero[0])
    if (firstDigit !== c.classe) {
      throw new PCMError(
        'PCM_009',
        `Compte ${c.numero} déclaré classe ${c.classe} mais commence par ${firstDigit}`,
        { numero: c.numero, classe: c.classe },
      )
    }
  }

  // Numéros uniques dans le template
  const seen = new Set<string>()
  for (const c of tpl.comptes) {
    if (seen.has(c.numero)) {
      throw new PCMError('PCM_008', `Numéro ${c.numero} en doublon dans le template ${tpl.code}`)
    }
    seen.add(c.numero)
  }

  return tpl as PCMTemplate
}

/**
 * Déduit le numero_parent d'un sous-compte (4511.OCC → 4511).
 * Retourne null pour un compte racine.
 */
export function deriveParent(numero: string): string | null {
  const dotIdx = numero.indexOf('.')
  return dotIdx > 0 ? numero.slice(0, dotIdx) : null
}

/**
 * Charge un template depuis la table pcm_templates (Supabase).
 * @throws PCM_001 si introuvable
 */
export async function loadTemplateFromDb(
  supabase: { from: (t: string) => any },
  code: string,
): Promise<PCMTemplate> {
  const { data, error } = await supabase
    .from('pcm_templates')
    .select('code, nom, description, type, juridiction_code, version, prerequisites, comptes_json')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new PCMError('PCM_001', `Erreur chargement template ${code}: ${error.message}`)
  if (!data) throw new PCMError('PCM_001', `Template "${code}" introuvable ou inactif`)

  return validateTemplate({
    code: data.code,
    nom: data.nom,
    description: data.description,
    type: data.type,
    juridiction_code: data.juridiction_code,
    version: data.version,
    prerequisites: data.prerequisites || [],
    comptes: data.comptes_json?.comptes ?? data.comptes_json,
  })
}

/** Tri canonique des comptes par numéro (gère les sous-comptes). */
export function sortComptes<T extends { numero: string }>(comptes: T[]): T[] {
  return [...comptes].sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))
}

export type { TemplateCompte }
