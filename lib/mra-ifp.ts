/**
 * MRA Invoice Fiscalization Platform (IFP) Integration
 *
 * Handles communication with the Mauritius Revenue Authority e-invoicing
 * system (Electronic Billing System EBS).
 *
 * Mode mock vs réel : contrôlé par la variable d'env MRA_USE_MOCK.
 * Par défaut TRUE (sécurité — éviter d'envoyer des données réelles au MRA
 * tant que les certificats n'ont pas été validés en sandbox).
 * Mettre MRA_USE_MOCK=false en prod pour activer les vrais appels.
 *
 * Audit : tous les appels passent par fiscaliseInvoiceWithAudit() qui
 * insère systématiquement une ligne dans mra_fiscalisation_logs
 * (mig 248) — conformité légale 7 ans.
 *
 * QR code : généré via lib `qrcode` (vrais codes scannables). L'ancien
 * generateQRCode() qui produisait un pattern SVG aléatoire est conservé
 * uniquement pour rétrocompat — utiliser generateQRCodeDataURL().
 */

import QRCode from 'qrcode'

// Mode mock par défaut activé côté serveur. Pour passer en réel sur
// production : MRA_USE_MOCK=false dans Vercel + clé API MRA active.
const USE_MOCK = process.env.MRA_USE_MOCK !== 'false'

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

// ── Real API Implementation ──
// Retry exponentiel : 1s, 2s, 4s. Timeout 15s par tentative. Conforme
// recommandations MRA EBS pour résilience réseau.

const REAL_MAX_ATTEMPTS = 3
const REAL_TIMEOUT_MS = 15000

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function realFiscalise(config: MRAConfig, invoice: MRAInvoice): Promise<MRAFiscalisationResponse & { httpStatus?: number; durationMs: number; rawResponse?: unknown }> {
  const start = Date.now()
  let lastError: { code: string; message: string; status?: number } | null = null
  for (let attempt = 1; attempt <= REAL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${config.api_url}/invoices/fiscalise`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.api_key}`,
            'X-EBS-ID': config.ebs_id,
            'X-Idempotency-Key': `${invoice.ebsId}-${invoice.invoiceNumber}`,
          },
          body: JSON.stringify(invoice),
        },
        REAL_TIMEOUT_MS,
      )
      const httpStatus = response.status

      // 5xx / 429 = retriable. 4xx hors 429 = abandon (erreur métier client).
      if (response.status >= 500 || response.status === 429) {
        const errBody = await response.json().catch(() => ({}))
        lastError = { code: `HTTP_${response.status}`, message: errBody.message || `Retry-able server error`, status: response.status }
        if (attempt < REAL_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
          continue
        }
        return { success: false, errorCode: lastError.code, errorMessage: lastError.message, httpStatus, durationMs: Date.now() - start, rawResponse: errBody }
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        return {
          success: false,
          errorCode: `HTTP_${response.status}`,
          errorMessage: errBody.message || `MRA API returned status ${response.status}`,
          httpStatus,
          durationMs: Date.now() - start,
          rawResponse: errBody,
        }
      }

      const data = await response.json()
      return {
        success: true,
        irn: data.irn || data.invoiceReferenceNumber,
        qrCodeData: data.qrCodeData || data.qrCode,
        fiscalisationDate: data.fiscalisationDate || new Date().toISOString(),
        httpStatus,
        durationMs: Date.now() - start,
        rawResponse: data,
      }
    } catch (error) {
      // Network/abort → retriable
      lastError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Erreur de connexion au serveur MRA',
      }
      if (attempt < REAL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
        continue
      }
    }
  }
  return {
    success: false,
    errorCode: lastError?.code || 'UNKNOWN',
    errorMessage: lastError?.message || `Échec après ${REAL_MAX_ATTEMPTS} tentatives`,
    durationMs: Date.now() - start,
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
 * Generate a REAL QR code (PNG data URL) — utilise la lib `qrcode`.
 * Le code est SCANNABLE par n'importe quel lecteur QR mobile, conforme
 * à la spec MRA EBS (qui demande de pouvoir vérifier la facture via
 * scan du QR vers efiling.mra.mu).
 *
 * Niveau M (medium) suffit pour les URLs MRA — pas besoin du high-error
 * correction. Format PNG 200x200 lisible imprimé sur A4.
 */
export async function generateQRCodeDataURL(data: string, size = 200): Promise<string> {
  if (!data) return ''
  try {
    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'M',
      width: size,
      margin: 2,
      color: { dark: '#0B0F2E', light: '#FFFFFF' },
    })
  } catch (e) {
    console.warn('[mra-ifp] QR generation failed:', e)
    return ''
  }
}

