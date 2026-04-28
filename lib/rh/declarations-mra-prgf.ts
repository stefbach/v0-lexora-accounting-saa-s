/**
 * LEXORA — Générateur fichier PRGF Monthly Return MRA
 *
 * Format officiel attendu par https://eservices14.mra.mu/prgfcontribution
 * Référence : MRA Portable Retirement Gratuity Fund (PRGF) Monthly Return.
 *
 * STRUCTURE
 * ─────────
 *   Section 1 : MRA,PRGF,V1.0
 *   Section 2 : 8 en-têtes employeur
 *   Section 3 : 8 valeurs employeur
 *   Section 4 : 12 en-têtes employé
 *   Section 5 : 1 ligne par employé éligible
 *
 * ÉLIGIBILITÉ (employés inclus dans le CSV)
 * ─────────────────────────────────────────
 * Sont EXCLUS :
 *   - Migrant workers / non-citizens (is_migrant_worker OR is_mauritian=false)
 *   - Basic > Rs 200 000/mois
 *   - prgf_motif_exemption non-null (private pension FSC, sbpf, sipf,
 *     job_contractor, apprenti, etc.)
 *   - inclus_prgf = false (toggle admin)
 *
 * MAPPING COLONNES EMPLOYÉ
 * ────────────────────────
 *  1. Employee ID       = nic_number
 *  2. Surname           = nom
 *  3. Other Names       = prenom
 *  4. Pension Scheme    = 'N' toujours (les couverts sont déjà filtrés)
 *  5. Full Time         = isFullTimeForPaco(emp)
 *  6. Start Date        = date_arrivee → YYYYMMDD
 *  7. Basic             = bulletin.salaire_base (entier)
 *  8. Allowances        = heures_sup_montant + increment_salaire (entier)
 *  9. Commission        = 0 (pas de champ DB en V1)
 * 10. Total             = 7 + 8 + 9
 * 11. PRGF Amount       = bulletin.prgf (tel quel — pas de recalcul V1)
 * 12. Reason no remun.  = '' si total > 0, sinon 'D' (exited dans la période)
 *                                              ou 'L' (leave without pay)
 */

import {
  csvField,
  truncate,
  parseMauritiusMobile,
  parseMauritiusTelephone,
  isFullTimeForPaco,
  tauxPeriodMra,
  lastDayYYYYMMDD,
} from './declarations-mra-paco'

export interface PrgfSociete {
  nom: string
  ern: string
  brn: string
  mra_telephone?: string | null
  mra_mobile?: string | null
  mra_declarant_name?: string | null
  mra_email?: string | null
  telephone?: string | null
  contact_name?: string | null
  email?: string | null
}

export interface PrgfEmploye {
  id: string
  nom: string
  prenom: string
  nic_number?: string | null
  date_arrivee?: string | null         // YYYY-MM-DD
  date_depart?: string | null          // YYYY-MM-DD si exited
  contrat_type?: string | null
  type_contrat?: string | null
  is_migrant_worker?: boolean | null
  is_mauritian?: boolean | null
  inclus_prgf?: boolean | null
  prgf_motif_exemption?: string | null
}

export interface PrgfBulletin {
  employe_id: string
  periode: string                      // YYYY-MM-DD
  salaire_base: number
  heures_sup_montant?: number | null
  increment_salaire?: number | null
  prgf?: number | null
}

export interface PrgfGenerationOptions {
  societe: PrgfSociete
  employes: PrgfEmploye[]
  bulletins: PrgfBulletin[]
  periode: string                      // YYYY-MM
  /**
   * Paramètres MRA depuis parametres_paie_mra (mig 212).
   * Si fourni, on RECALCULE col 11 PRGF Amount à la volée à partir de
   * col 10 Total (basic + allowances + commission), au lieu de lire la
   * valeur stockée dans bulletin.prgf qui peut être calculée sur une
   * mauvaise base (ex: salaire_brut incluant electricity allowance).
   * Si non fourni, fallback sur bulletin.prgf (legacy comportement).
   */
  params?: {
    prgf_taux_emoluments?: number      // 0.045 par défaut si null
  }
}

export interface PrgfGenerationResult {
  csv: string
  filename: string                     // prgf<YYYYMMDD>.csv
  warnings: string[]
  employes_inclus: number
  employes_exclus: { id: string; nom: string; raison: string }[]
  total_basic: number
  total_allowances: number
  total_prgf: number
  /**
   * Employés concernés par l'écart potentiel PRGF V1 (la valeur stockée
   * peut sur-déclarer si l'electricity allowance a été incluse à tort
   * dans la base — fix V2 via "Recalculer cette période").
   */
  bulletins_avec_ecart_potentiel: string[]
}

