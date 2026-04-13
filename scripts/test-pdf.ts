// Simple test script to render a sample Grand Livre PDF
// Run with: npx tsx scripts/test-pdf.ts
import fs from 'fs'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { GrandLivrePDF } from '../components/pdf/GrandLivrePDF'

const sampleEntries = [
  { id: '1', numero_compte: '401', nom_compte: 'Fournisseurs', description: 'Fournisseur Cellplus Mobile Communications Ltd — Facture', date_ecriture: '2025-07-01', journal: 'ACH', ref_folio: 'FINV02699083-2506M', debit_mur: 0, credit_mur: 4687.00, solde_progressif: -141361.44, lettre: null },
  { id: '2', numero_compte: '401', nom_compte: 'Fournisseurs', description: 'Fournisseur ServiQual Ltd — Facture 103581', date_ecriture: '2025-07-01', journal: 'ACH', ref_folio: '103581', debit_mur: 0, credit_mur: 41026.25, solde_progressif: -182387.69, lettre: 'R053' },
  { id: '3', numero_compte: '401', nom_compte: 'Fournisseurs', description: 'Fournisseur Emtel — Facture FINV/15060000001067399/25 (TTC)', date_ecriture: '2025-10-01', journal: 'ACH', ref_folio: 'FINV/15060000001067399', debit_mur: 0, credit_mur: 1944.25, solde_progressif: -156366.59, lettre: null },
  { id: '4', numero_compte: '411', nom_compte: 'Clients', description: 'SKYCALL — Facture juillet 2025', date_ecriture: '2025-07-04', journal: 'VTE', ref_folio: '04/07/2025', debit_mur: 959976.04, credit_mur: 0, solde_progressif: 959976.04, lettre: null },
  { id: '5', numero_compte: '512', nom_compte: 'Banque', description: 'Paiement MHL-2025-165-AUG — Magellan Hub Ltd', date_ecriture: '2025-07-07', journal: 'BNQ', ref_folio: 'BANK-7b1c5240-6f71-4a9', debit_mur: 37768.88, credit_mur: 0, solde_progressif: -163686.93, lettre: 'R061' },
]

const sampleSociete = { nom: 'Digital Data Solutions Ltd', brn: 'C20173322' }
const compteNames = { '401': 'Fournisseurs', '411': 'Clients', '512': 'Banque' }

async function main() {
  const buffer = await renderToBuffer(
    React.createElement(GrandLivrePDF, {
      societe: sampleSociete,
      dateDebut: '2025-07-01',
      dateFin: '2026-06-30',
      ecritures: sampleEntries as any,
      compteNames,
    }) as any
  )
  const outPath = path.join(process.cwd(), 'test-grandlivre.pdf')
  fs.writeFileSync(outPath, buffer)
  console.log('PDF written:', outPath, `(${buffer.length} bytes)`)
}

main().catch(e => { console.error(e); process.exit(1) })
