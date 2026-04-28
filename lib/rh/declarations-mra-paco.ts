/**
 * LEXORA — Générateur fichier PACO MRA (Joint Statement Dec 2024)
 *
 * Format officiel attendu par le portail MRA e-Services pour la
 * déclaration jointe CSG/NSF/PAYE. Référence : fichier OCC mars 2026
 * validé MRA (Payroll Mauritius).
 *
 * STRUCTURE
 * ─────────
 *   Section 1 : MRA,PACO,V1.0
 *   Section 2 : 8 en-têtes employeur
 *   Section 3 : 8 valeurs employeur
 *   Section 4 : 19 en-têtes employé
 *   Section 5 : 1 ligne par employé (19 colonnes)
 *
 * RÈGLES STRICTES
 * ────────────────
 * - Séparateur : virgule
 * - Encodage UTF-8 (sans BOM)
 * - Tous les montants : entiers (Math.round)
 * - Pas de guillemets sauf si la valeur contient une virgule
 * - Total Wage Bill (col 6) peut être 0 si EOY Bonus > 0 (depuis juillet 2024)
 *
 * CONTRIBUTION CODE (col 7)
 * ─────────────────────────
 * MRA attend une SEULE lettre. Lexora stocke un code interne plus
 * granulaire (ex: "S2", "S2_STANDARD") — on extrait la première lettre
 * et on valide qu'elle est dans l'alphabet MRA. Fallback 'S' (Standard).
 */

export interface PacoSociete {
  nom: string
  ern: string                          // 8 chiffres
  brn: string                          // 9 caractères A-Z & 0-9
  // Contact MRA (mig 210). Si NULL, fallback aux colonnes legacy.
  mra_telephone?: string | null
  mra_mobile?: string | null
  mra_declarant_name?: string | null
  mra_email?: string | null
  // Legacy (mig 046) — utilisés en fallback
  telephone?: string | null
  contact_name?: string | null
  email?: string | null
}

export interface PacoEmploye {
  id: string
  nom: string                          // Surname
  prenom: string                       // Other Names
  nic_number?: string | null
  contribution_code?: string | null    // Lexora interne ('S2', 'S2_STANDARD'...)
  contrat_type?: string | null         // canonical Lexora (mig 047 CHECK)
  type_contrat?: string | null         // legacy / variant Lexora ('CDI', 'CDD'…)
  exclure_mra?: boolean | null
}

export interface PacoBulletin {
  employe_id: string
  periode: string                      // YYYY-MM-DD (1er du mois)
  salaire_base: number
  montant_absence?: number | null
  base_csg_nsf?: number | null         // mig 213. NULL = fallback salaire_base - absence
  salaire_brut: number                 // = Emoluments
  csg_salarie?: number | null
  csg_patronal?: number | null
  csg_bonus?: number | null            // CSG sur EOY (décembre uniquement)
  csg_patronal_bonus?: number | null
  nsf_salarie?: number | null
  nsf_patronal?: number | null
  paye?: number | null
  eoy_bonus?: number | null
  // Autres champs ignorés ici mais possibles : training_levy, prgf, …
}

export interface PacoGenerationOptions {
  societe: PacoSociete
  employes: PacoEmploye[]              // tous les employés actifs de la société
  bulletins: PacoBulletin[]            // bulletins de la période demandée
  periode: string                      // YYYY-MM (ex: 2026-04)
  /**
   * Paramètres MRA depuis parametres_paie_mra (mig 212).
   * Utilisés pour RECALCULER CSG/NSF à la volée à l'export plutôt que de
   * lire les valeurs des bulletins (qui peuvent dater d'avant la mise à
   * jour des taux/plafonds — bug NSF 28600 vs 28570 sur OCC avril 2026).
   * Si non fourni, on lit les bulletins (legacy comportement).
   */
  params?: {
    csg_seuil_taux_reduit: number       // 50000
    csg_salarie_taux_reduit: number     // 0.015
    csg_salarie_taux_plein: number      // 0.030
    csg_patronal: number                // 0.060
    csg_patronal_taux_reduit?: number   // 0.030 (default si null)
    nsf_salarie: number                 // 0.010
    nsf_patronal: number                // 0.025
    nsf_plafond_mensuel: number         // 28570
  }
}

