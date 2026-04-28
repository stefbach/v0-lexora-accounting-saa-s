/**
 * LEXORA — Formats de virement bancaire Maurice
 * Toutes les banques commerciales agréées par la Bank of Mauritius
 * À utiliser dans app/api/rh/exports/virement/route.ts
 */

/**
 * @deprecated Mig 211 — utiliser la table `banques_mauritius` (DB) comme
 * source de vérité. Les codes ci-dessous étaient incorrects et provoquaient
 * des fichiers BP-V1 rejetés par MCB :
 *   - SBM=03 → en fait 11 (vérifié BP-1920430.txt validé MRA mars 2026)
 *   - ABSA=04 → en fait 03
 *   - BANKONE=08 → en fait 05
 * Le générateur MCB BP-V1 lit désormais la map DB. Cet objet est conservé
 * pour rétrocompat mais ne doit plus être utilisé pour générer un BP-V1
 * de production.
 */
export const MCB_BANK_CODES: Record<string, string> = {
  'MCB':     '01',
  'SBM':     '11',  // Corrigé via mig 211
  'ABC':     '11',
  'AFRASIA': '05',
  'MAUBANK': '06',
  'BANKONE': '05',  // Corrigé via mig 211
  'ABSA':    '03',  // Corrigé via mig 211
  'SCB':     '07',
  'HSBC':    '09',
  'BCP':     '10',
  'BDM':     '10',
  'CIM':     '12',
  'AUTRE':   '99',
}

/** Format nom bénéficiaire BP-V1 : NOM en MAJUSCULES + Prénom en
 *  Capitalize. Référence Payroll Mauritius. Tronqué à 30 caractères
 *  selon la spec MCB.
 *
 *  Capitalize Unicode-aware : la regex `(^|\s|-)\p{L}` capture la
 *  première lettre de chaque mot (séparateur début / espace / tiret),
 *  flag `u` pour reconnaître les lettres accentuées (\p{L}). Sans cette
 *  forme, `\b\w` traite `é` comme frontière de mot et casserait
 *  "mélanie" en "MéLanie". */
function formatNomBenefBP(nom: string | undefined, prenom: string | undefined): string {
  const nomCaps = (nom || '').trim().toUpperCase()
  const prenomCap = (prenom || '').trim().toLowerCase()
    .replace(/(^|\s|-)\p{L}/gu, m => m.toUpperCase())
  return `${nomCaps} ${prenomCap}`.trim().slice(0, 30)
}

/**
 * Générer le fichier MCB BP-V1 (format officiel Bulk Payment MCB)
 * Validé sur fichier réel BP-1920430.txt (OCC, mars 2026)
 *
 * Structure :
 *   Ligne 0  : en-tête batch (1 ligne)
 *   Ligne 9  : compte débiteur employeur (1 ligne)
 *   Lignes 1 : virements MCB→MCB (même banque, numéro 12 chiffres)
 *   Lignes 2 : virements MCB→Autre banque (code banque MCB + numéro compte)
 *
 * Exemple réel :
 *   0|BP-V1|20260328|02|1|501858.14|16|501858.14|MUR|20260328180545
 *   9|501858.14|000447954555|SALARY Mar 2026
 *   1|24863.27|000183552032|SALARY Mar 2026
 *   2|36850.55|03|191079310|LALANE Melanie|SALARY Mar 2026|N
 */
/**
 * Map<code_banque, code_mcb_bp> chargée depuis la table banques_mauritius
 * (mig 211). NULL si la banque n'a pas de code confirmé → le générateur
 * refuse alors de produire la ligne correspondante.
 */
export type BankCodesMap = Map<string, string | null>

/**
 * Erreur thrownée si une banque utilisée dans les bulletins n'a pas de
 * code_mcb_bp confirmé en DB. À catcher côté route pour renvoyer un 422
 * explicite (« Code MCB BP manquant pour XXX, contactez admin »).
 */
export class BankCodeMissingError extends Error {
  constructor(public banque: string, public employes: string[]) {
    super(`Code MCB BP manquant pour la banque "${banque}" (${employes.length} employé(s) concerné(s)). Renseignez code_mcb_bp dans la table banques_mauritius.`)
    this.name = 'BankCodeMissingError'
  }
}

