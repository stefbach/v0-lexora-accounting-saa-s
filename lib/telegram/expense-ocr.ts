/**
 * OCR léger pour notes de frais (ticket / reçu) via Anthropic Claude vision.
 *
 * Sortie structurée — STRICT JSON :
 *   { vendor, date_facture (YYYY-MM-DD), montant_ttc, devise, categorie_suggeree, confidence }
 *
 * On utilise un modèle économique (sonnet, fallback haiku) avec max_tokens bas
 * pour garder une latence < 3 s typique sur un ticket photographié.
 *
 * Conçu pour la pipeline Telegram (photo de ticket) → INSERT notes_de_frais.
 */
import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const OCR_MODEL = process.env.LEXORA_EXPENSE_OCR_MODEL || 'claude-sonnet-4-5'

export type ExpenseOcrOutput = {
  vendor: string | null
  date_facture: string | null // YYYY-MM-DD
  montant_ttc: number | null
  devise: string | null
  categorie_suggeree: string | null // repas | taxi | essence | hotel | deplacement | divers
  description: string | null
  confidence: number // 0-1
}

export type ExpenseOcrResult =
  | { ok: true; data: ExpenseOcrOutput; raw_text: string; model: string; duration_ms: number }
  | { ok: false; error: string }

const ALLOWED_CATEGORIES = ['repas', 'taxi', 'essence', 'hotel', 'deplacement', 'divers'] as const

const SYSTEM_PROMPT = `Tu es un OCR comptable spécialisé dans les tickets / reçus / factures simples (notes de frais d'employés à Maurice).
À partir d'une image de ticket, extrais STRICTEMENT un JSON suivant ce schéma (et RIEN d'autre — pas de markdown, pas de backticks) :

{
  "vendor": "<nom du commerçant tel qu'imprimé, ou null>",
  "date_facture": "<YYYY-MM-DD ou null si illisible>",
  "montant_ttc": <nombre décimal ou null>,
  "devise": "<code ISO 3 lettres MUR/USD/EUR/etc. ou null — défaut MUR à Maurice>",
  "categorie_suggeree": "<repas | taxi | essence | hotel | deplacement | divers>",
  "description": "<résumé 1 ligne, ex: 'Dîner restaurant Acme' ou null>",
  "confidence": <0.0 à 1.0 — ta confiance globale dans l'extraction>
}

Règles :
- montant_ttc = total final payé (taxes incluses), pas le sous-total.
- Devise = MUR par défaut si rien d'imprimé et que le ticket semble local Maurice (Rs, Re, Roupies).
- categorie_suggeree DOIT être une des 6 valeurs autorisées.
- Si la photo n'est pas un ticket exploitable, mets confidence < 0.3 et tous les champs à null.
- Réponds UNIQUEMENT le JSON, sans phrase d'introduction ni conclusion.`

function clampCategory(value: any): string | null {
  const s = String(value || '').toLowerCase().trim()
  return (ALLOWED_CATEGORIES as readonly string[]).includes(s) ? s : null
}

function isoDateOrNull(value: any): string | null {
  const s = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : s
}

export async function ocrExpenseTicket(args: {
  image_bytes: ArrayBuffer | Buffer
  mime_type?: string
}): Promise<ExpenseOcrResult> {
  if (!ANTHROPIC_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY manquant' }
  }

  const t0 = Date.now()
  const mime = (args.mime_type || 'image/jpeg').toLowerCase()
  // Anthropic vision accepte image/jpeg | image/png | image/gif | image/webp
  const supportedMime =
    mime.includes('png') ? 'image/png'
    : mime.includes('webp') ? 'image/webp'
    : mime.includes('gif') ? 'image/gif'
    : 'image/jpeg'

  const buf = args.image_bytes instanceof Buffer
    ? args.image_bytes
    : Buffer.from(args.image_bytes as ArrayBuffer)
  const base64 = buf.toString('base64')

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

  let response
  try {
    response = await client.messages.create({
      model: OCR_MODEL,
      max_tokens: 600,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: supportedMime as any, data: base64 },
            },
            { type: 'text', text: 'Extrait le JSON conforme au schéma.' },
          ],
        },
      ],
    })
  } catch (e: any) {
    return { ok: false, error: `Anthropic vision call failed: ${e?.message || String(e)}` }
  }

  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()

  let parsed: any = null
  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    return {
      ok: false,
      error: 'OCR ticket : JSON invalide retourné par le modèle',
    }
  }

  const data: ExpenseOcrOutput = {
    vendor: parsed?.vendor ? String(parsed.vendor).slice(0, 200) : null,
    date_facture: isoDateOrNull(parsed?.date_facture),
    montant_ttc:
      typeof parsed?.montant_ttc === 'number' && isFinite(parsed.montant_ttc) && parsed.montant_ttc >= 0
        ? Math.round(parsed.montant_ttc * 100) / 100
        : null,
    devise: parsed?.devise ? String(parsed.devise).toUpperCase().slice(0, 5) : null,
    categorie_suggeree: clampCategory(parsed?.categorie_suggeree),
    description: parsed?.description ? String(parsed.description).slice(0, 240) : null,
    confidence:
      typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
  }

  return {
    ok: true,
    data,
    raw_text: raw,
    model: OCR_MODEL,
    duration_ms: Date.now() - t0,
  }
}

/**
 * Détecte si une caption Telegram (texte joint à la photo) suggère
 * une note de frais. Match insensible à la casse.
 */
const EXPENSE_CAPTION_RE = /^(frais|note|notedefrais|note_de_frais|repas|taxi|essence|hotel|hôtel|deplacement|déplacement|expense)/i
export function captionLooksLikeExpense(caption: string | null | undefined): boolean {
  if (!caption) return false
  return EXPENSE_CAPTION_RE.test(caption.trim())
}
