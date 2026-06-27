/**
 * Tests d'audit automatiques — chaque constat est EXPLIQUÉ en langage naturel
 * (exigence auditeur : pas de flag sans justification). Tous purs.
 */
import type {
  TrialBalanceLine, EcritureStats, AuditFinding, LeadSchedule,
} from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const fmt = (n: number) => round2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function runAuditTests(input: {
  balanceN: TrialBalanceLine[]
  leadSchedules: LeadSchedule[]
  stats: EcritureStats
  seuilMaterialite: number
}): AuditFinding[] {
  const { balanceN, leadSchedules, stats, seuilMaterialite } = input
  const findings: Array<Omit<AuditFinding, 'key'>> = []

  // T1 — Équilibre de la balance (débit = crédit).
  const totalDebit = round2(balanceN.reduce((s, l) => s + l.total_debit, 0))
  const totalCredit = round2(balanceN.reduce((s, l) => s + l.total_credit, 0))
  const delta = round2(totalDebit - totalCredit)
  if (Math.abs(delta) >= 0.01) {
    findings.push({
      test: 'T1_equilibre',
      severity: 'critical',
      titre: 'Balance déséquilibrée',
      explication: `Le total des débits (${fmt(totalDebit)}) ne correspond pas au total des crédits (${fmt(totalCredit)}) — écart de ${fmt(delta)}. Une balance déséquilibrée empêche toute certification ; corriger avant l'audit.`,
      refs: [{ montant: delta, detail: 'écart débit - crédit' }],
    })
  }

  // T2 — Comptes utilisés mais absents du plan comptable.
  if (stats.comptesNonMappes.length > 0) {
    findings.push({
      test: 'T2_comptes_non_mappes',
      severity: 'warning',
      titre: `${stats.comptesNonMappes.length} compte(s) hors plan comptable`,
      explication: `Des écritures utilisent des numéros de compte absents du plan comptable : ${stats.comptesNonMappes.slice(0, 10).join(', ')}${stats.comptesNonMappes.length > 10 ? '…' : ''}. Rattacher ces comptes au PCM pour un mapping IFRS correct.`,
      refs: stats.comptesNonMappes.slice(0, 20).map((c) => ({ numero_compte: c })),
    })
  }

  // T3 — Variations N/N-1 supérieures à la matérialité (par rubrique).
  for (const ls of leadSchedules) {
    if (!ls.flagged) continue
    const pct = ls.variation_pct == null ? 'nouveau poste' : `${ls.variation_pct > 0 ? '+' : ''}${Math.round(ls.variation_pct)}%`
    findings.push({
      test: 'T3_variation_inexpliquee',
      severity: 'warning',
      titre: `Variation significative : ${ls.caption}`,
      explication: `Le poste « ${ls.caption} » varie de ${fmt(ls.variation)} (${pct}) entre N-1 (${fmt(ls.total_n1)}) et N (${fmt(ls.total_n)}), au-dessus du seuil de matérialité (${fmt(seuilMaterialite)}). Documenter la cause (test analytique).`,
      refs: [{ numero_compte: ls.code, montant: ls.variation }],
    })
  }

  // T4 — Soldes au sens anormal (charge créditrice, produit débiteur…).
  for (const l of balanceN) {
    const anormal =
      (l.sens_normal === 'D' && l.solde < -seuilMaterialite) ||
      (l.sens_normal === 'C' && l.solde > seuilMaterialite)
    if (anormal) {
      findings.push({
        test: 'T4_solde_anormal',
        severity: 'warning',
        titre: `Solde au sens inhabituel : ${l.numero_compte}`,
        explication: `Le compte ${l.numero_compte} « ${l.libelle} » (sens normal ${l.sens_normal === 'D' ? 'débiteur' : 'créditeur'}) présente un solde de ${fmt(l.solde)}, opposé à son sens habituel. Vérifier un éventuel reclassement ou une erreur d'imputation.`,
        refs: [{ numero_compte: l.numero_compte, montant: l.solde }],
      })
    }
  }

  // T5 — Doublons potentiels d'écritures.
  if (stats.doublons.length > 0) {
    const top = stats.doublons.slice(0, 10)
    findings.push({
      test: 'T5_doublons',
      severity: 'warning',
      titre: `${stats.doublons.length} doublon(s) d'écriture potentiel(s)`,
      explication: `Des écritures identiques (même date, compte, montant et libellé) apparaissent plusieurs fois — risque de double comptabilisation. Ex : ${top.map((d) => `${d.numero_compte} ${d.date} ${fmt(d.montant)} ×${d.count}`).join(' ; ')}.`,
      refs: top.map((d) => ({ numero_compte: d.numero_compte, montant: d.montant, detail: `${d.date} ×${d.count}` })),
    })
  }

  // T6 — Cut-off : écritures hors de la fenêtre de l'exercice.
  if (stats.horsExercice.length > 0) {
    findings.push({
      test: 'T6_cutoff',
      severity: 'critical',
      titre: `${stats.horsExercice.length} écriture(s) hors période`,
      explication: `Des écritures portent une date en dehors de l'exercice audité — problème de séparation des exercices (cut-off). Reclasser dans le bon exercice avant l'audit.`,
      refs: stats.horsExercice.slice(0, 20).map((e) => ({ numero_compte: e.numero_compte, montant: e.montant, detail: e.date })),
    })
  }

  // T7 — Comptes de tiers non lettrés (suivi des soldes ouverts).
  if (stats.tiersNonLettres.length > 0) {
    const total = round2(stats.tiersNonLettres.reduce((s, t) => s + t.montant, 0))
    findings.push({
      test: 'T7_tiers_non_lettres',
      severity: 'info',
      titre: `Lettrage incomplet sur ${stats.tiersNonLettres.length} compte(s) tiers`,
      explication: `Des comptes de tiers (classe 4) comportent des écritures non lettrées (total ${fmt(total)}). Préparer la balance âgée et justifier les soldes ouverts pour l'auditeur.`,
      refs: stats.tiersNonLettres.slice(0, 20).map((t) => ({ numero_compte: t.numero_compte, montant: t.montant, detail: `${t.nb} écritures` })),
    })
  }

  // Clé stable pour persister le statut de traitement. Les tests répétés par
  // compte/rubrique (T3, T4) sont désambiguïsés par leur première référence.
  return findings.map((f) => {
    const ref = f.refs?.[0]?.numero_compte
    return { ...f, key: ref ? `${f.test}:${ref}` : f.test }
  })
}
