/**
 * POST /api/client/mra/tds-scan
 *   body : { societe_id, periode?, only_missing?, dry_run? }
 *   → Scanne les factures FOURNISSEURS de la société, détecte la catégorie
 *     TDS (loyer 5%, honoraires 3%, travaux 0,75%…) via le compte d'imputation
 *     + le libellé, calcule la retenue, et écrit tds_category/rate/amount/period
 *     sur chaque facture concernée. Rétroactif : rattrape les factures saisies
 *     avant l'activation de la détection auto.
 *
 *   • only_missing (défaut true) : ne touche que les factures sans tds_category
 *   • dry_run (défaut false)     : simulation, ne persiste rien
 *   • periode (YYYY-MM, opt.)    : limite à un mois
 *
 * Auth multi-mode (session / API key / token interne → agent Telegram).
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { detectTds } from '@/lib/accounting/tds-detect'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as any
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const onlyMissing = body?.only_missing !== false
    const dryRun = body?.dry_run === true
    const periode = typeof body?.periode === 'string' && /^\d{4}-\d{2}$/.test(body.periode) ? body.periode : null

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    // Factures fournisseurs candidates
    let q = admin.from('factures')
      .select('id, tiers, montant_ht, montant_ttc, description, notes, date_facture, tds_category, tds_amount_mur')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'fournisseur')
      .order('date_facture', { ascending: false })
      .limit(1000)
    if (periode) {
      const start = `${periode}-01`
      const [y, m] = periode.split('-').map(Number)
      const end = `${periode}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      q = q.gte('date_facture', start).lte('date_facture', end)
    }
    const { data: factures, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let scanned = 0, detected = 0, applied = 0, total_tds = 0
    const details: any[] = []

    for (const f of (factures || []) as any[]) {
      if (onlyMissing && f.tds_category && f.tds_category !== 'none' && Number(f.tds_amount_mur) > 0) continue
      scanned++

      // Compte d'imputation : on cherche un compte 6xx sur les écritures liées
      let numero_compte: string | null = null
      const { data: ecr } = await admin
        .from('ecritures_comptables_v2')
        .select('numero_compte')
        .eq('societe_id', societe_id)
        .or(`ref_folio.eq.FAC-${f.id},numero_piece.eq.FAC-${f.id}`)
        .limit(30)
      if (ecr) {
        const charge = ecr.find((r: any) => String(r.numero_compte || '').startsWith('6'))
        if (charge) numero_compte = String(charge.numero_compte)
      }

      const res = detectTds({
        montant_ht: Number(f.montant_ht) || 0,
        montant_ttc: Number(f.montant_ttc) || 0,
        description: String(f.description || f.notes || f.tiers || ''),
        numero_compte,
      })
      if (!res.applies || res.tds_amount_mur <= 0) continue
      detected++
      total_tds += res.tds_amount_mur
      details.push({
        facture_id: f.id, tiers: f.tiers, category: res.category,
        rate_pct: res.rate_pct, tds: res.tds_amount_mur, periode: String(f.date_facture || '').slice(0, 7),
      })

      if (!dryRun) {
        const periodeTds = String(f.date_facture || '').slice(0, 7)
        const { error: upErr } = await admin.from('factures').update({
          tds_category: res.category,
          tds_rate_pct: res.rate_pct,
          tds_amount_mur: res.tds_amount_mur,
          tds_period: periodeTds || null,
        }).eq('id', f.id)
        if (!upErr) applied++
      }
    }

    // Recalcule les déclarations MRA des périodes touchées (TDS dashboard)
    if (!dryRun && applied > 0) {
      const periodes = [...new Set(details.map(d => d.periode).filter(Boolean))]
      for (const p of periodes) {
        await admin.rpc('mra_compute_period', { p_societe_id: societe_id, p_periode: p }).then(() => {}, () => {})
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      scanned, detected, applied,
      total_tds: Math.round(total_tds * 100) / 100,
      details: details.slice(0, 100),
      message: dryRun
        ? `${detected} facture(s) avec TDS détectée (simulation, rien écrit).`
        : `${applied} facture(s) mises à jour — TDS total ${Math.round(total_tds * 100) / 100} MUR. Dashboard MRA recalculé.`,
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
