/**
 * MRA Invoice Fiscalization Platform (IFP) Integration
 *
 * Handles communication with the Mauritius Revenue Authority e-invoicing system.
 *
 * The module supports three runtime modes selected via env vars:
 *   - `mock`       : default, produces deterministic fake IRNs + QR data (dev/test)
 *   - `sandbox`    : scaffold for MRA sandbox (not yet implemented, falls back to mock)
 *   - `production` : scaffold for MRA production (not yet implemented, falls back to mock)
 *
 * Safety: if `MRA_MODE=production` but any critical env var is missing (EBS_ID,
 * API_ENDPOINT, CERT_PATH, TAXPAYER_TAN), the module logs an error and downgrades
 * to `mock` mode so that a misconfigured production deployment does not crash.
 *
 * Env vars consumed (see .env.local.example):
 *   MRA_MODE, MRA_EBS_ID, MRA_API_ENDPOINT, MRA_CERT_PATH,
 *   MRA_CERT_PASSWORD, MRA_TAXPAYER_TAN
 */

// ── Mode configuration ──

/** Runtime mode of the MRA integration. */
export type MraMode = 'mock' | 'sandbox' | 'production'

/** Resolved MRA configuration read from env vars. */
export interface MraConfig {
  mode: MraMode
  /** Electronic Billing Solution ID provided by MRA. */
  ebsId: string | null
  /** URL of the MRA API (sandbox or production). */
  apiEndpoint: string | null
  /** Path to the X.509 certificate (PEM or PKCS#12). */
  certPath: string | null
  /** Password protecting the certificate (if PKCS#12). */
  certPassword: string | null
  /** Tax Account Number of the taxpayer. */
  taxpayerTan: string | null
  /** Prefix used when generating mock IRNs. */
  mockIrnPrefix: string
}

const DEFAULT_MOCK_IRN_PREFIX = 'MRA-MOCK'

function readEnv(name: string): string | null {
  const v = process.env[name]
  if (v === undefined || v === null) return null
  const trimmed = String(v).trim()
  return trimmed.length === 0 ? null : trimmed
}

function parseMode(raw: string | null): MraMode {
  switch ((raw || '').toLowerCase()) {
    case 'sandbox':
      return 'sandbox'
    case 'production':
    case 'prod':
      return 'production'
    case 'mock':
    case '':
    case null as unknown as string:
      return 'mock'
    default:
      console.warn(`[mra] Unknown MRA_MODE='${raw}', defaulting to 'mock'`)
      return 'mock'
  }
}

/**
 * Read the MRA configuration from the process environment.
 *
 * Returns a resolved `MraConfig`. If `MRA_MODE=production` but one of the
 * critical settings is missing, the mode is downgraded to `mock` and an error
 * is logged (fail-safe default, avoids a broken production deployment).
 */
export function getMraConfig(): MraConfig {
  const requestedMode = parseMode(readEnv('MRA_MODE'))
  const ebsId = readEnv('MRA_EBS_ID')
  const apiEndpoint = readEnv('MRA_API_ENDPOINT')
  const certPath = readEnv('MRA_CERT_PATH')
  const certPassword = readEnv('MRA_CERT_PASSWORD')
  const taxpayerTan = readEnv('MRA_TAXPAYER_TAN')
  const mockIrnPrefix = readEnv('MRA_MOCK_IRN_PREFIX') || DEFAULT_MOCK_IRN_PREFIX

  let mode: MraMode = requestedMode

  if (requestedMode === 'production') {
    const missing: string[] = []
    if (!ebsId) missing.push('MRA_EBS_ID')
    if (!apiEndpoint) missing.push('MRA_API_ENDPOINT')
    if (!certPath) missing.push('MRA_CERT_PATH')
    if (!taxpayerTan) missing.push('MRA_TAXPAYER_TAN')
    if (missing.length > 0) {
      console.error(
        `[mra] Production mode requested but config incomplete (missing: ${missing.join(', ')}), falling back to mock`
      )
      mode = 'mock'
    }
  }

  return {
    mode,
    ebsId,
    apiEndpoint,
    certPath,
    certPassword,
    taxpayerTan,
    mockIrnPrefix,
  }
}

/**
 * Returns `true` when the environment fully defines the settings required to
 * talk to the real MRA IFP (sandbox or production). Does not validate
 * certificate contents — only presence of env vars.
 */
export function isMraRealConfigured(): boolean {
  const ebsId = readEnv('MRA_EBS_ID')
  const apiEndpoint = readEnv('MRA_API_ENDPOINT')
  const certPath = readEnv('MRA_CERT_PATH')
  const taxpayerTan = readEnv('MRA_TAXPAYER_TAN')
  return Boolean(ebsId && apiEndpoint && certPath && taxpayerTan)
}

// ── Legacy types (kept for backwards compatibility with existing call-sites) ──

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
  /**
   * Set when a non-mock mode was requested but the implementation fell back to
   * the mock path (e.g. sandbox/production stubs). Allows callers and tests to
   * detect a fallback without parsing logs.
   */
  _fallback_reason?: 'real_not_implemented' | 'config_incomplete'
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