export function genererVirementMCB_BPV1(
  lignes: LigneBulletin[],
  compteDebiteur: string,     // Numéro compte MCB employeur (ex: 000447954555)
  dateValeur: string,          // YYYY-MM-DD
  bankCodesMap: BankCodesMap,  // Map chargée depuis banques_mauritius (mig 211)
  referenceLabel?: string      // Ex: "SALARY Mar 2026"
): { content: string; extension: string; filename_suggestion: string } {

  const dateYYYYMMDD = dateValeur.replace(/-/g, '')
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  // Construire référence "SALARY Mmm YYYY"
  const moisNoms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = new Date(dateValeur)
  const ref = referenceLabel || `SALARY ${moisNoms[d.getMonth()]} ${d.getFullYear()}`

  // Séparer MCB interne (type 1) vs autres banques (type 2)
  const lignesMCB    = lignes.filter(l => (l.bank_code || normaliserCodeBanque(l.bank_name)) === 'MCB')
  const lignesAutres = lignes.filter(l => (l.bank_code || normaliserCodeBanque(l.bank_name)) !== 'MCB')

  // Validation amont : toutes les banques inter-bancaires doivent avoir
  // un code_mcb_bp confirmé. On groupe les manquants par banque pour un
  // message d'erreur lisible.
  const manquants = new Map<string, string[]>()
  for (const l of lignesAutres) {
    const bankCode = (l.bank_code || normaliserCodeBanque(l.bank_name)).toUpperCase()
    const mcbCode = bankCodesMap.get(bankCode)
    if (!mcbCode) {
      const nomEmp = `${l.prenom || ''} ${l.nom || ''}`.trim() || l.employe_code || '?'
      const arr = manquants.get(bankCode) || []
      arr.push(nomEmp)
      manquants.set(bankCode, arr)
    }
  }
  if (manquants.size > 0) {
    const [premiereBanque, employes] = Array.from(manquants.entries())[0]
    throw new BankCodeMissingError(premiereBanque, employes)
  }

  const totalGeneral = lignes.reduce((s, l) => s + l.salaire_net, 0)
  const nbTransactions = lignes.length

  let content = ''

  // LIGNE 0 — En-tête batch
  content += `0|BP-V1|${dateYYYYMMDD}|02|1|${totalGeneral.toFixed(2)}|${nbTransactions}|${totalGeneral.toFixed(2)}|MUR|${timestamp}\r\n`

  // LIGNE 9 — Compte débiteur employeur
  content += `9|${totalGeneral.toFixed(2)}|${compteDebiteur}|${ref}\r\n`

  // LIGNES 1 — Virements MCB→MCB
  for (const l of lignesMCB) {
    content += `1|${l.salaire_net.toFixed(2)}|${l.bank_account}|${ref}\r\n`
  }

  // LIGNES 2 — Virements MCB→Autre banque (codes lus depuis banques_mauritius)
  for (const l of lignesAutres) {
    const bankCode = (l.bank_code || normaliserCodeBanque(l.bank_name)).toUpperCase()
    const mcbCode = bankCodesMap.get(bankCode)!  // garanti non-null par la validation amont
    // Si bank_account_name est rempli (HR a saisi la convention "NOM
    // Prénom" du compte bancaire), on lui fait confiance sans casing.
    // Sinon on construit depuis nom/prenom au format BP attendu.
    const nomBenef = l.bank_account_name && l.bank_account_name.trim()
      ? l.bank_account_name.trim().slice(0, 30)
      : formatNomBenefBP(l.nom, l.prenom)
    content += `2|${l.salaire_net.toFixed(2)}|${mcbCode}|${l.bank_account}|${nomBenef}|${ref}|N\r\n`
  }

  const moisRef = dateValeur.slice(0, 7)
  return {
    content,
    extension: 'txt',
    filename_suggestion: `BP-SALARY-${moisRef}.txt`
  }
}

