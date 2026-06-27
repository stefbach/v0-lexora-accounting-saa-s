/**
 * Mistral OCR — moteur d'OCR documents (PDF / image → markdown structuré).
 *
 * Architecture retenue (cf. session juin 2026) : « OCR Mistral → extraction Claude ».
 * Mistral fait l'OCR brut (rapide, bon marché, robuste sur les PDF scannés et les
 * tableaux denses), puis Claude structure le markdown en JSON métier via les prompts
 * existants (relevés bancaires, notes de frais, documents génériques).
 *
 * Activation : variable d'environnement `MISTRAL_API_KEY` (Vercel). En son absence,
 * `mistralOcrAvailable()` renvoie false et tous les appelants retombent sur leur
 * chemin vision Claude historique — aucun changement de comportement.
 *
 * API : POST https://api.mistral.ai/v1/ocr  (modèle `mistral-ocr-latest`).
 * Docs : https://docs.mistral.ai/capabilities/document/
 */

const MISTRAL_OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr'
const DEFAULT_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest'
// L'OCR d'un PDF multi-pages peut être long : timeout généreux mais borné.
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MISTRAL_OCR_TIMEOUT_MS || '', 10) || 60_000

export type MistralOcrPage = {
  index: number
  markdown: string
}

export type MistralOcrResult =
  | { ok: true; markdown: string; pages: MistralOcrPage[]; pagesProcessed: number; model: string; duration_ms: number }
  | { ok: false; error: string }

/** True si la clé Mistral est configurée (sinon les appelants gardent Claude vision). */
export function mistralOcrAvailable(): boolean {
  return !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.trim())
}

/**
 * Normalise un type MIME en l'une des familles supportées et indique s'il s'agit
 * d'un PDF (envoyé en `document_url`) ou d'une image (envoyée en `image_url`).
 */
export function classifyOcrMime(mime: string | undefined | null): { kind: 'pdf' | 'image'; mime: string } {
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf')) return { kind: 'pdf', mime: 'application/pdf' }
  if (m.includes('png')) return { kind: 'image', mime: 'image/png' }
  if (m.includes('webp')) return { kind: 'image', mime: 'image/webp' }
  if (m.includes('gif')) return { kind: 'image', mime: 'image/gif' }
  if (m.includes('tif')) return { kind: 'image', mime: 'image/tiff' }
  return { kind: 'image', mime: 'image/jpeg' }
}

/** Construit la data-URI base64 attendue par l'API Mistral OCR. */
export function buildDataUri(base64: string, mime: string): string {
  return `data:${mime};base64,${base64}`
}

/** Concatène le markdown de toutes les pages dans l'ordre. */
export function joinPagesMarkdown(pages: MistralOcrPage[]): string {
  return pages
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((p) => p.markdown || '')
    .join('\n\n')
    .trim()
}

function toBase64(bytes: ArrayBuffer | Buffer | Uint8Array): string {
  if (Buffer.isBuffer(bytes)) return bytes.toString('base64')
  return Buffer.from(bytes as ArrayBuffer).toString('base64')
}

/**
 * OCR d'un document (PDF ou image) vers du markdown via Mistral.
 * Ne jette jamais : renvoie `{ ok: false, error }` en cas d'échec pour permettre
 * un fallback propre vers le chemin vision Claude.
 */
export async function ocrToMarkdown(args: {
  data: ArrayBuffer | Buffer | Uint8Array | string // base64 string accepté directement
  mimeType?: string
  model?: string
  timeoutMs?: number
}): Promise<MistralOcrResult> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'MISTRAL_API_KEY manquant' }

  const base64 = typeof args.data === 'string' ? args.data : toBase64(args.data)
  if (!base64 || base64.length < 16) return { ok: false, error: 'Document vide ou illisible' }

  const { kind, mime } = classifyOcrMime(args.mimeType)
  const dataUri = buildDataUri(base64, mime)
  const document = kind === 'pdf'
    ? { type: 'document_url', document_url: dataUri }
    : { type: 'image_url', image_url: dataUri }

  const model = args.model || DEFAULT_MODEL
  const timeoutMs = args.timeoutMs || DEFAULT_TIMEOUT_MS
  const t0 = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(MISTRAL_OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ model, document, include_image_base64: false }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `Mistral OCR HTTP ${res.status}: ${detail.slice(0, 300)}` }
    }

    const json: any = await res.json()
    const rawPages: any[] = Array.isArray(json?.pages) ? json.pages : []
    const pages: MistralOcrPage[] = rawPages.map((p, i) => ({
      index: typeof p?.index === 'number' ? p.index : i,
      markdown: typeof p?.markdown === 'string' ? p.markdown : '',
    }))
    const markdown = joinPagesMarkdown(pages)
    if (!markdown || markdown.length < 1) {
      return { ok: false, error: 'Mistral OCR : aucun texte extrait' }
    }
    return {
      ok: true,
      markdown,
      pages,
      pagesProcessed: Number(json?.usage_info?.pages_processed) || pages.length,
      model: String(json?.model || model),
      duration_ms: Date.now() - t0,
    }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `timeout après ${timeoutMs}ms` : (e?.message || String(e))
    return { ok: false, error: `Mistral OCR échec: ${msg}` }
  } finally {
    clearTimeout(timer)
  }
}
