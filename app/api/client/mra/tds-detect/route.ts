/**
 * POST /api/client/mra/tds-detect
 *   body : { montant_ht?, montant_ttc?, numero_compte?, description?, tiers_country? }
 *   → { applies, category, rate_pct, tds_amount_mur, net_to_supplier_mur, rationale }
 *
 * POST /api/client/mra/tds-detect  body : { facture_id, apply: true }
 *   → lit la facture, détecte le TDS, et écrit tds_category/tds_rate_pct/
 *     tds_amount_mur/tds_period sur la facture (auth societe vérifiée).
 *
 * Suggestion live à la saisie + persistance optionnelle. Auth multi-mode.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { detectTds } from '@/lib/accounting/tds-detect'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({})) as any
    const admin = getAdminClient()

    // ── Mode persistance : applique au facture_id ─────────────────────
    if (body?.facture_id && body?.apply === true) {
      const { data: fac } = await admin
        .from('factures').select('id, societe_id, montant_ht, montant_ttc, description, tiers, date_facture')
        .eq('id', body.facture_id).maybeSingle()
      if (!fac) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
      await assertSocieteAccess(admin, user.id, fac.societe_id)

      // Récupère un compte usuel d'imputation (best-effort via écritures liées)
      let numero_compte: string | null = null
      const { data: ecr } = await admin
        .from('ecritures_comptables_v2')
        .select('numero_compte')
        .eq('societe_id', fac.societe_id)
        .or(`ref_folio.eq.FAC-${fac.id},numero_piece.eq.FAC-${fac.id}`)
        .limit(20)
      if (ecr) {
        // On cherche un compte 6xx (charge)
        const charge = ecr.find((r: any) => String(r.numero_compte || '').startsWith('6'))
        if (charge) numero_compte = String(charge.numero_compte)
      }

      const detected = detectTds({
        montant_ht: Number(fac.montant_ht) || 0,
        montant_ttc: Number(fac.montant_ttc) || 0,
        description: String(fac.description || fac.tiers || ''),
        numero_compte,
      })

      const tds_period = String(fac.date_facture || '').slice(0, 7) // YYYY-MM
      const patch: Record<string, any> = {
        tds_category: detected.category,
        tds_rate_pct: detected.rate_pct,
        tds_amount_mur: detected.tds_amount_mur,
        tds_period: tds_period || null,
      }
      const { error: upErr } = await admin.from('factures').update(patch).eq('id', fac.id)
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

      return NextResponse.json({ ok: true, facture_id: fac.id, ...detected })
    }

    // ── Mode suggestion : pas de persistance ──────────────────────────
    const detected = detectTds({
      montant_ht: body?.montant_ht,
      montant_ttc: body?.montant_ttc,
      numero_compte: body?.numero_compte,
      description: body?.description,
      tiers_country: body?.tiers_country,
    })
    return NextResponse.json(detected)
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
