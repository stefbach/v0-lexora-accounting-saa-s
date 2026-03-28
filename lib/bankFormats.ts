// ============================================================
// bankFormats.ts — Bibliothèque de formats bancaires
// Maurice (MCB BP-V1, SBM CSV, MauBank CSV) + International (SEPA pain.001, SWIFT MT103)
// Sprint 3 — TIBOK COMPTA IA
// ============================================================

// ============================================================
// CONSTANTES — Banques mauriciennes
// ============================================================

/**
 * Liste complète des banques mauriciennes avec codes MCB EFT.
 * code_mcb_eft = code numérique utilisé dans les lignes type 2 du format MCB BP-V1.
 * null = banque MCB elle-même (virement interne, ligne 1).
 */
export const BANQUES_MAURITIUS = [
  { code: 'MCB',      nom: 'Mauritius Commercial Bank',       code_mcb_eft: null  },
  { code: 'SBM',      nom: 'State Bank of Mauritius',         code_mcb_eft: '03'  },
  { code: 'ABC',      nom: 'ABC Banking Corporation',         code_mcb_eft: '05'  },
  { code: 'ABSA',     nom: 'ABSA Bank Mauritius',             code_mcb_eft: '08'  },
  { code: 'BOM',      nom: 'Bank of Mauritius',               code_mcb_eft: '11'  },
  { code: 'BNP',      nom: 'BNP Paribas Mauritius',           code_mcb_eft: '12'  },
  { code: 'CITI',     nom: 'Citi Mauritius',                  code_mcb_eft: '15'  },
  { code: 'DEUTSCHE', nom: 'Deutsche Bank Mauritius',         code_mcb_eft: '20'  },
  { code: 'HABIB',    nom: 'Habib Bank Mauritius',            code_mcb_eft: '25'  },
  { code: 'HSBC',     nom: 'HSBC Mauritius',                  code_mcb_eft: '30'  },
  { code: 'IBL',      nom: 'IBL Bank',                        code_mcb_eft: '35'  },
  { code: 'INVESTEC', nom: 'Investec Mauritius',              code_mcb_eft: '40'  },
  { code: 'MAUBANK',  nom: 'MauBank',                         code_mcb_eft: '45'  },
  { code: 'SCB',      nom: 'Standard Chartered Mauritius',    code_mcb_eft: '50'  },
  { code: 'MPCB',     nom: 'MPCB',                            code_mcb_eft: '55'  },
  { code: 'SBI',      nom: 'SBI Mauritius',                   code_mcb_eft: '60'  },
] as const

/** Type d'une entrée banque Maurice */
export type BanqueMauritius = typeof BANQUES_MAURITIUS[number]

// ============================================================
// CONSTANTES — Codes banques Maurice (numériques MCB)
// ============================================================

/** Mapping code textuel → code numérique MCB pour lignes type 2 (EFT inter-banques) */
export const BANK_CODES_MCB: Record<string, string> = {
  SBM:       '03',
  ABC:       '05',
  BARCLAYS:  '08',
  ABSA:      '08',
  BOM:       '11',
  BNP:       '12',
  CITI:      '15',
  DEUTSCHE:  '20',
  HABIB:     '25',
  HSBC:      '30',
  IBL:       '35',
  INVESTEC:  '40',
  MAUBANK:   '45',
  SC:        '50',
  SCB:       '50',
  MPCB:      '55',
  SBI:       '60',
}

/** Liste complète des banques Maurice pour les dropdowns (compatibilité legacy) */
export const BANK_LIST_MAURITIUS = [
  { code: 'MCB',      label: 'MCB — Mauritius Commercial Bank',     format: 'mcb_bp_v1' },
  { code: 'SBM',      label: 'SBM — State Bank of Mauritius',       format: 'sbm_csv'   },
  { code: 'ABC',      label: 'ABC Banking Corporation',             format: 'sbm_csv'   },
  { code: 'BOM',      label: 'Bank of Mauritius',                   format: 'sbm_csv'   },
  { code: 'MAUBANK',  label: 'MauBank',                             format: 'maubank_csv' },
  { code: 'HSBC',     label: 'HSBC Bank (Mauritius) Limited',       format: 'generic_csv' },
  { code: 'ABSA',     label: 'ABSA Bank Mauritius',                 format: 'generic_csv' },
  { code: 'BNP',      label: 'BNP Paribas Mauritius',               format: 'generic_csv' },
  { code: 'CITI',     label: 'Citi Mauritius',                      format: 'generic_csv' },
  { code: 'SCB',      label: 'Standard Chartered Mauritius',        format: 'generic_csv' },
  { code: 'IBL',      label: 'IBL Bank',                            format: 'generic_csv' },
  { code: 'MPCB',     label: 'Mauritius Post & Cooperative Bank',   format: 'generic_csv' },
  { code: 'SBI',      label: 'SBI Mauritius',                       format: 'generic_csv' },
  { code: 'HABIB',    label: 'Habib Bank Mauritius',                format: 'generic_csv' },
  { code: 'INVESTEC', label: 'Investec Mauritius',                  format: 'generic_csv' },
  { code: 'DEUTSCHE', label: 'Deutsche Bank Mauritius',             format: 'generic_csv' },
]

