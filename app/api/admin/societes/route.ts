import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// GET — List all sociétés
export async function GET() {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()

    // Simple select without FK join (avoids schema cache issues)
    const { data: societes, error } = await supabase
      .from('societes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with comptable name separately
    const comptableIds = [...new Set((societes || []).map(s => s.comptable_id).filter(Boolean))]
    let comptableMap: Record<string, any> = {}
    if (comptableIds.length > 0) {
      const { data: comptables } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', comptableIds)
      ;(comptables || []).forEach(c => { comptableMap[c.id] = c })
    }

    const enriched = (societes || []).map(s => ({
      ...s,
      comptable: s.comptable_id ? comptableMap[s.comptable_id] || null : null,
    }))

    return NextResponse.json({ societes: enriched })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// POST — Create a société
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const {
      nom, brn, numero_tva_mra, statut_tva, comptable_id,
      ern, tan_societe, registered_office,
      mra_declarant_name, mra_email, mra_telephone, mra_mobile,
      date_incorporation, short_name, npf_number, nature_business,
      adresse, ville, telephone, email,
    } = await request.json()

    if (!nom) {
      return NextResponse.json({ error: 'Le nom de la société est requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('societes')
      .insert({
        nom,
        brn: brn || null,
        numero_tva_mra: numero_tva_mra || null,
        statut_tva: statut_tva || false,
        comptable_id: comptable_id || null,
        ern: ern || null,
        tan_societe: tan_societe || null,
        registered_office: registered_office || null,
        mra_declarant_name: mra_declarant_name || null,
        mra_email: mra_email || null,
        mra_telephone: mra_telephone || null,
        mra_mobile: mra_mobile || null,
        date_incorporation: date_incorporation || null,
        short_name: short_name || null,
        npf_number: npf_number || null,
        nature_business: nature_business || null,
        adresse: adresse || null,
        ville: ville || null,
        telephone: telephone || null,
        email: email || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// PUT — Update a société (tous les champs)
export async function PUT(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { id } = body

    if (!id) return NextResponse.json({ error: "L'identifiant de la société est requis" }, { status: 400 })

    const supabase = getAdminClient()

    // Build update object — only include fields that are present in the body
    const updates: Record<string, unknown> = {}
    const allowedFields = [
      'nom', 'brn', 'numero_tva_mra', 'statut_tva', 'comptable_id',
      'short_name', 'ern', 'tan_societe', 'registered_office',
      'mra_declarant_name', 'mra_email', 'mra_telephone', 'mra_mobile',
      'mra_ebs_id', 'mra_api_key', 'mra_environment', 'mra_fiscalisation_active',
      'npf_number', 'nature_business', 'date_incorporation', 'logo_url',
      'secteur_activite', 'contact_name', 'contact_position',
      'adresse', 'adresse2', 'ville', 'telephone', 'fax', 'email', 'email_dco',
      'latitude', 'longitude', 'distance_pointage',
      'period_closing_day', 'pay_day', 'salary_frequency', 'eoy_bonus_mode',
      'declaration_type', 'payslip_template', 'payslip_language',
      'devises_actives', 'client_id', 'modules_actifs',
    ]
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('societes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}

// DELETE — Delete a société and its related dossiers
export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await requireAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "L'identifiant de la société est requis" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Delete related dossiers first
    const { error: dossiersError } = await supabase
      .from('dossiers')
      .delete()
      .eq('societe_id', id)

    if (dossiersError) {
      return NextResponse.json({ error: 'Erreur lors de la suppression des dossiers liés : ' + dossiersError.message }, { status: 500 })
    }

    // Delete the société
    const { error } = await supabase
      .from('societes')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: 'Erreur lors de la suppression de la société : ' + error.message }, { status: 500 })
    return NextResponse.json({ message: 'Société et dossiers associés supprimés avec succès' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}