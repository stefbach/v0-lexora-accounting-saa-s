/**
 * Tests unitaires du pipeline OCR documents (lib/documents/process-document.ts).
 *
 * STRATÉGIE : on stub le client Supabase (`@supabase/supabase-js`), l'API
 * Anthropic, et les 4 orchestrateurs métier aval (écritures factures, taux
 * de change, relevé bancaire, note de frais). Tout le reste du pipeline
 * s'exécute réellement : parsing JSON de la réponse Claude, normalisation
 * type/devise/dates, post-validation client vs fournisseur, construction de
 * la ligne `factures` (montants, taux de change, lignes), déduplication du
 * numéro de facture, warnings de dates, et le parsing XLSX réel (lib xlsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Infrastructure de mock Supabase (query-builder chaînable) ──────────────
interface RecordedOp {
  method: string
  args: any[]
}
interface RecordedCall {
  table: string
  ops: RecordedOp[]
}

const h = vi.hoisted(() => {
  const state: {
    calls: RecordedCall[]
    route: (call: { table: string; ops: { method: string; args: any[] }[] }) => any
  } = {
    calls: [],
    route: () => ({ data: null, error: null }),
  }

  const anthropicCreate = vi.fn()
  const download = vi.fn()
  const createEcrituresForFacture = vi.fn()
  const getTauxChange = vi.fn()
  const processReleveBancaire = vi.fn()
  const autoCreateNoteDeFrais = vi.fn()

  const CHAIN_METHODS = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'limit', 'order', 'like']

  function from(table: string) {
    const call = { table, ops: [] as { method: string; args: any[] }[] }
    state.calls.push(call)
    const resolve = () => Promise.resolve(state.route(call) ?? { data: null, error: null })
    const builder: any = {}
    for (const m of CHAIN_METHODS) {
      builder[m] = (...args: any[]) => {
        call.ops.push({ method: m, args })
        return builder
      }
    }
    builder.maybeSingle = () => {
      call.ops.push({ method: 'maybeSingle', args: [] })
      return resolve()
    }
    builder.single = () => {
      call.ops.push({ method: 'single', args: [] })
      return resolve()
    }
    builder.then = (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected)
    return builder
  }

  const client = {
    from,
    storage: { from: (_bucket: string) => ({ download }) },
  }

  return {
    state,
    client,
    anthropicCreate,
    download,
    createEcrituresForFacture,
    getTauxChange,
    processReleveBancaire,
    autoCreateNoteDeFrais,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }))
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    // Le code de prod utilise soit .create() soit .stream().finalMessage()
    // (streaming obligatoire pour les gros max_tokens des relevés denses). Les
    // deux délèguent au même mock pour préserver les assertions d'appel.
    messages = {
      create: (...args: any[]) => h.anthropicCreate(...args),
      stream: (...args: any[]) => ({ finalMessage: () => h.anthropicCreate(...args) }),
    }
  }
  return { default: MockAnthropic }
})
vi.mock('@/lib/accounting/ecritures-factures', () => ({
  createEcrituresForFacture: h.createEcrituresForFacture,
}))
vi.mock('@/lib/taux-change', () => ({ getTauxChange: h.getTauxChange }))
vi.mock('@/lib/bank/process-releve', () => ({ processReleveBancaire: h.processReleveBancaire }))
vi.mock('@/lib/expenses/auto-create', () => ({ autoCreateNoteDeFrais: h.autoCreateNoteDeFrais }))

import { processDocument } from '../process-document'

// ─── Helpers ────────────────────────────────────────────────────────────────
function callsFor(table: string): RecordedCall[] {
  return h.state.calls.filter((c) => c.table === table)
}
function opArg(call: RecordedCall, method: string): any {
  return call.ops.find((o) => o.method === method)?.args?.[0]
}
function updatesFor(table: string): any[] {
  return callsFor(table)
    .map((c) => opArg(c, 'update'))
    .filter(Boolean)
}
function insertsFor(table: string): any[] {
  return callsFor(table)
    .map((c) => opArg(c, 'insert'))
    .filter(Boolean)
}

function makeFileData(content: string | ArrayBuffer) {
  const buf = typeof content === 'string' ? new TextEncoder().encode(content).buffer : content
  return {
    arrayBuffer: async () => buf,
    text: async () => (typeof content === 'string' ? content : ''),
  }
}

function claudeReplies(payload: unknown) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  h.anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text }] })
}

/**
 * Route Supabase par défaut : société active "Lexora Ltd", dossier dos-1 /
 * société soc-1, aucune facture existante.
 */
