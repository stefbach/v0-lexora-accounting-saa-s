import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/comptable/cta-recalc?societe_id=...&date_cloture=YYYY-MM-DD
 * POST /api/comptable/cta-recalc  { societe_id, date_cloture, post_entry? }
 *
 * Calcule l'écart de conversion (CTA — Cumulative Translation Adjustment)
 * pour une société multi-devise (devise fonctionnelle ≠ MUR) selon IAS 21 §39.
 *
 * GET → retourne le diagnostic sans écrire.
 * POST avec post_entry=true → génère l'écriture comptable OD-CTA sur
 *   compte 1078 pour solder l'écart.
 */

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const date_cloture = searchParams.get('date_cloture') || new Date().toISOString().slice(0, 10)
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    const [{ data: societe }, { data: cta, error }] = await Promise.all([
      supabase.from('societes')
        .select('id, raison_sociale, devise_fonctionnelle')
        .eq('id', societe_id).single(),
      supabase.rpc('ias21_compute_cta', { p_societe_id: societe_id, p_date_cloture: date_cloture }),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ctaRow: any = Array.isArray(cta) ? cta[0] : cta
    const isMUR = societe?.devise_fonctionnelle === 'MUR' || !societe?.devise_fonctionnelle

    return NextResponse.json({
      societe: { id: societe?.id, raison_sociale: societe?.raison_sociale, devise_fonctionnelle: societe?.devise_fonctionnelle || 'MUR' },
      date_cloture,
      applicable: !isMUR,
      diagnostic: ctaRow || null,
      hint: isMUR
        ? "Société en MUR — pas de CTA possible (IAS 21 ne s'applique pas à une entité dont la monnaie fonctionnelle est MUR)."
        : Math.abs(Number(ctaRow?.ecart_fonctionnelle) || 0) > 0.01
          ? "⚠️ Déséquilibre en devise fonctionnelle détecté. C'est une erreur comptable (Σdébit ≠ Σcrédit en devise primaire). À investiguer avant de générer la CTA."
          : `Écart de translation MUR à constater en OCI sur compte 1078 : ${(Number(ctaRow?.ecart_translation_mur) || 0).toFixed(2)} MUR.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, date_cloture, post_entry } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const closingDate = date_cloture || new Date().toISOString().slice(0, 10)
    const supabase = getAdminClient()

    const { data: societe } = await supabase.from('societes')
      .select('id, raison_sociale, devise_fonctionnelle')
      .eq('id', societe_id).single()

    if (!societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    if (!societe.devise_fonctionnelle || societe.devise_fonctionnelle === 'MUR') {
      return NextResponse.json({
        error: 'CTA non applicable : société en monnaie fonctionnelle MUR. Configurer devise_fonctionnelle ≠ MUR pour activer.',
      }, { status: 400 })
    }

    const { data: cta, error } = await supabase.rpc('ias21_compute_cta', {
      p_societe_id: societe_id, p_date_cloture: closingDate,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ctaRow: any = Array.isArray(cta) ? cta[0] : cta
    const ecartMUR = Number(ctaRow?.ecart_translation_mur) || 0
    const ecartFonct = Number(ctaRow?.ecart_fonctionnelle) || 0

    // Refuse de poster si déséquilibre fonctionnelle (= erreur comptable)
    if (Math.abs(ecartFonct) > 0.01) {
      return NextResponse.json({
        error: `Déséquilibre Σdébit ≠ Σcrédit en devise fonctionnelle (écart=${ecartFonct.toFixed(2)} ${societe.devise_fonctionnelle}). Comptabilité incohérente — refus de générer CTA.`,
        diagnostic: ctaRow,
      }, { status: 422 })
    }

    if (!post_entry) {
      return NextResponse.json({ diagnostic: ctaRow, would_post: { compte: '1078', amount_mur: ecartMUR } })
    }

    // Génération de l'écriture OD-CTA pour solder l'écart sur compte 1078
    if (Math.abs(ecartMUR) < 0.01) {
      return NextResponse.json({ message: 'Écart < 0.01 MUR — aucune écriture nécessaire.', diagnostic: ctaRow })
    }

    const debit_mur  = ecartMUR < 0 ? Math.abs(ecartMUR) : 0
    const credit_mur = ecartMUR > 0 ? ecartMUR : 0

    const ref_folio = `CTA-${closingDate}`

    // Idempotence : supprimer toute écriture CTA précédente pour la même date
    await supabase.from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', societe_id)
      .eq('ref_folio', ref_folio)
      .is('lettre', null)

    const { error: insErr } = await supabase.from('ecritures_comptables_v2').insert({
      societe_id,
      date_ecriture: closingDate,
      ref_folio,
      numero_compte: '1078',
      nom_compte: 'Écart de conversion (CTA) — IAS 21',
      description: `Écart de conversion ${societe.devise_fonctionnelle} → MUR au ${closingDate}`,
      debit_mur, credit_mur,
      debit_fonctionnelle: 0,   // Le CTA n'a pas d'existence en devise fonctionnelle
      credit_fonctionnelle: 0,
      devise_origine: societe.devise_fonctionnelle,
      taux_fonct_vers_mur: 1,    // N/A pour CTA
      journal: 'OD',
    })

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      posted: { compte: '1078', debit_mur, credit_mur, ref_folio, date_cloture: closingDate },
      diagnostic: ctaRow,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
