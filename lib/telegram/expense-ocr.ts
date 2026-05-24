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
const OCR_MODEL = process.env.LEXORA_EXPENSE_OCR_MODEL || 'claude-haiku-4-5-20251001'

export type ExpenseOcrOutput = {
  vendor: string | null
  vendor_normalized?: string | null
  date_facture: string | null // YYYY-MM-DD
  montant_ttc: number | null
  montant_ht?: number | null
  montant_tva?: number | null
  taux_tva?: number | null
  devise: string | null
  categorie_suggeree: string | null // une des 12 valeurs ALLOWED_CATEGORIES
  description: string | null
  vat_number_vendor?: string | null
  brn_vendor?: string | null
  confidence: number // 0-1
}

export type ExpenseOcrResult =
  | { ok: true; data: ExpenseOcrOutput; raw_text: string; model: string; duration_ms: number }
  | { ok: false; error: string }

const ALLOWED_CATEGORIES = [
  'repas',          // restaurant, déjeuner client, dîner d'affaires
  'taxi',           // taxi, VTC, navette
  'essence',        // carburant véhicule
  'hotel',          // hébergement professionnel
  'deplacement',    // train, avion, billet, péage
  'telecom',        // recharge mobile, dongle, données
  'fournitures',    // papeterie, stylos, post-it, cartouches
  'formation',      // séminaire, livre pro, certification
  'parking',        // parking horodateur
  'pharmacie',      // pharmacie professionnelle (clinique)
  'communication',  // photocopie, impression, courrier
  'divers',         // catch-all si rien d'autre
] as const

