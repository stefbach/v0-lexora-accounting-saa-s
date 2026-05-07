// Refait les écritures VTE/ACH créées par backfill-ecritures-occ.mjs avec
// conversion devise correcte (HT × taux, TVA × taux pour les factures EUR).
//
// Usage : node scripts/fix-devise-ecritures.mjs [--apply]

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

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

// 1. Récupère factures
const { data: factures } = await sb
  .from('factures')
  .select('*')
  .eq('societe_id', SOCIETE_ID)
  .not('statut', 'eq', 'brouillon')

// 2. Pour chaque facture, supprime les écritures VTE/ACH existantes (ref_folio FAC-<id>)
//    et insère les nouvelles avec conversion correcte.
let deleted = 0
let inserted = 0
const errors = []

for (const f of factures) {
  const refFolio = `FAC-${f.id}`
  const isClient = f.type_facture === 'client'
  const journal = isClient ? 'VTE' : 'ACH'

  if (APPLY) {
    // Delete previous VTE/ACH écritures pour cette facture (mais PAS les BNQ)
    const { error: delErr, count: nbDel } = await sb
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', SOCIETE_ID)
      .eq('ref_folio', refFolio)
      .in('journal', ['VTE', 'ACH'])
    if (delErr) { errors.push(`del ${f.numero_facture}: ${delErr.message}`); continue }
    deleted += nbDel || 0
  }

  // Conversion : si devise != MUR et taux > 0, on multiplie HT et TVA par taux.
  // Pour TTC, on utilise montant_mur (déjà converti).
  const devise = (f.devise || 'MUR').toUpperCase()
  const taux = Number(f.taux_change) || 1
  const isMurNative = devise === 'MUR' || taux === 1
  const ttcMur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
  const htBase = Number(f.montant_ht) || 0
  const tvaBase = Number(f.montant_tva) || 0
  let htMur = isMurNative ? htBase : Math.round(htBase * taux * 100) / 100
  let tvaMur = isMurNative ? tvaBase : Math.round(tvaBase * taux * 100) / 100
  // Reéquilibrage : si (HT + TVA) != TTC en MUR (arrondi), on ajuste HT pour
  // que la somme soit exacte (évite tout déséquilibre 411 vs 706/4457).
  const diff = ttcMur - (htMur + tvaMur)
  if (Math.abs(diff) > 0.01) {
    htMur = Math.round((htMur + diff) * 100) / 100
  }
  if (ttcMur <= 0) { errors.push(`${f.numero_facture}: TTC 0`); continue }
  const exercice = String(new Date(f.date_facture).getFullYear())
  const libelle = `${isClient ? 'Vente' : 'Achat'} ${f.numero_facture || ''} — ${f.tiers || ''}`.slice(0, 200)

  const entries = []
  if (isClient) {
    entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '411', nom_compte: 'Clients', libelle, description: libelle, debit_mur: ttcMur, credit_mur: 0, exercice, facture_id: f.id })
    if (htMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '706', nom_compte: 'Prestations', libelle, description: libelle, debit_mur: 0, credit_mur: htMur, exercice, facture_id: f.id })
    if (tvaMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '4457', nom_compte: 'TVA collectee', libelle, description: libelle, debit_mur: 0, credit_mur: tvaMur, exercice, facture_id: f.id })
  } else {
    if (htMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '607', nom_compte: 'Achats', libelle, description: libelle, debit_mur: htMur, credit_mur: 0, exercice, facture_id: f.id })
    if (tvaMur > 0) entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '4456', nom_compte: 'TVA deductible', libelle, description: libelle, debit_mur: tvaMur, credit_mur: 0, exercice, facture_id: f.id })
    entries.push({ societe_id: SOCIETE_ID, date_ecriture: f.date_facture, journal, ref_folio: refFolio, numero_piece: f.numero_facture, numero_compte: '401', nom_compte: 'Fournisseurs', libelle, description: libelle, debit_mur: 0, credit_mur: ttcMur, exercice, facture_id: f.id })
  }

  // Vérif balance interne
  const sumD = entries.reduce((s, e) => s + Number(e.debit_mur), 0)
  const sumC = entries.reduce((s, e) => s + Number(e.credit_mur), 0)
  if (Math.abs(sumD - sumC) > 0.01) {
    errors.push(`${f.numero_facture}: D=${sumD} C=${sumC} ecart=${(sumD-sumC).toFixed(2)}`)
    continue
  }

  if (APPLY) {
    const { error: insErr } = await sb.from('ecritures_comptables_v2').insert(entries)
    if (insErr) { errors.push(`ins ${f.numero_facture}: ${insErr.message}`); continue }
    inserted += entries.length
  } else {
    inserted += entries.length // simulé
  }
}

console.log(`Factures traitées: ${factures.length}`)
console.log(`Écritures supprimées: ${deleted}`)
console.log(`Écritures (re)créées: ${inserted}`)
if (errors.length) {
  console.log(`\nErreurs (${errors.length}):`)
  errors.slice(0, 20).forEach(e => console.log(`  ${e}`))
}

// Recompte final
const { count: nb411 } = await sb.from('ecritures_comptables_v2').select('*', { count: 'exact', head: true }).eq('societe_id', SOCIETE_ID).or('numero_compte.like.411%,numero_compte.like.401%')
const { count: nb706 } = await sb.from('ecritures_comptables_v2').select('*', { count: 'exact', head: true }).eq('societe_id', SOCIETE_ID).eq('numero_compte', '706')
const { count: nbLet } = await sb.from('ecritures_comptables_v2').select('*', { count: 'exact', head: true }).eq('societe_id', SOCIETE_ID).or('numero_compte.like.411%,numero_compte.like.401%').not('lettre', 'is', null)
console.log(`\n=== État final ===`)
console.log(`411x/401x: ${nb411}, lettrées: ${nbLet}`)
console.log(`Compte 706: ${nb706}`)