function defaultRoute(call: RecordedCall): any {
  if (call.table === 'documents') {
    const sel = opArg(call, 'select')
    if (typeof sel === 'string' && sel.includes('dossiers!inner')) {
      return {
        data: {
          dossier_id: 'dos-1',
          dossiers: { societe_id: 'soc-1', societes: { nom: 'Lexora Ltd', brn: 'C123456' } },
        },
        error: null,
      }
    }
    if (typeof sel === 'string' && sel.includes('uploaded_by')) {
      return { data: { dossier_id: 'dos-1', uploaded_by: 'user-1' }, error: null }
    }
    return { data: null, error: null }
  }
  if (call.table === 'dossiers') {
    return { data: { societe_id: 'soc-1' }, error: null }
  }
  if (call.table === 'factures') {
    const sel = opArg(call, 'select')
    if (call.ops.some((o) => o.method === 'insert')) {
      return { data: { id: 'fac-00000001-aaaa' }, error: null }
    }
    if (sel === 'id') return { data: null, error: null } // pas de facture existante
    if (sel === 'numero_facture') return { data: [], error: null } // pas de collision
    return { data: null, error: null }
  }
  return { data: null, error: null }
}

const FACTURE_PAYLOAD = {
  routing: {
    societe: 'Fournisseur SARL',
    type_document: 'facture_fournisseur',
    confiance_type: 95,
    format_detecte: 'facture_structuree',
  },
  extraction: {
    emetteur: 'Fournisseur SARL',
    destinataire: 'Lexora Ltd',
    date_document: '10/07/2026',
    date_echeance: '2026-08-10',
    numero_reference: 'F-001',
    devise: '€',
    taux_tva: 15,
    montant_ht: 100,
    montant_tva: 15,
    montant_ttc: 115,
    categorie_suggeree: null,
    description_libre: 'Facture de prestation',
    confiance_extraction: 92,
    lignes: [{ description: 'Prestation conseil', quantite: 2, prix_unitaire: 50, montant_ht: 100, taux_tva: 15 }],
    // Doit être IGNORÉ pour une facture (écritures générées côté métier).
    ecritures_comptables: [{ compte: '601', libelle: 'Achat', debit: 100, credit: 0 }],
  },
}

const PARAMS = { documentId: 'doc-1', storagePath: 'soc/facture.pdf', nomFichier: 'facture.pdf' }

