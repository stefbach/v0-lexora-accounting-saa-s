/**
 * lib/analytique/grille.ts — Grille analytique croisée (compte × section).
 *
 * Couche PURE : agrège des écritures direct-taguées et des ventilations en une
 * matrice compte × section, avec la part non affectée et les totaux. Sert le
 * tableau croisé et le compte de résultat analytique.
 */

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100
const num = (v: number | string | null | undefined): number => {
  const x = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(x as number) ? (x as number) : 0
}

export type Nature = 'charge' | 'produit'

export interface EcritureLigne {
  numero_compte: string
  nom_compte: string | null
  debit_mur: number | string | null
  credit_mur: number | string | null
  section_analytique_id: string | null
}

export interface VentilationLigne {
  numero_compte: string
  nom_compte: string | null
  section_analytique_id: string
  montant: number | string | null
}

export interface CompteRow {
  numero_compte: string
  nom_compte: string
  nature: Nature
  /** montant par section (id -> montant, nature-positif). */
  parSection: Record<string, number>
  total: number         // net total du compte (classe 6/7)
  affecte: number       // Σ des affectations (direct + ventilé)
  non_affecte: number   // total − affecte
}

export interface GrilleResult {
  comptes: CompteRow[]
  /** Totaux par section : charges, produits, marge. */
  totauxSection: Record<string, { charges: number; produits: number; marge: number }>
  total: { charges: number; produits: number; marge: number; charges_non_affectees: number; produits_non_affectes: number }
}

function natureOf(numeroCompte: string): Nature | null {
  const c = String(numeroCompte || '').charAt(0)
  if (c === '6') return 'charge'
  if (c === '7') return 'produit'
  return null
}

/** Net nature-positif d'une écriture (charge = D−C, produit = C−D). */
function netEcriture(e: EcritureLigne, nature: Nature): number {
  const d = num(e.debit_mur)
  const c = num(e.credit_mur)
  return nature === 'charge' ? d - c : c - d
}

/**
 * Construit la grille. `ecritures` = toutes les lignes de charge/produit ;
 * `ventilations` = les répartitions (sur écritures non taguées).
 */
export function buildGrille(ecritures: EcritureLigne[], ventilations: VentilationLigne[]): GrilleResult {
  const rows = new Map<string, CompteRow>()

  const ensure = (compte: string, nom: string, nature: Nature): CompteRow => {
    let r = rows.get(compte)
    if (!r) {
      r = { numero_compte: compte, nom_compte: nom || `Compte ${compte}`, nature, parSection: {}, total: 0, affecte: 0, non_affecte: 0 }
      rows.set(compte, r)
    }
    return r
  }

  for (const e of ecritures) {
    const nature = natureOf(e.numero_compte)
    if (!nature) continue
    const r = ensure(e.numero_compte, e.nom_compte || '', nature)
    const net = netEcriture(e, nature)
    r.total = round2(r.total + net)
    // Affectation directe (section_analytique_id) → compte pleinement affecté.
    if (e.section_analytique_id) {
      r.parSection[e.section_analytique_id] = round2((r.parSection[e.section_analytique_id] || 0) + net)
      r.affecte = round2(r.affecte + net)
    }
  }

  for (const v of ventilations) {
    const nature = natureOf(v.numero_compte)
    if (!nature) continue
    const r = ensure(v.numero_compte, v.nom_compte || '', nature)
    const m = round2(num(v.montant))
    r.parSection[v.section_analytique_id] = round2((r.parSection[v.section_analytique_id] || 0) + m)
    r.affecte = round2(r.affecte + m)
  }

  const totauxSection: Record<string, { charges: number; produits: number; marge: number }> = {}
  let totCharges = 0, totProduits = 0, chargesNA = 0, produitsNA = 0

  for (const r of rows.values()) {
    r.non_affecte = round2(r.total - r.affecte)
    for (const [sid, montant] of Object.entries(r.parSection)) {
      const t = (totauxSection[sid] ||= { charges: 0, produits: 0, marge: 0 })
      if (r.nature === 'charge') t.charges = round2(t.charges + montant)
      else t.produits = round2(t.produits + montant)
    }
    if (r.nature === 'charge') { totCharges = round2(totCharges + r.total); chargesNA = round2(chargesNA + r.non_affecte) }
    else { totProduits = round2(totProduits + r.total); produitsNA = round2(produitsNA + r.non_affecte) }
  }
  for (const sid of Object.keys(totauxSection)) {
    totauxSection[sid].marge = round2(totauxSection[sid].produits - totauxSection[sid].charges)
  }

  const comptes = [...rows.values()].sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
  return {
    comptes,
    totauxSection,
    total: {
      charges: totCharges, produits: totProduits, marge: round2(totProduits - totCharges),
      charges_non_affectees: chargesNA, produits_non_affectes: produitsNA,
    },
  }
}