/** Banques internationales (hors Maurice) */
export const BANK_LIST_INTERNATIONAL = [
  { code: 'BARCLAYS_UK', label: 'Barclays Bank UK',       format: 'swift_mt103' },
  { code: 'HSBC_UK',     label: 'HSBC Bank UK',           format: 'swift_mt103' },
  { code: 'LLOYDS',      label: 'Lloyds Bank UK',         format: 'swift_mt103' },
  { code: 'BOV',         label: 'Bank of Valletta Malta',  format: 'sepa_xml'   },
  { code: 'HSBC_MT',     label: 'HSBC Malta',             format: 'sepa_xml'   },
  { code: 'APS_BANK',    label: 'APS Bank Malta',         format: 'sepa_xml'   },
  { code: 'BNF',         label: 'BNF Bank Malta',         format: 'sepa_xml'   },
]

// ============================================================
// TYPES
// ============================================================

export interface VirementHeader {
  societeNom: string
  compteDebiteur: string         // Numéro de compte société
  dateValeur: Date               // Date de valeur du virement
  devise: string                 // Toujours 'MUR' pour Maurice
  reference: string              // Ex: "SALARY Mar 2026"
}

export interface VirementCredit {
  employe_id: string
  nom: string                    // NOM PRENOM complet (uppercase)
  bank_code: string              // Code interne (MCB, SBM, BOM...)
  bank_account_number: string    // Numéro de compte employé
  iban?: string                  // IBAN pour international
  bic?: string                   // BIC/SWIFT pour international
  montant_net: number            // Salaire net à virer
}

export interface VirementResult {
  contenu: string                // Contenu exact du fichier
  nb_employes: number
  montant_total: number
  filename: string
}

// ============================================================
// UTILITAIRES DATES
// ============================================================

/**
 * Calcule le dernier vendredi ouvré d'un mois donné.
 * Si le dernier jour du mois est vendredi → retourne ce jour.
 * Sinon remonte jusqu'au dernier vendredi précédent.
 * Ex: Mars 2026, dernier jour = mardi 31 → retourne vendredi 27.
 */
export function getLastWorkingDay(year: number, month: number): Date {
  // Dernier jour du mois (month est 1-indexed)
  const dernierJour = new Date(year, month, 0)
  const dayOfWeek = dernierJour.getDay() // 0=dim, 1=lun, ..., 5=ven, 6=sam

  let offset = 0
  if (dayOfWeek === 0) offset = 2      // Dimanche → vendredi -2j
  else if (dayOfWeek === 6) offset = 1  // Samedi → vendredi -1j
  else if (dayOfWeek < 5) {
    // Lundi(1)→jeudi(4) : on remonte au vendredi précédent
    offset = dayOfWeek + 2
  }
  // Vendredi (5) → offset = 0, on garde le jour tel quel

  const resultat = new Date(dernierJour)
  resultat.setDate(dernierJour.getDate() - offset)
  return resultat
}

/**
 * Formate une date en YYYYMMDD (format MCB).
 */
export function formatMCBDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Formate une date+heure en YYYYMMDDHHmmss (timestamp MCB).
 */