beforeEach(() => {
  h.state.calls = []
  h.state.route = defaultRoute
  h.download.mockReset().mockResolvedValue({ data: makeFileData('%PDF-fake'), error: null })
  h.anthropicCreate.mockReset()
  claudeReplies(FACTURE_PAYLOAD)
  h.createEcrituresForFacture.mockReset().mockResolvedValue({ ok: true })
  h.getTauxChange.mockReset().mockResolvedValue({ EUR: 50, USD: 45 })
  h.processReleveBancaire.mockReset().mockResolvedValue({
    ok: true,
    nb_transactions: 3,
    releve_id: 'rel-1',
    compte_bancaire_id: 'cb-1',
    created_account: false,
  })
  h.autoCreateNoteDeFrais.mockReset().mockResolvedValue({ ok: true, id: 'ndf-1' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── Chemin nominal facture fournisseur (PDF) ───────────────────────────────
describe('processDocument — facture fournisseur PDF', () => {
  it('retourne le résultat complet et passe le document en statut traite', async () => {
    const res = await processDocument(PARAMS)

    expect(res).toMatchObject({
      ok: true,
      type_document: 'facture_fournisseur',
      societe_detectee: 'Fournisseur SARL',
      format_detecte: 'facture_structuree',
      confiance_extraction: 92,
      description_libre: 'Facture de prestation',
      categorie_suggeree: null,
      statut: 'traite',
    })
    expect((res as any).warnings).toBeUndefined()

    // Statut intermédiaire en_cours puis résultat final.
    const docUpdates = updatesFor('documents')
    expect(docUpdates[0]).toEqual({ statut: 'en_cours' })
    expect(docUpdates[1]).toMatchObject({
      type_document: 'facture_fournisseur',
      statut: 'traite',
      societe_detectee: 'Fournisseur SARL',
      confiance_type: 92,
    })
    expect(docUpdates[1].categorie).toBeUndefined()
    expect(docUpdates[1].n8n_result.metadata.model).toBe('claude-haiku-4-5-20251001')

    // Le PDF est transmis à Claude en bloc document base64.
    const claudeReq = h.anthropicCreate.mock.calls[0][0]
    expect(claudeReq.messages[0].content[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    })
    expect(claudeReq.system).toContain('Société active : "Lexora Ltd" (BRN C123456)')
  })

  it('crée la facture avec dates normalisées, devise EUR et conversion MUR au taux du jour', async () => {
    await processDocument(PARAMS)

    const fac = insertsFor('factures')[0]
    expect(fac).toMatchObject({
      societe_id: 'soc-1',
      dossier_id: 'dos-1',
      numero_facture: 'F-001',
      type_facture: 'fournisseur',
      tiers: 'Fournisseur SARL',
      date_facture: '2026-07-10', // 10/07/2026 normalisé ISO
      date_echeance: '2026-08-10',
      devise: 'EUR', // symbole € normalisé
      taux_change: 50,
      montant_ht: 100,
      montant_tva: 15,
      montant_ttc: 115,
      taux_tva: 15,
      montant_mur: 5750, // 115 × 50
      statut: 'en_attente',
      document_id: 'doc-1',
    })
    expect(fac.lignes).toHaveLength(1)
    expect(fac.lignes[0]).toMatchObject({
      description: 'Prestation conseil',
      quantite: 2,
      prix_unitaire: 50,
      montant_ht: 100,
      taux_tva: 15,
    })

    // Les écritures proviennent du moteur métier, pas de Claude.
    expect(insertsFor('ecritures_comptables_v2')).toHaveLength(0)
    expect(h.createEcrituresForFacture).toHaveBeenCalledTimes(1)
    expect(h.createEcrituresForFacture.mock.calls[0][1]).toMatchObject({
      id: 'fac-00000001-aaaa',
      societe_id: 'soc-1',
      numero_facture: 'F-001',
      tiers: 'Fournisseur SARL',
      montant_ttc: 115,
      type_facture: 'fournisseur',
      devise: 'EUR',
      taux_change: 50,
      montant_mur: 5750,
    })
  })

  it('déduplique le numéro de facture en cas de collision (F-001 → F-001-3)', async () => {
    h.state.route = (call) => {
      if (call.table === 'factures' && opArg(call, 'select') === 'numero_facture') {
        return { data: [{ numero_facture: 'F-001' }, { numero_facture: 'F-001-2' }], error: null }
      }
      return defaultRoute(call)
    }
    await processDocument(PARAMS)
    expect(insertsFor('factures')[0].numero_facture).toBe('F-001-3')
  })

  it('facture déjà créée pour ce document → aucun doublon inséré', async () => {
    h.state.route = (call) => {
      if (call.table === 'factures' && opArg(call, 'select') === 'id') {
        return { data: { id: 'fac-existante' }, error: null }
      }
      return defaultRoute(call)
    }
    const res = await processDocument(PARAMS)
    expect(res.ok).toBe(true)
    expect(insertsFor('factures')).toHaveLength(0)
    expect(h.createEcrituresForFacture).not.toHaveBeenCalled()
  })

  it('aucun montant détecté → pas de facture créée mais traitement OK', async () => {
    claudeReplies({
      ...FACTURE_PAYLOAD,
      extraction: { ...FACTURE_PAYLOAD.extraction, montant_ht: 0, montant_tva: 0, montant_ttc: 0 },
    })
    const res = await processDocument(PARAMS)
    expect(res.ok).toBe(true)
    expect(insertsFor('factures')).toHaveLength(0)
  })

  it('getTauxChange en échec → repli taux_change=1 et montant_mur = montant devise', async () => {
    h.getTauxChange.mockRejectedValue(new Error('BOM indisponible'))
    await processDocument(PARAMS)
    const fac = insertsFor('factures')[0]
    expect(fac.taux_change).toBe(1)
    expect(fac.montant_mur).toBe(115)
  })

  it('sans lignes extraites → ligne forfait par défaut basée sur le HT', async () => {
    claudeReplies({
      ...FACTURE_PAYLOAD,
      extraction: { ...FACTURE_PAYLOAD.extraction, lignes: [], devise: 'MUR' },
    })
    await processDocument(PARAMS)
    const fac = insertsFor('factures')[0]
    expect(fac.devise).toBe('MUR')
    expect(fac.taux_change).toBe(1)
    expect(fac.montant_mur).toBe(115)
    expect(fac.lignes).toEqual([
      expect.objectContaining({
        description: 'Prestation — voir PDF original pour le détail',
        quantite: 1,
        unite: 'Forfait',
        prix_unitaire: 100,
        montant_ht: 100,
        taux_tva: 15,
      }),
    ])
  })

  it('date > 6 mois dans le passé + millésime douteux → warnings + alerte date_facture_suspecte', async () => {
    claudeReplies({
      ...FACTURE_PAYLOAD,
      extraction: { ...FACTURE_PAYLOAD.extraction, date_document: '2025-08-10' },
    })
    const res = await processDocument(PARAMS)

    expect(res.ok).toBe(true)
    const warnings = (res as any).warnings as string[]
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('Date suspecte : 2025-08-10')
    expect(warnings[1]).toContain('Millésime probablement erroné')

    const alerte = insertsFor('alertes')[0]
    expect(alerte).toMatchObject({
      societe_id: 'soc-1',
      type_alerte: 'date_facture_suspecte',
      niveau: 'important',
      statut: 'active',
      montant_mur: 5750,
    })
    expect(alerte.metadata).toMatchObject({ document_id: 'doc-1', date_extraite: '2025-08-10' })
  })
})

// ─── Post-validation client vs fournisseur ──────────────────────────────────
describe('processDocument — post-validation du sens de la facture', () => {
  it('force facture_fournisseur quand MA société est destinataire (Claude dit client)', async () => {
    claudeReplies({
      ...FACTURE_PAYLOAD,
      routing: { ...FACTURE_PAYLOAD.routing, type_document: 'facture_client' },
      extraction: {
        ...FACTURE_PAYLOAD.extraction,
        emetteur: 'Fournisseur SARL',
        destinataire: 'LEXORA LIMITED', // variantes de suffixe neutralisées
      },
    })
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'facture_fournisseur' })
    expect(insertsFor('factures')[0].type_facture).toBe('fournisseur')
  })

  it('force facture_client quand MA société est émettrice (Claude dit fournisseur)', async () => {
    claudeReplies({
      ...FACTURE_PAYLOAD,
      routing: { ...FACTURE_PAYLOAD.routing, type_document: 'facture_fournisseur' },
      extraction: {
        ...FACTURE_PAYLOAD.extraction,
        emetteur: { nom: 'Lexora Ltd' }, // objet toléré
        destinataire: 'Client Co',
      },
    })
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'facture_client' })
    const fac = insertsFor('factures')[0]
    expect(fac.type_facture).toBe('client')
    expect(fac.tiers).toBe('Client Co') // côté client, le tiers est le destinataire
  })
})