// ============================================================
// HELPERS
// ============================================================

function formatDateYYYYMMDD(d: string | null | undefined): string {
  if (!d) return ''
  return String(d).slice(0, 10).replace(/-/g, '')
}

/**
 * Date YYYY-MM-DD ∈ période YYYY-MM ?
 */
function isInPeriod(date: string | null | undefined, periode: string): boolean {
  if (!date) return false
  return String(date).startsWith(periode)
}

// ============================================================
// GÉNÉRATEUR
// ============================================================

const VALID_EXEMPTION_MOTIFS = new Set([
  'salaire_au_dessus_200k', 'migrant_non_citoyen', 'sbpf', 'sipf',
  'private_pension_fsc', 'job_contractor', 'apprenti',
])

export function genererPrgfMra(opts: PrgfGenerationOptions): PrgfGenerationResult {
  const warnings: string[] = []
  const exclus: PrgfGenerationResult['employes_exclus'] = []
  const bulletinsAvecEcart: string[] = []
  const { societe, employes, bulletins, periode } = opts

  // ── Validation employeur ────────────────────────────────────
  if (!societe.ern || !/^\d{8}$/.test(societe.ern.trim())) {
    throw new Error(`ERN invalide pour "${societe.nom}". Attendu : 8 chiffres.`)
  }
  // BRN pour PRGF : 10 chars max selon spec, mais Lexora valide jusqu'à 12
  if (societe.brn && !/^[A-Z0-9]{1,12}$/i.test(societe.brn.trim())) {
    throw new Error(`BRN invalide pour "${societe.nom}". Attendu : alphanumérique max 12 caractères.`)
  }

  const taxPeriod = tauxPeriodMra(periode)

  const mobile = (societe.mra_mobile || '').trim()
    || parseMauritiusMobile(societe.telephone)
  const telephone = (societe.mra_telephone || '').trim()
    || parseMauritiusTelephone(societe.telephone)
  if (!mobile && !telephone) {
    warnings.push(
      `Aucun numéro de téléphone/mobile trouvé pour "${societe.nom}". `
      + `MRA exige au moins l'un des deux. Renseignez societes.mra_mobile ou mra_telephone.`,
    )
  }
  const declarantName = truncate(
    societe.mra_declarant_name || societe.contact_name || '',
    80,
  )
  const email = (societe.mra_email || societe.email || '').trim()

  // ── Index bulletins par employe_id ──────────────────────────
  const bulletinsByEmp = new Map<string, PrgfBulletin>()
  for (const b of bulletins) bulletinsByEmp.set(b.employe_id, b)

  // ── Construire les lignes employés ──────────────────────────
  const empLines: string[] = []
  let employesInclus = 0
  let totalBasic = 0
  let totalAllowances = 0
  let totalPrgf = 0

  for (const emp of employes) {
    const empLabel = `${emp.prenom} ${emp.nom}`.trim() || emp.id

    // Filtrage 1 : migrant/non-citizen
    if (emp.is_migrant_worker === true) {
      exclus.push({ id: emp.id, nom: empLabel, raison: 'is_migrant_worker' })
      continue
    }
    if (emp.is_mauritian === false) {
      exclus.push({ id: emp.id, nom: empLabel, raison: 'is_mauritian=false' })
      continue
    }

    // Filtrage 2 : motif d'exemption explicite (pension FSC, sbpf, etc.)
    if (emp.prgf_motif_exemption && VALID_EXEMPTION_MOTIFS.has(emp.prgf_motif_exemption)) {
      exclus.push({ id: emp.id, nom: empLabel, raison: `prgf_motif_exemption=${emp.prgf_motif_exemption}` })
      continue
    }
    // Filtrage 3 : toggle admin off
    if (emp.inclus_prgf === false) {
      exclus.push({ id: emp.id, nom: empLabel, raison: 'inclus_prgf=false' })
      continue
    }

    const bulletin = bulletinsByEmp.get(emp.id)
    if (!bulletin) {
      // Pas de bulletin pour ce mois — exclu silencieusement (ex: absent/parti)
      continue
    }

    // Filtrage 4 : basic > 200 000 (au niveau bulletin)
    const basicRaw = Number(bulletin.salaire_base) || 0
    if (basicRaw > 200000) {
      exclus.push({ id: emp.id, nom: empLabel, raison: `salaire_base=${basicRaw} > 200000` })
      continue
    }

    // ── Construction de la ligne employé ─────────────────────
    const employeeId = truncate(emp.nic_number || '', 14)
    if (!employeeId) {
      warnings.push(`[${empLabel}] NIC manquant — col 1 vide`)
    }

    const surname = truncate(emp.nom, 80)
    const otherNames = truncate(emp.prenom, 80)
    const pensionScheme = 'N'
    const fullTime = isFullTimeForPaco(emp)
    const startDate = formatDateYYYYMMDD(emp.date_arrivee)
    if (!startDate) warnings.push(`[${empLabel}] date_arrivee manquante — col 6 vide`)

    const basic = Math.round(basicRaw)
    const ot = Math.round(Number(bulletin.heures_sup_montant) || 0)
    const incrementSal = Math.round(Number(bulletin.increment_salaire) || 0)
    const allowances = ot + incrementSal
    const commission = 0
    const total = basic + allowances + commission

    // Col 11 — PRGF Amount.
    // Si params fourni : on RECALCULE depuis col 10 (Total) avec le taux
    // courant prgf_taux_emoluments (mig 212 : 4.5%). Évite la
    // sur-déclaration quand bulletin.prgf a été calculé à tort sur le
    // salaire_brut (incluant electricity allowance) au lieu du basic.
    // Sinon : fallback sur la valeur stockée + détection d'écart pour
    // signaler que le recalcul serait pertinent.
    let prgfAmount: number
    if (opts.params) {
      const rate = opts.params.prgf_taux_emoluments ?? 0.045
      prgfAmount = Math.round(total * rate)
    } else {
      prgfAmount = Math.round(Number(bulletin.prgf) || 0)
      const prgfAttendu = Math.round(basicRaw * 0.045)
      if (prgfAmount > prgfAttendu) {
        bulletinsAvecEcart.push(empLabel)
      }
    }

    // Col 12 — Reason no remuneration
    let reasonNoRem = ''
    if (total === 0) {
      // Si départ tombe dans la période → 'D' (Exited), sinon 'L' (Leave without Pay)
      reasonNoRem = isInPeriod(emp.date_depart, periode) ? 'D' : 'L'
    }

    empLines.push([
      csvField(employeeId),
      csvField(surname),
      csvField(otherNames),
      csvField(pensionScheme),
      csvField(fullTime),
      csvField(startDate),
      csvField(basic),
      csvField(allowances),
      csvField(commission),
      csvField(total),
      csvField(prgfAmount),
      csvField(reasonNoRem),
    ].join(','))

    employesInclus++
    totalBasic += basic
    totalAllowances += allowances
    totalPrgf += prgfAmount
  }

  if (employesInclus === 0) {
    throw new Error(
      `Aucun employé éligible PRGF pour ${periode} (${employes.length} employés actifs, `
      + `${exclus.length} exclus).`,
    )
  }

  // ── Construction du CSV ─────────────────────────────────────
  const lines: string[] = []
  lines.push('MRA,PRGF,V1.0')

  lines.push([
    'Employer Registration Number',
    'Employer Business Registration Number',
    'Employer Name',
    'Tax Period',
    'Telephone Number',
    'Mobile Number',
    'Name of Declarant',
    'E-mail Address',
  ].join(','))

  lines.push([
    csvField(societe.ern.trim()),
    csvField((societe.brn || '').trim().toUpperCase()),
    csvField(truncate(societe.nom, 80)),
    csvField(taxPeriod),
    csvField(telephone),
    csvField(mobile),
    csvField(declarantName),
    csvField(truncate(email, 50)),
  ].join(','))

  lines.push([
    'Employee ID',
    'Surname',
    'Other Names',
    'Pension Scheme (Y/N)',
    'Full Time Employment (Y/N)',
    'Start Date of Employment',
    'Monthly basic wage or salary (MUR)',
    'Allowances (MUR)',
    'Commission (MUR)',
    'Total remuneration on which PRGF calculated (MUR)',
    'PRGF Contribution Amount (MUR)',
    'Reason no remuneration',
  ].join(','))

  for (const line of empLines) lines.push(line)

  return {
    csv: lines.join('\n') + '\n',
    filename: `prgf${lastDayYYYYMMDD(periode)}.csv`,
    warnings,
    employes_inclus: employesInclus,
    employes_exclus: exclus,
    total_basic: totalBasic,
    total_allowances: totalAllowances,
    total_prgf: totalPrgf,
    bulletins_avec_ecart_potentiel: bulletinsAvecEcart,
  }
}
