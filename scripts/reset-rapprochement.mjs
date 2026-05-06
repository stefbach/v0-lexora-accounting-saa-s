// Reset complet pour une société : rapprochements + écritures comptables
// liées aux paiements/factures. Idempotent. Service-role direct (pas
// besoin d'auth navigateur).
//
// Usage : node scripts/reset-rapprochement.mjs <societe_id>

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

async function sb(pathSuffix, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1${pathSuffix}`
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "count=exact",
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${pathSuffix} → ${res.status}: ${text.slice(0, 200)}`)
  }
  const range = res.headers.get("content-range")
  const count = range ? parseInt(range.split("/")[1] || "0", 10) : 0
  let body = null
  try { body = text ? JSON.parse(text) : null } catch {}
  return { body, count }
}

async function main() {
  const societeId = process.argv[2]
  if (!societeId) {
    console.error("Usage: node scripts/reset-rapprochement.mjs <societe_id>")
    process.exit(1)
  }

  console.log(`\n⚠ RESET RAPPROCHEMENT — société ${societeId}\n`)

  // 1. Supprime écritures factures FAC-*
  const r1 = await sb(`/ecritures_comptables_v2?societe_id=eq.${societeId}&ref_folio=like.FAC-*`, {
    method: "DELETE",
  })
  console.log(`  ✓ Écritures factures (FAC-*) supprimées : ${r1.count}`)

  // 2. Supprime écritures paiements BANK-* et PAY-*
  const r2 = await sb(
    `/ecritures_comptables_v2?societe_id=eq.${societeId}&or=(ref_folio.like.BANK-*,ref_folio.like.PAY-*)`,
    { method: "DELETE" }
  )
  console.log(`  ✓ Écritures paiements (BANK-*/PAY-*) supprimées : ${r2.count}`)

  // 3. Supprime écritures legacy BNQ sans ref_folio
  const r3 = await sb(
    `/ecritures_comptables_v2?societe_id=eq.${societeId}&journal=eq.BNQ&ref_folio=is.null`,
    { method: "DELETE" }
  )
  console.log(`  ✓ Écritures BNQ legacy (sans ref_folio) supprimées : ${r3.count}`)

  // 4. Remet les factures à en_attente
  const r4 = await sb(`/factures?societe_id=eq.${societeId}&statut=neq.annule`, {
    method: "PATCH",
    body: JSON.stringify({
      statut: "en_attente",
      rapproche_releve_id: null,
      rapproche_transaction_idx: null,
      rapproche_date: null,
      rapproche_by: null,
      rapproche_source: null,
      solde_non_paye: null,
    }),
  })
  console.log(`  ✓ Factures réinitialisées (statut=en_attente) : ${r4.count}`)

  // 5. Remet toutes les tx bancaires à non_identifie (clear lettre, facture_id, etc.)
  const { body: releves } = await sb(
    `/releves_bancaires?select=id,transactions_json&societe_id=eq.${societeId}`
  )
  let nbReleves = 0
  let nbTx = 0
  for (const r of releves || []) {
    const arr = Array.isArray(r.transactions_json) ? r.transactions_json : []
    if (arr.length === 0) continue
    const cleaned = arr.map((tx) => {
      const next = { ...tx }
      next.statut = "non_identifie"
      delete next.facture_id
      delete next.facture_ids
      delete next.matched_type
      delete next.matched_strategy
      delete next.matched_confidence
      delete next.match_confidence
      delete next.classification
      delete next.classification_suggestion
      delete next.compte_comptable
      delete next.lettre
      delete next.rapproche_at
      delete next.rapprochement_multi
      delete next.nb_factures
      delete next.suggestion_source
      delete next.note
      return next
    })
    await sb(`/releves_bancaires?id=eq.${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        transactions_json: cleaned,
        statut_rapprochement: "en_attente",
      }),
    })
    nbReleves++
    nbTx += cleaned.length
  }
  console.log(`  ✓ Relevés réinitialisés : ${nbReleves} (${nbTx} transactions à non_identifie)`)

  console.log(`\n✓ Reset terminé pour ${societeId}.`)
  console.log(`  Tu peux relancer Lex Banque depuis /client/rapprochement.`)
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message || err)
  process.exit(1)
})
