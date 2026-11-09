import { describe, it, expect } from 'vitest'
import {
  normaliserCodeBanque,
  genererVirementMCB_BPV1,
  BankCodeMissingError,
  type LigneBulletin,
  type BankCodesMap,
} from './banques-mauritius'

const ligneBase: LigneBulletin = {
  employe_code: 'E001',
  nom: 'DUPONT',
  prenom: 'Jean',
  bank_account: '000123456789',
  bank_name: 'MCB',
  salaire_net: 20000,
  periode: '2026-08',
}

describe('normaliserCodeBanque', () => {
  it('returns SANS_BANQUE for a missing bank name', () => {
    expect(normaliserCodeBanque(undefined as unknown as string)).toBe('SANS_BANQUE')
    expect(normaliserCodeBanque('')).toBe('SANS_BANQUE')
  })

  it('recognises MCB from various spellings', () => {
    expect(normaliserCodeBanque('MCB')).toBe('MCB')
    expect(normaliserCodeBanque('Mauritius Commercial Bank')).toBe('MCB')
  })
})

describe('genererVirementMCB_BPV1', () => {
  const bankCodesMap: BankCodesMap = new Map([['SBM', '11']])

  it('génère le fichier normalement pour des employés payés avec banque connue', () => {
    const result = genererVirementMCB_BPV1(
      [ligneBase],
      '000447954555',
      '2026-08-29',
      bankCodesMap,
      'SALARY Aug 2026',
    )
    expect(result.content).toContain('000123456789')
  })

  // Régression OCC (issue #581) : un collaborateur sans salaire (ex:
  // consultant géré uniquement pour le planning) n'a ni bank_name ni
  // bank_code renseigné. normaliserCodeBanque(null) retombe alors sur
  // 'SANS_BANQUE', absent de la table des codes MCB BP, ce qui faisait
  // lever BankCodeMissingError et bloquait la génération du virement
  // pour TOUTE la société. Les appelants doivent filtrer ces lignes
  // (salaire_net <= 0) avant d'appeler ce générateur — ce test documente
  // pourquoi ce filtre amont est nécessaire.
  it('lève BankCodeMissingError si une ligne sans banque est incluse (cas consultant non rémunéré)', () => {
    const ligneSansBanque: LigneBulletin = {
      employe_code: 'E002',
      nom: 'HARBOTTLE',
      prenom: 'Baydon',
      bank_account: '',
      bank_name: '',
      salaire_net: 0,
      periode: '2026-08',
    }
    expect(() =>
      genererVirementMCB_BPV1(
        [ligneBase, ligneSansBanque],
        '000447954555',
        '2026-08-29',
        bankCodesMap,
        'SALARY Aug 2026',
      ),
    ).toThrow(BankCodeMissingError)
  })

  it('ne lève plus d\'erreur une fois la ligne à salaire net 0 filtrée en amont', () => {
    const ligneSansBanque: LigneBulletin = {
      employe_code: 'E002',
      nom: 'HARBOTTLE',
      prenom: 'Baydon',
      bank_account: '',
      bank_name: '',
      salaire_net: 0,
      periode: '2026-08',
    }
    const lignes = [ligneBase, ligneSansBanque].filter(l => l.salaire_net > 0)
    const result = genererVirementMCB_BPV1(
      lignes,
      '000447954555',
      '2026-08-29',
      bankCodesMap,
      'SALARY Aug 2026',
    )
    expect(result.content).toContain('000123456789')
    expect(result.content).not.toContain('HARBOTTLE')
  })
})