export interface PacoGenerationResult {
  csv: string                          // contenu CSV UTF-8
  filename: string                     // paco<YYYYMMDD>.csv
  warnings: string[]                   // bulletins avec base_csg_nsf NULL → fallback, contribution code inattendu, etc.
  employes_inclus: number
  employes_exclus_mra: number
  total_wage_bill: number              // somme col 6 (entiers)
  total_csg: number                    // somme col 10
  total_nsf: number                    // somme col 11
  total_paye: number                   // somme col 15
}

// ============================================================
// UTILITAIRES
// ============================================================

const VALID_CONTRIBUTION_CODES = new Set(['S', 'X', 'V', 'G', 'N', 'D', 'B', 'C'])

/**
 * Mappe le contribution_code interne Lexora vers le code MRA (1 lettre).
 * Lexora stocke "S2", "S2_STANDARD", etc. — on extrait la première lettre
 * et on valide. Fallback 'S' (Standard 18-65) avec warning.
 */
export function mapToPacoContributionCode(
  employe: { contribution_code?: string | null },
  warnings: string[],
  empLabel: string,
): string {
  const raw = (employe.contribution_code || '').toString().trim().toUpperCase()
  if (!raw) {
    warnings.push(`[${empLabel}] contribution_code vide — fallback 'S' (Standard)`)
    return 'S'
  }
  const firstChar = raw[0]
  if (VALID_CONTRIBUTION_CODES.has(firstChar)) return firstChar
  warnings.push(`[${empLabel}] contribution_code "${raw}" non reconnu — fallback 'S'`)
  return 'S'
}

/**
 * Convertit la période YYYY-MM en YYMM (Tax Period MRA).
 */
function tauxPeriodMra(periode: string): string {
  // periode = YYYY-MM
  const [yyyy, mm] = periode.split('-')
  return `${yyyy.slice(2)}${mm}`
}

/**
 * Dernier jour du mois → YYYYMMDD pour le filename paco<YYYYMMDD>.csv.
 */
function lastDayYYYYMMDD(periode: string): string {
  const [yyyyStr, mmStr] = periode.split('-')
  const yyyy = parseInt(yyyyStr, 10)
  const mm = parseInt(mmStr, 10)
  // Dernier jour : new Date(yyyy, mm, 0) (mm est 1-indexé, 0 = mois précédent)
  const last = new Date(yyyy, mm, 0)
  const dd = String(last.getDate()).padStart(2, '0')
  return `${yyyyStr}${mmStr}${dd}`
}

/**
 * Extrait les 8 chiffres d'un numéro de mobile depuis un format libre
 * type "+230 5249 1043" ou "5249 1043". Retourne '' si pas trouvé / longueur invalide.
 * Exigence MRA : 8 chiffres, premier = 5.
 */
export function parseMauritiusMobile(raw: string | null | undefined): string {
  if (!raw) return ''
  // Strip everything except digits, then drop the +230 country code if present
  const digits = String(raw).replace(/\D+/g, '')
  // Format possible : 230XXXXXXXX (11 chars) ou XXXXXXXX (8 chars)
  let mobile = digits
  if (digits.length === 11 && digits.startsWith('230')) mobile = digits.slice(3)
  if (digits.length === 10 && digits.startsWith('00230')) mobile = digits.slice(5)
  if (mobile.length !== 8) return ''
  if (!mobile.startsWith('5')) return ''
  return mobile
}

/**
 * Extrait un numéro de téléphone fixe (7 chiffres) depuis un format libre.
 * Retourne '' si non trouvé.
 */
export function parseMauritiusTelephone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D+/g, '')
  let phone = digits
  if (digits.length === 10 && digits.startsWith('230')) phone = digits.slice(3)
  if (phone.length !== 7) return ''
  if (phone.startsWith('5')) return ''  // Un mobile 8 chiffres tronqué — on ne prend pas
  return phone
}

