/**
 * jurisprudence-crawl.ts — Helpers PURS pour le crawl de jurisprudence.
 * Découverte d'URLs de jugements depuis une page de listing + détection de la
 * citation neutre. Aucune dépendance réseau/Supabase ici → testable via `tsx`.
 */

/**
 * Découvre les URLs de PDF de jugements dans le HTML d'une page de listing
 * (Cour suprême de Maurice). Les liens sont de la forme
 * `/view_document/…?file=<url-encodée-du-pdf>#…`. On extrait et décode le
 * paramètre `file`, on retire l'ancre, et on ne garde que les PDF absolus.
 */
export function discoverJudgmentPdfUrls(html: string): string[] {
  const urls = new Set<string>()

  // 1) Liens "view_document" exposant le PDF dans le paramètre ?file=…
  const fileRe = /[?&]file=([^"&'\s]+\.pdf)/gi
  let m: RegExpExecArray | null
  while ((m = fileRe.exec(html))) {
    const decoded = safeDecode(m[1]).replace(/#.*$/, '').trim()
    if (decoded.startsWith('http') && decoded.toLowerCase().endsWith('.pdf')) urls.add(decoded)
  }

  // 2) Liens directs vers des PDF de jugements (au cas où le markup change).
  const directRe = /https?:\/\/[^\s"'<>]+\/system\/files\/judgment\/[^\s"'<>]+\.pdf/gi
  while ((m = directRe.exec(html))) {
    urls.add(m[0].replace(/#.*$/, '').trim())
  }

  return [...urls]
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Détecte la citation neutre mauricienne en tête de jugement, p.ex.
 * « 2026 SCJ 123 », « 2026 INT 144 », « 2026 IND 24 », « 2026 PL2 20 ».
 * Format : ANNÉE + CODE-COUR (2 à 6 caractères alphanumériques majuscules,
 * commençant par une lettre) + NUMÉRO. À défaut, on tente un numéro de cause
 * (« CN 88/2022 », « Cause No 12/2024 »). Renvoie `null` si rien de fiable.
 */
export function detectCitation(text: string): string | null {
  const head = (text || '').slice(0, 2000)

  const neutral = head.match(/\b(\d{4})\s+([A-Z][A-Z0-9]{1,5})\s+(\d{1,4})\b/)
  if (neutral) return `${neutral[1]} ${neutral[2]} ${neutral[3]}`

  const cause = head.match(/\b(?:Record No\.?|Cause No\.?|CN)\s*[:.]?\s*([0-9]{1,5}\/\d{2,4})\b/i)
  if (cause) return `CN ${cause[1]}`

  return null
}

/**
 * Construit une « key » (préfixe de slug) stable et unique pour un jugement
 * découvert, à partir de son URL de PDF. On exploite l'identifiant numérique du
 * chemin `…/judgment/<id>/<slug>.pdf` quand il est présent, sinon on dérive du
 * nom de fichier.
 */
export function keyFromPdfUrl(url: string): string {
  const idMatch = url.match(/\/judgment\/(\d+)\//)
  if (idMatch) return `jp-${idMatch[1]}`
  const file = url.split('/').pop() || 'jugement'
  const base = file.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `jp-${base}`.slice(0, 80)
}
