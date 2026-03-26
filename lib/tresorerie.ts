import { createClient } from '@supabase/supabase-js'

// Bank of Mauritius reference exchange rates
const TAUX_CHANGE: Record<string, number> = {
  EUR: 46.50,
  GBP: 54.20,
  USD: 44.80,
  MUR: 1,
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface CompteBalance {
  id: string
  banque: string
  nom_compte: string | null
  numero_compte: string | null
  devise: string
  solde_actuel: number
  solde_mur: number
  compte_principal: boolean
  date_dernier_releve: string | null
}

export interface TresorerieConsolidee {
  total_mur: number
  total_eur: number
  total_gbp: number
  total_converti_mur: number
  comptes: CompteBalance[]
  nb_comptes: number
  date_derniere_maj: string | null
}

export function convertToMUR(amount: number, devise: string): number {
  const taux = TAUX_CHANGE[devise] || 1
  return amount * taux
}

export function getTauxChange(devise: string): number {
  return TAUX_CHANGE[devise] || 1
}

export async function calculerTresorerieConsolidee(societeId: string): Promise<TresorerieConsolidee> {
  const supabase = getSupabase()

  const { data: comptes } = await supabase
    .from('comptes_bancaires')
    .select('*')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .order('ordre_affichage')

  if (!comptes || comptes.length === 0) {
    return { total_mur: 0, total_eur: 0, total_gbp: 0, total_converti_mur: 0, comptes: [], nb_comptes: 0, date_derniere_maj: null }
  }

  const comptesBalances: CompteBalance[] = comptes.map(c => ({
    id: c.id,
    banque: c.banque,
    nom_compte: c.nom_compte,
    numero_compte: c.numero_compte,
    devise: c.devise,
    solde_actuel: c.solde_actuel || 0,
    solde_mur: convertToMUR(c.solde_actuel || 0, c.devise),
    compte_principal: c.compte_principal,
    date_dernier_releve: c.date_dernier_releve,
  }))

  const total_mur = comptesBalances.filter(c => c.devise === 'MUR').reduce((s, c) => s + c.solde_actuel, 0)
  const total_eur = comptesBalances.filter(c => c.devise === 'EUR').reduce((s, c) => s + c.solde_actuel, 0)
  const total_gbp = comptesBalances.filter(c => c.devise === 'GBP').reduce((s, c) => s + c.solde_actuel, 0)
  const total_converti_mur = comptesBalances.reduce((s, c) => s + c.solde_mur, 0)

  const dates = comptesBalances.map(c => c.date_dernier_releve).filter(Boolean) as string[]
  const date_derniere_maj = dates.length > 0 ? dates.sort().reverse()[0] : null

  return {
    total_mur,
    total_eur,
    total_gbp,
    total_converti_mur,
    comptes: comptesBalances,
    nb_comptes: comptesBalances.length,
    date_derniere_maj,
  }
}
