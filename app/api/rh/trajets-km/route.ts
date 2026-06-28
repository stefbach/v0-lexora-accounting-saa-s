import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
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

// Taux IK par défaut (MUR/km) si parametres_km absent pour la société.
// Cohérent avec le coût réel à Maurice (carburant Rs ~64/L + usure).
// Tarif par défaut WRA Maurice voiture = 16 Rs/km (cf. parametres_km).
// Utilisé si la société n'a pas configuré son propre tarif.
const DEFAULT_TAUX_KM = { voiture: 16, moto: 4, velo: 2 } as const

function tauxFromParams(params: any, vehicule: string | null | undefined): number {
  const v = (vehicule || 'voiture').toLowerCase()
  if (v === 'moto') return Number(params?.taux_moto) || DEFAULT_TAUX_KM.moto
  if (v === 'velo') return Number(params?.taux_velo) || DEFAULT_TAUX_KM.velo
  return Number(params?.taux_voiture) || DEFAULT_TAUX_KM.voiture
}

/**
 * Pont GPS → paie. Agrège les trajets VALIDÉS d'un employé pour le mois
 * de `dateTrajet` et écrit/actualise la ligne frais_km_mois (approuvée,
 * source='gps') que le moteur de paie consomme. Idempotent : recalcule
 * le total du mois à chaque appel (pas de double comptage entre trajets).
 *
 * Réconciliation : si une ligne frais_km_mois existe déjà pour
 * (employe, periode) avec une source ≠ 'gps' ET des km > 0 (saisie
 * manuelle RH), on NE l'écrase PAS — on retourne un avertissement pour
 * que le RH réconcilie, évitant tout double comptage manuel/GPS.
 */
async function syncFraisKmMoisFromTrajets(
  supabase: ReturnType<typeof getAdminClient>,
  employe_id: string,
  societe_id: string | null,
  dateTrajet: string,
): Promise<{ ok: boolean; skipped?: string; km?: number; montant?: number }> {
  const d = String(dateTrajet || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false }
  const periode = `${d.slice(0, 7)}-01`           // 1er du mois (DATE)
  const moisDebut = `${d.slice(0, 7)}-01`
  const moisFinExcl = (() => {
    const [y, m] = d.slice(0, 7).split('-').map(Number)
    const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    return `${nm}-01`
  })()

  // Taux société (fallback défaut). Lu une fois pour le mois.
  let params: any = null
  if (societe_id) {
    const { data } = await supabase.from('parametres_km').select('*').eq('societe_id', societe_id).maybeSingle()
    params = data
  }

  // Tous les trajets VALIDÉS de l'employé sur le mois.
  const { data: trajetsMois } = await supabase
    .from('trajets_kilometriques')
    .select('id, distance_totale_km, vehicule')
    .eq('employe_id', employe_id)
    .eq('statut', 'valide')
    .gte('date_trajet', moisDebut)
    .lt('date_trajet', moisFinExcl)

  const trajets = trajetsMois || []
  const totalKm = trajets.reduce((s: number, t: any) => s + (Number(t.distance_totale_km) || 0), 0)
  // Indemnité = somme(km_i × taux(véhicule_i)) → gère les mois mixtes
  // voiture/moto. tarif_applique = indemnité / km (montant est GENERATED).
  const totalIndemnite = trajets.reduce(
    (s: number, t: any) => s + (Number(t.distance_totale_km) || 0) * tauxFromParams(params, t.vehicule), 0,
  )
  const tarifEffectif = totalKm > 0 ? Math.round((totalIndemnite / totalKm) * 10000) / 10000 : 0

  // Réconciliation avec une éventuelle saisie manuelle.
  const { data: existing } = await supabase
    .from('frais_km_mois')
    .select('id, km_parcourus, source')
    .eq('employe_id', employe_id)
    .eq('periode', periode)
    .maybeSingle()

  if (existing && existing.source !== 'gps' && Number(existing.km_parcourus) > 0) {
    return { ok: false, skipped: 'saisie_manuelle_existante' }
  }

  const { error: upErr } = await supabase
    .from('frais_km_mois')
    .upsert({
      employe_id,
      periode,
      km_parcourus: Math.round(totalKm * 100) / 100,
      tarif_applique: tarifEffectif,
      approuve: true,
      source: 'gps',
    }, { onConflict: 'employe_id,periode' })
  if (upErr) {
    console.error('[trajets-km sync paie] upsert frais_km_mois:', upErr.message)
    return { ok: false }
  }

  // Traçabilité : marquer les trajets du mois intégrés à la paie.
  if (trajets.length > 0) {
    await supabase.from('trajets_kilometriques')
      .update({ integre_paie: true })
      .in('id', trajets.map((t: any) => t.id))
  }
  return { ok: true, km: Math.round(totalKm * 100) / 100, montant: Math.round(totalIndemnite * 100) / 100 }
}


