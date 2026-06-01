/* eslint-disable no-console */
// =============================================================================
// scripts/seed-crm.ts
// Lance les connecteurs CRM et insère les résultats dans Supabase.
//
// Usage :
//   pnpm tsx scripts/seed-crm.ts --connector=cbrd --query="hotel" --limit=30
//   pnpm tsx scripts/seed-crm.ts --connector=yellowpages_mu --query="construction" --limit=50
//   pnpm tsx scripts/seed-crm.ts --connector=apollo --industrie="Manufacturing" --limit=25
//   pnpm tsx scripts/seed-crm.ts --all --industrie="Hotels"
//   pnpm tsx scripts/seed-crm.ts --dry-run --connector=cbrd --query="construction"
//
// Variables d'env requises :
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   APOLLO_API_KEY (optionnel — sinon connecteur apollo skip)
// =============================================================================

import { CONNECTORS, listConnectorNames } from '../lib/crm/connectors'
import { ingestPayloads } from '../lib/crm/ingest'
import type { CrmIngestPayload } from '../lib/crm/types'

function parseArgs(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=')
      out[k] = v ?? true
    }
  }
  return out
}

async function main() {
  const args = parseArgs()

  if (args.help) {
    console.log(`
Usage: pnpm tsx scripts/seed-crm.ts [options]

Options:
  --connector=<name>        Un seul connecteur : ${listConnectorNames().join(' | ')}
  --all                     Tous les connecteurs disponibles
  --query="..."             Mot-clé de recherche (obligatoire pour cbrd / yp)
  --industrie="..."         Filtre industrie
  --region="..."            Filtre région
  --limit=N                 Nombre max de résultats par connecteur (défaut 25)
  --dry-run                 N'écrit RIEN dans la base, juste affiche les résultats
  --help                    Affiche cette aide
`)
    return
  }

  const limit = Number(args.limit ?? 25)
  const query = (args.query as string) || undefined
  const industrie = (args.industrie as string) || undefined
  const region = (args.region as string) || undefined
  const dryRun = Boolean(args['dry-run'])

  let names: string[]
  if (args.all) {
    names = listConnectorNames()
  } else if (args.connector) {
    names = [String(args.connector)]
  } else {
    console.error('❌ --connector=<name> ou --all requis (--help pour la liste)')
    process.exit(1)
  }

  const allPayloads: CrmIngestPayload[] = []
  for (const name of names) {
    const conn = CONNECTORS[name]
    if (!conn) {
      console.warn(`⚠️  Connecteur "${name}" inconnu — skip`)
      continue
    }
    console.log(`\n🔍 [${name}] recherche query="${query ?? ''}" industrie="${industrie ?? ''}" limit=${limit}`)
    const res = await conn.search({ query, industrie, region, limit })
    console.log(`   → ${res.total} résultats`)
    if (res.errors.length) res.errors.forEach((e) => console.warn(`   ⚠️  ${e}`))
    allPayloads.push(...res.payloads)
  }

  console.log(`\n📦 Total à ingérer : ${allPayloads.length} sociétés`)
  if (allPayloads.length === 0) return

  if (dryRun) {
    console.log('\n--- DRY RUN — aucun écrit dans la base ---')
    console.log(JSON.stringify(allPayloads.slice(0, 5), null, 2))
    console.log(`\n(... + ${Math.max(0, allPayloads.length - 5)} payloads non affichés)`)
    return
  }

  console.log('\n💾 Ingestion en cours...')
  const result = await ingestPayloads(allPayloads, null)
  console.log('\n✅ Ingestion terminée :')
  console.log(`   Sociétés créées  : ${result.companies_created}`)
  console.log(`   Sociétés mises à jour : ${result.companies_updated}`)
  console.log(`   Contacts créés   : ${result.contacts_created}`)
  console.log(`   Contacts MAJ     : ${result.contacts_updated}`)
  console.log(`   Contacts opt-out : ${result.contacts_skipped_opt_out}`)
  if (result.errors.length) {
    console.log(`   ⚠️  Erreurs (${result.errors.length}) :`)
    result.errors.slice(0, 10).forEach((e) => console.log(`      - ${e}`))
  }
}

main().catch((err) => {
  console.error('💥 Crash :', err)
  process.exit(1)
})
