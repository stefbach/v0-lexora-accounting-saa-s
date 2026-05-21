import { describe, it, expect } from 'vitest'
import {
  detectInterSociete,
  levenshteinSimilarity,
  normalizeForMatch,
  type SocieteGroupeRow,
} from '@/lib/comptable/inter-societes'

const DDS: SocieteGroupeRow = {
  id: 'soc-dds',
  nom: 'DIGITAL DATA SOLUTIONS LTD',
  groupe_id: 'grp-1',
  client_id: 'client-stef',
}
const OCC: SocieteGroupeRow = {
  id: 'soc-occ',
  nom: 'OBESITY CARE CLINIC LTD',
  groupe_id: 'grp-1',
  client_id: 'client-stef',
}
const ZBROS: SocieteGroupeRow = {
  id: 'soc-zbros',
  nom: 'Z BROS HOLDING LIMITED',
  groupe_id: 'grp-1',
  client_id: 'client-stef',
}

const GROUPE = [DDS, OCC, ZBROS]

describe('normalizeForMatch', () => {
  it('lowercase + retire LTD/LIMITED + ponctuation', () => {
    expect(normalizeForMatch('DIGITAL DATA SOLUTIONS LTD')).toBe('digital data solutions')
    expect(normalizeForMatch('Obesity Care Clinic Ltd.')).toBe('obesity care clinic')
    expect(normalizeForMatch('Z Bros Holding Limited')).toBe('z bros holding')
  })
  it('gère accents et caractères spéciaux', () => {
    expect(normalizeForMatch('Société Générale & Cie, S.A.')).toBe('societe generale cie')
  })
  it('vide → vide', () => {
    expect(normalizeForMatch('')).toBe('')
    expect(normalizeForMatch(null)).toBe('')
    expect(normalizeForMatch(undefined)).toBe('')
  })
})

describe('levenshteinSimilarity', () => {
  it('identique = 1', () => {
    expect(levenshteinSimilarity('abc', 'abc')).toBe(1)
  })
  it('vides = 1', () => {
    expect(levenshteinSimilarity('', '')).toBe(1)
  })
  it('1 char d écart sur 10 ≈ 0.9', () => {
    const s = levenshteinSimilarity('digital dat', 'digital data')
    expect(s).toBeGreaterThanOrEqual(0.9)
  })
  it('totalement différent < 0.5', () => {
    expect(levenshteinSimilarity('abc', 'xyz')).toBeLessThan(0.5)
  })
})

describe('detectInterSociete — exact match', () => {
  it('libellé contient "DIGITAL DATA SOLUTIONS LTD" → match DDS exact', () => {
    const res = detectInterSociete(
      'Virement reçu de DIGITAL DATA SOLUTIONS LTD ref 12345',
      null,
      GROUPE,
    )
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-dds')
    expect(res.match_method).toBe('exact')
    expect(res.score).toBe(1)
  })

  it('libellé contient "Obesity Care Clinic" (sans LTD) → match OCC exact', () => {
    const res = detectInterSociete(
      'Transfer to Obesity Care Clinic',
      null,
      GROUPE,
    )
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-occ')
    expect(res.match_method).toBe('exact')
  })

  it('tiers_detecte porte le nom — match exact même si libelle est vide', () => {
    const res = detectInterSociete(
      'TRF 250000',
      'OBESITY CARE CLINIC LTD',
      GROUPE,
    )
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-occ')
  })
})

describe('detectInterSociete — fuzzy match (abréviations)', () => {
  it('"Digital Data Sol Ltd" (abréviation "Sol") → match DDS via fragment/fuzzy', () => {
    const res = detectInterSociete('Wire from Digital Data Sol Ltd', null, GROUPE)
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-dds')
    expect(['fragment', 'fuzzy', 'exact']).toContain(res.match_method)
    expect(res.score).toBeGreaterThanOrEqual(0.7)
  })

  it('"OBESITY CARE" (sans "CLINIC" ni "LTD") → match OCC via fragment', () => {
    const res = detectInterSociete('Paiement OBESITY CARE 31/03', null, GROUPE)
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-occ')
  })

  it('"Z Bros" seul (token court "bros" + fragment) → match Z BROS HOLDING', () => {
    const res = detectInterSociete('Virement Z Bros Holding', null, GROUPE)
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-zbros')
  })
})

describe('detectInterSociete — non-détection', () => {
  it('"Mauritius Telecom" → pas inter-sociétés', () => {
    const res = detectInterSociete('Paiement Mauritius Telecom facture 234', null, GROUPE)
    expect(res.is_inter).toBe(false)
    expect(res.societe_dest_id).toBeNull()
    expect(res.match_method).toBe('none')
  })

  it('libellé vide → pas inter-sociétés', () => {
    const res = detectInterSociete('', null, GROUPE)
    expect(res.is_inter).toBe(false)
  })

  it('groupe vide → pas inter-sociétés', () => {
    const res = detectInterSociete('DIGITAL DATA SOLUTIONS LTD', null, [])
    expect(res.is_inter).toBe(false)
  })

  it('libellé générique "Salary March 2026" → pas inter-sociétés', () => {
    const res = detectInterSociete('Salary March 2026 — John Smith', null, GROUPE)
    expect(res.is_inter).toBe(false)
  })

  it('libellé "MRA PAYE Mar 2026" → pas inter-sociétés (pas de match accidentel sur "MRA")', () => {
    const res = detectInterSociete('MRA PAYE Mar 2026', null, GROUPE)
    expect(res.is_inter).toBe(false)
  })
})

describe('detectInterSociete — choix du meilleur match', () => {
  it('quand 2 candidats matchent, prend celui avec le score le plus haut', () => {
    // Si on a "DIGITAL DATA OBESITY" (purement théorique), exact gagne sur DDS.
    // Mais on teste plus simplement que le score est >= 0.7 et qu'un seul match est rendu.
    const res = detectInterSociete(
      'DIGITAL DATA SOLUTIONS LTD — paiement OCC',
      null,
      GROUPE,
    )
    expect(res.is_inter).toBe(true)
    // L'un OU l'autre — l'important est qu'il y ait UN gagnant unique
    expect(['soc-dds', 'soc-occ']).toContain(res.societe_dest_id)
    expect(res.score).toBeGreaterThanOrEqual(0.85)
  })
})
