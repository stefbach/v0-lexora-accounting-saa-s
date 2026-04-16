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

/** Mauritius fixed public holidays (same dates every year) */
function getFixedHolidays(annee: number) {
  return [
    { date: `${annee}-01-01`, libelle: 'Nouvel An', type_jour: 'fixe' },
    { date: `${annee}-01-02`, libelle: 'Nouvel An (2e jour)', type_jour: 'fixe' },
    { date: `${annee}-02-01`, libelle: 'Abolition de l\'esclavage', type_jour: 'fixe' },
    { date: `${annee}-03-12`, libelle: 'Fête nationale', type_jour: 'fixe' },
    { date: `${annee}-05-01`, libelle: 'Fête du travail', type_jour: 'fixe' },
    { date: `${annee}-08-15`, libelle: 'Assomption', type_jour: 'fixe' },
    { date: `${annee}-11-01`, libelle: 'Toussaint', type_jour: 'fixe' },
    { date: `${annee}-12-25`, libelle: 'Noël', type_jour: 'fixe' },
  ]
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const annee = searchParams.get('annee') || new Date().getFullYear().toString()
    const societe_id = searchParams.get('societe_id')

    let query = supabase
      .from('jours_feries')
      .select('*')
      .gte('date', `${annee}-01-01`)
      .lte('date', `${annee}-12-31`)
      .order('date')

    if (societe_id) {
      query = query.eq('societe_id', societe_id)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ jours_feries: data || [], annee })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    // Check role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const allowedRoles = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
    if (!profile || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    // ---- CREATE ----
    // Sprint 6 FIX 1 — le frontend envoie type_jour='custom' pour les jours
    // personnalisés société, mais la CHECK constraint DB (mig 105) n'autorise
    // QUE 'fixe' ou 'variable' → INSERT en 500. On normalise :
    //   - type_jour='custom' + societe_id NULL → 'variable' (fallback)
    //   - type_jour='custom' + societe_id != NULL → 'variable'
    //     (la nature custom est portée par societe_id, pas par type_jour)
    //   - autres valeurs non autorisées → 'variable' par défaut.
    // Du coup le badge UI se calcule ensuite à partir de (societe_id, date)
    // et non plus de type_jour seul (voir FIX 2).
    if (action === 'creer') {
      const { date, libelle, societe_id, travail_autorise, majoration_pct } = body
      let { type_jour } = body
      if (!date || !libelle) {
        return NextResponse.json({ error: 'Date et libellé requis' }, { status: 400 })
      }
      // Normalisation type_jour pour respecter la CHECK constraint DB
      if (type_jour !== 'fixe' && type_jour !== 'variable') {
        type_jour = 'variable'
      }

      const annee = new Date(date).getFullYear()
      const insertRow: Record<string, unknown> = {
        date,
        libelle,
        type_jour,
        societe_id: societe_id || null,
        annee,
        pays: 'MU',
      }
      // Colonnes optionnelles (mig 139) — best-effort, retombe sans si absentes
      if (travail_autorise !== undefined) insertRow.travail_autorise = !!travail_autorise
      if (majoration_pct !== undefined) {
        const pct = Number(majoration_pct)
        if (Number.isFinite(pct) && pct >= 0 && pct <= 1000) insertRow.majoration_pct = pct
      }

      const { data, error } = await supabase.from('jours_feries').insert(insertRow).select().single()

      if (error) {
        console.error('[jours-feries POST creer] insert error:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        })
        // Doublon UNIQUE(date, societe_id) — mig 139
        if (error.code === '23505' || /duplicate|already exists|unique/i.test(error.message)) {
          return NextResponse.json({
            error: 'Un jour férié existe déjà pour cette date' + (societe_id ? ' et cette société' : ' (national Maurice)') + '.',
          }, { status: 409 })
        }
        // Colonne manquante (mig 139 pas appliquée)
        if (error.code === '42703' && /travail_autorise|majoration_pct/.test(error.message)) {
          // Retry sans les colonnes optionnelles
          delete insertRow.travail_autorise
          delete insertRow.majoration_pct
          const retry = await supabase.from('jours_feries').insert(insertRow).select().single()
          if (retry.error) {
            return NextResponse.json({ error: `Erreur insertion (retry) : ${retry.error.message}`, code: retry.error.code }, { status: 500 })
          }
          return NextResponse.json({ success: true, jour_ferie: retry.data, warning: 'Migration 139 non appliquée — colonnes travail_autorise/majoration_pct ignorées' })
        }
        return NextResponse.json({
          error: `Erreur insertion : ${error.message}${error.hint ? ` (${error.hint})` : ''}`,
          code: error.code,
        }, { status: 500 })
      }
      return NextResponse.json({ success: true, jour_ferie: data })
    }

    // ---- DELETE ----
    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const { error } = await supabase.from('jours_feries').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ---- UPDATE (Sprint 4 TÂCHE 3 — toggle travail_autorise + majoration) ----
    if (action === 'modifier') {
      const { id, travail_autorise, majoration_pct, libelle } = body
      if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

      const updates: Record<string, unknown> = {}
      if (travail_autorise !== undefined) updates.travail_autorise = !!travail_autorise
      if (majoration_pct !== undefined) {
        const pct = Number(majoration_pct)
        if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
          return NextResponse.json({ error: 'majoration_pct doit être entre 0 et 1000' }, { status: 400 })
        }
        updates.majoration_pct = pct
      }
      if (libelle !== undefined) updates.libelle = String(libelle).trim()
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
      }

      const { data, error } = await supabase.from('jours_feries')
        .update(updates).eq('id', id).select().maybeSingle()
      if (error) {
        // Si mig 139 pas appliquée → colonnes travail_autorise/majoration_pct absentes
        if (/travail_autorise|majoration_pct/.test(error.message)) {
          return NextResponse.json({
            error: 'Migration 139 non appliquée — exécutez supabase/migrations/139_jours_feries_ameliore.sql',
          }, { status: 503 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, jour_ferie: data })
    }

    // ---- INIT YEAR (pre-fill fixed holidays) ----
    if (action === 'init_annee') {
      const { annee, societe_id } = body
      if (!annee) return NextResponse.json({ error: 'Année requise' }, { status: 400 })

      const fixed = getFixedHolidays(parseInt(annee))
      const rows = fixed.map(h => ({
        ...h,
        societe_id: societe_id || null,
        annee: parseInt(annee),
        pays: 'MU',
      }))

      // Upsert to avoid duplicates
      const { data, error } = await supabase
        .from('jours_feries')
        .upsert(rows, { onConflict: 'societe_id,date', ignoreDuplicates: true })
        .select()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, inserted: data?.length || 0 })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
