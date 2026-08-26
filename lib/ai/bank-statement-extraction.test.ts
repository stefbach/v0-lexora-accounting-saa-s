import { describe, it, expect } from 'vitest'
import { tryParseFullJson } from './bank-statement-extraction'

// Régression : un relevé dense (ex. juin, 6 pages) faisait dépasser max_tokens →
// la réponse JSON était TRONQUÉE → l'ancien parse échouait et le document
// retombait sur { extraction: {} } (aucun relevé créé). tryParseFullJson doit
// récupérer les transactions déjà extraites en refermant les accolades/crochets.
describe('tryParseFullJson — récupération de JSON tronqué (relevé dense)', () => {
  it('parse un JSON complet normalement', () => {
    const r = tryParseFullJson('{"routing":{"type_document":"releve_bancaire"},"extraction":{"transactions":[{"date":"2026-06-01","credit":100}]}}')
    expect(r?.extraction?.transactions?.length).toBe(1)
  })

  it('récupère un JSON coupé ENTRE deux transactions (cas réel max_tokens)', () => {
    // Réponse tronquée juste après une transaction complète + virgule : c'est le
    // point de coupure typique d'un relevé dense qui déborde max_tokens.
    const truncated = `{
      "routing": { "type_document": "releve_bancaire", "societe": "ACME" },
      "extraction": {
        "transactions": [
          { "date": "2026-06-01", "libelle": "Salaire", "debit": 0, "credit": 264068 },
          { "date": "2026-06-02", "libelle": "Frais", "debit": 115, "credit": 0 },`
    const r = tryParseFullJson(truncated)
    expect(r).toBeTruthy()
    const txs = r?.extraction?.transactions
    expect(Array.isArray(txs)).toBe(true)
    // Les deux transactions complètes sont récupérées (au lieu de tout jeter).
    expect(txs.length).toBe(2)
    expect(txs[0].credit).toBe(264068)
    expect(r?.routing?.type_document).toBe('releve_bancaire')
  })

  it('extrait le JSON même entouré de texte / fences markdown', () => {
    const wrapped = 'Voici le résultat :\n```json\n{"extraction":{"transactions":[]}}\n```\nFin.'
    const r = tryParseFullJson(wrapped)
    expect(r?.extraction?.transactions).toEqual([])
  })

  it('renvoie null sur une entrée sans objet JSON', () => {
    expect(tryParseFullJson('aucun json ici')).toBeNull()
  })
})
