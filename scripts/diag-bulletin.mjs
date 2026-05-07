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

// Cecilia bulletin BP-9b457ae6
const { data: cecilia } = await sb.from('bulletins_paie')
  .select('*')
  .eq('id', '9b457ae6-a35a-4000-97b6-692788c4c135')
  .maybeSingle()
if (cecilia) {
  console.log('Bulletin Cecilia PAUL:')
  console.log(`  salaire_base: ${cecilia.salaire_base}`)
  console.log(`  salaire_brut: ${cecilia.salaire_brut}`)
  console.log(`  salaire_net: ${cecilia.salaire_net}`)
  console.log(`  basic_pay: ${cecilia.basic_pay}`)
  console.log(`  transport: ${cecilia.transport_allowance}`)
  console.log(`  petrol: ${cecilia.petrol_allowance}`)
  console.log(`  heures_sup: ${cecilia.heures_sup_montant}`)
  console.log(`  primes: ${cecilia.special_allowance_1} / ${cecilia.special_allowance_2} / ${cecilia.special_allowance_3}`)
  console.log(`  csg_sal: ${cecilia.csg_salarie} | csg_pat: ${cecilia.csg_patronal}`)
  console.log(`  nsf_sal: ${cecilia.nsf_salarie} | nsf_pat: ${cecilia.nsf_patronal}`)
  console.log(`  paye: ${cecilia.paye}`)
  console.log(`  prgf: ${cecilia.prgf}`)
  console.log(`  training: ${cecilia.training_levy}`)
  console.log(`  eoy_bonus: ${cecilia.eoy_bonus}`)
  console.log(`  net_a_payer: ${cecilia.net_a_payer}`)
  
  // Vérification arithmétique
  const debits = (cecilia.salaire_brut || 0) + (cecilia.csg_patronal || 0) + (cecilia.nsf_patronal || 0) + (cecilia.training_levy || 0) + (cecilia.prgf || 0) + (cecilia.eoy_bonus || 0)
  const credits = (cecilia.salaire_net || 0) + (cecilia.csg_salarie || 0) + (cecilia.nsf_salarie || 0) + (cecilia.paye || 0) + (cecilia.csg_patronal || 0) + (cecilia.nsf_patronal || 0) + (cecilia.training_levy || 0) + (cecilia.prgf || 0)
  console.log(`\n  Total débits attendus: ${debits.toFixed(2)}`)
  console.log(`  Total crédits attendus: ${credits.toFixed(2)}`)
  console.log(`  ECART: ${(debits - credits).toFixed(2)}`)
  
  // Si le brut était différent
  console.log(`\n  Si on prenait salaire_net + retenues_salariales:`)
  const calcBrut = (cecilia.salaire_net || 0) + (cecilia.csg_salarie || 0) + (cecilia.nsf_salarie || 0) + (cecilia.paye || 0)
  console.log(`  = net (${cecilia.salaire_net}) + csg_sal (${cecilia.csg_salarie}) + nsf_sal (${cecilia.nsf_salarie}) + paye (${cecilia.paye}) = ${calcBrut}`)
  console.log(`  vs salaire_brut enregistré: ${cecilia.salaire_brut}`)
  console.log(`  écart brut: ${(calcBrut - (cecilia.salaire_brut || 0)).toFixed(2)}`)
}
