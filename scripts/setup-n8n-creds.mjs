// Crée (ou recrée) les credentials Supabase dans l'instance n8n.
// Idempotent : si une credential du même nom est déjà présente dans le cache
// local, on la supprime puis on la recrée pour s'assurer que la valeur est à jour.
//
// Stocke les IDs dans n8n-workflows/.credentials.json (commitable, IDs ≠ secrets).
//
// Usage: node scripts/setup-n8n-creds.mjs

import {
  env,
  n8n,
  readCredentialCache,
  writeCredentialCache,
  SUPABASE_CRED_NAME,
  SUPABASE_API_CRED_NAME,
} from "./n8n-utils.mjs"

async function upsertCredential(name, type, data) {
  const cache = readCredentialCache()
  const existingId = cache[name]?.id

  if (existingId) {
    try {
      await n8n.deleteCredential(existingId)
      console.log(`  • deleted existing credential ${name} (${existingId})`)
    } catch (err) {
      console.log(`  • could not delete existing ${name} (${existingId}): ${err.message}`)
    }
  }

  const created = await n8n.createCredential({ name, type, data })
  cache[name] = { id: created.id, type }
  writeCredentialCache(cache)
  console.log(`  ✓ ${name} → id=${created.id} (type=${type})`)
  return created
}

async function main() {
  console.log("Setting up n8n credentials for Supabase…")
  console.log(`  n8n: ${env.n8nBaseUrl}`)
  console.log(`  supabase: ${env.supabaseUrl}`)

  // 1) Custom Auth credential — pour les nœuds HTTP Request
  //    Injecte les deux headers Supabase (apikey + Authorization Bearer)
  await upsertCredential(SUPABASE_CRED_NAME, "httpCustomAuth", {
    json: JSON.stringify({
      headers: {
        apikey: env.supabaseServiceRole,
        Authorization: `Bearer ${env.supabaseServiceRole}`,
      },
    }),
  })

  // 2) Native Supabase API credential — pour le nœud n8n-nodes-base.supabase
  await upsertCredential(SUPABASE_API_CRED_NAME, "supabaseApi", {
    host: env.supabaseUrl,
    serviceRole: env.supabaseServiceRole,
    allowedHttpRequestDomains: "all",
  })

  console.log("\nDone. Credentials are saved in n8n-workflows/.credentials.json")
}

main().catch((err) => {
  console.error("\nFAILED:", err.message)
  process.exit(1)
})