export function formatMCBTimestamp(date: Date): string {
  const base = formatMCBDate(date)
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${base}${h}${min}${s}`
}

/**
 * Retourne l'abréviation anglaise d'un mois (1-based).
 * Ex: moisEnAnglais(3) → 'Mar'
 */
export function moisEnAnglais(mois: number): string {
  const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return MOIS[mois - 1] ?? 'Jan'
}

/**
 * Arrondit un montant à 2 décimales, retourne string sans espace parasite.
 */
function formatMontant(n: number): string {
  return n.toFixed(2)
}

// ============================================================
// FORMAT MCB BP-V1
// ============================================================

/**
 * Génère le fichier virement MCB BP-V1.
 *
 * Structure :
 *   Ligne 0 : en-tête
 *   Ligne 9 : compte débiteur société
 *   Lignes 1 : employés MCB (interne, même banque)
 *   Lignes 2 : employés autres banques mauriciennes (EFT inter-banques)
 *
 * Règle de séparation :
 *   - bank_code === 'MCB' → ligne de type 1
 *   - autres banques mauriciennes → ligne de type 2 avec code numérique MCB
 *
 * Exemple vérifié contre fichier réel MCB Mauritius BP-V1 :
 *   0|BP-V1|20260330|02|1|339115.17|9|339115.17|MUR|20260327110538
 *   9|339115.17|000451839102|SALARY Mar 2026
 *   1|14883.34|000448350203|SALARY Mar 2026
 *   2|30690.00|03|191042026|DESIRE Marie Alicia Whitney|SALARY Mar 2026|N
 *
 * Format ligne 0 :
 *   0|BP-V1|{date_valeur}|02|{nb_total}|{total}|{nb_debits}|{total}|MUR|{timestamp}
 *   nb_total = nombre de bénéficiaires (lignes 1 + 2)
 *   nb_debits = toujours 1 (compte débiteur société)
 */
export function generateMCBFormat(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const now = new Date()
  const dateValeurStr = formatMCBDate(header.dateValeur)
  const timestampStr = formatMCBTimestamp(now)

  // Calcul totaux
  const montantTotal = credits.reduce((sum, c) => sum + c.montant_net, 0)
  const nbCredits = credits.length

  // Séparation MCB interne vs EFT autres banques
  const creditsMCB = credits.filter(c => c.bank_code.toUpperCase() === 'MCB')
  const creditsEFT = credits.filter(c => c.bank_code.toUpperCase() !== 'MCB')

  const lignes: string[] = []

  // Ligne 0 : en-tête
  // 0|BP-V1|{date_valeur}|02|{nb_credits}|{total}|1|{total}|{devise}|{timestamp}
  lignes.push(
    `0|BP-V1|${dateValeurStr}|02|${nbCredits}|${formatMontant(montantTotal)}|1|${formatMontant(montantTotal)}|${header.devise}|${timestampStr}`
  )

  // Ligne 9 : compte débiteur société
  // 9|{montant_total}|{numero_compte_societe}|{reference}
  lignes.push(
    `9|${formatMontant(montantTotal)}|${header.compteDebiteur}|${header.reference}`
  )

  // Lignes 1 : virements intra-MCB (même banque)
  // 1|{montant_net}|{numero_compte_employe}|{reference}
  for (const c of creditsMCB) {
    lignes.push(
      `1|${formatMontant(c.montant_net)}|${c.bank_account_number}|${header.reference}`
    )
  }

  // Lignes 2 : virements EFT (autres banques mauriciennes)
  // 2|{montant_net}|{bank_code_numerique}|{numero_compte_employe}|{nom_complet}|{reference}|N
  for (const c of creditsEFT) {
    const codeNumerique = BANK_CODES_MCB[c.bank_code.toUpperCase()] ?? '99'
    lignes.push(
      `2|${formatMontant(c.montant_net)}|${codeNumerique}|${c.bank_account_number}|${c.nom}|${header.reference}|N`
    )
  }

  // Jointure avec séparateur Unix LF — pas de CRLF, pas d'espace parasite
  return lignes.join('\n') + '\n'
}

// ============================================================
// FORMAT SBM CSV
// ============================================================

/**
 * Génère le fichier CSV SBM Bank.
 * Format : NIC;compte;montant;nom;reference
 * Encodage UTF-8, séparateur point-virgule.
 */
export function generateSBMFormat(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const lignes: string[] = [
    'NIC;Compte;Montant;Nom;Reference'
  ]

  for (const c of credits) {
    const nic = c.employe_id
    const compte = c.bank_account_number
    const montant = formatMontant(c.montant_net)
    const nom = c.nom.replace(/;/g, ' ')
    const ref = header.reference.replace(/;/g, ' ')
    lignes.push(`${nic};${compte};${montant};${nom};${ref}`)
  }

  return lignes.join('\n') + '\n'
}

// ============================================================
// FORMAT MAUBANK CSV
// ============================================================

/**
 * Génère le fichier CSV MauBank.
 * Format proche SBM avec colonne devise.
 * Encodage UTF-8, séparateur virgule.
 */
export function generateMauBankCSV(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const lignes: string[] = [
    'AccountNumber,BeneficiaryName,Amount,Currency,Reference,BankCode'
  ]

  for (const c of credits) {
    const compte = c.bank_account_number
    const nom = `"${c.nom.replace(/"/g, '')}"`
    const montant = formatMontant(c.montant_net)
    const devise = header.devise
    const ref = header.reference.replace(/,/g, ' ')
    const bankCode = BANK_CODES_MCB[c.bank_code.toUpperCase()] ?? c.bank_code
    lignes.push(`${compte},${nom},${montant},${devise},${ref},${bankCode}`)
  }

  return lignes.join('\n') + '\n'
}

