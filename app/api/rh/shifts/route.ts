import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const SHIFT_PRESETS = {
  standard_week: {
    nom: 'Semaine Standard',
    description: 'Lun-Ven 08:00-17:00, weekend off',
    shifts: {
      lundi:    { heure_debut: '08:00', heure_fin: '17:00', pause: 60 },
      mardi:    { heure_debut: '08:00', heure_fin: '17:00', pause: 60 },
      mercredi: { heure_debut: '08:00', heure_fin: '17:00', pause: 60 },
      jeudi:    { heure_debut: '08:00', heure_fin: '17:00', pause: 60 },
      vendredi: { heure_debut: '08:00', heure_fin: '17:00', pause: 60 },
      samedi:   null,
      dimanche: null,
    },
  },
  '3x8': {
    nom: '3×8 Rotation',
    description: 'Matin 06:00-14:00, Après-midi 14:00-22:00, Nuit 22:00-06:00, rotation',
    shifts: {
      matin:      { heure_debut: '06:00', heure_fin: '14:00', pause: 30 },
      apres_midi: { heure_debut: '14:00', heure_fin: '22:00', pause: 30 },
      nuit:       { heure_debut: '22:00', heure_fin: '06:00', pause: 30 },
    },
    rotation: true,
  },
}

// GET /api/rh/shifts?societe_id=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('nom')

    if (error) throw error

    return NextResponse.json({
      templates: data,
      total: data?.length || 0,
      presets: Object.keys(SHIFT_PRESETS),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/shifts
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, nom, preset, shifts, description } = body

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Use preset if specified, otherwise custom shifts
    let templateShifts = shifts
    let templateNom = nom
    let templateDesc = description

    if (preset && preset in SHIFT_PRESETS) {
      const p = SHIFT_PRESETS[preset as keyof typeof SHIFT_PRESETS]
      templateShifts = p.shifts
      templateNom = templateNom || p.nom
      templateDesc = templateDesc || p.description
    }

    if (!templateNom || !templateShifts) {
      return NextResponse.json({ error: 'nom et shifts requis (ou utiliser un preset)' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('shift_templates')
      .insert({
        societe_id,
        nom: templateNom,
        description: templateDesc || null,
        shifts: templateShifts,
        actif: true,
        cree_par: user.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ template: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// PATCH /api/rh/shifts
export async function PATCH(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { id, nom, shifts, description } = body

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (nom !== undefined) updates.nom = nom
    if (shifts !== undefined) updates.shifts = shifts
    if (description !== undefined) updates.description = description

    const { data, error } = await supabase
      .from('shift_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ template: data })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/rh/shifts?id=... (soft delete: actif=false)
export async function DELETE(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('shift_templates')
      .update({ actif: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ template: data, message: 'Template désactivé' })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
