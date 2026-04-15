import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/comptable/factures/import-csv
 *   body: { societe_id, rows: [{tiers, numero_facture, date_facture, date_echeance?, montant_ht?, montant_tva?, montant_ttc, devise?, type_facture?, statut?, description?}] }
 *
 * Import CSV en lot, idempotent via (societe_id, numero_facture, tiers).
 */
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { societe_id, rows } = body
    if (!societe_id || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'societe_id et rows[] requis' }, { status: 400 })
    }
    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Max 1000 lignes par import' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const errors: Array<{ row: number; error: string }> = []
    const payload: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const tiers = String(r.tiers || '').trim()
      const numero_facture = String(r.numero_facture || '').trim()
      const date_facture = String(r.date_facture || '').trim()
      const montant_ttc = Number(r.montant_ttc)
      if (!tiers || !numero_facture || !date_facture || !montant_ttc || isNaN(montant_ttc)) {
        errors.push({ row: i + 1, error: `Ligne ${i + 1}: tiers, numero_facture, date_facture, montant_ttc requis` })
        continue
      }
      const montant_ht = Number(r.montant_ht) || 0
      const montant_tva = Number(r.montant_tva) || (montant_ht > 0 ? montant_ttc - montant_ht : 0)
      const devise = (r.devise || 'MUR').toUpperCase()
      const type_facture = r.type_facture === 'client' ? 'client' : 'fournisseur'
      const statut = r.statut || 'en_attente'

      payload.push({
        societe_id,
        tiers,
        numero_facture,
        date_facture,
        date_echeance: r.date_echeance || null,
        montant_ht, montant_tva, montant_ttc,
        montant_mur: devise === 'MUR' ? montant_ttc : null,
        devise, type_facture, statut,
        description: r.description || null,
        source: 'import_csv',
      })
    }

    if (payload.length === 0) {
      return NextResponse.json({
        success: false,
        imported: 0,
        errors,
        message: 'Aucune ligne valide',
      }, { status: 400 })
    }

    const { data: inserted, error } = await supabase
      .from('factures')
      .upsert(payload, { onConflict: 'societe_id,numero_facture,tiers' })
      .select('id, numero_facture')
    if (error) {
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      imported: inserted?.length || 0,
      skipped: rows.length - payload.length,
      errors,
      factures: inserted || [],
    })
  } catch (e: any) {
    console.error('[import-csv]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
