import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchAndStoreRates } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/comptable/taux-change
 * Liste tous les taux de change groupés par devise, triés par date DESC.
 * Retourne aussi les 30 derniers taux par devise.
 */
export async function GET() {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    // Récupère les 200 derniers enregistrements (couvre 30 dates × 13 devises)
    const { data, error } = await supabase
      .from('taux_change')
      .select('id, devise, taux, date_taux, source')
      .order('date_taux', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Grouper par devise
    const byDevise: Record<string, any[]> = {}
    for (const row of data || []) {
      if (!byDevise[row.devise]) byDevise[row.devise] = []
      if (byDevise[row.devise].length < 30) {
        byDevise[row.devise].push(row)
      }
    }

    // Taux actuels (le plus récent par devise)
    const current: Record<string, any> = {}
    for (const [devise, rows] of Object.entries(byDevise)) {
      if (rows.length > 0) current[devise] = rows[0]
    }

    return NextResponse.json({
      current,
      history: byDevise,
      total: data?.length || 0,
    })
  } catch (e: any) {
    console.error('[taux-change GET]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

/**
 * POST /api/comptable/taux-change
 * Actions disponibles :
 *   - action=update_from_api → appelle fetchAndStoreRates()
 *   - action=manual_entry body={ devise, date_taux, taux } → upsert manuel
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'action requis (update_from_api | manual_entry)' }, { status: 400 })
    }

    // ── Action: mettre à jour depuis l'API externe ────────────────────
    if (action === 'update_from_api') {
      const result = await fetchAndStoreRates()
      if (!result.success) {
        return NextResponse.json({ error: result.error, rates: result.rates }, { status: 502 })
      }
      return NextResponse.json({
        success: true,
        message: `${Object.keys(result.rates).length - 1} devises mises à jour depuis ExchangeRate-API`,
        rates: result.rates,
      })
    }

    // ── Action: saisie manuelle d'un taux historique ──────────────────
    if (action === 'manual_entry') {
      const { devise, date_taux, taux } = body
      if (!devise || !date_taux || taux === undefined || taux === null) {
        return NextResponse.json(
          { error: 'devise, date_taux et taux sont requis' },
          { status: 400 }
        )
      }

      const deviseCaps = String(devise).toUpperCase()
      const tauxNum = Number(taux)
      if (isNaN(tauxNum) || tauxNum <= 0) {
        return NextResponse.json({ error: 'taux doit être un nombre positif' }, { status: 400 })
      }

      // Valider le format de date
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(String(date_taux))) {
        return NextResponse.json({ error: 'date_taux doit être au format YYYY-MM-DD' }, { status: 400 })
      }

      const supabase = getAdminClient()
      const { data: upserted, error: upsertError } = await supabase
        .from('taux_change')
        .upsert(
          {
            devise: deviseCaps,
            taux: tauxNum,
            date_taux: String(date_taux),
            source: 'manual',
          },
          { onConflict: 'devise,date_taux' }
        )
        .select()
        .single()

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Taux ${deviseCaps} du ${date_taux} enregistré : ${tauxNum} MUR`,
        entry: upserted,
      })
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error('[taux-change POST]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
