// Helpers partagés pour les scripts n8n.
// Charge .env.local, expose un client API n8n minimal et le nom canonique
// de la credential Supabase.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

export const SUPABASE_CRED_NAME = "Lexora Supabase (service_role)"
export const SUPABASE_API_CRED_NAME = "Lexora Supabase API"

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  const lines = fs.readFileSync(file, "utf8").split("\n")
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv(path.join(repoRoot, ".env.local"))
loadDotEnv(path.join(repoRoot, ".env"))

function required(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing env var: ${name} (set it in .env.local)`)
    process.exit(1)
  }
  return v
}

export const env = {
  n8nBaseUrl: required("N8N_BASE_URL").replace(/\/$/, ""),
  n8nApiKey: required("N8N_API_KEY"),
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
  supabaseServiceRole: required("SUPABASE_SERVICE_ROLE_KEY"),
}

export const repoPaths = {
  root: repoRoot,
  workflows: path.join(repoRoot, "n8n-workflows"),
}

async function n8nFetch(pathSuffix, init = {}) {
  const url = `${env.n8nBaseUrl}/api/v1${pathSuffix}`
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-N8N-API-KEY": env.n8nApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body)
    throw new Error(`n8n API ${init.method || "GET"} ${pathSuffix} → ${res.status}: ${detail}`)
  }
  return body
}

export const n8n = {
  fetch: n8nFetch,

  async listWorkflows() {
    const all = []
    let cursor
    do {
      const qs = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : "?limit=100"
      const page = await n8nFetch(`/workflows${qs}`)
      all.push(...(page.data || []))
      cursor = page.nextCursor
    } while (cursor)
    return all
  },

  getWorkflow(id) {
    return n8nFetch(`/workflows/${id}`)
  },

  createWorkflow(workflow) {
    return n8nFetch(`/workflows`, {
      method: "POST",
      body: JSON.stringify(workflow),
    })
  },

  updateWorkflow(id, workflow) {
    return n8nFetch(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(workflow),
    })
  },

  deleteWorkflow(id) {
    return n8nFetch(`/workflows/${id}`, { method: "DELETE" })
  },

  activateWorkflow(id) {
    return n8nFetch(`/workflows/${id}/activate`, { method: "POST" })
  },

  deactivateWorkflow(id) {
    return n8nFetch(`/workflows/${id}/deactivate`, { method: "POST" })
  },

  listCredentials() {
    // The /credentials endpoint requires a different approach — n8n public API
    // does not list credentials, only allows create/delete. So we cache by name
    // in a local file when we create them.
    return null
  },

  createCredential(payload) {
    return n8nFetch(`/credentials`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  deleteCredential(id) {
    return n8nFetch(`/credentials/${id}`, { method: "DELETE" })
  },

  getCredentialSchema(type) {
    return n8nFetch(`/credentials/schema/${type}`)
  },
}

const credCacheFile = path.join(repoPaths.root, "n8n-workflows", ".credentials.json")

export function readCredentialCache() {
  if (!fs.existsSync(credCacheFile)) return {}
  try {
    return JSON.parse(fs.readFileSync(credCacheFile, "utf8"))
  } catch {
    return {}
  }
}

export function writeCredentialCache(cache) {
  fs.writeFileSync(credCacheFile, JSON.stringify(cache, null, 2) + "\n")
}