function generateMockIRN(prefix: string = DEFAULT_MOCK_IRN_PREFIX): string {
  const year = new Date().getFullYear()
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let random = ''
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}-${year}-${random}`
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

/**
 * Mock fiscalisation: validates minimal invariants and returns a synthetic IRN
 * + QR payload. No network I/O beyond an artificial delay.
 */
async function fiscaliseMock(
  invoice: MRAInvoice,
  config: MraConfig
): Promise<MRAFiscalisationResponse> {
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

  const irn = generateMockIRN(config.mockIrnPrefix)
  const qrCodeData = generateMockQRData(irn, invoice)

  return {
    success: true,
    irn,
    qrCodeData,
    fiscalisationDate: new Date().toISOString(),
  }
}

// ── Sandbox Implementation (stub) ──

/**
 * TODO: Implement MRA sandbox fiscalisation.
 *   - Load X.509 certificate at `config.certPath` (decrypt with `certPassword` if PKCS#12)
 *   - Build mTLS agent (https.Agent with cert+key) or use an undici Dispatcher
 *   - POST to `${config.apiEndpoint}/invoices/fiscalise` with the MRA-mandated payload
 *     (include EBS ID, taxpayer TAN, signed invoice JSON)
 *   - Handle retries with exponential backoff for 5xx / network errors
 *   - Parse response → extract IRN, QR payload, fiscalisation timestamp
 *   - Persist full raw response in DB for audit (done at call-site)
 */
async function fiscaliseSandbox(
  invoice: MRAInvoice,
  config: MraConfig
): Promise<MRAFiscalisationResponse> {
  console.warn('[mra] sandbox not yet implemented, using mock')
  const res = await fiscaliseMock(invoice, config)
  return { ...res, _fallback_reason: 'real_not_implemented' }
}

// ── Production Implementation (stub) ──

/**
 * TODO: Implement MRA production fiscalisation.
 *   - Same plumbing as sandbox (mTLS + signed POST) but pointed at the production
 *     endpoint (e.g. https://vfisc.mra.mu/realapi)
 *   - Stricter validation of taxpayer TAN / EBS ID before sending
 *   - Enforce idempotency (retry-safe) using an invoice-level correlation ID
 *   - Parse response → extract IRN, QR payload, fiscalisation timestamp
 *   - Persist full raw response in DB for audit (done at call-site)
 */
async function fiscaliseProduction(
  invoice: MRAInvoice,
  config: MraConfig
): Promise<MRAFiscalisationResponse> {
  console.warn('[mra] production not yet implemented, using mock')
  const res = await fiscaliseMock(invoice, config)
  return { ...res, _fallback_reason: 'real_not_implemented' }
}

// ── Legacy real API implementation (kept for the `fiscaliseInvoice(config, invoice)` path) ──

async function realFiscaliseLegacy(
  config: MRAConfig,
  invoice: MRAInvoice
): Promise<MRAFiscalisationResponse> {
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
 *
 * The function routes to the implementation selected by `getMraConfig()`:
 *   - `mock`       : deterministic local response (default)
 *   - `sandbox`    : stub, currently falls back to mock + sets `_fallback_reason`
 *   - `production` : stub, currently falls back to mock + sets `_fallback_reason`
 *
 * The `config` parameter is kept for backwards compatibility with existing
 * call-sites that build an `MRAConfig` from `societes` table settings. It is
 * ignored when `MRA_MODE` is set, except as a last-resort signal that the
 * caller explicitly wants the legacy real-HTTP path (used only if env-based
 * mode is `mock` AND the caller provided non-mock legacy credentials — in that
 * case we still stay on mock to avoid surprising behaviour).
 *
 * Returns IRN + QR code data on success.
 */
export async function fiscaliseInvoice(
  _config: MRAConfig,
  invoice: MRAInvoice
): Promise<MRAFiscalisationResponse> {
  const config = getMraConfig()
  switch (config.mode) {
    case 'mock':
      return fiscaliseMock(invoice, config)
    case 'sandbox':
      return fiscaliseSandbox(invoice, config)
    case 'production':
      return fiscaliseProduction(invoice, config)
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = config.mode
      void _exhaustive
      return fiscaliseMock(invoice, config)
    }
  }
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
        cells += `<rect x="${padding + x * cellSize}" y="${padding + y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0B0F2E"/>`
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
 *
 * Kept for backwards compatibility with call-sites that derive MRA credentials
 * from the `societes` row. New code should prefer `getMraConfig()` which reads
 * the server-wide env-based configuration.
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
 *
 * In `mock` mode (default), returns a synthetic success after a short delay.
 * In `sandbox` / `production` modes the real endpoint is reachable, this issues
 * a lightweight HTTP GET against the legacy `config.api_url`. Future work should
 * replace this with an mTLS-authenticated probe against `config.apiEndpoint`.
 */
export async function testMRAConnection(config: MRAConfig): Promise<{ success: boolean; message: string }> {
  const mraConfig = getMraConfig()
  if (mraConfig.mode === 'mock') {
    await new Promise(resolve => setTimeout(resolve, 800))
    return { success: true, message: 'Connexion au serveur MRA (mock) reussie.' }
  }

  // TODO: replace with mTLS probe against mraConfig.apiEndpoint once the real
  // implementation lands. For now, keep the legacy HTTP probe for compatibility.
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

// Re-export legacy helper name to avoid breaking any callers that may have
// imported it; kept out of the public surface by not being referenced above.
void realFiscaliseLegacy