// ─── Petites pièces (tickets / reçus) ───────────────────────────────────────
describe('processDocument — tickets et reçus', () => {
  const TICKET_PAYLOAD = {
    routing: { societe: 'Winners Phoenix', type_document: 'ticket', confiance_type: 90, format_detecte: 'ticket_caisse' },
    extraction: {
      emetteur: 'Winners Phoenix',
      date_document: '2026-08-20',
      devise: 'Rs',
      montant_ht: 0,
      montant_tva: 0,
      montant_ttc: 450,
      categorie_suggeree: 'Fournitures ',
      description_libre: 'Ticket Winners courses bureau 450 MUR',
      confiance_extraction: 85,
    },
  }
  const TICKET_PARAMS = { documentId: 'doc-t', storagePath: 'soc/ticket.jpg', nomFichier: 'ticket.JPG' }

  it('catégorise en frais_employe et auto-crée la note de frais normalisée', async () => {
    claudeReplies(TICKET_PAYLOAD)
    const res = await processDocument(TICKET_PARAMS)

    expect(res).toMatchObject({
      ok: true,
      type_document: 'ticket',
      statut: 'traite',
      categorie_suggeree: 'fournitures', // lowercase + trim
    })
    expect(updatesFor('documents')[1].categorie).toBe('frais_employe')

    // L'image est passée à Claude en bloc image jpeg (extension insensible à la casse).
    const claudeReq = h.anthropicCreate.mock.calls[0][0]
    expect(claudeReq.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    })

    expect(h.autoCreateNoteDeFrais).toHaveBeenCalledTimes(1)
    expect(h.autoCreateNoteDeFrais.mock.calls[0][1]).toMatchObject({
      societe_id: 'soc-1',
      dossier_id: 'dos-1',
      user_id: 'user-1',
      vendor: 'Winners Phoenix',
      date_facture: '2026-08-20',
      montant_ttc: 450,
      devise: 'MUR', // "Rs" normalisé
      categorie: 'fournitures',
      document_id: 'doc-t',
      ocr_confidence: 0.85,
      statut: 'brouillon',
    })
    // Pas de facture ni d'écritures pour un ticket.
    expect(insertsFor('factures')).toHaveLength(0)
    expect(h.createEcrituresForFacture).not.toHaveBeenCalled()
  })

  it('confiance < 50 → en_attente_revue avec warning ; < 30 → pas de note de frais', async () => {
    claudeReplies({
      ...TICKET_PAYLOAD,
      extraction: { ...TICKET_PAYLOAD.extraction, confiance_extraction: 20 },
    })
    const res = await processDocument(TICKET_PARAMS)

    expect(res).toMatchObject({ ok: true, statut: 'en_attente_revue', confiance_extraction: 20 })
    expect(updatesFor('documents')[1].n8n_result.warning).toContain('Extraction peu fiable')
    expect(h.autoCreateNoteDeFrais).not.toHaveBeenCalled()
  })

  it('autoCreateNoteDeFrais qui throw → le pipeline reste ok', async () => {
    claudeReplies(TICKET_PAYLOAD)
    h.autoCreateNoteDeFrais.mockRejectedValue(new Error('table absente'))
    const res = await processDocument(TICKET_PARAMS)
    expect(res.ok).toBe(true)
  })
})

