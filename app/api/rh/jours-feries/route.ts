import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
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
// Sprint 10 BUG 2 — `type_jour` n'existe PAS comme colonne sur jours_feries
// en prod (la colonne a été retirée après mig 105). On garde le champ ici
// UNIQUEMENT pour la logique applicative (distinction fixe/variable côté UI)
// mais on NE l'envoie JAMAIS dans les INSERT/UPDATE.
function getFixedHolidays(annee: number) {
  return [
    { date: `${annee}-01-01`, libelle: 'Nouvel An' },
    { date: `${annee}-01-02`, libelle: 'Nouvel An (2e jour)' },
    { date: `${annee}-02-01`, libelle: 'Abolition de l\'esclavage' },
    { date: `${annee}-03-12`, libelle: 'Fête nationale' },
    { date: `${annee}-05-01`, libelle: 'Fête du travail' },
    { date: `${annee}-08-15`, libelle: 'Assomption' },
    { date: `${annee}-11-01`, libelle: 'Toussaint' },
    { date: `${annee}-12-25`, libelle: 'Noël' },
  ]
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

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
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()

    // Check role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const allowedRoles = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
    if (!profile || !allowedRoles.includes(profile.role)) {
      return apiError('access_denied', 403)
    }

    const body = await request.json()
    const { action } = body

    // ---- CREATE ----
    // Sprint 10 BUG 2 — la colonne `type_jour` n'existe PAS en prod
    // (schema cache: "Could not find the 'type_jour' column"). On retire
    // complètement ce champ de l'INSERT. Le badge UI se calcule à partir
    // de (societe_id, date) via une liste hardcodée de dates fixes MU
    // (voir Sprint 6 FIX 2 côté page.tsx).
    //
    // Historique : Sprint 6 FIX 1 normalisait 'custom' → 'variable' pour
    // respecter la CHECK constraint mig 105, mais la colonne a été
    // ultérieurement supprimée de la table en prod → on ne l'envoie plus
    // du tout.
    if (action === 'creer') {
      const { date, libelle, societe_id, travail_autorise, majoration_pct } = body
      if (!date || !libelle) {
        return NextResponse.json({ error: 'Date et libellé requis' }, { status: 400 })
      }

      const insertRow: Record<string, unknown> = {
        date,
        libelle,
        societe_id: societe_id || null,
        // Sprint 7 FIX 4 — `annee` retiré (colonne inexistante en prod).
        // Sprint 10 BUG 2 — `type_jour` retiré (colonne inexistante en prod).
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
        // Sprint 10 BUG 2 — retry defensif si une colonne inconnue apparaît
        // dans l'erreur. Couvre travail_autorise/majoration_pct (mig 139)
        // et toute autre colonne optionnelle qu'un env pourrait avoir
        // désactivée. Le retry strippe la colonne fautive et retente.
        if (error.code === '42703') {
          const safeRow: Record<string, unknown> = { ...insertRow }
          const optionalCols = ['travail_autorise', 'majoration_pct', 'annee', 'type_jour', 'pays']
          let stripped: string[] = []
          for (const col of optionalCols) {
            if (error.message.includes(col) && col in safeRow) {
              delete safeRow[col]
              stripped.push(col)
            }
          }
          if (stripped.length > 0) {
            const retry = await supabase.from('jours_feries').insert(safeRow).select().single()
            if (retry.error) {
              return NextResponse.json({ error: `Erreur insertion (retry) : ${retry.error.message}`, code: retry.error.code }, { status: 500 })
            }
            return NextResponse.json({ success: true, jour_ferie: retry.data, warning: `Colonnes manquantes ignorées : ${stripped.join(', ')}` })
          }
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
        return apiError('no_fields_to_update', 400)
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

      // Sprint 7 FIX 4 — pas de champ `annee` dans l'INSERT (colonne
      // inexistante en prod, l'année est dans `date`).
      const fixed = getFixedHolidays(parseInt(annee))
      const rows = fixed.map(h => ({
        ...h,
        societe_id: societe_id || null,
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