const SYSTEM_PROMPT = `Tu es un OCR comptable expert mauricien spécialisé dans les tickets / reçus / factures simples (notes de frais d'employés à Maurice).

À partir d'une image de ticket, extrais STRICTEMENT un JSON suivant ce schéma (et RIEN d'autre — pas de markdown, pas de backticks) :

{
  "vendor": "<nom du commerçant tel qu'imprimé, ou null>",
  "vendor_normalized": "<nom canonique si tu reconnais le vendor, ex: 'Total' → 'Total Mauritius', sinon égal à vendor>",
  "date_facture": "<YYYY-MM-DD ou null si illisible>",
  "montant_ttc": <nombre décimal ou null>,
  "montant_ht": <nombre ou null si TVA déduisible visible>,
  "montant_tva": <nombre ou null si TVA présente sur le ticket>,
  "taux_tva": <0 ou 15, ou null si pas mentionné>,
  "devise": "<MUR | EUR | USD | GBP — défaut MUR à Maurice>",
  "categorie_suggeree": "<une des 12 valeurs autorisées>",
  "description": "<résumé 1 ligne, ex: 'Dîner restaurant Acme avec client X' ou null>",
  "vat_number_vendor": "<n° TVA du vendor si imprimé, sinon null>",
  "brn_vendor": "<BRN du vendor si imprimé, sinon null>",
  "confidence": <0.0 à 1.0 — confiance globale dans l'extraction>
}

═══ CATÉGORIES (12 autorisées) ═══

- repas : restaurant, déjeuner, dîner, café avec client
- taxi : taxi, VTC, Uber, navette (course ponctuelle)
- essence : carburant véhicule (Total, Engen, Caltex, Vivo, BP, Indian Oil)
- hotel : hébergement (hôtel, gîte, B&B professionnel)
- deplacement : train, avion, ferry, billet de transport longue distance, péage
- telecom : recharge mobile, dongle 4G, abonnement données mobiles
- fournitures : papeterie, stylos, cartouches imprimante, classeurs
- formation : livre pro, séminaire, certification, conférence
- parking : parking horodateur, garage
- pharmacie : pharmacie professionnelle (achats clinique, secourisme)
- communication : photocopie, impression, envoi courrier, fax
- divers : catch-all si vraiment rien d'autre ne correspond

═══ DÉTECTION TVA Maurice ═══

Maurice : TVA standard 15%. Sur un ticket :
- Si "VAT 15%" ou "TVA 15%" mentionné : taux_tva = 15, calcule HT
- Si "VAT 0%" ou "Exonéré" : taux_tva = 0
- Si rien mentionné sur petite somme (< 200 MUR) : taux_tva = null
- montant_ttc reste TOUJOURS le total final payé

═══ DÉTECTION VENDOR CONNU (Maurice) ═══

Si tu reconnais l'un de ces vendors mauriciens populaires, normalise le nom :
- "TOTAL", "TOTAL ENERGIES", "TotalEnergies Mauritius" → "Total Mauritius"
- "ENGEN" → "Engen Mauritius"
- "CALTEX" → "Caltex Mauritius"
- "VIVO ENERGY" → "Vivo Energy Mauritius"
- "INDIAN OIL" → "Indian Oil Mauritius"
- "WINNER'S" → "Winner's Supermarket"
- "INTERMART" → "Intermart Supermarket"
- "JUMBO" → "Jumbo Hyper"
- "MONOPRIX" → "Monoprix Mauritius"
- "PRIX BAS" / "PNL" → "Prix Bas"
- "WOODLANDS" → "Woodlands Hotel"
- "LE LABOURDONNAIS" → "Le Labourdonnais Hotel"
- "TAXI" + numéro → "Taxi" (générique)
- "EMTEL" / "MT" / "ORANGE" → telecom opérateur

═══ RÈGLES ═══

1. montant_ttc = total final payé (taxes incluses), pas le sous-total
2. Devise = MUR par défaut à Maurice (Rs, Re, Roupies, Rupees)
3. categorie_suggeree DOIT être une des 12 valeurs ci-dessus
4. Si la photo est illisible/floue : tous champs null + confidence < 0.3
5. Si tu DOUTES sur la catégorie : utilise "divers" plutôt que d'inventer
6. Si VAT/BRN du vendor sont imprimés : extrais-les (utile pour rattachement DB)
7. Réponds UNIQUEMENT le JSON, sans phrase d'introduction ni conclusion

═══ ANTI-PATTERNS ═══

❌ Inventer un montant si le total n'est pas visible (mets null)
❌ Deviner la devise si pas d'indice (mets MUR par défaut à Maurice)
❌ Mettre categorie_suggeree = "essence" si vendor n'est pas une station-service
❌ Mettre confidence > 0.8 si vendor null ET date null
❌ Confondre date de la transaction avec date d'impression
❌ Confondre sous-total avec total final`

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

  let parsed: any
  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    return {
      ok: false,
      error: 'OCR ticket : JSON invalide retourné par le modèle',
    }
  }

  const numOrNull = (v: any): number | null =>
    typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null
  const tauxOrNull = (v: any): number | null => {
    if (typeof v !== 'number' || !isFinite(v)) return null
    if (v === 0 || v === 15) return v
    return null
  }

  const data: ExpenseOcrOutput = {
    vendor: parsed?.vendor ? String(parsed.vendor).slice(0, 200) : null,
    vendor_normalized: parsed?.vendor_normalized
      ? String(parsed.vendor_normalized).slice(0, 200)
      : null,
    date_facture: isoDateOrNull(parsed?.date_facture),
    montant_ttc: numOrNull(parsed?.montant_ttc),
    montant_ht: numOrNull(parsed?.montant_ht),
    montant_tva: numOrNull(parsed?.montant_tva),
    taux_tva: tauxOrNull(parsed?.taux_tva),
    devise: parsed?.devise ? String(parsed.devise).toUpperCase().slice(0, 5) : null,
    categorie_suggeree: clampCategory(parsed?.categorie_suggeree),
    description: parsed?.description ? String(parsed.description).slice(0, 240) : null,
    vat_number_vendor: parsed?.vat_number_vendor
      ? String(parsed.vat_number_vendor).slice(0, 50)
      : null,
    brn_vendor: parsed?.brn_vendor ? String(parsed.brn_vendor).slice(0, 50) : null,
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
