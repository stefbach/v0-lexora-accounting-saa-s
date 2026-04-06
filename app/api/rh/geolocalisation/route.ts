import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/geolocalisation?societe_id=...
// Returns employee positions with today's shift info
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // 1. Fetch all active employees for this société
    const { data: employes, error: empErr } = await supabase
      .from('employes')
      .select('*')
      .eq('societe_id', societe_id)
      .is('date_depart', null)

    if (empErr) throw empErr
    if (!employes || employes.length === 0) {
      return NextResponse.json({ positions: [], total: 0 })
    }

    const empIds = employes.map(e => e.id)

    // 2. Fetch positions from employe_positions (type = 'domicile')
    const { data: positions } = await supabase
      .from('employe_positions')
      .select('*')
      .in('employe_id', empIds)
      .eq('type', 'domicile')

    const posMap: Record<string, any> = {}
    for (const p of positions || []) {
      posMap[p.employe_id] = p
    }

    // 3. Fetch today's planning assignments
    const today = new Date().toISOString().split('T')[0]
    const currentPeriode = today.slice(0, 7) // YYYY-MM

    // Find planning for current period
    const { data: plannings } = await supabase
      .from('plannings')
      .select('*')
      .eq('societe_id', societe_id)
      .or(`periode.eq.${currentPeriode}-01,periode.eq.${currentPeriode}`)
      .limit(1)

    let assignmentMap: Record<string, any> = {}
    if (plannings && plannings.length > 0) {
      const planningId = plannings[0].id
      const { data: assignments } = await supabase
        .from('planning_assignments')
        .select('*')
        .eq('planning_id', planningId)
        .eq('date', today)
        .in('employe_id', empIds)

      for (const a of assignments || []) {
        assignmentMap[a.employe_id] = a
      }
    }

    // 4. Build response
    const result = employes.map(emp => {
      const pos = posMap[emp.id]
      const assignment = assignmentMap[emp.id]

      // Determine shift status
      let shift_today = 'non_planifie'
      let shift_label = 'Non planifié'
      if (assignment) {
        const shift = assignment.shift || assignment.creneau_nom || assignment.type_shift || ''
        const shiftLower = shift.toLowerCase()
        if (shiftLower.includes('repos')) {
          shift_today = 'repos'
          shift_label = 'Repos'
        } else if (shiftLower.includes('cong') || shiftLower.includes('absent')) {
          shift_today = 'conge'
          shift_label = 'Congé'
        } else {
          shift_today = 'travail'
          shift_label = shift || 'Travail'
        }
      }

      return {
        employe_id: emp.id,
        nom: emp.nom || '',
        prenom: emp.prenom || '',
        poste: emp.poste || '',
        latitude: pos?.latitude ?? emp.latitude ?? null,
        longitude: pos?.longitude ?? emp.longitude ?? null,
        adresse: pos?.adresse || emp.adresse_complete || [emp.adresse, emp.adresse2, emp.ville, emp.code_postal].filter(Boolean).join(', ') || '',
        shift_today,
        shift_label,
        heure_debut: assignment?.heure_debut || null,
        heure_fin: assignment?.heure_fin || null,
      }
    })

    return NextResponse.json({ positions: result, total: result.length })
  } catch (e: unknown) {
    console.error('[geolocalisation GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/geolocalisation
// Update an employee's position
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { employe_id, latitude, longitude, adresse, type } = body

    if (!employe_id) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }

    const posType = type || 'domicile'

    // Upsert into employe_positions
    const { data: position, error: posErr } = await supabase
      .from('employe_positions')
      .upsert({
        employe_id,
        type: posType,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        adresse: adresse || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employe_id,type' })
      .select('*')
      .single()

    if (posErr) {
      console.error('[geolocalisation POST] employe_positions upsert error:', posErr.message)
      // If table doesn't exist, continue — we'll still update the employes table
    }

    // Also update the employes table directly
    const updateData: any = {}
    if (latitude !== undefined) updateData.latitude = Number(latitude)
    if (longitude !== undefined) updateData.longitude = Number(longitude)
    if (adresse) updateData.adresse_complete = adresse

    if (Object.keys(updateData).length > 0) {
      const { error: empErr } = await supabase
        .from('employes')
        .update(updateData)
        .eq('id', employe_id)

      if (empErr) {
        console.error('[geolocalisation POST] employes update error:', empErr.message)
      }
    }

    return NextResponse.json({
      success: true,
      position: position || { employe_id, type: posType, latitude, longitude, adresse },
      message: 'Position mise à jour',
    })
  } catch (e: unknown) {
    console.error('[geolocalisation POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
