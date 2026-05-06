// Migration one-shot : remappe les transactions persistées par
// /api/agent/rapprochement vers le format "suggestion à valider" attendu
// par le front Lexora.
//
// Statuts cibles :
//   - Match agent (avec facture_id) → "propose" (en attente validation humaine)
//   - Classification agent (avec compte_comptable suggéré) → "a_verifier"
//   - Sans match ni classif → "non_identifie"
//
// Idempotent. Migre les statuts précédents :
//   - "suggested"  (legacy v1)
//   - "rapproche"  + lettre "agent-*"/"ai-*"  (legacy v2)
//   - "non_identifie" + matched_strategy="classification_agent"  (legacy v2)
//
// Usage : node scripts/migrate-agent-suggestions.mjs <societe_id>

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadDotEnv(path.join(repoRoot, ".env.local"))

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

async function sbFetch(pathSuffix, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1${pathSuffix}`
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: init.method === "PATCH" ? "return=minimal" : "return=representation",
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`${init.method || "GET"} ${pathSuffix} → ${res.status}: ${txt.slice(0, 200)}`)
  }
  if (res.status === 204) return null
  return res.json()
}

const PCM_BY_CLASSIFICATION = {
  frais_bancaires: "6270",
  salaire_bulk: "4210",
  salaire_individuel: "4210",
  paiement_mra: "4330",
  virement_interne: "5811",
  transfert_interne: "5811",
  interets: "6611",
  agios: "6611",
  charges_sociales: "4310",
  remboursement_pret: "1641",
  reversal_salaire: "4210",
}

let lettreCounter = 0
function nextLettre() {
  lettreCounter++
  return `AG${String(Date.now()).slice(-6)}${String(lettreCounter).padStart(3, "0")}`
}

async function main() {
  const societeId = process.argv[2]
  if (!societeId) {
    console.error("Usage: node scripts/migrate-agent-suggestions.mjs <societe_id>")
    process.exit(1)
  }

  console.log(`Migration des suggestions agent pour société ${societeId}…`)

  const releves = await sbFetch(
    `/releves_bancaires?select=id,transactions_json&societe_id=eq.${societeId}`
  )
  console.log(`  ${releves.length} relevés à inspecter`)

  // Reconnaît une tx créée par l'agent — par lettre "agent-*", "ai-*", ou
  // matched_strategy=classification_agent/claude_semantic.
  function isAgentTx(tx) {
    if (!tx || typeof tx !== "object") return false
    const lettre = (tx.lettre || "").toString()
    if (lettre.startsWith("agent-") || lettre.startsWith("ai-") || lettre.startsWith("AG")) return true
    const strat = (tx.matched_strategy || "").toString()
    if (
      strat === "classification_agent" ||
      strat === "claude_semantic" ||
      strat.startsWith("supplier_") ||
      strat.startsWith("amount_")
    ) return true
    if (tx.suggestion_source === "agent_algo" || tx.suggestion_source === "agent_ai") return true
    if (tx.statut === "suggested") return true
    return false
  }

  let touchedReleves = 0
  let touchedTx = 0
  for (const r of releves) {
    const arr = Array.isArray(r.transactions_json) ? [...r.transactions_json] : []
    let dirty = false
    for (let i = 0; i < arr.length; i++) {
      const tx = arr[i] || {}
      if (!isAgentTx(tx)) continue

      const next = { ...tx }
      const fids = Array.isArray(tx.facture_ids) ? tx.facture_ids : []
      const isAi =
        (tx.lettre || "").startsWith("ai-") ||
        tx.matched_strategy === "claude_semantic" ||
        tx.suggestion_source === "agent_ai" ||
        tx.classification_suggestion?.source === "claude_semantic"

      if (fids.length > 0) {
        // Match → statut "propose" (en attente de validation humaine)
        next.statut = "propose"
        next.facture_id = fids[0]
        next.facture_ids = fids
        next.matched_type =
          fids.length > 1
            ? tx.matched_strategy || "amount_multi_facture"
            : tx.matched_strategy || "supplier_match"
        next.match_confidence = `${isAi ? "ai" : "agent"}_${Math.round((tx.matched_confidence || 0.7) * 100)}`
        next.matched_confidence = tx.matched_confidence
        next.matched_strategy = tx.matched_strategy
        next.lettre = tx.lettre || nextLettre()
        next.rapproche_at = tx.rapproche_at || new Date().toISOString()
        next.suggestion_source = isAi ? "agent_ai" : "agent_algo"
        if (fids.length > 1) {
          next.rapprochement_multi = true
          next.nb_factures = fids.length
        }
        next.note = isAi
          ? "Suggestion IA Claude — à valider"
          : "Suggestion agent (algo) — à valider"
      } else if (tx.classification || tx.classification_suggestion || tx.compte_comptable) {
        // Classification → statut "a_verifier" (PCM suggéré, en attente)
        const cls =
          tx.classification ||
          tx.classification_suggestion?.type ||
          ""
        const proposedPcm =
          tx.classification_suggestion?.compte_pcm ||
          PCM_BY_CLASSIFICATION[cls] ||
          tx.compte_comptable ||
          null
        next.statut = "a_verifier"
        next.compte_comptable = proposedPcm
        next.classification = cls
        next.matched_strategy = tx.matched_strategy || "classification_agent"
        next.match_confidence = `${isAi ? "ai" : "agent"}_${Math.round((tx.matched_confidence || tx.classification_suggestion?.confidence || 0.7) * 100)}`
        next.suggestion_source = isAi ? "agent_ai" : "agent_algo"
        next.note = tx.classification_suggestion?.note || `Classification suggérée (${cls}) — à valider`
      } else {
        next.statut = "non_identifie"
      }

      arr[i] = next
      dirty = true
      touchedTx++
    }

    if (dirty) {
      await sbFetch(`/releves_bancaires?id=eq.${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ transactions_json: arr }),
      })
      touchedReleves++
      const proposes = arr.filter((t) => t.statut === "propose").length
      const aVerifier = arr.filter((t) => t.statut === "a_verifier").length
      console.log(
        `  ✓ relevé ${r.id.slice(0, 8)}… : ${proposes} matchs (propose) / ${aVerifier} classifs (a_verifier)`
      )
    }
  }

  console.log(`\nTerminé. ${touchedReleves} relevés modifiés, ${touchedTx} tx migrées.`)
}

main().catch((err) => {
  console.error("FAILED:", err?.message || err)
  process.exit(1)
})
