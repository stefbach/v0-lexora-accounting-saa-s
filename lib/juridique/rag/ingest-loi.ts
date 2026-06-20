/**
 * ingest-loi.ts — Récupération et découpage des textes de loi (PDF) pour le RAG.
 * SERVEUR UNIQUEMENT. Extraction via `unpdf` (pdf.js serverless, sans canvas),
 * importé dynamiquement pour ne pas charger pdf.js au moment du build.
 */

/** Télécharge un PDF et en extrait le texte brut (unpdf, serverless-friendly). */
export async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Lexora-Legal-RAG/1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const { extractText } = await import('unpdf')
  const { text } = await extractText(bytes, { mergePages: true })
  const full = Array.isArray(text) ? text.join('\n') : String(text || '')
  return full.replace(/ /g, ' ')
}

export interface ChunkLoi { reference: string; texte: string }

/** Détecte un numéro de section (ex. « 12. », « 33A. ») en tête de passage. */
function detectSection(s: string): string | null {
  const m = s.match(/(?:^|\n)\s*(\d{1,3}[A-Z]{0,2})\.\s+[A-ZÀ-Ÿ(]/)
  return m ? `s.${m[1]}` : null
}

/**
 * Découpe le texte d'une loi en passages (~1500 caractères, chevauchement 150),
 * en coupant de préférence à une frontière de phrase/paragraphe, et en
 * rattachant un numéro de section détecté comme référence.
 */
export function chunkLoi(text: string, maxChars = 1500, overlap = 150): ChunkLoi[] {
  const clean = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const chunks: ChunkLoi[] = []
  let i = 0
  let guard = 0
  while (i < clean.length && guard < 5000) {
    guard++
    let end = Math.min(i + maxChars, clean.length)
    if (end < clean.length) {
      const slice = clean.slice(i, end)
      const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '))
      if (cut > maxChars * 0.5) end = i + cut + 1
    }
    const piece = clean.slice(i, end).trim()
    if (piece.length > 60) {
      chunks.push({ reference: detectSection(piece) || `extrait ${chunks.length + 1}`, texte: piece })
    }
    if (end >= clean.length) break
    i = Math.max(end - overlap, i + 1)
  }
  return chunks
}
