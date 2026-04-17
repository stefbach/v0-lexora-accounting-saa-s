import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveOwnership } from '@/lib/rh/ownership'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Haversine distance (km) between two GPS points ─────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 100) / 100
}

// GET /api/rh/trajets-km?societe_id=...&employe_id=...&date_debut=...&date_fin=...&statut=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const statut = searchParams.get('statut')

    // P0 Sécurité — ownership check
    const ownership = await resolveOwnership(supabase, user.id)
    if (!ownership.isRH) {
      if (employe_id && ownership.employe_id && employe_id !== ownership.employe_id) {
        return NextResponse.json({ error: 'Accès refusé — vous ne pouvez voir que vos propres trajets.' }, { status: 403 })
      }
    }

    if (!societe_id && !employe_id) {
      return NextResponse.json({ error: 'societe_id ou employe_id requis' }, { status: 400 })
    }

    // Build employee ID list if filtering by société
    let empIds: string[] = []
    if (employe_id) {
      empIds = [employe_id]
    } else if (societe_id) {
      const { data: emps } = await supabase
        .from('employes')
        .select('*')
        .eq('societe_id', societe_id)
        .is('date_depart', null)
      empIds = (emps || []).map((e: any) => e.id)
      if (empIds.length === 0) {
        return NextResponse.json({ trajets: [], total: 0, stats: { total_km: 0, total_indemnite: 0, nb_trajets: 0 } })
      }
    }

    // Fetch trajets
    let query = supabase
      .from('trajets_kilometriques')
      .select('*')
      .in('employe_id', empIds)
      .order('date_trajet', { ascending: false })

    if (date_debut) query = query.gte('date_trajet', date_debut)
    if (date_fin) query = query.lte('date_trajet', date_fin)
    if (statut) query = query.eq('statut', statut)

    const { data: trajets, error: trajErr } = await query
    if (trajErr) throw trajErr

    // Fetch employee info for enrichment
    const uniqueEmpIds = [...new Set((trajets || []).map((t: any) => t.employe_id))]
    let empMap: Record<string, any> = {}
    if (uniqueEmpIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('*').in('id', uniqueEmpIds)
      for (const e of emps || []) empMap[e.id] = e
    }

    // Fetch trajet_steps for each trajet
    const trajetIds = (trajets || []).map((t: any) => t.id)
    let stepsMap: Record<string, any[]> = {}
    if (trajetIds.length > 0) {
      const { data: steps } = await supabase
        .from('trajet_steps')
        .select('*')
        .in('trajet_id', trajetIds)
        .order('step_order', { ascending: true })
      for (const s of steps || []) {
        if (!stepsMap[s.trajet_id]) stepsMap[s.trajet_id] = []
        stepsMap[s.trajet_id].push(s)
      }
    }

    // Build enriched results
    const result = (trajets || []).map((t: any) => {
      const emp = empMap[t.employe_id] || {}
      return {
        ...t,
        employe_nom: emp.nom || '',
        employe_prenom: emp.prenom || '',
        employe_poste: emp.poste || '',
        steps: stepsMap[t.id] || [],
        distance_km: Number(t.distance_totale_km) || 0,
        indemnite: Number(t.montant_indemnite) || 0,
      }
    })

    // Stats
    const total_km = result.reduce((s: number, t: any) => s + t.distance_km, 0)
    const total_indemnite = result.reduce((s: number, t: any) => s + t.indemnite, 0)

    return NextResponse.json({
      trajets: result,
      total: result.length,
      stats: {
        total_km: Math.round(total_km * 100) / 100,
        total_indemnite: Math.round(total_indemnite * 100) / 100,
        nb_trajets: result.length,
      },
    })
  } catch (e: unknown) {
    console.error('[trajets-km GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/trajets-km
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── Start a new trajet ──────────────────────────────────────────────
    if (action === 'demarrer') {
      const { employe_id, societe_id: socId, latitude, longitude, motif, vehicule: veh } = body
      if (!employe_id) {
        return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
      }

      // Get societe_id from employee if not provided
      let finalSocieteId = socId
      if (!finalSocieteId) {
        const { data: emp } = await supabase.from('employes').select('societe_id').eq('id', employe_id).maybeSingle()
        finalSocieteId = emp?.societe_id
      }
      if (!finalSocieteId) return NextResponse.json({ error: 'societe_id introuvable' }, { status: 400 })

      const { data, error } = await supabase
        .from('trajets_kilometriques')
        .insert({
          employe_id,
          societe_id: finalSocieteId,
          date_trajet: new Date().toISOString().split('T')[0],
          depart_lat: latitude ? Number(latitude) : null,
          depart_lng: longitude ? Number(longitude) : null,
          depart_heure: new Date().toISOString(),
          vehicule: veh || 'voiture',
          motif: motif || null,
          statut: 'en_cours',
          distance_totale_km: 0,
          montant_indemnite: 0,
        })
        .select('*')
        .single()

      if (error) {
        console.error('[trajets-km] insert error:', error.message, error.details)
        return NextResponse.json({ error: 'Erreur création trajet: ' + error.message }, { status: 500 })
      }

      // Insert first step
      if (latitude && longitude) {
        await supabase.from('trajet_steps').insert({
          trajet_id: data.id,
          step_order: 1,
          latitude: Number(latitude),
          longitude: Number(longitude),
          heure: new Date().toISOString(),
          distance_depuis_precedent_km: 0,
        })
      }

      return NextResponse.json({ trajet: data, message: 'Trajet démarré' })
    }

    // ── Add a checkpoint GPS step ───────────────────────────────────────
    if (action === 'checkpoint') {
      const { trajet_id, latitude, longitude, adresse } = body
      if (!trajet_id) {
        return NextResponse.json({ error: 'trajet_id requis' }, { status: 400 })
      }

      // Get the last step to calculate distance
      const { data: lastSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)
        .order('step_order', { ascending: false })
        .limit(1)

      const lastStep = lastSteps && lastSteps.length > 0 ? lastSteps[0] : null
      const nextOrder = lastStep ? (lastStep.step_order || 0) + 1 : 1

      let distFromPrev = 0
      if (lastStep && lastStep.latitude && lastStep.longitude && latitude && longitude) {
        distFromPrev = haversineKm(lastStep.latitude, lastStep.longitude, Number(latitude), Number(longitude))
      }

      const { data: step, error: stepErr } = await supabase
        .from('trajet_steps')
        .insert({
          trajet_id,
          step_order: nextOrder,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          adresse: adresse || null,
          heure: new Date().toISOString(),
          distance_depuis_precedent_km: distFromPrev,
        })
        .select('*')
        .single()

      if (stepErr) throw stepErr

      // Update trajet total distance
      const { data: allSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)

      const totalDist = (allSteps || []).reduce((s: number, st: any) => s + (Number(st.distance_depuis_precedent_km) || 0), 0)

      await supabase
        .from('trajets_kilometriques')
        .update({ distance_totale_km: Math.round(totalDist * 100) / 100 })
        .eq('id', trajet_id)

      return NextResponse.json({ step, distance_ajoutee: distFromPrev, distance_totale: totalDist })
    }

    // ── End a trajet ────────────────────────────────────────────────────
    if (action === 'terminer') {
      const { trajet_id, latitude, longitude } = body
      if (!trajet_id) {
        return NextResponse.json({ error: 'trajet_id requis' }, { status: 400 })
      }

      // Add final step
      const { data: lastSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)
        .order('step_order', { ascending: false })
        .limit(1)

      const lastStep = lastSteps && lastSteps.length > 0 ? lastSteps[0] : null
      const nextOrder = lastStep ? (lastStep.step_order || 0) + 1 : 1

      let distFromPrev = 0
      if (lastStep && lastStep.latitude && lastStep.longitude && latitude && longitude) {
        distFromPrev = haversineKm(lastStep.latitude, lastStep.longitude, Number(latitude), Number(longitude))
      }

      await supabase.from('trajet_steps').insert({
        trajet_id,
        step_order: nextOrder,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        heure: new Date().toISOString(),
        distance_depuis_precedent_km: distFromPrev,
      })

      // Calculate total distance
      const { data: allSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)

      const totalDist = (allSteps || []).reduce((s: number, st: any) => s + (Number(st.distance_depuis_precedent_km) || 0), 0)
      const roundedDist = Math.round(totalDist * 100) / 100

      // Get trajet to find employe and société for indemnity calc
      const { data: trajet } = await supabase
        .from('trajets_kilometriques')
        .select('*')
        .eq('id', trajet_id)
        .single()

      let tauxKm = 0.50 // default
      if (trajet) {
        const societeId = trajet.societe_id
        const vehiculeType = trajet.vehicule || 'voiture'

        if (societeId) {
          // Look up parametres_km for this société
          const { data: params } = await supabase
            .from('parametres_km')
            .select('*')
            .eq('societe_id', societeId)
            .maybeSingle()

          if (params) {
            if (vehiculeType === 'moto' && params.taux_moto) {
              tauxKm = Number(params.taux_moto)
            } else if (vehiculeType === 'velo' && params.taux_velo) {
              tauxKm = Number(params.taux_velo)
            } else if (params.taux_voiture) {
              tauxKm = Number(params.taux_voiture)
            }
          }
        }
      }

      const indemnite = Math.round(roundedDist * tauxKm * 100) / 100

      // Update the trajet
      const { data: updated, error: updErr } = await supabase
        .from('trajets_kilometriques')
        .update({
          arrivee_heure: new Date().toISOString(),
          arrivee_lat: latitude ? Number(latitude) : null,
          arrivee_lng: longitude ? Number(longitude) : null,
          distance_totale_km: roundedDist,
          taux_km_applique: tauxKm,
          montant_indemnite: indemnite,
          statut: 'termine',
        })
        .eq('id', trajet_id)
        .select('*')
        .single()

      if (updErr) throw updErr

      return NextResponse.json({
        trajet: updated,
        distance_km: roundedDist,
        taux_km: tauxKm,
        indemnite,
        message: 'Trajet terminé',
      })
    }

    // ── Validate a trajet (RH approval) ─────────────────────────────────
    if (action === 'valider') {
      const { trajet_id, statut: newStatut } = body
      if (!trajet_id) {
        return NextResponse.json({ error: 'trajet_id requis' }, { status: 400 })
      }

      const finalStatut = newStatut || 'valide'

      const { data, error } = await supabase
        .from('trajets_kilometriques')
        .update({
          statut: finalStatut,
          approuve_par: user.id,
          date_approbation: new Date().toISOString(),
        })
        .eq('id', trajet_id)
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ trajet: data, message: `Trajet ${finalStatut === 'rejete' ? 'rejeté' : 'validé'}` })
    }

    // ── Parametres km (get/set rates) ───────────────────────────────────
    if (action === 'parametres') {
      const { societe_id, taux_voiture, taux_moto, taux_velo, plafond_mensuel, mode } = body

      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      }

      // GET mode: fetch current parameters
      if (mode === 'get' || (!taux_voiture && !taux_moto && !taux_velo)) {
        const { data: params } = await supabase
          .from('parametres_km')
          .select('*')
          .eq('societe_id', societe_id)
          .maybeSingle()

        return NextResponse.json({ parametres: params || null })
      }

      // SET mode: upsert parameters for this société
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (taux_voiture !== undefined) updateData.taux_voiture = Number(taux_voiture)
      if (taux_moto !== undefined) updateData.taux_moto = Number(taux_moto)
      if (taux_velo !== undefined) updateData.taux_velo = Number(taux_velo)
      if (plafond_mensuel !== undefined) updateData.plafond_mensuel = Number(plafond_mensuel)

      const { data, error } = await supabase
        .from('parametres_km')
        .upsert({
          societe_id,
          ...updateData,
        }, { onConflict: 'societe_id' })
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ parametre: data, message: 'Paramètres km mis à jour' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[trajets-km POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
