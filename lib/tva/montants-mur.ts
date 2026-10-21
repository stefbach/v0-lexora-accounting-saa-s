// Conversion en MUR des montants d'une ligne de la table `factures`.
// Préférence à `montant_mur` (TTC déjà converti à l'OCR, taux du jour), ventilé
// au prorata HT/TVA ; sinon recalcul via `taux_change` ; sinon montant tel quel
// (facture en MUR). Ne jamais afficher ou sommer un montant_ht/montant_tva en
// devise étrangère (EUR/USD…) sous un libellé MUR.

type FactureMontants = {
  montant_ht?: number | string | null
  montant_tva?: number | string | null
  montant_ttc?: number | string | null
  montant_mur?: number | string | null
  taux_change?: number | string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function ttcOrigine(f: FactureMontants): number {
  return Number(f.montant_ttc) || (Number(f.montant_ht) + Number(f.montant_tva || 0)) || 0
}

function montantMurTTC(f: FactureMontants): number | null {
  const m = Number(f.montant_mur)
  return Number.isFinite(m) && m > 0 ? m : null
}

export function htMur(f: FactureMontants): number {
  const m = montantMurTTC(f)
  if (m !== null) {
    const ttc = ttcOrigine(f)
    const ht = Number(f.montant_ht) || 0
    if (ttc > 0 && ht > 0) return round2((ht / ttc) * m)
  }
  return round2((Number(f.montant_ht) || 0) * (Number(f.taux_change) || 1))
}

export function tvaMur(f: FactureMontants): number {
  const m = montantMurTTC(f)
  if (m !== null) {
    const ttc = ttcOrigine(f)
    if (ttc > 0) return round2(((Number(f.montant_tva) || 0) / ttc) * m)
  }
  return round2((Number(f.montant_tva) || 0) * (Number(f.taux_change) || 1))
}

export function ttcMur(f: FactureMontants): number {
  const m = montantMurTTC(f)
  if (m !== null) return round2(m)
  return round2((Number(f.montant_ttc) || 0) * (Number(f.taux_change) || 1))
}
