import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { callClaudeDocumentJSON } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Person = { nom?: string; adresse?: string; fonction?: string; parts?: string }
type Extracted = {
  nom?: string; brn?: string; ern?: string; numero_tva_mra?: string
  forme_juridique?: string; date_incorporation?: string; statut?: string
  adresse?: string; adresse2?: string; ville?: string; pays?: string
  secteur_activite?: string; telephone?: string; email?: string; website?: string
  capital_social?: string; devise_capital?: string
  administrateurs?: Person[]; actionnaires?: Person[]; secretaire?: Person
}

/**
 * POST /api/client/societes/import-register
 * Body : { societe_id, pdf_base64 }
 * Numérise un registre CBRD (Register of Companies) et extrait toutes les
 * informations de la société. Ne met PAS à jour directement : renvoie les
 * champs pour que l'utilisateur valide côté UI.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as { societe_id?: string; pdf_base64?: string } | null
  if (!b?.societe_id || !b.pdf_base64) return NextResponse.json({ error: 'societe_id et pdf_base64 requis' }, { status: 400 })

  const admin = getAdminClient()
  try { await assertSocieteAccess(admin, user.id, b.societe_id) }
  catch { return NextResponse.json({ error: 'Accès société refusé' }, { status: 403 }) }

  const pdf = b.pdf_base64.includes(',') ? b.pdf_base64.split(',')[1] : b.pdf_base64

  const system = `Tu numérises un « Register of Companies » officiel (CBRD Maurice) et tu en extrais TOUTES les informations de la société. Réponds STRICTEMENT en JSON, sans texte autour :
{
  "nom": "", "brn": "", "ern": "", "numero_tva_mra": "",
  "forme_juridique": "", "date_incorporation": "AAAA-MM-JJ", "statut": "",
  "adresse": "", "adresse2": "", "ville": "", "pays": "",
  "secteur_activite": "", "telephone": "", "email": "", "website": "",
  "capital_social": "", "devise_capital": "",
  "administrateurs": [{"nom":"","adresse":"","fonction":""}],
  "actionnaires": [{"nom":"","parts":""}],
  "secretaire": {"nom":"","adresse":""}
}
Règles : n'invente RIEN, laisse "" ou [] si absent. Le BRN commence souvent par C suivi de chiffres. Date d'incorporation au format AAAA-MM-JJ. Recopie les adresses complètes.`

  let ext: Extracted = {}
  try {
    ext = await callClaudeDocumentJSON<Extracted>(system, 'Extrais toutes les informations de ce registre.', pdf, 4096)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Numérisation échouée' }, { status: 502 })
  }

  // Champs directement applicables à la table societes.
  const societeFields = {
    nom: ext.nom || undefined,
    brn: ext.brn || undefined,
    ern: ext.ern || undefined,
    numero_tva_mra: ext.numero_tva_mra || undefined,
    adresse: ext.adresse || undefined,
    adresse2: ext.adresse2 || undefined,
    secteur_activite: ext.secteur_activite || undefined,
    telephone: ext.telephone || undefined,
    email: ext.email || undefined,
    website: ext.website || undefined,
  }

  return NextResponse.json({ ok: true, societeFields, extracted: ext })
}
