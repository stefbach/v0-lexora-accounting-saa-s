import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Typage : contrat partagé avec le front ──────────────────────────────────
export interface InvoiceSettings {
  societe_id: string
  // Entreprise
  logo_url: string | null
  brn: string | null
  vat_number: string | null
  adresse: string | null
  telephone: string | null
  email: string | null
  website: string | null
  // Bancaire
  banque_nom: string | null
  banque_compte: string | null
  banque_iban: string | null
  banque_swift: string | null
  // Facturation
  devise_defaut: string
  conditions_paiement: string | null
  prefixe_facture: string
  prochain_numero: number
  pied_de_page: string | null
  mention_legale_mra: string | null
  // Template
  template_id: string
  couleur_primaire: string
  couleur_secondaire: string
  // MRA
  mra_active: boolean
  mra_ebs_id: string | null
  mra_api_key_encrypted: string | null
  mra_env: 'sandbox' | 'production'
}

// Champs modifiables (on exclut id / societe_id / timestamps)
type InvoiceSettingsPatch = Partial<Omit<InvoiceSettings, 'societe_id'>>

// Liste blanche des champs persistables — protège contre un POST arbitraire
const WRITABLE_FIELDS: readonly (keyof InvoiceSettingsPatch)[] = [
  'logo_url',
  'brn',
  'vat_number',
  'adresse',
  'telephone',
  'email',
  'website',
  'banque_nom',
  'banque_compte',
  'banque_iban',
  'banque_swift',
  'devise_defaut',
  'conditions_paiement',
  'prefixe_facture',
  'prochain_numero',
  'pied_de_page',
  'mention_legale_mra',
  'template_id',
  'couleur_primaire',
  'couleur_secondaire',
  'mra_active',
  'mra_ebs_id',
  'mra_api_key_encrypted',
  'mra_env',
] as const

function sanitize(body: Record<string, unknown>): InvoiceSettingsPatch {
  const out: Record<string, unknown> = {}
  for (const key of WRITABLE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out as InvoiceSettingsPatch
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/client/invoice-settings?societe_id=<uuid>
// Retourne la ligne pour la société, ou {} si aucune ligne existante.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis' },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societeId)

    const { data, error } = await admin
      .from('invoice_settings')
      .select('*')
      .eq('societe_id', societeId)
      .maybeSingle()

    if (error) {
      console.error('[invoice-settings:GET]', error)
      return NextResponse.json(
        { error: 'Lecture échouée : ' + error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ settings: data || {} })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[invoice-settings:GET]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/client/invoice-settings
// Body : { societe_id, ...fields }
// Upsert complet (INSERT ON CONFLICT DO UPDATE).
// ────────────────────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const societeId = typeof body.societe_id === 'string' ? body.societe_id : ''
    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis' },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societeId)

    const payload = {
      societe_id: societeId,
      ...sanitize(body),
    }

    const { data, error } = await admin
      .from('invoice_settings')
      .upsert(payload, { onConflict: 'societe_id' })
      .select()
      .single()

    if (error) {
      console.error('[invoice-settings:PUT]', error)
      return NextResponse.json(
        { error: 'Upsert échoué : ' + error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ settings: data })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[invoice-settings:PUT]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/client/invoice-settings
// Body : { societe_id, ...fields }
// Update partiel — ne touche que les champs présents dans le body.
// Si aucune ligne n'existe, crée la ligne.
// ────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const societeId = typeof body.societe_id === 'string' ? body.societe_id : ''
    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis' },
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societeId)

    const patch = sanitize(body)

    // Vérifie si une ligne existe déjà
    const { data: existing } = await admin
      .from('invoice_settings')
      .select('id')
      .eq('societe_id', societeId)
      .maybeSingle()

    if (!existing) {
      // Pas de ligne → upsert
      const { data, error } = await admin
        .from('invoice_settings')
        .insert({ societe_id: societeId, ...patch })
        .select()
        .single()
      if (error) {
        console.error('[invoice-settings:PATCH:insert]', error)
        return NextResponse.json(
          { error: 'Insert échoué : ' + error.message },
          { status: 500 },
        )
      }
      return NextResponse.json({ settings: data })
    }

    const { data, error } = await admin
      .from('invoice_settings')
      .update(patch)
      .eq('societe_id', societeId)
      .select()
      .single()

    if (error) {
      console.error('[invoice-settings:PATCH:update]', error)
      return NextResponse.json(
        { error: 'Update échoué : ' + error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ settings: data })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[invoice-settings:PATCH]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
