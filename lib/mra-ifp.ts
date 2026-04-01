/**
 * MRA Invoice Fiscalization Platform (IFP) Integration
 *
 * Handles communication with the Mauritius Revenue Authority e-invoicing system.
 * Currently operates in MOCK mode for development/testing. Set USE_MOCK = false
 * and configure real MRA EBS credentials for production fiscalisation.
 */

// Toggle this to switch between mock and real MRA API
const USE_MOCK = true

// ── Types ──

export interface MRAConfig {
  api_url: string
  api_key: string
  ebs_id: string
  environment: 'sandbox' | 'production'
}

export interface MRAInvoice {
  ebsId: string
  invoiceTypeCode: string // '01' = invoice, '02' = credit note, '03' = debit note
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  currencyCode: string // MUR, EUR, USD
  exchangeRate?: number
  seller: {
    brn: string
    vatNumber: string
    name: string
    address: string
    premisesId?: string
  }
  buyer: {
    name: string
    address?: string
    vatNumber?: string
    nic?: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    vatRate: number
    vatCategory: string // 'S' standard, 'Z' zero-rated, 'E' exempt
    lineTotal: number
    vatAmount: number
  }>
  totals: {
    subtotalHT: number
    totalVAT: number
    totalTTC: number
    discount?: number
  }
}

export interface MRAFiscalisationResponse {
  success: boolean
  irn?: string
  qrCodeData?: string
  fiscalisationDate?: string
  errorCode?: string
  errorMessage?: string
}

// ── Constants ──

const MRA_SANDBOX_URL = 'https://sandboxifp.mra.mu/api/v1'
const MRA_PRODUCTION_URL = 'https://ifp.mra.mu/api/v1'

const INVOICE_TYPE_CODES: Record<string, string> = {
  facture: '01',
  avoir: '02',
  note_debit: '03',
}

// ── Mock Implementation ──

function generateMockIRN(): string {
  const year = new Date().getFullYear()
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let random = ''
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `MRA-${year}-${random}`
}

function generateMockQRData(irn: string, invoice: MRAInvoice): string {
  const params = new URLSearchParams({
    irn,
    inv: invoice.invoiceNumber,
    date: invoice.issueDate,
    seller: invoice.seller.brn,
    total: invoice.totals.totalTTC.toFixed(2),
    cur: invoice.currencyCode,
    vat: invoice.totals.totalVAT.toFixed(2),
  })
  return `https://efiling.mra.mu/verify?${params.toString()}`
}

async function mockFiscalise(invoice: MRAInvoice): Promise<MRAFiscalisationResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500))

  // Simulate validation errors
  if (!invoice.seller.brn || !invoice.seller.vatNumber) {
    return {
      success: false,
      errorCode: 'SELLER_INFO_MISSING',
      errorMessage: 'Le BRN et le numero TVA du vendeur sont obligatoires.',
    }
  }

  if (!invoice.lineItems || invoice.lineItems.length === 0) {
    return {
      success: false,
      errorCode: 'NO_LINE_ITEMS',
      errorMessage: 'La facture doit contenir au moins une ligne.',
    }
  }

  const irn = generateMockIRN()
  const qrCodeData = generateMockQRData(irn, invoice)

  return {
    success: true,
    irn,
    qrCodeData,
    fiscalisationDate: new Date().toISOString(),
  }
}

// ── Real API Implementation (placeholder) ──

async function realFiscalise(config: MRAConfig, invoice: MRAInvoice): Promise<MRAFiscalisationResponse> {
  try {
    const response = await fetch(`${config.api_url}/invoices/fiscalise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
        'X-EBS-ID': config.ebs_id,
      },
      body: JSON.stringify(invoice),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        errorCode: `HTTP_${response.status}`,
        errorMessage: errorData.message || `MRA API returned status ${response.status}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      irn: data.irn || data.invoiceReferenceNumber,
      qrCodeData: data.qrCodeData || data.qrCode,
      fiscalisationDate: data.fiscalisationDate || new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Erreur de connexion au serveur MRA',
    }
  }
}

// ── Public API ──

/**
 * Send an invoice to MRA IFP for fiscalisation.
 * Returns the IRN (Invoice Reference Number) and QR code data on success.
 */
export async function fiscaliseInvoice(
  config: MRAConfig,
  invoice: MRAInvoice
): Promise<MRAFiscalisationResponse> {
  if (USE_MOCK) {
    return mockFiscalise(invoice)
  }
  return realFiscalise(config, invoice)
}

/**
 * Convert a Lexora facture record + societe settings to MRA invoice format.
 */
