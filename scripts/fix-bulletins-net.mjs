// Corrige le salaire_net des bulletins existants OCC + régénère les
// écritures OD-PAIE puis supprime les régul 471 (devenues inutiles).
//
// À lancer APRÈS déploiement de mig 236 (qui ajoute le trigger et la fonction
// compute_salaire_net).
//
// Usage : node scripts/fix-bulletins-net.mjs [--apply]

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

// 1. Charge les bulletins
const { data: bulletins } = await sb
  .from('bulletins_paie')
  .select('id, employe_id, periode, salaire_brut, salaire_net, csg_salarie, nsf_salarie, paye, montant_absence, source')
  .eq('societe_id', SOCIETE_ID)

console.log(`Bulletins: ${bulletins.length}`)

// 2. Recalcul du net attendu pour chaque
const incoherents = []
for (const b of bulletins) {
  const expected = Math.max(
    0,
    Math.round(
      ((Number(b.salaire_brut) || 0)
        - (Number(b.csg_salarie) || 0)
        - (Number(b.nsf_salarie) || 0)
        - (Number(b.paye) || 0)
        - (Number(b.montant_absence) || 0)) * 100
    ) / 100
  )
  const diff = Math.round(((Number(b.salaire_net) || 0) - expected) * 100) / 100
  if (Math.abs(diff) > 1) {
    incoherents.push({ ...b, expected, diff })
  }
}
console.log(`Bulletins incohérents : ${incoherents.length}\n`)
console.log('5 premiers exemples:')
incoherents.slice(0, 5).forEach(b => console.log(
  `  ${b.id.slice(0,8)} | ${b.periode} | brut=${b.salaire_brut} | net actuel=${b.salaire_net} → recalculé=${b.expected} (écart ${b.diff})`
))

if (!APPLY) {
  console.log('\n(dry run — pour corriger : --apply)')
  process.exit(0)
}

// 3. Update du salaire_net
let updatedBulletins = 0
for (const b of incoherents) {
  const { error } = await sb
    .from('bulletins_paie')
    .update({ salaire_net: b.expected })
    .eq('id', b.id)
  if (error) console.warn(`  err update ${b.id.slice(0,8)}: ${error.message}`)
  else updatedBulletins++
}
console.log(`\n${updatedBulletins} bulletins corrigés`)

// 4. Régénération des écritures OD-PAIE pour les bulletins corrigés
//    via la RPC `generer_ecritures_paie` (mig 216)
let regen = 0, regenErr = 0
for (const b of incoherents) {
  const { error } = await sb.rpc('generer_ecritures_paie', { p_bulletin_id: b.id })
  if (error) { regenErr++; console.warn(`  err regen ${b.id.slice(0,8)}: ${error.message}`); continue }
  regen++
}
console.log(`\nRégénération OD-PAIE : ${regen} OK, ${regenErr} en erreur`)

// 5. Supprime les régul 471 anciennes (devenues inutiles)
const { count: nbRegulDel } = await sb
  .from('ecritures_comptables_v2')
  .delete({ count: 'exact' })
  .eq('societe_id', SOCIETE_ID)
  .eq('journal', 'OD-PAIE')
  .eq('numero_compte', '471')
  .like('libelle', 'Régul écart bulletin%')
console.log(`Régul 471 supprimées : ${nbRegulDel || 0}`)

// 6. Vérification balance finale
async function fetchAll() {
  const all = []; let from = 0; const PAGE = 1000
  while (true) {
    const { data } = await sb.from('ecritures_comptables_v2')
      .select('debit_mur, credit_mur, journal').eq('societe_id', SOCIETE_ID)
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...data); if (data.length < PAGE) break; from += PAGE
  }
  return all
}
const all = await fetchAll()
const sumD = all.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
const sumC = all.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
console.log(`\nGrand Livre final : D=${sumD.toFixed(2)} | C=${sumC.toFixed(2)} | écart=${(sumD-sumC).toFixed(2)} MUR`)

const byJ = new Map()
for (const e of all) {
  const slot = byJ.get(e.journal) || { d: 0, c: 0 }
  slot.d += Number(e.debit_mur) || 0; slot.c += Number(e.credit_mur) || 0
  byJ.set(e.journal, slot)
}
console.log('\nPar journal:')
;[...byJ.entries()].forEach(([k, v]) => console.log(`  ${(k||'?').padEnd(8)} | écart=${(v.d-v.c).toFixed(2).padStart(12)}`))