/**
 * Détermine la valeur PACO col 14 (Full Time Employment Y/N).
 * Lexora stocke des valeurs hétérogènes selon la société :
 *   - canonical (mig 047) : fulltime / parttime / contract / casual / intern
 *   - legacy (DDS/OCC)    : CDI / CDD / INTERIM / TEMPS_PARTIEL / …
 *
 * Default = 'Y' (full time). Seul un signal explicite "temps partiel"
 * (parttime, part_time, temps_partiel, half_time, contient "partiel"…)
 * produit 'N'. Tous les autres CDI/CDD/contract/intern/etc. = Y.
 */
export function isFullTimeForPaco(emp: { contrat_type?: string | null; type_contrat?: string | null }): 'Y' | 'N' {
  const raw = (emp.contrat_type || emp.type_contrat || '').toString().trim().toLowerCase()
  if (!raw) return 'Y'
  // Normaliser : tirets/underscores/espaces homogènes
  const norm = raw.replace(/[-\s]+/g, '_')
  if (
    norm === 'parttime' || norm === 'part_time' || norm === 'temps_partiel'
    || norm === 'half_time' || norm === 'mi_temps'
    || norm.includes('partiel') || norm.includes('part_time')
  ) {
    return 'N'
  }
  return 'Y'
}

/**
 * CSV escape : guillemets seulement si la valeur contient virgule, "
 * ou retour à la ligne (RFC 4180 minimal).
 */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Tronque à n caractères max (PACO impose 80 chars sur Surname/Other Names/Name of Declarant).
 */
function truncate(s: string | null | undefined, n: number): string {
  return (s || '').toString().slice(0, n)
}

// ============================================================
// GÉNÉRATEUR PRINCIPAL
// ============================================================