// ─── Relevé bancaire ────────────────────────────────────────────────────────
describe('processDocument — relevé bancaire', () => {
  it("délègue la persistance à processReleveBancaire avec l'extraction brute", async () => {
    const extraction = {
      banque: 'MCB',
      titulaire: 'Lexora Ltd',
      devise: 'MUR',
      periode_debut: '2026-07-01',
      periode_fin: '2026-07-31',
      solde_ouverture: 1000,
      solde_cloture: 2500,
      confiance_extraction: 95,
      description_libre: 'Relevé MCB juillet',
      transactions: [{ date: '2026-07-05', libelle: 'VIR CLIENT', debit: 0, credit: 1500 }],
    }
    claudeReplies({
      routing: { societe: 'Lexora Ltd', type_document: 'releve_bancaire', confiance_type: 98, format_detecte: 'scan_pdf' },
      extraction,
    })

    const res = await processDocument({ documentId: 'doc-r', storagePath: 'soc/releve.pdf', nomFichier: 'releve.pdf' })

    expect(res).toMatchObject({ ok: true, type_document: 'releve_bancaire', statut: 'traite' })
    expect(h.processReleveBancaire).toHaveBeenCalledTimes(1)
    expect(h.processReleveBancaire.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-r',
      dossierId: 'dos-1',
      societeId: 'soc-1',
      nomFichier: 'releve.pdf',
      extraction,
    })
    // Jamais de facture ni d'écritures Claude pour un relevé.
    expect(insertsFor('factures')).toHaveLength(0)
    expect(insertsFor('ecritures_comptables_v2')).toHaveLength(0)
  })

  it('processReleveBancaire qui throw → le pipeline reste ok', async () => {
    claudeReplies({
      routing: { societe: 'X', type_document: 'releve_bancaire', confiance_type: 90, format_detecte: 'scan_pdf' },
      extraction: { confiance_extraction: 90 },
    })
    h.processReleveBancaire.mockRejectedValue(new Error('IBAN invalide'))
    const res = await processDocument(PARAMS)
    expect(res.ok).toBe(true)
  })
})

