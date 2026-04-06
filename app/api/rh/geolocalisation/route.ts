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

    // 4. Build response — geocode from known Mauritius locations if no GPS
    const MAURITIUS_GEOCODE: Record<string, [number, number]> = {
      "port-louis": [-20.1609, 57.5012], "port louis": [-20.1609, 57.5012],
      "curepipe": [-20.3162, 57.5166], "rose hill": [-20.2338, 57.4755],
      "beau bassin": [-20.2296, 57.4677], "quatre bornes": [-20.2633, 57.4789],
      "vacoas": [-20.2983, 57.4784], "phoenix": [-20.2778, 57.4961],
      "floreal": [-20.3089, 57.4961], "moka": [-20.2196, 57.5002],
      "ebene": [-20.2449, 57.4885], "trianon": [-20.2577, 57.4955],
      "grand baie": [-20.0174, 57.5802], "grand bay": [-20.0174, 57.5802],
      "pereybere": [-20.0043, 57.5872], "trou aux biches": [-20.0333, 57.5500],
      "flic en flac": [-20.2783, 57.3636], "tamarin": [-20.3253, 57.3675],
      "mahebourg": [-20.4083, 57.7000], "centre de flacq": [-20.1917, 57.7131],
      "flacq": [-20.1917, 57.7131], "goodlands": [-20.0358, 57.6494],
      "riviere du rempart": [-20.1000, 57.6833], "pamplemousses": [-20.1036, 57.5747],
      "forest side": [-20.3167, 57.5000], "glen park": [-20.3330, 57.5090],
      "plaine wilhems": [-20.3000, 57.4900], "rose-hill": [-20.2338, 57.4755],
      "beau-bassin": [-20.2296, 57.4677], "grand gaube": [-20.0167, 57.6667],
      "grand river north west": [-20.1200, 57.5000], "thiais": [48.7647, 2.3960],
      "france": [48.8566, 2.3522],
    }

    function geocodeFromAddress(adresse: string): [number, number] | null {
      if (!adresse) return null
      const lower = adresse.toLowerCase()
      for (const [city, coords] of Object.entries(MAURITIUS_GEOCODE)) {
        if (lower.includes(city)) return coords
      }
      return null
    }

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

      const fullAdresse = pos?.adresse || emp.adresse_complete || [emp.adresse, emp.address, emp.adresse2, emp.address_2, emp.ville, emp.city, emp.code_postal].filter(Boolean).join(', ') || ''

      return {
        employe_id: emp.id,
        nom: emp.nom || '',
        prenom: emp.prenom || '',
        poste: emp.poste || '',
        latitude: pos?.latitude ?? emp.latitude ?? (() => { const gc = geocodeFromAddress(fullAdresse); return gc ? gc[0] : null })(),
        longitude: pos?.longitude ?? emp.longitude ?? (() => { const gc = geocodeFromAddress(fullAdresse); return gc ? gc[1] : null })(),
        adresse: fullAdresse,
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
