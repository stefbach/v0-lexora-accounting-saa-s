/**
 * Seed des templates PCM dans la table pcm_templates.
 *
 * Lit tous les fichiers /pcm-templates/*.json et les upsert dans Supabase.
 * Idempotent (onConflict code). À relancer après chaque ajout/modif de template.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-pcm-templates.ts
 *   Ajouter --dry-run pour prévisualiser sans écrire.
 */

import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEMPLATES_DIR = join(process.cwd(), 'pcm-templates')
const DRY_RUN = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SRK) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis')
  process.exit(1)
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SRK!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'))
  console.log(`${files.length} template(s) trouvé(s): ${files.join(', ')}`)

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'))
    const row = {
      code: raw.code,
      nom: raw.nom,
      description: raw.description ?? null,
      type: raw.type,
      juridiction_code: raw.juridiction_code ?? 'MU',
      version: raw.version,
      is_active: true,
      comptes_json: { comptes: raw.comptes },
      prerequisites: raw.prerequisites ?? [],
    }

    if (DRY_RUN) {
      console.log(`[dry-run] ${row.code} (${row.type}) — ${raw.comptes.length} comptes, v${row.version}`)
      continue
    }

    const { error } = await supabase
      .from('pcm_templates')
      .upsert(row, { onConflict: 'code' })
    if (error) {
      console.error(`❌ ${row.code}: ${error.message}`)
    } else {
      console.log(`✓ ${row.code} (${raw.comptes.length} comptes, v${row.version})`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
