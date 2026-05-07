// Régularise l'écart débit/crédit de chaque bulletin de paie déséquilibré.
//
// Cause racine : pour 56 bulletins sur 96 (OCC), le `salaire_net` du bulletin
// est incohérent avec `salaire_brut - retenues_salariales` — origine probable
// dans le calculateur de paie ou saisie manuelle. La fonction Postgres
// generer_ecritures_paie écrit les valeurs telles quelles → écart D/C par
// bulletin, qui se cumule en 382k MUR de désequilibre du Grand Livre.
//
// Solution non-invasive : pour chaque bulletin déséquilibré, ajouter UNE
// écriture sur le compte 471 "Comptes d'attente — régularisation paie"
// du montant exact de l'écart. Le total Grand Livre revient à 0 ; le solde
// du 471 trace tous les bulletins à corriger côté RH.
//
// Le PCM mauricien autorise 471 comme compte transitoire avant régul finale.
//
// Usage : node scripts/regul-paie.mjs [--apply]

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

// 1. Charge toutes les écritures OD-PAIE
async function fetchAll(builder) {
  const all = []; let from = 0; const PAGE = 1000
  while (true) {
    const { data, error } = await builder.range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data); if (data.length < PAGE) break; from += PAGE
  }
  return all
}

const ecr = await fetchAll(sb.from('ecritures_comptables_v2')
  .select('id, ref_folio, date_ecriture, exercice, debit_mur, credit_mur, numero_compte, libelle')
  .eq('societe_id', SOCIETE_ID).eq('journal', 'OD-PAIE'))

console.log(`Écritures OD-PAIE: ${ecr.length}`)

// 2. Supprime les régularisations déjà posées (idempotent)
if (APPLY) {
  const { count: nbDel } = await sb.from('ecritures_comptables_v2')
    .delete({ count: 'exact' })
    .eq('societe_id', SOCIETE_ID)
    .eq('journal', 'OD-PAIE')
    .eq('numero_compte', '471')
    .like('libelle', 'Régul écart bulletin%')
  console.log(`Anciennes régul supprimées: ${nbDel || 0}`)
}

// 3. Pour chaque bulletin (ref_folio), calcule l'écart
const byBulletin = new Map()
for (const e of ecr) {
  if (e.numero_compte === '471') continue // ignore les régul existantes
  const slot = byBulletin.get(e.ref_folio) || { d: 0, c: 0, date: e.date_ecriture, exercice: e.exercice, libellePersonne: '' }
  slot.d += Number(e.debit_mur) || 0
  slot.c += Number(e.credit_mur) || 0
  // Capture le nom de la personne depuis un libellé
  const m = e.libelle?.match(/—\s*(.+?)$/)
  if (m && !slot.libellePersonne) slot.libellePersonne = m[1].trim().slice(0, 60)
  byBulletin.set(e.ref_folio, slot)
}

const desequilibres = [...byBulletin.entries()]
  .map(([ref, v]) => ({ ref, ...v, ecart: v.d - v.c }))
  .filter((b) => Math.abs(b.ecart) > 0.01)

console.log(`\n${desequilibres.length} bulletins déséquilibrés sur ${byBulletin.size} :`)
console.log(`Écart total: ${desequilibres.reduce((s, b) => s + b.ecart, 0).toFixed(2)} MUR`)

// 4. Pour chaque bulletin déséquilibré, INSERT une ligne régul sur 471
const regulEntries = desequilibres.map((b) => {
  // Ecart > 0 : débit > crédit → on crédite 471 pour rééquilibrer
  // Ecart < 0 : crédit > débit → on débite 471 pour rééquilibrer
  const debit = b.ecart < 0 ? -b.ecart : 0
  const credit = b.ecart > 0 ? b.ecart : 0
  return {
    societe_id: SOCIETE_ID,
    date_ecriture: b.date,
    journal: 'OD-PAIE',
    ref_folio: b.ref,
    numero_piece: b.ref,
    numero_compte: '471',
    nom_compte: "Comptes d'attente — régul paie",
    libelle: `Régul écart bulletin ${b.libellePersonne || b.ref.slice(0, 12)}`,
    description: `Régul auto écart D/C bulletin ${b.ref}`,
    debit_mur: Math.round(debit * 100) / 100,
    credit_mur: Math.round(credit * 100) / 100,
    exercice: b.exercice,
  }
})

console.log(`\nLignes régul à créer: ${regulEntries.length}`)
if (APPLY && regulEntries.length > 0) {
  // Insert par lots de 100 pour éviter timeouts
  let inserted = 0
  for (let i = 0; i < regulEntries.length; i += 100) {
    const batch = regulEntries.slice(i, i + 100)
    const { error } = await sb.from('ecritures_comptables_v2').insert(batch)
    if (error) { console.error(`Batch ${i}: ${error.message}`); continue }
    inserted += batch.length
  }
  console.log(`Régul insérées: ${inserted}`)
}

// 5. Re-vérification balance globale
const all = await fetchAll(sb.from('ecritures_comptables_v2')
  .select('debit_mur, credit_mur, journal').eq('societe_id', SOCIETE_ID))
const sumD = all.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
const sumC = all.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
console.log(`\nGrand Livre:  Débit = ${sumD.toFixed(2)}  |  Crédit = ${sumC.toFixed(2)}  |  Écart = ${(sumD-sumC).toFixed(2)} MUR`)

const byJ = new Map()
for (const e of all) {
  const slot = byJ.get(e.journal) || { d: 0, c: 0 }
  slot.d += Number(e.debit_mur) || 0; slot.c += Number(e.credit_mur) || 0
  byJ.set(e.journal, slot)
}
console.log('\nPar journal:')
;[...byJ.entries()].forEach(([k, v]) => console.log(`  ${(k||'?').padEnd(8)} | écart=${(v.d-v.c).toFixed(2).padStart(12)}`))
