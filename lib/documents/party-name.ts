// L'OCR renvoie émetteur/destinataire soit en texte, soit (format récent) en
// objet { nom, adresse, vat_number… }. Tout affichage ou traitement texte doit
// passer par ce helper : un objet rendu tel quel fait planter React, et
// `.toLowerCase()` dessus lève une TypeError.
export function partyName(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const nom = o.nom ?? o.name ?? o.raison_sociale
    return typeof nom === 'string' ? nom : ''
  }
  return ''
}