// ─── Écritures issues de Claude (types non-facture) ─────────────────────────
describe('processDocument — écritures comptables Claude (charges sociales)', () => {
  it('insère les écritures valides en journal OD avec montants numériques', async () => {
    claudeReplies({
      routing: { societe: 'MRA', type_document: 'charges_sociales', confiance_type: 90, format_detecte: 'scan_pdf' },
      extraction: {
        date_document: '2026-08-01',
        numero_reference: 'CSG-07-2026',
        confiance_extraction: 90,
        description_libre: 'CSG juillet 2026',
        ecritures_comptables: [
          { compte: '4310', libelle: 'CSG à payer', debit: 0, credit: '1250.5' },
          { compte: '6450', libelle: 'Charges sociales', debit: 1250.5, credit: 0 },
          { compte: '', libelle: 'ignorée (pas de compte)', debit: 10, credit: 0 },
          { compte: '9999', libelle: 'ignorée (montants nuls)', debit: 0, credit: 0 },
        ],
      },
    })

    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'charges_sociales' })

    const entries = insertsFor('ecritures_comptables_v2')[0]
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      dossier_id: 'dos-1',
      societe_id: 'soc-1',
      date_ecriture: '2026-08-01',
      journal: 'OD', // charges_sociales hors du journalMap
      numero_piece: 'CSG-07-2026',
      numero_compte: '4310',
      libelle: 'CSG à payer',
      debit_mur: 0,
      credit_mur: 1250.5,
      piece_justificative: 'doc-1',
    })
    expect(entries[1]).toMatchObject({ numero_compte: '6450', debit_mur: 1250.5, credit_mur: 0 })
    // Pas de facture pour ce type.
    expect(insertsFor('factures')).toHaveLength(0)
  })

  it('écritures IA déséquilibrées → aucune insertion, document en attente de revue', async () => {
    claudeReplies({
      routing: { societe: 'MRA', type_document: 'charges_sociales', confiance_type: 90, format_detecte: 'scan_pdf' },
      extraction: {
        confiance_extraction: 90,
        // Σdébit = 1000, Σcrédit = 900 → déséquilibre de 100.
        ecritures_comptables: [
          { compte: '4310', libelle: 'CSG', debit: 0, credit: 900 },
          { compte: '6450', libelle: 'Charges', debit: 1000, credit: 0 },
        ],
      },
    })
    const res = await processDocument(PARAMS)
    expect(res.ok).toBe(true)
    // Garde-fou R1 : rien n'est inséré au grand livre.
    expect(insertsFor('ecritures_comptables_v2')).toHaveLength(0)
    // Le document est basculé en revue manuelle.
    const revue = updatesFor('documents').some((u) => u?.statut === 'en_attente_revue')
    expect(revue).toBe(true)
  })

  it('dossier sans societe_id → écritures non insérées (garde-fou)', async () => {
    claudeReplies({
      routing: { societe: 'MRA', type_document: 'charges_sociales', confiance_type: 90, format_detecte: 'scan_pdf' },
      extraction: {
        confiance_extraction: 90,
        ecritures_comptables: [{ compte: '4310', libelle: 'CSG', debit: 0, credit: 100 }],
      },
    })
    h.state.route = (call) => {
      if (call.table === 'dossiers') return { data: { societe_id: null }, error: null }
      return defaultRoute(call)
    }
    const res = await processDocument(PARAMS)
    expect(res.ok).toBe(true)
    expect(insertsFor('ecritures_comptables_v2')).toHaveLength(0)
  })
})

