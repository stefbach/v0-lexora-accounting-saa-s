/**
 * Migration legacy du PCM pour une société existante.
 *
 * Bootstrappe la table comptes_societes à partir des écritures déjà présentes
 * dans ecritures_comptables_v2, puis complète avec les comptes obligatoires
 * du template CORE Maurice manquants.
 *
 * DRY-RUN OBLIGATOIRE en premier : affiche le rapport sans rien écrire.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/migrate-pcm-legacy.ts --societe=<UUID> [--execute]
 *
 *   Sans --execute → dry-run (rapport seulement).
 *   Avec --execute → applique réellement.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
const societeArg = process.argv.find(a => a.startsWith('--societe='))
const EXECUTE = process.argv.includes('--execute')
const societeId = societeArg?.split('=')[1]

if (!SUPABASE_URL || !SRK) { console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis'); process.exit(1) }
if (!societeId) { console.error('--societe=<UUID> requis'); process.exit(1) }

interface TemplateCompte {
  numero: string; intitule: string; classe: number; type: string
  nature?: string; sens_normal: string; lettrable: boolean; obligatoire: boolean; tags?: string[]
}

function deriveParent(numero: string): string | null {
  const i = numero.indexOf('.')
  return i > 0 ? numero.slice(0, i) : null
}

function classeFromNumero(numero: string): number {
  return Number(numero[0])
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SRK!, { auth: { autoRefreshToken: false, persistSession: false } })
  const mode = EXECUTE ? 'EXECUTE' : 'DRY-RUN'
  console.log(`\n=== Migration PCM legacy — société ${societeId} — mode ${mode} ===\n`)

  // 1. Template CORE Maurice
  const core = JSON.parse(readFileSync(join(process.cwd(), 'pcm-templates', 'core_maurice.json'), 'utf-8'))
  const coreComptes: TemplateCompte[] = core.comptes
  const coreByNumero = new Map(coreComptes.map((c: TemplateCompte) => [c.numero, c]))

  // 2. Comptes déjà présents dans comptes_societes (idempotence)
  const { data: existing } = await supabase
    .from('comptes_societes').select('numero').eq('societe_id', societeId)
  const existingNumeros = new Set<string>((existing || []).map((c: any) => c.numero))
  console.log(`Comptes déjà dans comptes_societes : ${existingNumeros.size}`)

  // 3. Comptes utilisés dans les écritures (paginé)
  const usedAccounts = new Map<string, { nom: string; nb: number }>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, nom_compte')
      .eq('societe_id', societeId)
      .range(from, from + 999)
    if (error) { console.error('Erreur lecture écritures:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const e of data) {
      const num = e.numero_compte
      if (!num) continue
      if (!usedAccounts.has(num)) usedAccounts.set(num, { nom: e.nom_compte || '', nb: 0 })
      usedAccounts.get(num)!.nb++
    }
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`Comptes distincts utilisés dans les écritures : ${usedAccounts.size}`)

  // 4. Construire la liste à créer
  const toCreate: any[] = []
  const report = { from_ecritures: 0, from_core_obligatoire: 0, skipped_existing: 0, anomalies: [] as string[] }

  // 4a. Comptes utilisés dans écritures, pas encore dans comptes_societes
  for (const [numero, info] of usedAccounts) {
    if (existingNumeros.has(numero)) { report.skipped_existing++; continue }
    const classe = classeFromNumero(numero)
    if (!Number.isInteger(classe) || classe < 1 || classe > 8) {
      report.anomalies.push(`Numéro "${numero}" classe indéterminée — ignoré`)
      continue
    }
    const tpl = coreByNumero.get(numero)
    toCreate.push({
      societe_id: societeId,
      numero,
      numero_parent: deriveParent(numero),
      intitule: (tpl as TemplateCompte | undefined)?.intitule || info.nom || `Compte ${numero}`,
      intitule_custom: !tpl,
      classe: (tpl as TemplateCompte | undefined)?.classe ?? classe,
      type: (tpl as TemplateCompte | undefined)?.type ?? guessType(classe),
      nature: (tpl as TemplateCompte | undefined)?.nature ?? null,
      sens_normal: (tpl as TemplateCompte | undefined)?.sens_normal ?? 'mixte',
      lettrable: (tpl as TemplateCompte | undefined)?.lettrable ?? false,
      obligatoire: (tpl as TemplateCompte | undefined)?.obligatoire ?? false,
      template_source: 'legacy_migration',
      tags: (tpl as TemplateCompte | undefined)?.tags ?? [],
      metadata: { nb_ecritures_at_migration: info.nb },
    })
    existingNumeros.add(numero)
    report.from_ecritures++
  }

  // 4b. Comptes obligatoires du CORE manquants
  for (const c of coreComptes) {
    if (!c.obligatoire) continue
    if (existingNumeros.has(c.numero)) continue
    toCreate.push({
      societe_id: societeId,
      numero: c.numero, numero_parent: deriveParent(c.numero),
      intitule: c.intitule, intitule_custom: false,
      classe: c.classe, type: c.type, nature: c.nature ?? null,
      sens_normal: c.sens_normal, lettrable: c.lettrable, obligatoire: true,
      template_source: 'core_maurice', tags: c.tags ?? [], metadata: {},
    })
    existingNumeros.add(c.numero)
    report.from_core_obligatoire++
  }

  // 5. Rapport
  console.log('\n--- RAPPORT ---')
  console.log(`À créer depuis écritures existantes : ${report.from_ecritures}`)
  console.log(`À créer (CORE obligatoire manquant) : ${report.from_core_obligatoire}`)
  console.log(`Ignorés (déjà présents)             : ${report.skipped_existing}`)
  console.log(`Total à créer                       : ${toCreate.length}`)
  if (report.anomalies.length > 0) {
    console.log(`\n⚠ Anomalies (${report.anomalies.length}) :`)
    report.anomalies.forEach(a => console.log(`  - ${a}`))
  }
  console.log('\nDétail des comptes à créer :')
  for (const c of toCreate.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))) {
    console.log(`  ${c.numero.padEnd(12)} ${c.intitule}  [${c.template_source}]`)
  }

  if (!EXECUTE) {
    console.log('\n🔵 DRY-RUN — rien écrit. Relancer avec --execute pour appliquer.')
    return
  }

  // 6. Exécution
  if (toCreate.length > 0) {
    const { error } = await supabase.from('comptes_societes').insert(toCreate)
    if (error) { console.error('❌ Insertion échouée:', error.message); process.exit(1) }
    await supabase.from('audit_log_pcm').insert({
      societe_id: societeId, action: 'legacy_migration', entity_type: 'template',
      entity_id: 'legacy_migration',
      after_state: report, actor_type: 'migration',
      reason: `Migration legacy PCM (${toCreate.length} comptes créés)`,
    })
    console.log(`\n✅ ${toCreate.length} comptes créés. Audit log enregistré.`)
  } else {
    console.log('\n✅ Rien à créer — PCM déjà complet.')
  }
}

function guessType(classe: number): string {
  switch (classe) {
    case 1: return 'passif'
    case 2: return 'actif'
    case 3: return 'actif'
    case 4: return 'mixte'
    case 5: return 'tresorerie'
    case 6: return 'charge'
    case 7: return 'produit'
    default: return 'mixte'
  }
}

main().catch(e => { console.error(e); process.exit(1) })
