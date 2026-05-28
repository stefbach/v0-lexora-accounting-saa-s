/**
 * Initialisation idempotente du PCM d'une société.
 *
 * Applique un template CORE + des modules optionnels :
 *   • Vérifie les prérequis de chaque module
 *   • Crée les comptes manquants (skip ceux qui existent déjà)
 *   • Trace les modules activés dans pcm_modules_actifs
 *   • Idempotent : 2 appels successifs → même état final, pas de doublon
 */

import { PCMError } from './errors'
import { loadTemplateFromDb, deriveParent } from './templates'
import { writeAuditLog } from './audit-log'
import type { InitializeResult, PCMTemplate, TemplateCompte } from './types'

interface SupabaseLike {
  from: (t: string) => any
}

interface InitializeOptions {
  societeId: string
  coreTemplateCode: string
  moduleCodes: string[]
  actorId?: string | null
  actorType?: 'user' | 'mcp_llm' | 'system' | 'migration'
}

/**
 * Applique le template CORE + modules à une société.
 * @throws PCM_001 template introuvable, PCM_002 prérequis manquant
 */
export async function initializePCM(
  supabase: SupabaseLike,
  opts: InitializeOptions,
): Promise<InitializeResult> {
  const { societeId, coreTemplateCode, moduleCodes, actorId, actorType = 'user' } = opts

  // 1. Charger le template CORE + les modules
  const coreTemplate = await loadTemplateFromDb(supabase, coreTemplateCode)
  const moduleTemplates: PCMTemplate[] = []
  for (const code of moduleCodes) {
    moduleTemplates.push(await loadTemplateFromDb(supabase, code))
  }

  // 2. Modules déjà activés (pour idempotence + prérequis)
  const { data: existingModules } = await supabase
    .from('pcm_modules_actifs')
    .select('template_code')
    .eq('societe_id', societeId)
  const activeCodes = new Set<string>((existingModules || []).map((m: any) => m.template_code))

  // Le CORE compte comme prérequis disponible une fois appliqué
  const availableForPrereq = new Set<string>([coreTemplateCode, ...activeCodes])

  // 3. Vérifier les prérequis des modules à appliquer
  const modulesToApply: PCMTemplate[] = []
  const modulesSkipped: string[] = []
  for (const tpl of moduleTemplates) {
    if (activeCodes.has(tpl.code)) {
      modulesSkipped.push(tpl.code) // déjà activé → skip (idempotence)
      continue
    }
    for (const prereq of tpl.prerequisites) {
      if (!availableForPrereq.has(prereq)) {
        throw new PCMError(
          'PCM_002',
          `Module "${tpl.code}" nécessite le prérequis "${prereq}" qui n'est pas activé`,
          { module: tpl.code, missing_prerequisite: prereq },
        )
      }
    }
    modulesToApply.push(tpl)
    availableForPrereq.add(tpl.code)
  }

  // 4. Comptes déjà présents pour la société (idempotence)
  const { data: existingComptes } = await supabase
    .from('comptes_societes')
    .select('numero')
    .eq('societe_id', societeId)
  const existingNumeros = new Set<string>((existingComptes || []).map((c: any) => c.numero))

  // 5. Construire la liste des comptes à insérer (CORE + modules à appliquer)
  const coreIsNew = !activeCodes.has(coreTemplateCode)
  const allTemplatesToInsert: Array<{ tpl: PCMTemplate; isModule: boolean }> = []
  if (coreIsNew) allTemplatesToInsert.push({ tpl: coreTemplate, isModule: false })
  for (const tpl of modulesToApply) allTemplatesToInsert.push({ tpl, isModule: true })

  const rowsToInsert: any[] = []
  let skipped = 0
  for (const { tpl } of allTemplatesToInsert) {
    for (const c of tpl.comptes) {
      if (existingNumeros.has(c.numero)) { skipped++; continue }
      existingNumeros.add(c.numero) // évite doublon intra-batch (modules qui partagent un compte)
      rowsToInsert.push(compteToRow(c, societeId, tpl.code, actorId))
    }
  }

  // 6. Insérer les comptes
  let created = 0
  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from('comptes_societes').insert(rowsToInsert)
    if (error) {
      throw new PCMError('PCM_008', `Insertion comptes échouée: ${error.message}`, error)
    }
    created = rowsToInsert.length
  }

  // 7. Enregistrer les modules activés (CORE + modules)
  const moduleRows: any[] = []
  if (coreIsNew) {
    moduleRows.push({
      societe_id: societeId, template_code: coreTemplateCode,
      version_applied: coreTemplate.version, activated_by: actorId ?? null,
    })
  }
  for (const tpl of modulesToApply) {
    moduleRows.push({
      societe_id: societeId, template_code: tpl.code,
      version_applied: tpl.version, activated_by: actorId ?? null,
    })
  }
  if (moduleRows.length > 0) {
    // upsert pour rester idempotent même en cas de retry
    await supabase.from('pcm_modules_actifs')
      .upsert(moduleRows, { onConflict: 'societe_id,template_code' })
  }

  // 8. Audit
  await writeAuditLog(supabase, {
    societe_id: societeId,
    action: 'apply_template',
    entity_type: 'template',
    entity_id: coreTemplateCode,
    after_state: {
      core: coreTemplateCode,
      modules_applied: modulesToApply.map(m => m.code),
      comptes_created: created,
      comptes_skipped: skipped,
    },
    actor_id: actorId,
    actor_type: actorType,
    reason: `Initialisation PCM (${created} comptes créés, ${skipped} ignorés)`,
  })

  return {
    template_code: coreTemplateCode,
    modules_applied: modulesToApply.map(m => m.code),
    comptes_created: created,
    comptes_skipped: skipped,
    modules_skipped: modulesSkipped,
  }
}

function compteToRow(
  c: TemplateCompte,
  societeId: string,
  templateCode: string,
  actorId?: string | null,
) {
  return {
    societe_id: societeId,
    numero: c.numero,
    numero_parent: deriveParent(c.numero),
    intitule: c.intitule,
    intitule_custom: false,
    classe: c.classe,
    type: c.type,
    nature: c.nature ?? null,
    sens_normal: c.sens_normal,
    lettrable: c.lettrable,
    obligatoire: c.obligatoire,
    template_source: templateCode,
    tags: c.tags ?? [],
    metadata: c.sous_comptes_pattern ? { sous_comptes_pattern: c.sous_comptes_pattern } : {},
    created_by: actorId ?? null,
    updated_by: actorId ?? null,
  }
}
