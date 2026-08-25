// @vitest-environment node
// react-pdf renderToBuffer s'exécute côté Node (streams natifs), pas dans le DOM.
// On force donc l'environnement node malgré le glob components/** → jsdom.
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReleveScrapePDF } from './ReleveScrapePDF'
import { generatedReleveStoragePath } from '@/lib/banks/releve-pdf'

// Transactions réalistes (format releves_bancaires.transactions_json scrapé).
const TXS = [
  { date: '2026-08-18', debit: 0, credit: 51123.92, libelle: 'Inward Transfer|QUINNELL', reference: 'FT26230PXYZ8' },
  { date: '2026-08-17', debit: 100000, credit: 0, libelle: 'IB Account Transfer|DIGITAL DATA SOL LTD', reference: 'FT262294HMPL' },
  { date: '2026-08-03', debit: 115, credit: 0, libelle: 'Business Banking Subs Fee', reference: 'Consolidated Entry' },
  { date: '2026-07-31', debit: 264068, credit: 0, libelle: 'Bulk Payment|SALARY Jul 2026', reference: 'FT262128FHCZ' },
]

const baseProps = {
  societe: { nom: 'ACME LTD', brn: 'C12345678' },
  compte: { numero_compte: '000447954555', devise: 'MUR', banque: 'MCB' },
  periode: '2026-08',
  date_debut: '2026-07-31',
  date_fin: '2026-08-18',
  solde_ouverture: 1000,
  solde_cloture: 1000 + 51123.92 - 100000 - 115 - 264068,
  total_debits: 100000 + 115 + 264068,
  total_credits: 51123.92,
  transactions: TXS,
  generated_at: '2026-08-25T10:00:00.000Z',
}

describe('ReleveScrapePDF', () => {
  it('rend un PDF non vide (buffer %PDF) à partir des transactions scrapées', async () => {
    const buf = await renderToBuffer(ReleveScrapePDF(baseProps) as never)
    expect(buf.byteLength).toBeGreaterThan(1500)
    // En-tête PDF valide.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('gère un relevé sans société / sans devise sans planter', async () => {
    const buf = await renderToBuffer(
      ReleveScrapePDF({ ...baseProps, societe: null, compte: { numero_compte: '000451839102' } }) as never,
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it('gère une liste de transactions vide (relevé sans mouvement)', async () => {
    const buf = await renderToBuffer(ReleveScrapePDF({ ...baseProps, transactions: [] }) as never)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('EUR : devise passée au rendu (compte 000447954587)', async () => {
    const buf = await renderToBuffer(
      ReleveScrapePDF({ ...baseProps, compte: { numero_compte: '000447954587', devise: 'EUR' } }) as never,
    )
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})

describe('generatedReleveStoragePath', () => {
  it('chemin déterministe, marqué _Lexora, dans bank-statements/<societe>', () => {
    const p = generatedReleveStoragePath('soc-1', '000447954555', '2026-07-31', '2026-08-18')
    expect(p).toBe('bank-statements/soc-1/Releve_Lexora_000447954555_2026-07-31_2026-08-18.pdf')
  })

  it('assainit les caractères non alphanumériques du numéro de compte', () => {
    const p = generatedReleveStoragePath('soc-1', 'MU00 1234/5678', '2026-01-01', '2026-01-31')
    const basename = p.split('/').pop() as string
    // Le nom de fichier ne doit contenir ni espace ni séparateur de chemin.
    expect(basename).not.toMatch(/[ /]/)
    expect(basename).toBe('Releve_Lexora_MU00-1234-5678_2026-01-01_2026-01-31.pdf')
  })

  it('deux périodes différentes → deux chemins distincts (pas d’écrasement)', () => {
    const a = generatedReleveStoragePath('s', '111', '2026-06-01', '2026-06-30')
    const b = generatedReleveStoragePath('s', '111', '2026-07-01', '2026-07-31')
    expect(a).not.toBe(b)
  })
})
