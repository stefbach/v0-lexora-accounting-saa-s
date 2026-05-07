// Backfill complet pour la société OCC :
//   1. Pour chaque facture sans écriture VTE/ACH → on génère
//   2. Pour chaque tx rapprochée avec facture_ids sans BNQ → on génère
//   3. Lance le lettrage (lib/accounting/lettrage)
//
// Usage : node scripts/backfill-ecritures-occ.mjs [--apply]
// Sans --apply : dry run (compte uniquement, n'écrit rien).

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

console.log(`Mode: ${APPLY ? 'APPLY (écriture)' : 'DRY RUN'}\n`)

// ── 1. Factures sans écritures ──────────────────────────────────────
const { data: factures } = await sb
  .from('factures')
  .select('*')
  .eq('societe_id', SOCIETE_ID)
  .not('statut', 'eq', 'brouillon')
  .order('date_facture')

console.log(`Factures: ${factures.length}`)

// Pour chaque facture, vérifie si elle a déjà des écritures (par facture_id ou par numero_piece)
const factSansEcr = []
for (const f of factures) {
  const { count } = await sb
    .from('ecritures_comptables_v2')
    .select('*', { count: 'exact', head: true })
    .eq('societe_id', SOCIETE_ID)
    .or(`facture_id.eq.${f.id},and(numero_piece.eq.${f.numero_facture || '___'},journal.in.(VTE,ACH))`)
  if (!count || count === 0) factSansEcr.push(f)
}
console.log(`  → sans écritures: ${factSansEcr.length}`)

// Génération (réimplémentation simplifiée de createEcrituresForFacture)
let ecrCreated = 0
const errors = []
if (APPLY) {
  for (const f of factSansEcr) {
    const isClient = f.type_facture === 'client'
    const journal = isClient ? 'VTE' : 'ACH'
    const ttcMur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
    const htMur = Number(f.montant_ht) || ttcMur
    const tvaMur = Number(f.montant_tva) || 0
    if (ttcMur <= 0) { errors.push(`facture ${f.numero_facture}: montant 0`); continue }
    const exercice = String(new Date(f.date_facture).getFullYear())
    const refFolio = `FAC-${f.id}`
    const libelle = `${isClient ? 'Vente' : 'Achat'} ${f.numero_facture || ''} — ${f.tiers || ''}`.slice(0, 200)
    const compteTier = isClient ? '411' : '401'
    const nomCompteTier = isClient ? 'Clients' : 'Fournisseurs'
    const entries = []
    if (isClient) {
      entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: compteTier, nom_compte: nomCompteTier, libelle, description: libelle, debit_mur: ttcMur, credit_mur: 0, exercice, facture_id: f.id })
      if (htMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '706', nom_compte: 'Prestations', libelle, description: libelle, debit_mur: 0, credit_mur: htMur, exercice, facture_id: f.id })
      if (tvaMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '4457', nom_compte: 'TVA collectee', libelle, description: libelle, debit_mur: 0, credit_mur: tvaMur, exercice, facture_id: f.id })
    } else {
      if (htMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '607', nom_compte: 'Achats', libelle, description: libelle, debit_mur: htMur, credit_mur: 0, exercice, facture_id: f.id })
      if (tvaMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '4456', nom_compte: 'TVA deductible', libelle, description: libelle, debit_mur: tvaMur, credit_mur: 0, exercice, facture_id: f.id })
      entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: compteTier, nom_compte: nomCompteTier, libelle, description: libelle, debit_mur: 0, credit_mur: ttcMur, exercice, facture_id: f.id })
    }
    const { error: insErr } = await sb.from('ecritures_comptables_v2').insert(entries)
    if (insErr) { errors.push(`facture ${f.numero_facture}: ${insErr.message}`); continue }
    ecrCreated += entries.length
  }
}
console.log(`  → écritures VTE/ACH créées: ${ecrCreated} (${errors.length} erreurs)`)

// ── 2. Tx rapprochées avec facture_ids sans BNQ ─────────────────────
const { data: relevs } = await sb
  .from('releves_bancaires')
  .select('id, compte_bancaire_id, transactions_json')
  .eq('societe_id', SOCIETE_ID)

const { data: comptesBc } = await sb
  .from('comptes_bancaires')
  .select('id, compte_comptable')
  .eq('societe_id', SOCIETE_ID)
const cbToCompte = {}
for (const c of comptesBc) cbToCompte[c.id] = c.compte_comptable