// GET /api/rh/trajets-km?societe_id=...&employe_id=...&date_debut=...&date_fin=...&statut=...
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

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

    // Taux courant par société (parametres_km, fallback défaut). On
    // recalcule l'indemnité affichée au taux ACTUEL plutôt que d'utiliser
    // montant_indemnite figé au moment du "terminé" (qui pouvait avoir un
    // taux périmé). Cohérent avec ce qui part en paie.
    const societeIds = [...new Set((trajets || []).map((t: any) => t.societe_id).filter(Boolean))]
    const paramsBySociete: Record<string, any> = {}
    if (societeIds.length > 0) {
      const { data: prm } = await supabase
        .from('parametres_km').select('*').in('societe_id', societeIds)
      for (const p of prm || []) paramsBySociete[p.societe_id] = p
    }

    // Build enriched results
    const result = (trajets || []).map((t: any) => {
      const emp = empMap[t.employe_id] || {}
      const dist = Number(t.distance_totale_km) || 0
      const tx = tauxFromParams(paramsBySociete[t.societe_id], t.vehicule)
      const indemnite = Math.round(dist * tx * 100) / 100
      return {
        ...t,
        // Mapping noms DB → noms attendus par le front (sinon formatDate(undefined)
        // affiche "Invalid Date" partout et les adresses sont vides). On garde
        // aussi les originaux via `...t` pour compat ascendante.
        date_depart: t.depart_heure ?? null,
        date_arrivee: t.arrivee_heure ?? null,
        adresse_depart: t.depart_adresse ?? null,
        adresse_arrivee: t.arrivee_adresse ?? null,
        employe_nom: emp.nom || '',
        employe_prenom: emp.prenom || '',
        employe_poste: emp.poste || '',
        steps: stepsMap[t.id] || [],
        distance_km: dist,
        taux_km: tx,
        indemnite,
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
  } catch (e: any) {
    console.error('[trajets-km GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/trajets-km
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

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

      let tauxKm: number = DEFAULT_TAUX_KM.voiture // default
      if (trajet) {
        const societeId = trajet.societe_id
        const vehiculeType = trajet.vehicule || 'voiture'
        let params: any = null
        if (societeId) {
          const { data } = await supabase
            .from('parametres_km')
            .select('*')
            .eq('societe_id', societeId)
            .maybeSingle()
          params = data
        }
        tauxKm = tauxFromParams(params, vehiculeType)
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

      // Rafraîchit le montant affiché du trajet avec le taux société
      // courant (les anciens trajets pouvaient avoir un taux périmé).
      if (data?.id && finalStatut !== 'rejete') {
        let prm: any = null
        if (data.societe_id) {
          const { data: p } = await supabase.from('parametres_km').select('*').eq('societe_id', data.societe_id).maybeSingle()
          prm = p
        }
        const tx = tauxFromParams(prm, data.vehicule)
        const dist = Number(data.distance_totale_km) || 0
        await supabase.from('trajets_kilometriques')
          .update({ taux_km_applique: tx, montant_indemnite: Math.round(dist * tx * 100) / 100 })
          .eq('id', data.id)
      }

      // Pont GPS → paie : recalcule le total km validé du mois et
      // l'écrit dans frais_km_mois (que la paie lit). Appelé que le
      // trajet soit validé OU rejeté → un rejet retire ses km du total.
      let paieSync: { ok: boolean; skipped?: string; km?: number; montant?: number } | null = null
      if (data?.employe_id && data?.date_trajet) {
        paieSync = await syncFraisKmMoisFromTrajets(
          supabase, data.employe_id, data.societe_id, data.date_trajet,
        )
      }

      const baseMsg = `Trajet ${finalStatut === 'rejete' ? 'rejeté' : 'validé'}`
      const message = paieSync?.skipped === 'saisie_manuelle_existante'
        ? `${baseMsg}. ⚠ Saisie manuelle de frais km déjà présente ce mois — non écrasée, à réconcilier.`
        : paieSync?.ok
          ? `${baseMsg}. Paie mise à jour : ${paieSync.km} km ce mois (${paieSync.montant} MUR).`
          : baseMsg
      return NextResponse.json({ trajet: data, message, paie_sync: paieSync })
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
  } catch (e: any) {
    console.error('[trajets-km POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