/**
 * @deprecated Utiliser generateQRCodeDataURL() (async, vraie lib qrcode).
 * Gardé pour rétrocompat : produit un faux pattern SVG non scannable.
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
      let filled: boolean

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

// ──────────────────────────────────────────────────────────────────────
// Wrapper avec audit (mig 248)
// ──────────────────────────────────────────────────────────────────────

type SupabaseClient = any

export interface FiscaliseWithAuditResult extends MRAFiscalisationResponse {
  /** ID de la ligne mra_fiscalisation_logs créée. */
  log_id?: string
  /** PNG data URL du QR code prêt à l'affichage (PDF/UI). */
  qr_code_image?: string
}

/**
 * Wrapper de fiscaliseInvoice qui :
 *   1. Appelle l'API MRA (mock ou réel selon MRA_USE_MOCK)
 *   2. Génère le QR code PNG (lib qrcode)
 *   3. Persiste un audit log dans mra_fiscalisation_logs
 *   4. Met à jour factures (irn, qr_code_data, mra_status, fiscalisation_date)
 *
 * À utiliser depuis les routes API et les jobs — pas à appeler directement
 * fiscaliseInvoice() qui ne loggue rien.
 */
export async function fiscaliseInvoiceWithAudit(
  supabase: SupabaseClient,
  args: {
    facture_id: string
    societe_id: string
    config: MRAConfig
    invoice: MRAInvoice
    source?: 'manuel' | 'cron' | 'retry' | 'api'
    created_by?: string | null
  },
): Promise<FiscaliseWithAuditResult> {
  const t0 = Date.now()
  const { facture_id, societe_id, config, invoice, source = 'manuel', created_by = null } = args

  // 1. Appel MRA (mock ou réel)
  const res = await fiscaliseInvoice(config, invoice)
  const durationMs = Date.now() - t0

  // 2. Génération QR code PNG si succès (URL renvoyée par MRA)
  let qr_code_image: string | undefined
  if (res.success && res.qrCodeData) {
    qr_code_image = await generateQRCodeDataURL(res.qrCodeData)
  }

  // 3. Audit log — try/catch pour ne JAMAIS faire échouer la
  //    fiscalisation à cause d'une écriture log qui plante.
  let log_id: string | undefined
  try {
    const { data: logRow } = await supabase
      .from('mra_fiscalisation_logs')
      .insert({
        facture_id,
        societe_id,
        action: 'fiscalise',
        environment: config.environment,
        success: res.success,
        irn: res.irn || null,
        qr_code_url: res.qrCodeData || null,
        http_status: (res as any).httpStatus || null,
        duration_ms: durationMs,
        error_code: res.errorCode || null,
        error_message: res.errorMessage || null,
        request_payload: invoice as unknown as object,
        response_payload: (res as any).rawResponse || res,
        source,
        created_by,
      })
      .select('id')
      .single()
    log_id = logRow?.id
  } catch (e) {
    console.warn('[mra-ifp] audit log insert failed:', e)
  }

  // 4. Mise à jour facture (si succès)
  if (res.success) {
    try {
      await supabase
        .from('factures')
        .update({
          irn: res.irn,
          qr_code_data: res.qrCodeData,
          fiscalisation_date: res.fiscalisationDate,
          mra_status: 'fiscalise',
        })
        .eq('id', facture_id)
    } catch (e) {
      console.warn('[mra-ifp] facture update failed:', e)
    }
  } else {
    // On marque la facture en erreur pour permettre un retry visible côté UI.
    try {
      await supabase
        .from('factures')
        .update({ mra_status: 'erreur' })
        .eq('id', facture_id)
    } catch { /* ignore */ }
  }

  return { ...res, log_id, qr_code_image }
}