const txAvecFid = []
for (const r of relevs) {
  const txs = r.transactions_json || []
  txs.forEach((tx, idx) => {
    const fids = Array.isArray(tx.facture_ids) ? tx.facture_ids : (tx.facture_id ? [tx.facture_id] : [])
    if (fids.length === 0) return
    txAvecFid.push({ releve_id: r.id, idx, tx, fids, compte_banque: cbToCompte[r.compte_bancaire_id] })
  })
}
console.log(`\nTx rapprochées avec facture_ids: ${txAvecFid.length}`)

// Vérifie présence BNQ
const txSansBnq = []
for (const t of txAvecFid) {
  const ref = `BANK-${t.releve_id}-${t.idx}`
  const { count } = await sb
    .from('ecritures_comptables_v2')
    .select('*', { count: 'exact', head: true })
    .eq('societe_id', SOCIETE_ID)
    .eq('ref_folio', ref)
  if (!count) txSansBnq.push(t)
}
console.log(`  → sans BNQ: ${txSansBnq.length}`)

let bnqCreated = 0
if (APPLY) {
  for (const t of txSansBnq) {
    const tx = t.tx
    const isOutgoing = (Number(tx.debit) || 0) > 0
    const amount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
    if (amount <= 0) continue
    // Récupère 1ere facture pour info tiers
    const { data: facsTx } = await sb.from('factures').select('id, tiers, numero_facture, type_facture').in('id', t.fids)
    if (!facsTx || facsTx.length === 0) continue
    const tiers = (facsTx[0].tiers || tx.tiers || '').slice(0, 50)
    const datePay = tx.date || new Date().toISOString().slice(0, 10)
    const exercice = String(new Date(datePay).getFullYear())
    const refFolio = `BANK-${t.releve_id}-${t.idx}`
    const isSupplier = facsTx[0].type_facture === 'fournisseur'
    const lettre = `BK${Date.now().toString().slice(-6)}`
    // Contrainte SQL : numero_compte 3-5 digits ; compte_comptable peut être
    // 512100 (6 digits) → on tronque à 5 char.
    const compteBanqueRaw = t.compte_banque || '512'
    const compteBanque = String(compteBanqueRaw).slice(0, 5)
    const fid = t.fids.length === 1 ? t.fids[0] : null
    const libelle = `Paiement ${facsTx.map(f => f.numero_facture).filter(Boolean).join(',') || ''} — ${tiers}`.slice(0, 200)
    const base = { societe_id: SOCIETE_ID, date_ecriture: datePay, journal: 'BNQ', ref_folio: refFolio, libelle, description: libelle, exercice, facture_id: fid, lettre, date_lettrage: datePay }
    const tierSide = { ...base, numero_compte: isSupplier ? '401' : '411', nom_compte: isSupplier ? 'Fournisseurs' : 'Clients', debit_mur: isSupplier ? amount : 0, credit_mur: isSupplier ? 0 : amount }
    const bankSide = { ...base, numero_compte: compteBanque, nom_compte: compteBanque.startsWith('512') ? 'Banque' : 'Banque', debit_mur: isSupplier ? 0 : amount, credit_mur: isSupplier ? amount : 0 }
    const { error } = await sb.from('ecritures_comptables_v2').insert([tierSide, bankSide])
    if (error) { errors.push(`bnq ${refFolio}: ${error.message}`); continue }
    bnqCreated += 2
    // Pose la lettre sur la facture VTE/ACH liée si single
    if (fid) {
      await sb.from('ecritures_comptables_v2').update({ lettre, date_lettrage: datePay })
        .eq('societe_id', SOCIETE_ID).eq('facture_id', fid)
        .or('numero_compte.like.411%,numero_compte.like.401%').is('lettre', null)
    }
  }
}
console.log(`  → BNQ créées: ${bnqCreated}`)

// ── 3. Lettrage final ───────────────────────────────────────────────
console.log('\n=== Recompte après backfill ===')
const { count: nb411 } = await sb.from('ecritures_comptables_v2')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .or('numero_compte.like.411%,numero_compte.like.401%')
const { count: nbLettrees } = await sb.from('ecritures_comptables_v2')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .or('numero_compte.like.411%,numero_compte.like.401%')
  .not('lettre', 'is', null)
const { count: nbAvecFid } = await sb.from('ecritures_comptables_v2')
  .select('*', { count: 'exact', head: true })
  .eq('societe_id', SOCIETE_ID)
  .not('facture_id', 'is', null)
console.log(`Écritures 4[01]1x: ${nb411}, lettrées: ${nbLettrees}`)
console.log(`Écritures avec facture_id: ${nbAvecFid}`)

if (errors.length > 0) {
  console.log('\nErreurs (10 premières):')
  errors.slice(0, 10).forEach(e => console.log(`  ${e}`))
}

console.log('\nFini.')
