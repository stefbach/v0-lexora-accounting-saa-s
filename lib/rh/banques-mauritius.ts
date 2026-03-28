/**
 * LEXORA — Formats de virement bancaire Maurice
 * Toutes les banques commerciales agréées par la Bank of Mauritius
 * À utiliser dans app/api/rh/exports/virement/route.ts
 */

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
