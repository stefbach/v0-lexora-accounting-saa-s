// Reset complet de l'état Lex Banque pour OCC :
//   1. transactions_json : retire statut/lettre/facture_ids des tx non validées
//      manuellement (on ne touche PAS celles avec lettre user explicite)
//   2. factures : statut paye → en_attente si elles avaient été marquées payées
//      par le moteur agent (pas par saisie manuelle de paiement)
//   3. ecritures BNQ (ref_folio LIKE 'BANK-%') : supprimées (régénérées au
//      prochain apply)
//   4. ecritures lettrées 411x/401x via lettre BK-... : remet lettre=null
//
// Usage : node scripts/reset-lexbank.mjs [--apply]

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const idx = l.indexOf('=')
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
  })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const SOCIETE_ID = 'b010d75c-62a2-4aae-a52b-8c18261047f7'
const APPLY = process.argv.includes('--apply')

console.log(`Mode : ${APPLY ? 'APPLY (écrit)' : 'DRY RUN'}\n`)

// ── 1. Reset transactions_json ──────────────────────────────────────
const { data: relevs } = await sb
  .from('releves_bancaires')
  .select('id, transactions_json')
  .eq('societe_id', SOCIETE_ID)

let nbTxReset = 0
let nbTxKept = 0
const updates = []
for (const r of relevs || []) {
  const txs = Array.isArray(r.transactions_json) ? r.transactions_json : []
  let modified = false
  const newTxs = txs.map(tx => {
    // On garde intactes :
    //   - les tx classifiées manuellement (compte_comptable défini)
    //   - les tx interne validées par user (statut=interne ET pas de lettre 'agent-')
    if (tx.compte_comptable) {
      nbTxKept++
      return tx
    }
    // Reset toutes les autres : statut, lettre, fids, matched_type, etc.
    if (
      tx.statut === 'rapproche' ||
      tx.statut === 'propose' ||
      tx.statut === 'a_verifier' ||
      tx.statut === 'interne' ||
      tx.lettre ||
      (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0) ||
      tx.facture_id
    ) {
      modified = true
      nbTxReset++
      const {
        statut, lettre, facture_ids, facture_id, matched_type, match_confidence,
        note, rapproche_at, ecriture_id, ...rest
      } = tx
      return rest
    }
    return tx
  })
  if (modified) {
    updates.push({ id: r.id, transactions_json: newTxs })
  }
}

console.log(`Transactions reset : ${nbTxReset}`)
console.log(`Transactions gardées (manuelles) : ${nbTxKept}`)
if (APPLY) {
  for (const u of updates) {
    const { error } = await sb.from('releves_bancaires')
      .update({ transactions_json: u.transactions_json })
      .eq('id', u.id)
    if (error) console.warn(`  err releve ${u.id.slice(0,8)}: ${error.message}`)
  }
  console.log(`  → ${updates.length} relevés mis à jour`)
}

// ── 2. Factures : paye → en_attente si rapproche par agent ──────────
const { data: factsPayees } = await sb.from('factures')
  .select('id, numero_facture, statut, rapproche_releve_id, rapproche_source')
  .eq('societe_id', SOCIETE_ID)
  .eq('statut', 'paye')

const factToReset = (factsPayees || []).filter(f =>
  f.rapproche_source === 'agent' || f.rapproche_source === 'smart' ||
  f.rapproche_source === 'agent-bot' || !f.rapproche_source
)
console.log(`\nFactures payées à reset (source=agent/smart) : ${factToReset.length}`)
if (APPLY && factToReset.length > 0) {
  const { error } = await sb.from('factures')
    .update({
      statut: 'en_attente',
      rapproche_releve_id: null,
      rapproche_transaction_idx: null,
      rapproche_date: null,
      rapproche_source: null,
    })
    .in('id', factToReset.map(f => f.id))
  if (error) console.warn(`  err: ${error.message}`)
  else console.log(`  → ${factToReset.length} factures repassées en_attente`)
}

// ── 3. Écritures BNQ ref_folio BANK-* ────────────────────────────────
const { count: nbBnq } = await sb.from('ecritures_comptables_v2')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .eq('journal', 'BNQ')
  .like('ref_folio', 'BANK-%')

console.log(`\nÉcritures BNQ (BANK-*) à supprimer : ${nbBnq}`)
if (APPLY && nbBnq > 0) {
  const { error } = await sb.from('ecritures_comptables_v2')
    .delete()
    .eq('societe_id', SOCIETE_ID)
    .eq('journal', 'BNQ')
    .like('ref_folio', 'BANK-%')
  if (error) console.warn(`  err: ${error.message}`)
  else console.log(`  → ${nbBnq} écritures BNQ supprimées`)
}

// ── 4. Lettres BK-* posées sur 411x/401x → remet lettre=null ────────
//     Ces lettres viennent des paiements agent. On les retire pour que
//     Lex Livre puisse re-lettrer après un nouveau cycle.
const { data: lettrees } = await sb.from('ecritures_comptables_v2')
  .select('id, lettre')
  .eq('societe_id', SOCIETE_ID)
  .or('numero_compte.like.411%,numero_compte.like.401%')
  .not('lettre', 'is', null)
  .like('lettre', 'BK%')

console.log(`\nLettres BK* à retirer sur 411/401 : ${lettrees?.length || 0}`)
if (APPLY && lettrees && lettrees.length > 0) {
  const { error } = await sb.from('ecritures_comptables_v2')
    .update({ lettre: null, date_lettrage: null })
    .in('id', lettrees.map(e => e.id))
  if (error) console.warn(`  err: ${error.message}`)
  else console.log(`  → ${lettrees.length} lettres retirées`)
}

// ── 5. Vérification finale ──────────────────────────────────────────
const { data: relevsAfter } = await sb.from('releves_bancaires')
  .select('transactions_json').eq('societe_id', SOCIETE_ID)
let totalTx = 0, sansStatut = 0
for (const r of relevsAfter || []) {
  for (const tx of r.transactions_json || []) {
    totalTx++
    if (!tx.statut && !tx.lettre && !(tx.facture_ids?.length) && !tx.facture_id) sansStatut++
  }
}
const { count: nbFEnAttente } = await sb.from('factures')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .eq('statut', 'en_attente')
const { count: nbBnqAfter } = await sb.from('ecritures_comptables_v2')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .eq('journal', 'BNQ')
  .like('ref_folio', 'BANK-%')

console.log('\n=== État final ===')
console.log(`Transactions sans rapprochement : ${sansStatut} / ${totalTx}`)
console.log(`Factures en_attente : ${nbFEnAttente}`)
console.log(`Écritures BNQ BANK-* restantes : ${nbBnqAfter}`)

if (!APPLY) console.log('\n(dry run — pour appliquer : --apply)')
