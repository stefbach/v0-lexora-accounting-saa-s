import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode')
    const employe_id = searchParams.get('employe_id')
    const type = searchParams.get('type')

    if (type === 'saisie' || periode) {
      let query = supabase
        .from('primes_variables_mois')
        .select('*')
        .order('created_at', { ascending: false })
      if (periode) query = query.eq('periode', `${periode}-01`)
      if (employe_id) query = query.eq('employe_id', employe_id)
      if (societe_id) {
        const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
        const ids = emps?.map(e => e.id) || []
        if (ids.length) query = query.in('employe_id', ids)
        else return NextResponse.json({ primes: [], nb: 0 })
      }
      const { data, error } = await query
      if (error) { console.error('[primes GET saisie]', error.message); throw error }

      // Enrich with employee + prime names (separate queries)
      const empIds = [...new Set((data || []).map(p => p.employe_id))]
      const primeIds = [...new Set((data || []).map(p => p.prime_id).filter(Boolean))]
      let empMap: Record<string, any> = {}
      let primeMap: Record<string, any> = {}
      if (empIds.length) {
        const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', empIds)
        for (const e of emps || []) empMap[e.id] = { nom: e.nom, prenom: e.prenom, poste: e.poste }
      }
      if (primeIds.length) {
        const { data: primes } = await supabase.from('catalogue_primes').select('id, code, libelle, type_prime').in('id', primeIds)
        for (const p of primes || []) primeMap[p.id] = { code: p.code, libelle: p.libelle, type_prime: p.type_prime }
      }

      const enriched = (data || []).map(p => ({
        ...p,
        employe: empMap[p.employe_id] || null,
        prime: primeMap[p.prime_id] || null,
      }))
      return NextResponse.json({ primes: enriched, nb: enriched.length })
    }

    // Catalogue
    let catQuery = supabase.from('catalogue_primes').select('*').order('code')
    if (societe_id) catQuery = catQuery.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    const { data, error } = await catQuery
    if (error) { console.error('[primes GET catalogue]', error.message); throw error }
    return NextResponse.json({ primes: data, nb: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    if (action === 'creer_catalogue') {
      const { code, libelle, type_prime, montant_fixe, montant_par_unite, unite, pourcentage, bonus_objectif_montant, periode_application, societe_id, postes_eligibles } = body
      if (!libelle || !type_prime) return NextResponse.json({ error: 'libelle et type_prime requis' }, { status: 400 })

      const autoCode = code || `PRM-${Date.now().toString(36).toUpperCase()}`

      // Try with new column names first, fallback to old names if column missing
      const record: Record<string, unknown> = {
        code: autoCode, libelle, actif: true,
        type_prime: type_prime || null,
        type: type_prime || null, // old column name
        montant_fixe: montant_fixe || null,
        montant_par_unite: montant_par_unite || null,
        tarif_unitaire: montant_par_unite || null, // old column name
        unite: unite || null,
        unite_libelle: unite || null, // old column name
        pourcentage: pourcentage || null,
        bonus_objectif_montant: bonus_objectif_montant || null,
        bonus_si_atteint: bonus_objectif_montant || null, // old column name
        periode_application: periode_application || 'mensuel',
        periode: periode_application || 'mensuel', // old column name
        societe_id: societe_id || null,
        postes_eligibles: postes_eligibles || null,
      }

      let { data, error } = await supabase.from('catalogue_primes').insert(record).select().single()
      if (error) {
        // Strip columns mentioned in the error and retry
        const safe = { ...record }
        const msg = error.message || ''
        for (const col of Object.keys(safe)) {
          if (msg.includes(col)) delete safe[col]
        }
        console.warn('[primes] retry without:', Object.keys(record).filter(k => !(k in safe)))
        const retry = await supabase.from('catalogue_primes').insert(safe).select().single()
        data = retry.data; error = retry.error
      }
      if (error) {
        console.error('[primes POST creer_catalogue]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ prime: data })
    }

    if (action === 'saisir') {
      const { employe_id, prime_id, periode, quantite, montant_force, notes } = body
      if (!employe_id || !prime_id || !periode) return NextResponse.json({ error: 'employe_id, prime_id, periode requis' }, { status: 400 })

      const { data: prime } = await supabase.from('catalogue_primes').select('*').eq('id', prime_id).single()
      if (!prime) return NextResponse.json({ error: 'Prime non trouvée' }, { status: 404 })

      let montant = 0
      if (montant_force) {
        montant = montant_force
      } else {
        switch (prime.type_prime) {
          case 'fixe':
            montant = prime.montant_fixe || 0
            break
          case 'variable_unitaire':
            montant = (quantite || 0) * (prime.montant_par_unite || 0)
            break
          case 'pourcentage': {
            const { data: emp } = await supabase.from('employes').select('salaire_base').eq('id', employe_id).single()
            montant = Math.round(Number(emp?.salaire_base || 0) * (Number(prime.pourcentage) / 100) * 100) / 100
            break
          }
          case 'bonus_objectif':
            montant = prime.bonus_objectif_montant || 0
            break
          case 'commission':
            montant = (quantite || 0) * (prime.montant_par_unite || 0)
            break
        }
      }

      const periodeDate = `${periode}-01`
      const { data, error } = await supabase.from('primes_variables_mois').upsert({
        employe_id, prime_id, periode: periodeDate, quantite: quantite || null,
        montant: Math.round(montant * 100) / 100,
        notes: notes || null,
        saisi_par: user.id,
        approuve: false,
        integre_paie: false,
      }, { onConflict: 'employe_id,prime_id,periode' }).select().single()
      if (error) {
        console.error('[primes POST saisir]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ prime_mois: data, montant_calcule: montant })
    }

    if (action === 'approuver') {
      const { id } = body
      const { data, error } = await supabase.from('primes_variables_mois')
        .update({ approuve: true, approuve_par: user.id, approuve_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) {
        console.error('[primes POST approuver]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ prime_mois: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[primes POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
