/**
 * Audit de conformité du PCM d'une société.
 *
 * Vérifie :
 *   • errors      : comptes obligatoires CORE manquants, écritures sur
 *                   comptes archivés, écritures sur comptes hors PCM
 *   • warnings    : sous-comptes orphelins (parent absent/archivé)
 *   • suggestions : comptes sans aucune écriture (candidats archivage)
 */

import { loadTemplateFromDb } from './templates'

interface SupabaseLike { from: (t: string) => any }

export interface AuditFinding {
  code: string
  message: string
  numero?: string
  details?: Record<string, unknown>
}

export interface PCMAuditReport {
  societe_id: string
  ok: boolean
  errors: AuditFinding[]
  warnings: AuditFinding[]
  suggestions: AuditFinding[]
  stats: {
    nb_comptes: number
    nb_archives: number
    nb_obligatoires_presents: number
    nb_comptes_utilises: number
  }
}

export async function auditPCM(
  supabase: SupabaseLike,
  societeId: string,
  coreTemplateCode = 'core_maurice',
): Promise<PCMAuditReport> {
  const errors: AuditFinding[] = []
  const warnings: AuditFinding[] = []
  const suggestions: AuditFinding[] = []

  // 1. Comptes de la société
  const { data: comptesRaw } = await supabase
    .from('comptes_societes')
    .select('numero, numero_parent, intitule, obligatoire, archive')
    .eq('societe_id', societeId)
  const comptes = comptesRaw || []
  const byNumero = new Map<string, any>(comptes.map((c: any) => [c.numero, c]))
  const actifs = comptes.filter((c: any) => !c.archive)
  const actifNumeros = new Set<string>(actifs.map((c: any) => c.numero))

  // 2. Template CORE → comptes obligatoires
  let coreObligatoires: string[] = []
  try {
    const core = await loadTemplateFromDb(supabase, coreTemplateCode)
    coreObligatoires = core.comptes.filter(c => c.obligatoire).map(c => c.numero)
  } catch {
    warnings.push({ code: 'PCM_AUDIT_NO_TEMPLATE', message: `Template ${coreTemplateCode} introuvable — vérification des obligatoires ignorée` })
  }

  // 3. ERROR : comptes obligatoires manquants
  let nbObligatoiresPresents = 0
  for (const num of coreObligatoires) {
    const c = byNumero.get(num)
    if (!c || c.archive) {
      errors.push({
        code: 'PCM_AUDIT_MISSING_MANDATORY',
        message: `Compte obligatoire ${num} manquant ou archivé`,
        numero: num,
      })
    } else {
      nbObligatoiresPresents++
    }
  }

  // 4. Comptes utilisés dans les écritures (numéros distincts, paginé)
  const usedNumeros = new Map<string, number>()
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte')
      .eq('societe_id', societeId)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const e of data) {
      const n = e.numero_compte
      if (n) usedNumeros.set(n, (usedNumeros.get(n) || 0) + 1)
    }
    if (data.length < 1000) break
    from += 1000
  }

  // 5. ERROR : écritures sur comptes archivés OU absents du PCM
  for (const [num, nb] of usedNumeros) {
    const c = byNumero.get(num)
    if (!c) {
      errors.push({
        code: 'PCM_AUDIT_ECRITURE_HORS_PCM',
        message: `${nb} écriture(s) sur le compte ${num} absent du PCM`,
        numero: num, details: { nb_ecritures: nb },
      })
    } else if (c.archive) {
      errors.push({
        code: 'PCM_AUDIT_ECRITURE_ARCHIVE',
        message: `${nb} écriture(s) sur le compte archivé ${num}`,
        numero: num, details: { nb_ecritures: nb },
      })
    }
  }

  // 6. WARNING : sous-comptes orphelins (parent absent ou archivé)
  for (const c of actifs) {
    if (c.numero_parent && !actifNumeros.has(c.numero_parent)) {
      warnings.push({
        code: 'PCM_AUDIT_PARENT_ORPHAN',
        message: `Sous-compte ${c.numero} dont le parent ${c.numero_parent} est absent ou archivé`,
        numero: c.numero,
      })
    }
  }

  // 7. SUGGESTION : comptes actifs non obligatoires sans aucune écriture
  for (const c of actifs) {
    if (!c.obligatoire && !usedNumeros.has(c.numero)) {
      suggestions.push({
        code: 'PCM_AUDIT_UNUSED',
        message: `Compte ${c.numero} (${c.intitule}) actif mais sans écriture — candidat à l'archivage`,
        numero: c.numero,
      })
    }
  }

  return {
    societe_id: societeId,
    ok: errors.length === 0,
    errors, warnings, suggestions,
    stats: {
      nb_comptes: comptes.length,
      nb_archives: comptes.filter((c: any) => c.archive).length,
      nb_obligatoires_presents: nbObligatoiresPresents,
      nb_comptes_utilises: usedNumeros.size,
    },
  }
}
