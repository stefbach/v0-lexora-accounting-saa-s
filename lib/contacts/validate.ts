/**
 * Validation des contacts clients (factures_contacts).
 * Extraite dans lib/ pour être testable indépendamment des routes Next.js.
 */

const DEVISES_OK = ['MUR', 'EUR', 'USD', 'GBP'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ContactPayload {
  nom: string
  entreprise: string | null
  adresse: string | null
  email: string | null
  telephone: string | null
  vat_number: string | null
  devise: string
  conditions_paiement: number
  offshore: boolean
  actif: boolean
}

export function validateContactPayload(
  body: any,
): { ok: true; data: ContactPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }

  const nom = typeof body.nom === 'string' ? body.nom.trim() : ''
  if (!nom) return { ok: false, error: 'nom requis' }
  if (nom.length > 200) return { ok: false, error: 'nom trop long (max 200)' }

  const email = body.email ? String(body.email).trim() : ''
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'email invalide' }
  }

  const devise = typeof body.devise === 'string' ? body.devise.toUpperCase() : 'MUR'
  if (!DEVISES_OK.includes(devise as any)) {
    return { ok: false, error: `devise invalide (${DEVISES_OK.join(', ')})` }
  }

  const cpRaw = body.conditions_paiement
  const conditions_paiement = cpRaw === undefined || cpRaw === null ? 30 : Number(cpRaw)
  if (!Number.isFinite(conditions_paiement) || conditions_paiement < 0 || conditions_paiement > 365) {
    return { ok: false, error: 'conditions_paiement doit être entre 0 et 365' }
  }

  return {
    ok: true,
    data: {
      nom,
      entreprise: body.entreprise ? String(body.entreprise).trim().slice(0, 200) || null : null,
      adresse: body.adresse ? String(body.adresse).trim().slice(0, 500) || null : null,
      email: email || null,
      telephone: body.telephone ? String(body.telephone).trim().slice(0, 50) || null : null,
      vat_number: body.vat_number ? String(body.vat_number).trim().slice(0, 50) || null : null,
      devise,
      conditions_paiement: Math.floor(conditions_paiement),
      offshore: body.offshore === true,
      actif: body.actif === false ? false : true,
    },
  }
}