export function genererPacoMra(opts: PacoGenerationOptions): PacoGenerationResult {
  const warnings: string[] = []
  const { societe, employes, bulletins, periode } = opts

  // ── Validation employeur ────────────────────────────────────
  if (!societe.ern || !/^\d{8}$/.test(societe.ern.trim())) {
    throw new Error(`ERN invalide pour "${societe.nom}". Attendu : 8 chiffres.`)
  }
  if (!societe.brn || !/^[A-Z0-9]{1,12}$/i.test(societe.brn.trim())) {
    throw new Error(`BRN invalide pour "${societe.nom}". Attendu : alphanumérique max 12 caractères.`)
  }

  // Tax Period YYMM
  const taxPeriod = tauxPeriodMra(periode)

  // Contact MRA — préfère mra_*, fallback vers les colonnes legacy
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

  // ── Build map bulletins par employe_id ──────────────────────
  const bulletinsByEmp = new Map<string, PacoBulletin>()
  for (const b of bulletins) bulletinsByEmp.set(b.employe_id, b)

  // ── Mois de la période (pour EOY Bonus = 0 hors décembre) ──
  const moisIdx = parseInt(periode.split('-')[1] || '0', 10)
  const isDecembre = moisIdx === 12

  // ── Construire les lignes employés ──────────────────────────
  const empLines: string[] = []
  let employesInclus = 0
  let employesExclusMra = 0
  let totalWageBill = 0
  let totalCsg = 0
  let totalNsf = 0
  let totalPaye = 0

  for (const emp of employes) {
    if (emp.exclure_mra) { employesExclusMra++; continue }
    const bulletin = bulletinsByEmp.get(emp.id)
    if (!bulletin) {
      // Employé actif mais sans bulletin pour la période → on l'exclut du PACO
      // (cas: nouvel arrivant après cut-off, départ avant période)
      warnings.push(`[${emp.prenom} ${emp.nom}] Aucun bulletin pour ${periode} — exclu du PACO`)
      continue
    }

    const empLabel = `${emp.prenom} ${emp.nom}`.trim() || emp.id

    // Col 1 — Employee ID (NIC, 14 chars max)
    const employeeId = truncate(emp.nic_number || '', 14)
    if (!employeeId) {
      warnings.push(`[${empLabel}] NIC manquant — colonne 1 vide`)
    }

    // Col 2 — Surname (80 chars max)
    const surname = truncate(emp.nom, 80)
    // Col 3 — Other Names (80 chars max)
    const otherNames = truncate(emp.prenom, 80)

    // Col 4 — Wage Bill (base CSG/NSF, entier)
    let wageBillRaw: number
    if (bulletin.base_csg_nsf != null) {
      wageBillRaw = Number(bulletin.base_csg_nsf)
    } else {
      // Fallback : salaire_base - montant_absence (mig 213 backfill non
      // appliqué pour les bulletins avec special_allowance ambigu)
      wageBillRaw = (Number(bulletin.salaire_base) || 0)
        - (Number(bulletin.montant_absence) || 0)
      warnings.push(
        `[${empLabel}] base_csg_nsf NULL — fallback salaire_base-absence (${wageBillRaw}). `
        + `Recalculer la paie pour fiabiliser.`,
      )
    }
    const wageBill = Math.round(Math.max(0, wageBillRaw))

    // Col 5 — Wage Relativity Adjustment (0 hors secteur sucre)
    const wageRelativity = 0

    // Col 6 — Total Wage Bill = col 4 + col 5
    const totalWageBillEmp = wageBill + wageRelativity

    // Col 7 — Contribution Code
    const contributionCode = mapToPacoContributionCode(emp, warnings, empLabel)

    // Col 8 — Pay Code (M pour Monthly)
    const payCode = 'M'
    // Col 9 — Frequency (1 pour M)
    const frequency = '1'

    // Col 10 / Col 11 — CSG et NSF totaux.
    // Bug PACO #B — On RECALCULE CSG/NSF à la volée à partir de
    // base_csg_nsf et des paramètres MRA courants (params), au lieu de
    // lire bulletin.csg_salarie + csg_patronal qui peuvent avoir été
    // calculés AVANT la mise à jour des taux/plafonds (mig 212 :
    // NSF 28600→28570). Évite de devoir recalculer toute la paie pour
    // que le PACO soit aligné aux nouveaux barèmes.
    //
    // Si params absent (legacy fallback), on lit le bulletin tel quel.
    let csgTotal: number
    let nsfTotal: number
    if (opts.params) {
      const baseCsg = Math.max(0, wageBillRaw) // = base_csg_nsf ou fallback salaire_base-absence
      const baseNsf = Math.min(baseCsg, opts.params.nsf_plafond_mensuel)
      // Palier CSG : > 50 000 = taux plein, sinon réduit
      const isReduit = baseCsg <= opts.params.csg_seuil_taux_reduit
      const csgSalarieRate = isReduit
        ? opts.params.csg_salarie_taux_reduit
        : opts.params.csg_salarie_taux_plein
      const csgPatronalRate = isReduit
        ? (opts.params.csg_patronal_taux_reduit ?? 0.030)
        : opts.params.csg_patronal
      csgTotal = Math.round(baseCsg * (csgSalarieRate + csgPatronalRate))
      nsfTotal = Math.round(baseNsf * (opts.params.nsf_salarie + opts.params.nsf_patronal))
    } else {
      csgTotal = Math.round(
        (Number(bulletin.csg_salarie) || 0)
        + (Number(bulletin.csg_patronal) || 0),
      )
      nsfTotal = Math.round(
        (Number(bulletin.nsf_salarie) || 0)
        + (Number(bulletin.nsf_patronal) || 0),
      )
    }

    // Col 12 — LEVY Applicable Y/N (Y pour Standard, N pour Exempt etc.)
    const levyApplicable = contributionCode === 'S' ? 'Y' : 'N'

    // Col 13 — Emoluments (= salaire_brut, entier). Doit être >= Total Wage Bill.
    const emoluments = Math.round(Number(bulletin.salaire_brut) || 0)
    const emolumentsAdjusted = Math.max(emoluments, totalWageBillEmp)

    // Col 14 — Full Time Y/N.
    // Bug PACO #A — Lexora stocke contrat_type/type_contrat avec des
    // valeurs hétérogènes (CDI, CDD, fulltime, contract, casual,
    // intern, parttime, TEMPS_PARTIEL, …). Default = 'Y' (full time).
    // Seul un signal explicite "temps partiel" → 'N'.
    const fullTime = isFullTimeForPaco(emp)

    // Col 15 — PAYE for Income Tax (entier)
    const paye = Math.round(Number(bulletin.paye) || 0)

    // Col 16 — PAYE for Solidarity Levy (toujours 0, aboli juillet 2023)
    const payeSolidarity = 0

    // Col 17 — End of Year Bonus excl. Special Allowance (0 hors décembre)
    const eoyBonus = isDecembre ? Math.round(Number(bulletin.eoy_bonus) || 0) : 0

    // Col 18 — CSG on End of Year Bonus (0 hors décembre)
    const csgOnEoy = isDecembre
      ? Math.round(
        (Number(bulletin.csg_bonus) || 0)
        + (Number(bulletin.csg_patronal_bonus) || 0),
      )
      : 0

    // Col 19 — Emoluments excl. Exempt/EOY/Special (= salaire_brut typiquement)
    const emolumentsExcl = emolumentsAdjusted

    empLines.push([
      csvField(employeeId),
      csvField(surname),
      csvField(otherNames),
      csvField(wageBill),
      csvField(wageRelativity),
      csvField(totalWageBillEmp),
      csvField(contributionCode),
      csvField(payCode),
      csvField(frequency),
      csvField(csgTotal),
      csvField(nsfTotal),
      csvField(levyApplicable),
      csvField(emolumentsAdjusted),
      csvField(fullTime),
      csvField(paye),
      csvField(payeSolidarity),
      csvField(eoyBonus),
      csvField(csgOnEoy),
      csvField(emolumentsExcl),
    ].join(','))

    employesInclus++
    totalWageBill += totalWageBillEmp
    totalCsg += csgTotal
    totalNsf += nsfTotal
    totalPaye += paye
  }

  if (employesInclus === 0) {
    throw new Error(
      `Aucun employé éligible pour le PACO ${periode} (${employes.length} employés actifs, `
      + `${employesExclusMra} exclus MRA, 0 avec bulletin valide).`,
    )
  }

  // ── Construction du CSV ─────────────────────────────────────
  const lines: string[] = []

  // Section 1 — Header technique
  lines.push('MRA,PACO,V1.0')

  // Section 2 — En-têtes employeur (fixes, ne pas modifier)
  lines.push([
    'Employer Registration Number',
    'Employer Business Registration Number',
    'Employer Name',
    'Tax Period',
    'Telephone Number',
    'Mobile Number',
    'Name of Declarant',
    'Email Address',
  ].join(','))

  // Section 3 — Valeurs employeur
  lines.push([
    csvField(societe.ern.trim()),
    csvField(societe.brn.trim().toUpperCase()),
    csvField(truncate(societe.nom, 80)),
    csvField(taxPeriod),
    csvField(telephone),
    csvField(mobile),
    csvField(declarantName),
    csvField(email),
  ].join(','))

  // Section 4 — En-têtes employé (19 colonnes, ordre + libellés exacts MRA)
  lines.push([
    'Employee ID',
    'Surname of Employee',
    'Other Names of Employee',
    'Wage Bill excluding Wage Relativity Adjustment (MUR)',
    'Wage Relativity Adjustment (MUR)',
    'Total Wage Bill (MUR)',
    'Contribution Code',
    'Pay Code',
    'Frequency',
    'Contribution Sociale Genéralisée Amount (CSG) (MUR)',
    'National Savings Fund Amount (NSF) (MUR)',
    'LEVY Applicable? (Y/N)',
    'Emoluments including Wage Relativity Adjustment but excluding travelling and Special Allowance 2024 (MUR)',
    'Full Time Employment (Y/N)',
    'PAYE for Income Tax (MUR)',
    'PAYE for Solidarity Levy (MUR)',
    'End of Year Bonus excluding Special Allowance 2024 (MUR)',
    'Contribution Sociale Genéralisée Amount (CSG) on End of Year Bonus (MUR)',
    // La colonne 19 contient une virgule dans son libellé MRA → quotée
    '"Emoluments including Wage Relativity Adjustment but excluding Exempt Emoluments, Statutory End-of-Year Bonus, and Special Allowance 2024 (MUR)"',
  ].join(','))

  // Section 5 — Lignes employés
  for (const line of empLines) lines.push(line)

  return {
    csv: lines.join('\n') + '\n',
    filename: `paco${lastDayYYYYMMDD(periode)}.csv`,
    warnings,
    employes_inclus: employesInclus,
    employes_exclus_mra: employesExclusMra,
    total_wage_bill: totalWageBill,
    total_csg: totalCsg,
    total_nsf: totalNsf,
    total_paye: totalPaye,
  }
}