export const BANQUES_MAURITIUS = [
  { code: 'MCB',   nom: 'Mauritius Commercial Bank',    swift: 'MCBLMUMU' },
  { code: 'SBM',   nom: 'State Bank of Mauritius',      swift: 'STCBMUMU' },
  { code: 'ABC',   nom: 'ABC Banking Corporation',       swift: 'ABCBMUMU' },
  { code: 'AFRASIA', nom: 'AfrAsia Bank',               swift: 'AFASMUMU' },
  { code: 'MAUBANK', nom: 'MauBank',                    swift: 'MAUBMUMU' },
  { code: 'BANKONE', nom: 'Bank One',                   swift: 'COMUMUXX' },
  { code: 'ABSA',  nom: 'Barclays / ABSA Mauritius',    swift: 'BARCMUMU' },
  { code: 'SCB',   nom: 'Standard Chartered Mauritius', swift: 'SCBLMUMU' },
  { code: 'HSBC',  nom: 'HSBC Mauritius',               swift: 'HSBCMUMU' },
  { code: 'BCP',   nom: 'Banque de Commerce et de Placements', swift: 'BCPMMUMU' },
  { code: 'BDM',   nom: 'Banque des Mascareignes',      swift: 'BDMAMUMU' },
  { code: 'CIM',   nom: 'CIM Finance',                  swift: 'CIMFMUMU' },
  { code: 'AUTRE', nom: 'Autre banque',                 swift: '' },
] as const

export type CodeBanque = typeof BANQUES_MAURITIUS[number]['code']

export interface LigneBulletin {
  employe_code: string
  nom: string
  prenom: string
  bank_account: string
  bank_iban?: string
  bank_swift?: string
  bank_branch?: string
  bank_account_name?: string
  bank_name: string
  bank_code?: string
  salaire_net: number
  devise_salaire?: string // MUR par défaut
  periode: string // YYYY-MM
}

export interface InfoEmetteur {
  banque: string
  numero_compte: string
  iban?: string
  swift?: string
  nom_compte?: string
}

/**
 * Générer le contenu CSV selon le format de chaque banque mauricienne
 * avec informations du compte émetteur (employeur) dans l'en-tête
 */
