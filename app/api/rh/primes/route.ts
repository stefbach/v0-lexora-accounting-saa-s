import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveOwnership } from '@/lib/rh/ownership'

export const dynamic = 'force-dynamic'

/**
 * Renvoie un client admin (service_role, bypasse RLS) si la clé est
 * configurée. Sinon `null` — l'appelant doit alors retomber sur le
 * client utilisateur (authentifié JWT) pour éviter les requêtes
 * silencieusement bloquées par la RLS.
 */
function getAdminClient(): ReturnType<typeof createClient> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) {
    console.error('[primes] SUPABASE_SERVICE_ROLE_KEY ou URL manquante — fallback sur client auth user')
    return null
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Fallback : si pas de service_role_key, on utilise le client auth user.
    // L'admin/RH passe la RLS grâce à son JWT.
    const supabase = getAdminClient() ?? supabaseAuth
    const usingAdminClient = getAdminClient() !== null
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode')
    let employe_id = searchParams.get('employe_id')
    const type = searchParams.get('type')

    // P0 Sécurité — ownership check
    const ownership = await resolveOwnership(supabase, user.id)
    if (!ownership.isRH) {
      if (employe_id && ownership.employe_id && employe_id !== ownership.employe_id) {
        return NextResponse.json({ error: 'Accès refusé — vous ne pouvez voir que vos propres primes.' }, { status: 403 })
      }
      if (!employe_id && ownership.employe_id) employe_id = ownership.employe_id
    }

    if (type === 'saisie' || periode) {
      let query = supabase
        .from('primes_variables_mois')
        .select('*')
        .order('created_at', { ascending: false })
      if (periode) query = query.eq('periode', `${periode}-01`)
      if (employe_id) query = query.eq('employe_id', employe_id)
      if (societe_id) {
        // FIX (mai 2026) — ne pas exclure les employés partis : les primes
        // déjà saisies/intégrées dans la paie du mois en cours doivent
        // rester visibles même après la confirmation du départ. Avant on
        // filtrait actif=true + date_depart IS NULL, ce qui cachait les
        // primes des départs récents et créait l'impression "0 primes".
        const { data: emps } = await supabase.from('employes').select('id')
          .eq('societe_id', societe_id)
        const ids = emps?.map(e => e.id) || []
        console.log(`[primes GET saisie] periode=${periode} societe=${societe_id} → ${ids.length} employes`)
        if (ids.length) query = query.in('employe_id', ids)
        else return NextResponse.json({ primes: [], nb: 0 })
      }
      const { data, error } = await query
      if (error) { console.error('[primes GET saisie]', error.message); throw error }
      console.log(`[primes GET saisie] periode=${periode} societe=${societe_id || 'all'} → ${data?.length || 0} primes`)

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
      return NextResponse.json({
        primes: enriched,
        nb: enriched.length,
        _debug: {
          using_admin_client: usingAdminClient,
          user_role: ownership.role,
          is_rh: ownership.isRH,
          nb_employes_societe: societe_id ? 'computed' : 'not_filtered',
        },
      })
    }

    // Catalogue
    let catQuery = supabase.from('catalogue_primes').select('*').order('code')
    if (societe_id) catQuery = catQuery.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    const { data, error } = await catQuery
    if (error) { console.error('[primes GET catalogue]', error.message); throw error }
    return NextResponse.json({ primes: data, nb: data?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Même fallback que GET : si pas de service_role, on utilise le JWT user.
    const supabase = getAdminClient() ?? supabaseAuth
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

    // Sprint 11 BUG 2 — résout l'employe_id du user connecté pour alimenter
    // les colonnes saisi_par / approuve_par (FK vers employes(id), mig 017).
    // Avant : on envoyait user.id (auth.users) → violation FK 23503.
    // Si l'utilisateur connecté n'est pas lié à un employe (admin/comptable
    // externe), on envoie null — la colonne est nullable.
    const resolveEmployeId = async (): Promise<string | null> => {
      try {
        const { data: profile } = await supabase
          .from('profiles').select('employe_id').eq('id', user.id).maybeSingle()
        if (profile?.employe_id) return profile.employe_id
      } catch (e: any) {
        console.warn('[primes] resolveEmployeId profiles lookup failed:', e?.message || e)
      }
      // Fallback : regarder directement employes.auth_user_id (mig 108)
      try {
        const { data: emp } = await supabase
          .from('employes').select('id').eq('auth_user_id', user.id).maybeSingle()
        if (emp?.id) return emp.id
      } catch (e: any) {
        console.warn('[primes] resolveEmployeId employes fallback failed:', e?.message || e)
      }
      return null
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
      const saisiParEmpId = await resolveEmployeId()
      const { data, error } = await supabase.from('primes_variables_mois').upsert({
        employe_id, prime_id, periode: periodeDate, quantite: quantite || null,
        montant: Math.round(montant * 100) / 100,
        notes: notes || null,
        saisi_par: saisiParEmpId,
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
      const approuveParEmpId = await resolveEmployeId()
      const { data, error } = await supabase.from('primes_variables_mois')
        .update({ approuve: true, approuve_par: approuveParEmpId, approuve_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) {
        console.error('[primes POST approuver]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ prime_mois: data })
    }

    // ═══════════════════════════════════════════
    // ACTION: import_excel (bulk import primes from Excel)
    // Body: { societe_id, periode (YYYY-MM), prime_id, rows: [{ nom, prenom, montant, quantite?, notes? }] }
    // Auto-matches employee by fuzzy name (nom + prenom)
    // ═══════════════════════════════════════════
    if (action === 'import_excel') {
      const { societe_id, periode, prime_id, rows } = body
      if (!societe_id || !periode || !prime_id || !Array.isArray(rows)) {
        return NextResponse.json({ error: 'societe_id, periode, prime_id et rows requis' }, { status: 400 })
      }

      // Fetch all employees of the societe for matching
      // Sprint 5 FIX 1 — exclure employés partis de l'import (un ancien salarié
      // ne doit pas recevoir de prime variable ; garder seulement les actifs).
      const { data: employes } = await supabase.from('employes')
        .select('id, nom, prenom, code, common_name')
        .eq('societe_id', societe_id)
        .eq('actif', true)
        .is('date_depart', null)
      if (!employes || employes.length === 0) {
        return NextResponse.json({ error: 'Aucun employe trouve pour cette societe' }, { status: 404 })
      }

      // Normalize function: lowercase, strip accents, remove punctuation
      const normalize = (s: string) => (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      // Simple Levenshtein distance
      const levenshtein = (a: string, b: string): number => {
        if (a === b) return 0
        if (!a.length) return b.length
        if (!b.length) return a.length
        const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0))
        for (let i = 0; i <= a.length; i++) dp[i][0] = i
        for (let j = 0; j <= b.length; j++) dp[0][j] = j
        for (let i = 1; i <= a.length; i++) {
          for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i-1] === b[j-1]
              ? dp[i-1][j-1]
              : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1])
          }
        }
        return dp[a.length][b.length]
      }

      // Match helper: find best employee match for a row
      const findMatch = (searchName: string) => {
        const normSearch = normalize(searchName)
        if (!normSearch) return null
        let best: any = null
        let bestScore = Infinity
        for (const emp of employes) {
          const candidates = [
            normalize(`${emp.prenom || ''} ${emp.nom || ''}`),
            normalize(`${emp.nom || ''} ${emp.prenom || ''}`),
            normalize(emp.common_name || ''),
            normalize(emp.code || ''),
          ].filter(Boolean)
          for (const cand of candidates) {
            // Exact match wins
            if (cand === normSearch) return { emp, score: 0 }
            // Contains match
            if (cand.includes(normSearch) || normSearch.includes(cand)) {
              if (bestScore > 1) { best = emp; bestScore = 1 }
              continue
            }
            const dist = levenshtein(cand, normSearch)
            const maxLen = Math.max(cand.length, normSearch.length)
            const ratio = dist / maxLen
            if (ratio < 0.3 && dist < bestScore) {
              best = emp; bestScore = dist
            }
          }
        }
        return best ? { emp: best, score: bestScore } : null
      }

      const periodeDate = `${periode}-01`
      const imported: any[] = []
      const unmatched: any[] = []
      const errors: string[] = []

      for (const row of rows) {
        const searchName = row.nom_complet || `${row.prenom || ''} ${row.nom || ''}`.trim() || row.nom || row.name || row.employee
        if (!searchName) {
          errors.push(`Ligne sans nom: ${JSON.stringify(row).slice(0, 80)}`)
          continue
        }
        const match = findMatch(searchName)
        if (!match) {
          unmatched.push({ searchName, row })
          continue
        }
        const montant = Number(row.montant || row.amount || row.prime || 0)
        if (montant <= 0) {
          errors.push(`${searchName}: montant invalide (${row.montant})`)
          continue
        }
        try {
          // Check if a row already exists (to avoid upsert conflict issues if UNIQUE constraint missing)
          const { data: existing } = await supabase.from('primes_variables_mois')
            .select('id').eq('employe_id', match.emp.id).eq('prime_id', prime_id).eq('periode', periodeDate).maybeSingle()

          const payload: any = {
            employe_id: match.emp.id,
            prime_id,
            periode: periodeDate,
            quantite: row.quantite ? Number(row.quantite) : null,
            montant: Math.round(montant * 100) / 100,
            notes: row.notes || `Import Excel - ${new Date().toLocaleDateString('fr-FR')}`,
            approuve: false,
            integre_paie: false,
          }

          let data: any = null, error: any = null
          if (existing) {
            const r = await supabase.from('primes_variables_mois').update(payload).eq('id', existing.id).select().single()
            data = r.data; error = r.error
          } else {
            const r = await supabase.from('primes_variables_mois').insert(payload).select().single()
            data = r.data; error = r.error
          }

          if (error) {
            errors.push(`${searchName}: ${error.message}`)
          } else {
            imported.push({ ...data, employe_nom: `${match.emp.prenom} ${match.emp.nom}`, match_score: match.score })
          }
        } catch (e: any) {
          errors.push(`${searchName}: ${e.message}`)
        }
      }

      return NextResponse.json({
        imported,
        unmatched,
        errors,
        summary: {
          total: rows.length,
          matched: imported.length,
          unmatched: unmatched.length,
          failed: errors.length,
        }
      })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    console.error('[primes POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