export function convertFactureToMRA(
  facture: {
    id: string
    numero_facture: string
    date_facture: string
    devise: string
    taux_change?: number
    montant_ht: number
    montant_tva: number
    montant_ttc: number
    tiers: string
    client_offshore?: boolean
    lignes?: Array<{
      description: string
      quantite: number
      prix_unitaire: number
      taux_tva: number
      montant_ht?: number
    }>
    remise_montant?: number
    type_document?: string
    client_adresse?: string
    client_vat_number?: string
    client_nic?: string
  },
  societe: {
    nom: string
    brn: string
    vat_number: string
    adresse: string
    mra_ebs_id?: string
    mra_premises_id?: string
  }
): MRAInvoice {
  const typeCode = INVOICE_TYPE_CODES[facture.type_document || 'facture'] || '01'

  const lineItems = (facture.lignes || []).map(l => {
    const lineTotal = (l.quantite || 1) * (l.prix_unitaire || 0)
    const vatRate = l.taux_tva || 0
    const vatAmount = lineTotal * vatRate / 100
    let vatCategory = 'S'
    if (vatRate === 0) {
      vatCategory = facture.client_offshore ? 'Z' : 'E'
    }

    return {
      description: l.description || '',
      quantity: l.quantite || 1,
      unitPrice: l.prix_unitaire || 0,
      vatRate,
      vatCategory,
      lineTotal,
      vatAmount,
    }
  })

  return {
    ebsId: societe.mra_ebs_id || '',
    invoiceTypeCode: typeCode,
    invoiceNumber: facture.numero_facture || '',
    issueDate: facture.date_facture || new Date().toISOString().split('T')[0],
    currencyCode: facture.devise || 'MUR',
    exchangeRate: facture.devise !== 'MUR' ? (facture.taux_change || 1) : undefined,
    seller: {
      brn: societe.brn || '',
      vatNumber: societe.vat_number || '',
      name: societe.nom || '',
      address: societe.adresse || '',
      premisesId: societe.mra_premises_id,
    },
    buyer: {
      name: facture.tiers || '',
      address: facture.client_adresse,
      vatNumber: facture.client_vat_number,
      nic: facture.client_nic,
    },
    lineItems,
    totals: {
      subtotalHT: facture.montant_ht || 0,
      totalVAT: facture.montant_tva || 0,
      totalTTC: facture.montant_ttc || 0,
      discount: facture.remise_montant || 0,
    },
  }
}

/**
 * Generate a simple QR code as an SVG data URL.
 * Uses a placeholder visual representation with encoded data.
 * In production, replace with a proper QR code library.
 */
export function generateQRCode(data: string): string {
  // Generate a deterministic pattern from the data string
  const hash = Array.from(data).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  const size = 21 // QR code v1 is 21x21
  const cellSize = 5
  const totalSize = size * cellSize
  const padding = 10
  const svgSize = totalSize + padding * 2

  let cells = ''

  // Fixed finder patterns (top-left, top-right, bottom-left)
  const finderPositions = [
    [0, 0], [size - 7, 0], [0, size - 7],
  ]

  const isFinderCell = (x: number, y: number): boolean => {
    for (const [fx, fy] of finderPositions) {
      const dx = x - fx
      const dy = y - fy
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        // Outer border
        if (dx === 0 || dx === 6 || dy === 0 || dy === 6) return true
        // Inner square
        if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) return true
        return false
      }
    }
    return false
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let filled = false

      if (isFinderCell(x, y)) {
        filled = true
      } else {
        // Deterministic pseudo-random fill based on position and data hash
        const seed = (hash + x * 31 + y * 37) & 0xFFFFFFFF
        filled = (seed % 3) !== 0
      }

      if (filled) {
        cells += `<rect x="${padding + x * cellSize}" y="${padding + y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#1E2A4A"/>`
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">
    <rect width="${svgSize}" height="${svgSize}" fill="white"/>
    ${cells}
  </svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/**
 * Build MRA configuration from societe settings.
 */
export function getMRAConfig(societe: {
  mra_ebs_id?: string
  mra_api_key?: string
  mra_environment?: string
  mra_fiscalisation_active?: boolean
}): MRAConfig | null {
  if (!societe.mra_fiscalisation_active) return null
  if (!societe.mra_ebs_id || !societe.mra_api_key) return null

  const env = (societe.mra_environment === 'production') ? 'production' : 'sandbox'

  return {
    api_url: env === 'production' ? MRA_PRODUCTION_URL : MRA_SANDBOX_URL,
    api_key: societe.mra_api_key,
    ebs_id: societe.mra_ebs_id,
    environment: env,
  }
}

/**
 * Test connection to MRA IFP.
 * Returns true if the connection is successful.
 */
export async function testMRAConnection(config: MRAConfig): Promise<{ success: boolean; message: string }> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800))
    return { success: true, message: 'Connexion au serveur MRA (sandbox) reussie.' }
  }

  try {
    const response = await fetch(`${config.api_url}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'X-EBS-ID': config.ebs_id,
      },
    })

    if (response.ok) {
      return { success: true, message: 'Connexion au serveur MRA reussie.' }
    }

    return { success: false, message: `Erreur MRA: HTTP ${response.status}` }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur de connexion',
    }
  }
}