// ─── Robustesse parsing / types inconnus / erreurs ──────────────────────────
describe('processDocument — robustesse', () => {
  it('échec de téléchargement du fichier → ok:false explicite', async () => {
    h.download.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    const res = await processDocument(PARAMS)
    expect(res).toEqual({ ok: false, error: 'Download failed: Object not found' })
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('réponse Claude non-JSON → fallback type autre, confiance nulle, pas de crash', async () => {
    claudeReplies('Désolé, je ne peux pas analyser ce document.')
    const res = await processDocument(PARAMS)

    expect(res).toMatchObject({
      ok: true,
      type_document: 'autre',
      societe_detectee: 'INCONNU',
      format_detecte: 'inconnu',
      confiance_extraction: null,
      statut: 'traite',
    })
    // societe INCONNU / confiance null → champs non poussés dans documents.
    const finalUpdate = updatesFor('documents')[1]
    expect(finalUpdate.societe_detectee).toBeUndefined()
    expect(finalUpdate.confiance_type).toBeUndefined()
    expect(insertsFor('factures')).toHaveLength(0)
  })

  it('JSON entouré de markdown ```json ... ``` → parsé correctement', async () => {
    claudeReplies('```json\n' + JSON.stringify(FACTURE_PAYLOAD) + '\n```')
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'facture_fournisseur', confiance_extraction: 92 })
  })

  it('JSON noyé dans du texte → extrait via le bloc {...}', async () => {
    claudeReplies('Voici mon analyse :\n' + JSON.stringify(FACTURE_PAYLOAD) + '\nBonne journée.')
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'facture_fournisseur' })
  })

  it('type_document hors mapping → coercé en autre', async () => {
    claudeReplies({
      routing: { societe: 'X', type_document: 'devis', confiance_type: 80, format_detecte: 'scan_pdf' },
      extraction: { confiance_extraction: 80 },
    })
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, type_document: 'autre' })
  })

  it('confiance hors bornes → clampée [0..100]', async () => {
    claudeReplies({
      routing: { societe: 'X', type_document: 'contrat', confiance_type: 80, format_detecte: 'scan_pdf' },
      extraction: { confiance_extraction: 250, description_libre: 'Contrat cadre' },
    })
    const res = await processDocument(PARAMS)
    expect(res).toMatchObject({ ok: true, confiance_extraction: 100 })
  })

  it('exception Anthropic → ok:false avec le message', async () => {
    h.anthropicCreate.mockRejectedValue(new Error('overloaded_error'))
    const res = await processDocument(PARAMS)
    expect(res).toEqual({ ok: false, error: 'overloaded_error' })
    // La queue gère le retry : documents.statut n'est pas passé à erreur ici.
    expect(updatesFor('documents').some((u) => u.statut === 'erreur')).toBe(false)
  })

  it('fichier texte simple → contenu transmis à Claude en texte brut', async () => {
    h.download.mockResolvedValue({ data: makeFileData('FACTURE N°12 — Total 500 MUR'), error: null })
    claudeReplies({
      routing: { societe: 'X', type_document: 'autre', confiance_type: 50, format_detecte: 'inconnu' },
      extraction: { confiance_extraction: 50 },
    })
    await processDocument({ documentId: 'doc-txt', storagePath: 'soc/note.txt', nomFichier: 'note.txt' })
    const claudeReq = h.anthropicCreate.mock.calls[0][0]
    expect(claudeReq.messages[0].content).toContain('FACTURE N°12 — Total 500 MUR')
  })
})

// ─── Excel (parsing xlsx réel) ──────────────────────────────────────────────
describe('processDocument — fichiers Excel', () => {
  async function buildWorkbook(): Promise<ArrayBuffer> {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    // Feuille récap à pénaliser (mot-clé "recap" dans le nom, peu de contenu).
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cumul annuel', 12]]), 'Recap 2026')
    // Feuille facture riche en indices.
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['FACTURE', 'F-2026-042'],
        ['Emetteur', 'Fournisseur SARL'],
        ['Destinataire', 'Lexora Ltd'],
        ['Devise', 'EUR'],
        ['Montant Total TTC', 19349.32],
        ['TVA', 0],
      ]),
      'Facture',
    )
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }

  it('sélectionne la feuille facture (pas la feuille récap) et trace les métadonnées Excel', async () => {
    h.download.mockResolvedValue({ data: makeFileData(await buildWorkbook()), error: null })
    const res = await processDocument({ documentId: 'doc-x', storagePath: 'soc/export.xlsx', nomFichier: 'export.xlsx' })
    expect(res.ok).toBe(true)

    // Le prompt utilisateur est textuel et pointe la bonne feuille.
    const claudeReq = h.anthropicCreate.mock.calls[0][0]
    const userContent = claudeReq.messages[0].content as string
    expect(typeof userContent).toBe('string')
    expect(userContent).toContain('Feuille analysée : Facture')
    expect(userContent).toContain('2 feuilles')
    expect(userContent).toContain('Fournisseur SARL')

    const meta = updatesFor('documents')[1].n8n_result.metadata
    expect(meta.excel_sheet_count).toBe(2)
    expect(meta.excel_sheet_names).toEqual(['Recap 2026', 'Facture'])
    expect(meta.excel_chosen_sheet).toBe('Facture')
  })

  it('Excel classé autre → contenu debug embarqué dans n8n_result', async () => {
    h.download.mockResolvedValue({ data: makeFileData(await buildWorkbook()), error: null })
    claudeReplies({
      routing: { societe: 'INCONNU', type_document: 'autre', confiance_type: 10, format_detecte: 'inconnu' },
      extraction: { confiance_extraction: 60 },
    })
    await processDocument({ documentId: 'doc-x', storagePath: 'soc/export.xlsx', nomFichier: 'export.xlsx' })
    const n8n = updatesFor('documents')[1].n8n_result
    expect(n8n.debug_excel_content).toContain('Feuille analysée : Facture')
    expect(n8n.debug_claude_raw).toBeTruthy()
  })
})