// ============================================================
// FORMAT CSV GÉNÉRIQUE (universel)
// ============================================================

/**
 * Génère un CSV universel multi-banques.
 * Format : compte_iban;bic;nom;montant;devise;reference;banque
 * Compatible plupart des banques acceptant upload CSV.
 */
export function generateGenericCSV(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const lignes: string[] = [
    'IBAN_Compte;BIC;Nom_Beneficiaire;Montant;Devise;Reference;Banque'
  ]

  for (const c of credits) {
    const iban = c.iban ?? c.bank_account_number
    const bic = c.bic ?? ''
    const nom = c.nom.replace(/;/g, ' ')
    const ref = header.reference.replace(/;/g, ' ')
    lignes.push(
      `${iban};${bic};${nom};${formatMontant(c.montant_net)};${header.devise};${ref};${c.bank_code}`
    )
  }

  return lignes.join('\n') + '\n'
}

// ============================================================
// FORMAT SEPA XML (pain.001.001.03)
// Pour OCC Malta, banques européennes
// ============================================================

/**
 * Génère un fichier SEPA Credit Transfer (pain.001.001.03).
 * Conforme au standard ISO 20022.
 * Utilisé pour NHS_S2 (Malta), OCC (Malta).
 */
export function generateSEPAXML(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const montantTotal = credits.reduce((sum, c) => sum + c.montant_net, 0)
  const now = new Date()
  const creationDateTime = now.toISOString().replace(/\.\d{3}Z$/, '+00:00')
  const requestedDate = header.dateValeur.toISOString().split('T')[0]

  // Identifiant unique du message (max 35 caractères)
  const msgId = `TIBOK-${formatMCBDate(now)}-${String(now.getTime()).slice(-6)}`

  // Construction des lignes de transactions
  const transactions = credits.map((c, idx) => {
    const endToEndId = `SAL-${String(idx + 1).padStart(4, '0')}-${formatMCBDate(header.dateValeur)}`
    const iban = c.iban ?? c.bank_account_number
    const bic = c.bic ?? ''
    return `        <CdtTrfTxInf>
          <PmtId>
            <EndToEndId>${endToEndId}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="${header.devise}">${formatMontant(c.montant_net)}</InstdAmt>
          </Amt>${bic ? `
          <CdtrsAgt>
            <FinInstnId>
              <BIC>${bic}</BIC>
            </FinInstnId>
          </CdtrsAgt>` : ''}
          <Cdtr>
            <Nm>${escapeXML(c.nom)}</Nm>
          </Cdtr>
          <CdtrAcct>
            <Id>
              <IBAN>${iban}</IBAN>
            </Id>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${escapeXML(header.reference)}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${credits.length}</NbOfTxs>
      <CtrlSum>${formatMontant(montantTotal)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXML(header.societeNom)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${credits.length}</NbOfTxs>
      <CtrlSum>${formatMontant(montantTotal)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${requestedDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXML(header.societeNom)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${header.compteDebiteur}</IBAN>
        </Id>
      </DbtrAcct>
${transactions}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`
}

// ============================================================
// FORMAT SWIFT MT103
// Pour NHS_S2 (Barclays UK), virements internationaux
// ============================================================

/**
 * Génère un lot de messages SWIFT MT103 (un par employé).
 * Chaque MT103 est séparé par une ligne de tirets.
 * Format texte brut conforme SWIFT FIN.
 */
export function generateSWIFTMT103(
  header: VirementHeader,
  credits: VirementCredit[]
): string {
  const now = new Date()
  const dateValStr = formatMCBDate(header.dateValeur).slice(2) // YYMMDD
  const messages: string[] = []

  for (let i = 0; i < credits.length; i++) {
    const c = credits[i]
    const refTx = `SAL${String(i + 1).padStart(5, '0')}${dateValStr}`
    const bic = c.bic ?? 'XXXXXXXXX'
    const iban = c.iban ?? c.bank_account_number
    const montant = `${header.devise}${formatMontant(c.montant_net)}`

    messages.push(
      `{1:F01${bic}0000000000}` +
      `{2:O1031200${dateValStr}${refTx}N}` +
      `{4:\n` +
      `:20:${refTx}\n` +
      `:23B:CRED\n` +
      `:32A:${dateValStr}${montant}\n` +
      `:50K:/${header.compteDebiteur}\n${header.societeNom}\n` +
      `:57A:${bic}\n` +
      `:59:/${iban}\n${c.nom}\n` +
      `:70:${header.reference.substring(0, 140)}\n` +
      `:71A:OUR\n` +
      `-}`
    )
  }

  return messages.join('\n' + '-'.repeat(40) + '\n') + '\n'
}

// ============================================================
// UTILITAIRES INTERNES
// ============================================================

/** Échappe les caractères spéciaux XML */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================
// DÉTECTION AUTO DU FORMAT SELON LA BANQUE
// ============================================================

/**
 * Retourne le format d'export recommandé pour une banque société donnée.
 * - MCB → mcb_bp_v1
 * - SBM → sbm_csv
 * - MauBank → maubank_csv
 * - Autres banques mauriciennes → generic_csv
 * - Banques internationales → sepa_xml ou swift_mt103
 */
export function getDefaultFormat(bankCode: string): string {
  const code = bankCode.toUpperCase()

  if (code === 'MCB') return 'mcb_bp_v1'
  if (code === 'SBM') return 'sbm_csv'
  if (code === 'MAUBANK') return 'maubank_csv'

  const banqueMaurice = BANK_LIST_MAURITIUS.find(b => b.code === code)
  if (banqueMaurice) return banqueMaurice.format

  const banqueIntl = BANK_LIST_INTERNATIONAL.find(b => b.code === code)
  if (banqueIntl) return banqueIntl.format

  // Fallback : CSV générique
  return 'generic_csv'
}

/**
 * Retourne le label complet d'une banque à partir de son code.
 */
export function getBankLabel(bankCode: string): string {
  const code = bankCode.toUpperCase()
  const all = [...BANK_LIST_MAURITIUS, ...BANK_LIST_INTERNATIONAL]
  return all.find(b => b.code === code)?.label ?? bankCode
}

/**
 * Retourne le nom du fichier de virement selon le format et la période.
 * MCB : BP-NO-MCB-IDENT-{YYYY}-{MM}.txt
 * SBM : SALARY-SBM-{YYYY}-{MM}.csv
 * MauBank : SALARY-MAUBANK-{YYYY}-{MM}.csv
 * Autres : {SOCIETE}_{BANQUE}_SALARY_{YYYY}-{MM}.csv
 */
export function getVirementFilename(
  societeCode: string,
  bankCode: string,
  format: string,
  periode: string  // YYYY-MM
): string {
  const [year, month] = periode.split('-')

  if (format === 'mcb_bp_v1') {
    return `BP-NO-MCB-IDENT-${year}-${month}.txt`
  }
  if (format === 'sbm_csv') {
    return `SALARY-SBM-${year}-${month}.csv`
  }
  if (format === 'maubank_csv') {
    return `SALARY-MAUBANK-${year}-${month}.csv`
  }
  if (format === 'sepa_xml') {
    return `${societeCode}_${bankCode}_SALARY_${periode}.xml`
  }
  if (format === 'swift_mt103') {
    return `${societeCode}_${bankCode}_SALARY_${periode}.txt`
  }
  // generic_csv et fallback
  return `${societeCode}_${bankCode}_SALARY_${periode}.csv`
}

/**
 * Génère la référence de salaire standard.
 * Ex: "SALARY Mar 2026"
 */
export function buildSalaryReference(periode: string): string {
  const [yearStr, monthStr] = periode.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr)
  return `SALARY ${moisEnAnglais(month)} ${year}`
}
