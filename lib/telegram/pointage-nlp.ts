/**
 * Détection des intents de pointage in/out à partir d'un message Telegram texte.
 *
 * Couvre les commandes slash (/in, /out, /pointage_in, /pointage_out) ET le
 * langage naturel basique FR/EN ("j'arrive", "je commence", "je pars", "je
 * termine", "I'm in", "leaving"…). Volontairement strict pour éviter les
 * faux positifs : on s'arrête au premier match clair, sinon on retourne null.
 */
export type PointageIntent = 'in' | 'out' | null

const RE_IN = [
  // Commandes
  /^\s*\/(in|pointage_?in|punch_?in|clockin)\b/i,
  // FR
  /^\s*(j['e]\s*)?(arrive|arrivee|arrivée|commence|debute|débute|prends?\s+mon\s+poste|reprise|de\s+retour)\b/i,
  /^\s*je\s+suis\s+(la|là|arrivée?|arrive)(\b|$|\s|[!.,?])/i,
  /^\s*bonjour[\s,!.]*je\s+commence\b/i,
  // EN
  /^\s*(i['']?m\s+in|im\s+in|clock(ing)?\s*in|punching?\s*in|starting|here\s+now)\b/i,
]

const RE_OUT = [
  // Commandes
  /^\s*\/(out|pointage_?out|punch_?out|clockout)\b/i,
  // FR
  /^\s*(je\s+)?(pars|termine|fini[se]?|finis|quitt[ee]|sortie|sortir|m['e]\s*en\s+vais)\b/i,
  /^\s*(au\s+revoir|bonsoir)[\s,!.]*je\s+(pars|termine)\b/i,
  // EN
  /^\s*(i['']?m\s+(out|leaving|done)|clock(ing)?\s*out|punching?\s*out|leaving\s+now|done\s+for\s+today)\b/i,
]

export function detectPointageIntent(text: string | null | undefined): PointageIntent {
  const t = String(text || '').trim()
  if (!t) return null
  for (const re of RE_IN) if (re.test(t)) return 'in'
  for (const re of RE_OUT) if (re.test(t)) return 'out'
  return null
}

/**
 * Détecte la commande /notes_de_frais (liste des notes en cours).
 */
export function isExpensesListCommand(text: string | null | undefined): boolean {
  return /^\s*\/(notes_?de_?frais|expenses|my_?expenses)\b/i.test(String(text || ''))
}
