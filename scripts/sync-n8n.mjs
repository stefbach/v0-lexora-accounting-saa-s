// Déploie les workflows n8n versionnés dans n8n-workflows/ vers l'instance n8n.
//
// Usage:
//   node scripts/sync-n8n.mjs list
//   node scripts/sync-n8n.mjs push <fichier.json>
//   node scripts/sync-n8n.mjs push-all
//   node scripts/sync-n8n.mjs activate <id>
//   node scripts/sync-n8n.mjs deactivate <id>
//   node scripts/sync-n8n.mjs run <id>
//   node scripts/sync-n8n.mjs delete <id>
//
// Conventions du JSON:
//   - Le `name` du workflow sert de clé d'unicité côté serveur.
//   - Les credentials sont référencées par NOM (ex: "Lexora Supabase (service_role)").
//     Le script résout l'ID à la volée depuis n8n-workflows/.credentials.json.

import fs from "node:fs"
import path from "node:path"
import { env, n8n, repoPaths, readCredentialCache } from "./n8n-utils.mjs"

const ALLOWED_FIELDS = ["name", "nodes", "connections", "settings", "staticData"]

function resolveCredentials(workflow) {
  const cache = readCredentialCache()
  const nodes = workflow.nodes || []
  for (const node of nodes) {
    if (!node.credentials) continue
    for (const [credType, credRef] of Object.entries(node.credentials)) {
      if (credRef && typeof credRef === "object" && credRef.name && !credRef.id) {
        const cached = cache[credRef.name]
        if (!cached) {
          throw new Error(
            `Credential "${credRef.name}" not found in cache. ` +
              `Run: node scripts/setup-n8n-creds.mjs`
          )
        }
        node.credentials[credType] = { id: cached.id, name: credRef.name }
      }
    }
  }
}

function sanitizeForApi(workflow) {
  const out = {}
  for (const key of ALLOWED_FIELDS) {
    if (workflow[key] !== undefined) out[key] = workflow[key]
  }
  if (!out.settings) out.settings = { executionOrder: "v1" }
  if (!out.connections) out.connections = {}
  if (!out.nodes) out.nodes = []
  return out
}

async function findByName(name) {
  const all = await n8n.listWorkflows()
  return all.find((w) => w.name === name)
}

async function cmdList() {
  const all = await n8n.listWorkflows()
  console.log(`${all.length} workflows on ${env.n8nBaseUrl}\n`)
  for (const w of all) {
    const flag = w.active ? "●" : "○"
    console.log(`  ${flag} ${w.id}  ${w.name}`)
  }
}

async function cmdPush(file) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"))
  resolveCredentials(raw)
  const payload = sanitizeForApi(raw)

  const existing = await findByName(payload.name)
  if (existing) {
    const updated = await n8n.updateWorkflow(existing.id, payload)
    console.log(`✓ updated ${updated.id}  ${updated.name}`)
    return updated
  }
  const created = await n8n.createWorkflow(payload)
  console.log(`✓ created ${created.id}  ${created.name}`)
  return created
}

async function cmdPushAll() {
  const dir = repoPaths.workflows
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .sort()
  for (const f of files) {
    await cmdPush(path.join(dir, f))
  }
}

async function cmdActivate(id) {
  await n8n.activateWorkflow(id)
  console.log(`✓ activated ${id}`)
}

async function cmdDeactivate(id) {
  await n8n.deactivateWorkflow(id)
  console.log(`✓ deactivated ${id}`)
}

async function cmdDelete(id) {
  await n8n.deleteWorkflow(id)
  console.log(`✓ deleted ${id}`)
}

async function cmdRun(id) {
  // L'API publique n'expose pas /workflows/:id/execute pour les triggers
  // manuels. On guide l'utilisateur vers l'UI à la place.
  const wf = await n8n.getWorkflow(id)
  console.log(`Open in UI to run: ${env.n8nBaseUrl}/workflow/${wf.id}`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  switch (cmd) {
    case "list":
      return cmdList()
    case "push":
      if (!arg) throw new Error("Usage: push <file.json>")
      return cmdPush(arg)
    case "push-all":
      return cmdPushAll()
    case "activate":
      if (!arg) throw new Error("Usage: activate <id>")
      return cmdActivate(arg)
    case "deactivate":
      if (!arg) throw new Error("Usage: deactivate <id>")
      return cmdDeactivate(arg)
    case "delete":
      if (!arg) throw new Error("Usage: delete <id>")
      return cmdDelete(arg)
    case "run":
      if (!arg) throw new Error("Usage: run <id>")
      return cmdRun(arg)
    default:
      console.log(
        "Usage:\n" +
          "  node scripts/sync-n8n.mjs list\n" +
          "  node scripts/sync-n8n.mjs push <file.json>\n" +
          "  node scripts/sync-n8n.mjs push-all\n" +
          "  node scripts/sync-n8n.mjs activate <id>\n" +
          "  node scripts/sync-n8n.mjs deactivate <id>\n" +
          "  node scripts/sync-n8n.mjs delete <id>\n" +
          "  node scripts/sync-n8n.mjs run <id>"
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message)
  process.exit(1)
})
