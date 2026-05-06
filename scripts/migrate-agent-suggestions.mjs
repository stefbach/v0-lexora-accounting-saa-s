// Migration one-shot : remappe les transactions persistées par
// /api/agent/rapprochement (statut "suggested" + facture_ids[] +
// matched_strategy) vers le format attendu par le front Lexora
// (statut "rapproche" + facture_id singulier + matched_type).
//
// Mappage classifications → compte_comptable PCM par défaut :
//   frais_bancaires      → 6270
//   salaire_bulk         → 4210
//   paiement_mra         → 4330
//   virement_interne     → 5811
//   interets / agios     → 6611
//   charges_sociales     → 4310
//
// Idempotent. Safe à relancer (skip les tx déjà au format "rapproche").
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

  let touchedReleves = 0
  let touchedTx = 0
  for (const r of releves) {
    const arr = Array.isArray(r.transactions_json) ? [...r.transactions_json] : []
    let dirty = false
    for (let i = 0; i < arr.length; i++) {
      const tx = arr[i] || {}
      if (tx.statut !== "suggested") continue

      const next = { ...tx }
      const fids = Array.isArray(tx.facture_ids) ? tx.facture_ids : []

      if (fids.length > 0) {
        next.statut = "rapproche"
        next.facture_id = fids[0]
        next.facture_ids = fids
        next.matched_type =
          fids.length > 1
            ? tx.matched_strategy || "amount_multi_facture"
            : tx.matched_strategy || "supplier_match"
        next.match_confidence = `agent_${Math.round((tx.matched_confidence || 0.7) * 100)}`
        next.matched_confidence = tx.matched_confidence
        next.matched_strategy = tx.matched_strategy
        next.lettre = tx.lettre || nextLettre()
        next.rapproche_at = tx.rapproche_at || new Date().toISOString()
        if (fids.length > 1) {
          next.rapprochement_multi = true
          next.nb_factures = fids.length
        }
        next.note = tx.note || "Rapprochement automatique (agent)"
      } else if (tx.classification || tx.classification_suggestion) {
        const cls =
          tx.classification ||
          tx.classification_suggestion?.type ||
          ""
        const proposedPcm =
          tx.classification_suggestion?.compte_pcm ||
          PCM_BY_CLASSIFICATION[cls] ||
          null
        next.statut = "non_identifie"
        next.compte_comptable = tx.compte_comptable || proposedPcm
        next.classification = cls
        next.matched_strategy = tx.matched_strategy || "classification_agent"
        next.note = tx.classification_suggestion?.note || `Classification automatique (${cls})`
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
      const rapprochees = arr.filter((t) => t.statut === "rapproche").length
      const classifiees = arr.filter((t) => t.statut === "non_identifie" && t.compte_comptable).length
      console.log(
        `  ✓ relevé ${r.id.slice(0, 8)}… : ${rapprochees} rapprochées / ${classifiees} classifiées`
      )
    }
  }

  console.log(`\nTerminé. ${touchedReleves} relevés modifiés, ${touchedTx} tx migrées.`)
}

main().catch((err) => {
  console.error("FAILED:", err?.message || err)
  process.exit(1)
})
