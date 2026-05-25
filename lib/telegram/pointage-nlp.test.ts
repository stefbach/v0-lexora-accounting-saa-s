import { describe, it, expect } from 'vitest'
import { detectPointageIntent, isExpensesListCommand } from './pointage-nlp'
import { captionLooksLikeExpense } from './expense-ocr'

describe('detectPointageIntent', () => {
  it('match /in and /out commands', () => {
    expect(detectPointageIntent('/in')).toBe('in')
    expect(detectPointageIntent('/out')).toBe('out')
    expect(detectPointageIntent('/pointage_in')).toBe('in')
    expect(detectPointageIntent('/pointage_out')).toBe('out')
    expect(detectPointageIntent('/clockin')).toBe('in')
    expect(detectPointageIntent('/clockout')).toBe('out')
  })

  it('match French natural language IN', () => {
    expect(detectPointageIntent("j'arrive")).toBe('in')
    expect(detectPointageIntent('je commence')).toBe('in')
    expect(detectPointageIntent("Bonjour, je commence")).toBe('in')
    expect(detectPointageIntent('je suis là')).toBe('in')
    expect(detectPointageIntent('je débute')).toBe('in')
  })

  it('match French natural language OUT', () => {
    expect(detectPointageIntent('je pars')).toBe('out')
    expect(detectPointageIntent('je termine')).toBe('out')
    expect(detectPointageIntent('je quitte')).toBe('out')
    expect(detectPointageIntent('je finis')).toBe('out')
    expect(detectPointageIntent("Bonsoir, je pars")).toBe('out')
  })

  it('match English natural language', () => {
    expect(detectPointageIntent("I'm in")).toBe('in')
    expect(detectPointageIntent('clocking in')).toBe('in')
    expect(detectPointageIntent('starting')).toBe('in')
    expect(detectPointageIntent("I'm out")).toBe('out')
    expect(detectPointageIntent('leaving now')).toBe('out')
    expect(detectPointageIntent('done for today')).toBe('out')
  })

  it('returns null for non-matching text', () => {
    expect(detectPointageIntent('')).toBe(null)
    expect(detectPointageIntent('  ')).toBe(null)
    expect(detectPointageIntent('comment vas-tu ?')).toBe(null)
    expect(detectPointageIntent('quel est mon solde de congés ?')).toBe(null)
    expect(detectPointageIntent('je veux savoir mes KPIs')).toBe(null)
    expect(detectPointageIntent(null as unknown as string)).toBe(null)
    expect(detectPointageIntent(undefined as unknown as string)).toBe(null)
  })
})

describe('isExpensesListCommand', () => {
  it('match /notes_de_frais and variants', () => {
    expect(isExpensesListCommand('/notes_de_frais')).toBe(true)
    expect(isExpensesListCommand('/notesdefrais')).toBe(true)
    expect(isExpensesListCommand('/expenses')).toBe(true)
    expect(isExpensesListCommand('/my_expenses')).toBe(true)
  })

  it('does not match other commands', () => {
    expect(isExpensesListCommand('/help')).toBe(false)
    expect(isExpensesListCommand('mes notes de frais')).toBe(false)
    expect(isExpensesListCommand('')).toBe(false)
  })
})

describe('captionLooksLikeExpense', () => {
  it('detects expense captions', () => {
    expect(captionLooksLikeExpense('frais')).toBe(true)
    expect(captionLooksLikeExpense('Frais déjeuner')).toBe(true)
    expect(captionLooksLikeExpense('repas du midi')).toBe(true)
    expect(captionLooksLikeExpense('Taxi vers aéroport')).toBe(true)
    expect(captionLooksLikeExpense('essence')).toBe(true)
    expect(captionLooksLikeExpense('Hotel Paris')).toBe(true)
    expect(captionLooksLikeExpense('hôtel ibis')).toBe(true)
    expect(captionLooksLikeExpense('Note frais déjeuner')).toBe(true)
    expect(captionLooksLikeExpense('Déplacement client')).toBe(true)
  })

  it('ignores non-expense captions', () => {
    expect(captionLooksLikeExpense('Facture fournisseur')).toBe(false)
    expect(captionLooksLikeExpense('Contrat client')).toBe(false)
    expect(captionLooksLikeExpense('')).toBe(false)
    expect(captionLooksLikeExpense(null)).toBe(false)
    expect(captionLooksLikeExpense(undefined)).toBe(false)
  })
})
