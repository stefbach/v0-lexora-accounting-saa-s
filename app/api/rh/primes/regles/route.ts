import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { lastDayOfMonth } from '@/lib/rh/period'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Parse AI description into structured prime rule
function parseDescription(description: string): {
  nom: string
  type: string
  montant: number
  taux: number
  scope: string
  scope_value: string | null
  conditions: Record<string, unknown>
  periode: string
  plafond: number | null
} {
  const desc = description.toLowerCase()
  let nom = description.split(':')[0]?.trim() || description.slice(0, 60)
  let type = 'fixe'
  let montant = 0
  let taux = 0
  let scope: string = 'tous'
  let scope_value: string | null = null
  let conditions: Record<string, unknown> = {}
  let periode = 'mensuel'
  let plafond: number | null = null

  // Detect type from description
  if (desc.includes('anciennet') || desc.includes('par ann')) {
    type = 'par_anciennete'
  } else if (desc.includes('assiduit') || desc.includes('absence')) {
    type = 'assiduite'
  } else if (desc.includes('% du salaire') || desc.includes('pourcentage') || desc.includes('pourcent')) {
    type = 'pourcentage'
  } else if (desc.includes('par heure') || desc.includes('heure travail')) {
    type = 'par_heure'
  } else if (desc.includes('par jour') || desc.includes('jour travail')) {
    type = 'par_jour'
  } else if (desc.includes('objectif') || desc.includes('performance') || desc.includes('atteint') || desc.includes('depass')) {
    type = 'objectif'
  }

  // Extract amounts: look for "Rs X" or "MUR X" or just numbers with context
  const rsMatch = description.match(/(?:Rs|MUR|rs)\s*([\d\s,.]+)/g)
  if (rsMatch) {
    const amounts = rsMatch.map(m => {
      const num = m.replace(/(?:Rs|MUR|rs)\s*/, '').replace(/\s/g, '').replace(',', '.')
      return parseFloat(num)
    }).filter(n => !isNaN(n))
    if (amounts.length > 0) montant = amounts[0]
    if (amounts.length > 1 && type === 'assiduite') {
      conditions = { ...conditions, montant_reduit: amounts[1] }
    }
  }

  // Extract percentage
  const pctMatch = description.match(/([\d,.]+)\s*%/)
  if (pctMatch) {
    taux = parseFloat(pctMatch[1].replace(',', '.'))
    if (type === 'objectif' && description.match(/([\d,.]+)\s*%.*?([\d,.]+)\s*%/)) {
      const allPcts = [...description.matchAll(/([\d,.]+)\s*%/g)]
      if (allPcts.length >= 2) {
        taux = parseFloat(allPcts[0][1].replace(',', '.'))
        conditions = { ...conditions, taux_depasse: parseFloat(allPcts[1][1].replace(',', '.')) }
      }
    }
    if (type === 'fixe' && (desc.includes('salaire') || desc.includes('base'))) {
      type = 'pourcentage'
    }
  }

  // Extract scope
  const groupMatch = description.match(/groupe\s+(\w+)/i)
  if (groupMatch) {
    scope = 'groupe'
    scope_value = groupMatch[1]
  }
  const deptMatch = description.match(/d[ée]partement\s+(\w+)/i)
  if (deptMatch) {
    scope = 'departement'
    scope_value = deptMatch[1]
  }

  // Extract conditions
  const absenceMatch = description.match(/(\d+)\s*(?:jours?\s*)?absence/i)
  if (absenceMatch) {
    conditions = { ...conditions, max_absences: parseInt(absenceMatch[1]) }
  }
  const ancienMatch = description.match(/(\d+)\s*ann[ée]e/i)
  if (ancienMatch && type !== 'par_anciennete') {
    conditions = { ...conditions, min_anciennete: parseInt(ancienMatch[1]) }
  }

  // Extract max/plafond
  const maxMatch = description.match(/max(?:imum)?\s*(?:Rs|MUR)?\s*([\d\s,.]+)/i)
  if (maxMatch) {
    plafond = parseFloat(maxMatch[1].replace(/\s/g, '').replace(',', '.'))
  }

  // Extract period
  if (desc.includes('trimestriel') || desc.includes('trimestre')) periode = 'trimestriel'
  if (desc.includes('annuel') || desc.includes('an ')) periode = 'annuel'

  // For assiduite, extract absence threshold
  if (type === 'assiduite') {
    const zeroAbs = desc.includes('0 absence')
    if (zeroAbs) conditions = { ...conditions, max_absences: 0 }
    const leqMatch = description.match(/[<≤]\s*(\d+)\s*jour/i)
    if (leqMatch) conditions = { ...conditions, seuil_absences_reduit: parseInt(leqMatch[1]) }
  }

  // For group-specific amounts in description
  const groupAmounts = [...description.matchAll(/(?:Rs|MUR)\s*([\d,.]+)\s*(?:pour\s+(?:le\s+)?)?(?:groupe\s+)?(\w+)/gi)]
  if (groupAmounts.length > 1) {
    const montants_par_groupe: Record<string, number> = {}
    for (const ga of groupAmounts) {
      const val = parseFloat(ga[1].replace(',', '.'))
      const grp = ga[2]
      if (!isNaN(val) && grp) montants_par_groupe[grp] = val
    }
    if (Object.keys(montants_par_groupe).length > 1) {
      conditions = { ...conditions, montants_par_groupe }
    }
  }

  return { nom, type, montant, taux, scope, scope_value, conditions, periode, plafond }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const supabase = getAdminClient()

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const include_calculs = searchParams.get('include_calculs')
    const periode = searchParams.get('periode')

    // List prime rules
    let query = supabase.from('regles_primes').select('*').order('created_at', { ascending: false })
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data: reglesRaw, error } = await query
    if (error) throw error
    // Restore original_type from conditions if fallback was used
    const regles = (reglesRaw || []).map((r: any) => ({
      ...r,
      type: r.conditions?.original_type || r.type,
    }))

    let calculs: unknown[] = []
    if (include_calculs && periode && societe_id) {
      const { data: c } = await supabase.from('calculs_primes')
        .select('*, employe:employes(nom,prenom,poste,groupe), regle:regles_primes(nom,type)')
        .eq('societe_id', societe_id)
        .eq('periode', periode)
        .order('created_at', { ascending: false })
      calculs = c || []
    }

    return NextResponse.json({ regles: regles || [], calculs, nb: regles?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const supabase = getAdminClient()

    const body = await request.json()
    const { action } = body

    // ═══════════════════════════════════════════
    // ACTION: parse_description (AI parsing)
    // ═══════════════════════════════════════════
    if (action === 'parse_description') {
      const { description } = body
      if (!description) return NextResponse.json({ error: 'Description requise' }, { status: 400 })
      const parsed = parseDescription(description)
      return NextResponse.json({ parsed, description_originale: description })
    }

    // ═══════════════════════════════════════════
    // ACTION: creer_regle
    // ═══════════════════════════════════════════
    if (action === 'creer_regle') {
      const { societe_id, nom, description, type, montant, taux, scope, scope_value, conditions, periode, plafond } = body
      if (!societe_id || !nom || !type) {
        return NextResponse.json({ error: 'societe_id, nom et type requis' }, { status: 400 })
      }

      // Try insert with the real type first
      let insertPayload: any = {
        societe_id,
        nom,
        description: description || null,
        type,
        montant: montant || 0,
        taux: taux || 0,
        scope: scope || 'tous',
        scope_value: scope_value || null,
        conditions: { ...(conditions || {}), original_type: type },
        periode: periode || 'mensuel',
        plafond: plafond || null,
        actif: true,
      }

      let { data, error } = await supabase.from('regles_primes').insert(insertPayload).select().single()

      // If CHECK constraint fails (migration 118 not applied), fallback:
      // store the real type in conditions.original_type and use 'fixe' as DB type
      if (error && (error.message?.includes('check') || error.code === '23514')) {
        insertPayload.type = 'fixe'
        const retry = await supabase.from('regles_primes').insert(insertPayload).select().single()
        data = retry.data
        error = retry.error
      }

      if (error) {
        console.error('[regles_primes] insert error:', error.message)
        return NextResponse.json({ error: `Erreur DB: ${error.message}` }, { status: 500 })
      }
      return NextResponse.json({ regle: data })
    }

    // ═══════════════════════════════════════════
    // ACTION: modifier_regle
    // ═══════════════════════════════════════════
    if (action === 'modifier_regle') {
      const { id, ...updates } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const allowedFields = ['nom', 'description', 'type', 'montant', 'taux', 'scope', 'scope_value', 'conditions', 'periode', 'plafond', 'actif']
      const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const key of allowedFields) {
        if (updates[key] !== undefined) filtered[key] = updates[key]
      }
      const { data, error } = await supabase.from('regles_primes').update(filtered).eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ regle: data })
    }

    // ═══════════════════════════════════════════
    // ACTION: supprimer_regle
    // ═══════════════════════════════════════════
    if (action === 'supprimer_regle') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase.from('regles_primes').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // ═══════════════════════════════════════════
    // ACTION: calculer (calculate primes for a period)
    // ═══════════════════════════════════════════
    if (action === 'calculer') {
      const { societe_id, periode } = body
      if (!societe_id || !periode) {
        return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
      }

      // Fetch active rules for this company
      const { data: regles } = await supabase.from('regles_primes')
        .select('*').eq('societe_id', societe_id).eq('actif', true)
      if (!regles || regles.length === 0) {
        return NextResponse.json({ calculs: [], message: 'Aucune regle active' })
      }

      // Fetch employees
      const { data: employes } = await supabase.from('employes')
        .select('*').eq('societe_id', societe_id).is('date_depart', null)
      if (!employes || employes.length === 0) {
        return NextResponse.json({ calculs: [], message: 'Aucun employe actif' })
      }

      // Fetch attendance data for the period (for assiduite rules)
      const periodeStr = periode.slice(0, 7)
      const { data: pointages } = await supabase.from('pointages')
        .select('employe_id, date_pointage, heure_entree, absent_justifie')
        .gte('date_pointage', `${periodeStr}-01`)
        .lte('date_pointage', lastDayOfMonth(periodeStr))
        .in('employe_id', employes.map(e => e.id))

      // Fetch approved leave
      const { data: conges } = await supabase.from('demandes_conges')
        .select('employe_id, date_debut, date_fin')
        .eq('statut', 'approuve')
        .gte('date_debut', `${periodeStr}-01`)
        .lte('date_fin', lastDayOfMonth(periodeStr))
        .in('employe_id', employes.map(e => e.id))

      // Build absence counts per employee
      const absencesMap: Record<string, number> = {}
      for (const emp of employes) {
        const empPointages = (pointages || []).filter(p => p.employe_id === emp.id)
        let absences = 0
        for (const pt of empPointages) {
          const day = new Date(pt.date_pointage + 'T12:00:00').getDay()
          if (day === 0 || day === 6) continue
          const enConge = (conges || []).some(c =>
            c.employe_id === emp.id && pt.date_pointage >= c.date_debut && pt.date_pointage <= c.date_fin
          )
          if (!pt.heure_entree && !enConge && pt.absent_justifie !== true) absences++
        }
        absencesMap[emp.id] = absences
      }

      // Calculate primes
      const calculResults: Array<{
        regle_prime_id: string
        employe_id: string
        societe_id: string
        periode: string
        montant_calcule: number
        details: Record<string, unknown>
        statut: string
      }> = []

      for (const regle of regles) {
        for (const emp of employes) {
          // Check scope
          if (regle.scope === 'groupe' && regle.scope_value) {
            if ((emp.groupe || emp.poste || '').toLowerCase() !== regle.scope_value.toLowerCase()) continue
          }
          if (regle.scope === 'departement' && regle.scope_value) {
            if ((emp.departement || '').toLowerCase() !== regle.scope_value.toLowerCase()) continue
          }
          if (regle.scope === 'individuel' && regle.scope_value) {
            if (emp.id !== regle.scope_value) continue
          }

          // Check conditions
          const cond = regle.conditions || {}
          const dateEmbauche = emp.date_embauche ? new Date(emp.date_embauche) : null
          const now = new Date()
          const anciennete = dateEmbauche
            ? Math.floor((now.getTime() - dateEmbauche.getTime()) / (365.25 * 24 * 3600 * 1000))
            : 0

          if (cond.min_anciennete && anciennete < cond.min_anciennete) continue

          const absences = absencesMap[emp.id] || 0

          // Calculate amount based on type
          let montant = 0
          const details: Record<string, unknown> = { type: regle.type, regle_nom: regle.nom }

          switch (regle.type) {
            case 'fixe':
              montant = Number(regle.montant) || 0
              // Check group-specific amounts
              if (cond.montants_par_groupe && (emp.groupe || emp.poste)) {
                const grpKey = Object.keys(cond.montants_par_groupe).find(
                  k => k.toLowerCase() === (emp.groupe || emp.poste || '').toLowerCase()
                )
                if (grpKey) montant = cond.montants_par_groupe[grpKey]
              }
              details.base = 'montant_fixe'
              break

            case 'pourcentage':
              montant = Math.round(Number(emp.salaire_base) * (Number(regle.taux) / 100) * 100) / 100
              details.salaire_base = emp.salaire_base
              details.taux = regle.taux
              break

            case 'par_heure': {
              // Count hours worked after a threshold (e.g., night hours after 20h)
              const empPts = (pointages || []).filter(p => p.employe_id === emp.id && p.heure_entree)
              const heures = empPts.length * (cond.heures_par_jour || 1)
              montant = heures * (Number(regle.montant) || 0)
              details.heures = heures
              break
            }

            case 'par_jour': {
              const empPts = (pointages || []).filter(p => p.employe_id === emp.id && p.heure_entree)
              montant = empPts.length * (Number(regle.montant) || 0)
              details.jours = empPts.length
              break
            }

            case 'par_anciennete':
              montant = anciennete * (Number(regle.montant) || 0)
              details.anciennete = anciennete
              details.montant_par_annee = regle.montant
              break

            case 'assiduite': {
              const maxAbs = cond.max_absences ?? 0
              if (absences <= maxAbs) {
                montant = Number(regle.montant) || 0
              } else if (cond.seuil_absences_reduit && absences <= cond.seuil_absences_reduit && cond.montant_reduit) {
                montant = Number(cond.montant_reduit)
                details.montant_reduit = true
              } else {
                montant = 0
              }
              details.absences = absences
              details.seuil = maxAbs
              break
            }

            case 'objectif':
              // Objective-based primes require manual validation
              // Set base amount, manager will adjust
              montant = Number(regle.montant) || 0
              if (regle.taux > 0) {
                montant = Math.round(Number(emp.salaire_base) * (Number(regle.taux) / 100) * 100) / 100
              }
              details.validation_requise = true
              break
          }

          // Apply plafond
          if (regle.plafond && montant > Number(regle.plafond)) {
            details.plafond_applique = true
            details.montant_avant_plafond = montant
            montant = Number(regle.plafond)
          }

          montant = Math.round(montant * 100) / 100

          if (montant > 0 || regle.type === 'objectif') {
            calculResults.push({
              regle_prime_id: regle.id,
              employe_id: emp.id,
              societe_id,
              periode: periodeStr,
              montant_calcule: montant,
              details,
              statut: 'calcule',
            })
          }
        }
      }

      // Delete previous calculations for this period and insert new ones
      await supabase.from('calculs_primes')
        .delete()
        .eq('societe_id', societe_id)
        .eq('periode', periodeStr)
        .eq('statut', 'calcule')

      if (calculResults.length > 0) {
        const { error } = await supabase.from('calculs_primes').insert(calculResults)
        if (error) throw error
      }

      // Fetch with employee info
      const { data: calculsWithInfo } = await supabase.from('calculs_primes')
        .select('*, employe:employes(nom,prenom,poste,groupe), regle:regles_primes(nom,type)')
        .eq('societe_id', societe_id)
        .eq('periode', periodeStr)
        .order('created_at', { ascending: false })

      const total = (calculsWithInfo || []).reduce((s, c) => s + Number(c.montant_calcule || 0), 0)

      return NextResponse.json({
        calculs: calculsWithInfo || [],
        nb: calculsWithInfo?.length || 0,
        total: Math.round(total * 100) / 100,
      })
    }

    // ═══════════════════════════════════════════
    // ACTION: valider (mark calculated primes as validated)
    // ═══════════════════════════════════════════
    if (action === 'valider') {
      const { societe_id, periode, ids } = body
      if (!societe_id || !periode) {
        return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
      }

      let query = supabase.from('calculs_primes')
        .update({
          statut: 'valide',
          valide_par: user.id,
          valide_at: new Date().toISOString(),
        })
        .eq('societe_id', societe_id)
        .eq('periode', periode)
        .eq('statut', 'calcule')

      if (ids && ids.length > 0) {
        query = query.in('id', ids)
      }

      const { data, error } = await query.select()
      if (error) throw error
      return NextResponse.json({ valides: data, nb: data?.length || 0 })
    }

    // ═══════════════════════════════════════════
    // ACTION: integrer_paie (create primes_variables_mois entries)
    // ═══════════════════════════════════════════
    if (action === 'integrer_paie') {
      const { societe_id, periode } = body
      if (!societe_id || !periode) {
        return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
      }

      // Fetch validated calculations
      const { data: calculs } = await supabase.from('calculs_primes')
        .select('*, regle:regles_primes(nom,type)')
        .eq('societe_id', societe_id)
        .eq('periode', periode)
        .eq('statut', 'valide')

      if (!calculs || calculs.length === 0) {
        return NextResponse.json({ error: 'Aucune prime validee a integrer' }, { status: 400 })
      }

      // Group by employee: sum all primes
      const parEmploye: Record<string, { total: number; details: string[] }> = {}
      for (const c of calculs) {
        if (!parEmploye[c.employe_id]) parEmploye[c.employe_id] = { total: 0, details: [] }
        parEmploye[c.employe_id].total += Number(c.montant_calcule)
        parEmploye[c.employe_id].details.push(`${c.regle?.nom}: ${c.montant_calcule} MUR`)
      }

      // Find or create a "Primes auto" catalogue entry
      let { data: primeAuto } = await supabase.from('catalogue_primes')
        .select('id').eq('code', 'PRM-AUTO-REGLES').maybeSingle()

      if (!primeAuto) {
        const { data: created } = await supabase.from('catalogue_primes').insert({
          code: 'PRM-AUTO-REGLES',
          libelle: 'Primes automatiques (regles)',
          type_prime: 'fixe',
          montant_fixe: 0,
          periode_application: 'mensuel',
          actif: true,
          societe_id: null,
        }).select().single()
        primeAuto = created
      }

      if (!primeAuto) {
        return NextResponse.json({ error: 'Impossible de creer la prime catalogue' }, { status: 500 })
      }

      const periodeDate = `${periode}-01`
      const inserted = []

      for (const [employe_id, info] of Object.entries(parEmploye)) {
        const montant = Math.round(info.total * 100) / 100
        const notes = info.details.join(' | ')

        const { data, error } = await supabase.from('primes_variables_mois').upsert({
          employe_id,
          prime_id: primeAuto.id,
          periode: periodeDate,
          montant,
          notes,
          saisi_par: user.id,
          approuve: true,
          approuve_par: user.id,
          approuve_at: new Date().toISOString(),
          integre_paie: false,
        }, { onConflict: 'employe_id,prime_id,periode' }).select().single()

        if (!error && data) inserted.push(data)
      }

      // Mark calculations as integrated
      await supabase.from('calculs_primes')
        .update({ statut: 'integre', integre_at: new Date().toISOString() })
        .eq('societe_id', societe_id)
        .eq('periode', periode)
        .eq('statut', 'valide')

      return NextResponse.json({
        integres: inserted,
        nb: inserted.length,
        total: inserted.reduce((s, i) => s + Number(i.montant || 0), 0),
      })
    }

    // ═══════════════════════════════════════════
    // ACTION: historique
    // ═══════════════════════════════════════════
    if (action === 'historique') {
      const { societe_id, nb_mois } = body
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      const { data, error } = await supabase.from('calculs_primes')
        .select('*, employe:employes(nom,prenom,poste,departement,groupe), regle:regles_primes(nom,type)')
        .eq('societe_id', societe_id)
        .in('statut', ['valide', 'integre'])
        .order('periode', { ascending: false })
        .limit(nb_mois ? nb_mois * 100 : 500)

      if (error) throw error

      // Group by period
      const parPeriode: Record<string, { total: number; count: number; calculs: unknown[] }> = {}
      for (const c of data || []) {
        if (!parPeriode[c.periode]) parPeriode[c.periode] = { total: 0, count: 0, calculs: [] }
        parPeriode[c.periode].total += Number(c.montant_calcule || 0)
        parPeriode[c.periode].count++
        parPeriode[c.periode].calculs.push(c)
      }

      // Group by type
      const parType: Record<string, number> = {}
      for (const c of data || []) {
        const typeName = c.regle?.type || 'autre'
        parType[typeName] = (parType[typeName] || 0) + Number(c.montant_calcule || 0)
      }

      return NextResponse.json({ historique: parPeriode, par_type: parType, total_records: data?.length || 0 })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
