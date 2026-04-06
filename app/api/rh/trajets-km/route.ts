import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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
        distance_km: Number(t.distance_km) || 0,
        indemnite: Number(t.indemnite) || 0,
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
      const nextOrdre = lastStep ? (lastStep.ordre || 0) + 1 : 1

      let distFromPrev = 0
      if (lastStep && lastStep.latitude && lastStep.longitude && latitude && longitude) {
        distFromPrev = haversineKm(lastStep.latitude, lastStep.longitude, Number(latitude), Number(longitude))
      }

      const { data: step, error: stepErr } = await supabase
        .from('trajet_steps')
        .insert({
          trajet_id,
          ordre: nextOrdre,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          adresse: adresse || null,
          timestamp: new Date().toISOString(),
          distance_depuis_precedent: distFromPrev,
        })
        .select('*')
        .single()

      if (stepErr) throw stepErr

      // Update trajet total distance
      const { data: allSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)

      const totalDist = (allSteps || []).reduce((s: number, st: any) => s + (Number(st.distance_depuis_precedent) || 0), 0)

      await supabase
        .from('trajets_kilometriques')
        .update({ distance_km: Math.round(totalDist * 100) / 100 })
        .eq('id', trajet_id)

      return NextResponse.json({ step, distance_ajoutee: distFromPrev, distance_totale: totalDist })
    }

    // ── End a trajet ────────────────────────────────────────────────────
    if (action === 'terminer') {
      const { trajet_id, latitude_arrivee, longitude_arrivee, adresse_arrivee } = body
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
      const nextOrdre = lastStep ? (lastStep.ordre || 0) + 1 : 1

      let distFromPrev = 0
      if (lastStep && lastStep.latitude && lastStep.longitude && latitude_arrivee && longitude_arrivee) {
        distFromPrev = haversineKm(lastStep.latitude, lastStep.longitude, Number(latitude_arrivee), Number(longitude_arrivee))
      }

      await supabase.from('trajet_steps').insert({
        trajet_id,
        ordre: nextOrdre,
        latitude: latitude_arrivee ? Number(latitude_arrivee) : null,
        longitude: longitude_arrivee ? Number(longitude_arrivee) : null,
        adresse: adresse_arrivee || null,
        timestamp: new Date().toISOString(),
        distance_depuis_precedent: distFromPrev,
      })

      // Calculate total distance
      const { data: allSteps } = await supabase
        .from('trajet_steps')
        .select('*')
        .eq('trajet_id', trajet_id)

      const totalDist = (allSteps || []).reduce((s: number, st: any) => s + (Number(st.distance_depuis_precedent) || 0), 0)
      const roundedDist = Math.round(totalDist * 100) / 100

      // Get trajet to find employe and société for indemnity calc
      const { data: trajet } = await supabase
        .from('trajets_kilometriques')
        .select('*')
        .eq('id', trajet_id)
        .single()

      let tauxKm = 0.50 // default
      if (trajet) {
        // Get employee's société
        const { data: emp } = await supabase
          .from('employes')
          .select('*')
          .eq('id', trajet.employe_id)
          .single()

        if (emp?.societe_id) {
          // Look up parametres_km for this société + vehicle type
          const vehiculeType = trajet.vehicule_type || 'voiture'
          const { data: params } = await supabase
            .from('parametres_km')
            .select('*')
            .eq('societe_id', emp.societe_id)
            .eq('vehicule_type', vehiculeType)
            .eq('actif', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (params?.taux_km) {
            tauxKm = Number(params.taux_km)
          } else {
            // Fallback: try frais_km_rules
            const { data: rule } = await supabase
              .from('frais_km_rules')
              .select('*')
              .eq('societe_id', emp.societe_id)
              .eq('actif', true)
              .order('date_effet', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (rule?.tarif_par_km) tauxKm = Number(rule.tarif_par_km)
          }

          // Check monthly cap
          let plafond: number | null = null
          if (params?.plafond_mensuel) plafond = Number(params.plafond_mensuel)
        }
      }

      const indemnite = Math.round(roundedDist * tauxKm * 100) / 100

      // Update the trajet
      const { data: updated, error: updErr } = await supabase
        .from('trajets_kilometriques')
        .update({
          date_arrivee: new Date().toISOString(),
          latitude_arrivee: latitude_arrivee ? Number(latitude_arrivee) : null,
          longitude_arrivee: longitude_arrivee ? Number(longitude_arrivee) : null,
          adresse_arrivee: adresse_arrivee || null,
          distance_km: roundedDist,
          taux_km: tauxKm,
          indemnite,
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
          valide_par: user.id,
          valide_at: new Date().toISOString(),
        })
        .eq('id', trajet_id)
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ trajet: data, message: `Trajet ${finalStatut === 'rejete' ? 'rejeté' : 'validé'}` })
    }

    // ── Parametres km (get/set rates) ───────────────────────────────────
    if (action === 'parametres') {
      const { societe_id, vehicule_type, taux_km, plafond_mensuel, mode } = body

      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      }

      // GET mode: fetch current parameters
      if (mode === 'get' || (!taux_km && !vehicule_type)) {
        const { data: params } = await supabase
          .from('parametres_km')
          .select('*')
          .eq('societe_id', societe_id)
          .eq('actif', true)
          .order('created_at', { ascending: false })

        return NextResponse.json({ parametres: params || [] })
      }

      // SET mode: upsert rate for a vehicle type
      const vType = vehicule_type || 'voiture'

      // Deactivate existing for this type
      await supabase
        .from('parametres_km')
        .update({ actif: false })
        .eq('societe_id', societe_id)
        .eq('vehicule_type', vType)

      const { data, error } = await supabase
        .from('parametres_km')
        .insert({
          societe_id,
          vehicule_type: vType,
          taux_km: Number(taux_km),
          plafond_mensuel: plafond_mensuel ? Number(plafond_mensuel) : null,
          actif: true,
          created_by: user.id,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ parametre: data, message: `Taux ${vType} mis à jour` })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[trajets-km POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