export function genererVirementBanque(
  lignes: LigneBulletin[],
  banque: string,
  date: string, // YYYY-MM-DD
  emetteur?: InfoEmetteur,
  devise: string = 'MUR'
): { content: string; extension: string; mime: string } {
  const dd = date.split('-')[2]
  const mm = date.split('-')[1]
  const yyyy = date.split('-')[0]
  const dateDDMMYYYY = `${dd}/${mm}/${yyyy}`
  const dateYYYYMMDD = `${yyyy}${mm}${dd}`

  switch (banque.toUpperCase()) {

    case 'MCB': {
      // MCB Juice Pro Business / MCB Internet Banking
      // En-tête avec compte débiteur employeur
      let csv = ''
      if (emetteur?.numero_compte) {
        csv += `##DEBIT_ACCOUNT:${emetteur.numero_compte}\n`
        csv += `##DEBIT_BANK:MCB\n`
        csv += `##BATCH_DATE:${date}\n`
      }
      csv += 'Account Number,Beneficiary Name,Amount,Currency,Reference,Date\n'
      for (const l of lignes) {
        const ref = `SALARY ${l.periode}`
        const benefName = l.bank_account_name || `${l.prenom} ${l.nom}`
        csv += `${l.bank_account},"${benefName}",${l.salaire_net.toFixed(2)},${devise},"${ref}",${date}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'SBM': {
      // SBM BizEdge Bulk Payment
      let csv = `BATCH|${date}|${lignes.length}`
      if (emetteur?.numero_compte) csv += `|${emetteur.numero_compte}`
      csv += '\n'
      for (const l of lignes) {
        const benefName = l.bank_account_name || `${l.prenom} ${l.nom}`
        csv += `${l.bank_account}|${benefName}|${l.salaire_net.toFixed(2)}|${devise}|SALARY ${l.periode}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'ABC': {
      // ABC Banking Corporation
      let csv = 'Beneficiary Account,Beneficiary Name,Amount,Currency,Payment Reference,Value Date\n'
      for (const l of lignes) {
        csv += `${l.bank_account},"${l.prenom} ${l.nom}",${l.salaire_net.toFixed(2)},MUR,"SALARY ${l.periode}",${date}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'AFRASIA': {
      // AfrAsia Bank Corporate — guillemets obligatoires sur tous les champs
      let csv = '"Account Number","Beneficiary Name","Amount","Currency","Reference","Date"\n'
      for (const l of lignes) {
        csv += `"${l.bank_account}","${l.prenom} ${l.nom}","${l.salaire_net.toFixed(2)}","MUR","SALARY ${l.periode}","${date}"\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'MAUBANK': {
      // MauBank Business (ex-MPCB)
      let csv = 'ACCOUNT_NO|BENEFICIARY|AMOUNT|CURRENCY|REFERENCE|DATE\n'
      for (const l of lignes) {
        const ref = `SAL${l.periode.replace('-', '')}`
        csv += `${l.bank_account}|${l.prenom} ${l.nom}|${l.salaire_net.toFixed(2)}|MUR|${ref}|${date}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'BANKONE': {
      // Bank One Corporate — date format DD/MM/YYYY obligatoire
      let csv = 'BeneficiaryAccount,BeneficiaryName,Amount,Currency,Reference,TransactionDate\n'
      for (const l of lignes) {
        csv += `${l.bank_account},"${l.prenom} ${l.nom}",${l.salaire_net.toFixed(2)},MUR,"SALARY ${l.periode}",${dateDDMMYYYY}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'ABSA':
    case 'BARCLAYS': {
      // ABSA / Barclays Mauritius BatchPay
      const ref = `SALARY${dateYYYYMMDD}`
      let csv = `##BATCHPAY|${date}|${ref}\n`
      csv += 'AccountNumber,BeneficiaryName,Amount,Currency,PaymentRef\n'
      for (const l of lignes) {
        csv += `${l.bank_account},"${l.prenom} ${l.nom}",${l.salaire_net.toFixed(2)},MUR,"SALARY ${l.periode}"\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'SCB':
    case 'STANDARD_CHARTERED': {
      // Standard Chartered Mauritius BatchFile
      // Montant sans décimale si MUR entier
      let csv = `SCMUPAY|${dateYYYYMMDD}|${lignes.length}\n`
      for (const l of lignes) {
        csv += `${l.bank_account}|${l.prenom} ${l.nom}|${Math.round(l.salaire_net)}|MUR\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'HSBC': {
      // HSBC Mauritius — format proche MCB
      let csv = 'Beneficiary_Account,Beneficiary_Name,Amount,Currency,Reference,Date\n'
      for (const l of lignes) {
        csv += `${l.bank_account},"${l.prenom} ${l.nom}",${l.salaire_net.toFixed(2)},MUR,"SALARY ${l.periode}",${date}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }

    case 'BCP':
    case 'BDM':
    case 'CIM':
    default: {
      // Format CSV générique — compatible avec la plupart des banques restantes
      let csv = 'Compte,Nom,Prenom,Montant,Devise,Reference,Date\n'
      for (const l of lignes) {
        csv += `${l.bank_account},"${l.nom}","${l.prenom}",${l.salaire_net.toFixed(2)},MUR,"SALARY ${l.periode}",${date}\n`
      }
      return { content: csv, extension: 'csv', mime: 'text/csv' }
    }
  }
}

/**
 * Grouper les bulletins par banque bénéficiaire
 * Retourne un Map<banque_code, LigneBulletin[]>
 */
export function grouperParBanque(
  bulletins: LigneBulletin[]
): Map<string, LigneBulletin[]> {
  const map = new Map<string, LigneBulletin[]>()

  for (const b of bulletins) {
    const banque = normaliserCodeBanque(b.bank_name)
    if (!map.has(banque)) map.set(banque, [])
    map.get(banque)!.push(b)
  }

  return map
}

/**
 * Normaliser le nom de banque saisi par l'utilisateur vers le code standard
 */
export function normaliserCodeBanque(bankName: string): string {
  if (!bankName) return 'SANS_BANQUE'
  const bn = bankName.toUpperCase().trim()

  if (bn.includes('MCB') || bn.includes('MAURITIUS COMMERCIAL')) return 'MCB'
  if (bn.includes('SBM') || bn.includes('STATE BANK')) return 'SBM'
  if (bn.includes('ABC') || bn.includes('ABC BANKING')) return 'ABC'
  if (bn.includes('AFRASIA') || bn.includes('AFRA')) return 'AFRASIA'
  if (bn.includes('MAUBANK') || bn.includes('MPCB')) return 'MAUBANK'
  if (bn.includes('BANK ONE') || bn.includes('BANKONE')) return 'BANKONE'
  if (bn.includes('ABSA') || bn.includes('BARCLAYS')) return 'ABSA'
  if (bn.includes('STANDARD CHARTERED') || bn.includes('SCB') || bn.includes('STANCHART')) return 'SCB'
  if (bn.includes('HSBC')) return 'HSBC'
  if (bn.includes('BCP') || bn.includes('BANQUE DE COMMERCE')) return 'BCP'
  if (bn.includes('MASCAREIGNES') || bn.includes('BDM')) return 'BDM'
  if (bn.includes('CIM')) return 'CIM'

  return 'AUTRE'
}
