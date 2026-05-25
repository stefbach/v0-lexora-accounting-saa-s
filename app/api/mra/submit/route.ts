/**
 * POST /api/mra/submit
 *
 * Wave 2-D problème 1A — Soumission MRA réelle via Playwright pour CIT/TDS.
 *
 * Auparavant, l'action `submit_mra` des routes /api/comptable/mra/{cit,tds}
 * se contentait de flipper `statut = 'submitted'` en base sans aucun appel
 * MRA. Cette route centralise désormais la soumission réelle :
 *
 *   1. Vérifie l'authentification + le statut workflow (CIT doit être 'approved')
 *   2. Génère le XML (CIT) ou CSV (TDS) à partir de la BDD
 *   3. Appelle submitCIT() / submitTDS() — robot Playwright
 *   4. Écrit en base : mra_ack_ref, mra_screenshot_b64, statut adapté
 *      - status='success'        → statut='submitted'
 *      - status='manual_needed'  → statut='manual_needed' (fichiers déjà
 *        envoyés en PJ Telegram par le robot, soumission manuelle requise)
 *      - status='failed'         → statut inchangé + mra_last_error
 *
 * Body :
 *   { kind: 'cit', societe_id, exercice }            → CIT annuelle
 *   { kind: 'tds', societe_id, periode: 'YYYY-MM' }  → TDS mensuelle
 *
 * Réponse 200 : { ok: true, ack_ref?, statut, message }
 * Réponse 4xx : { error } (validation, autorisation)
 * Réponse 502 : { error, status: 'failed' } (échec robot)
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateCitXml } from '@/lib/accounting/mra-xml'
import { generateTdsCsv, type TdsCategory } from '@/lib/accounting/tds'
import { submitCIT, submitTDS } from '@/lib/telegram/mra-robot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // Playwright + MRA peut prendre 60-90s

type Body =
  | { kind: 'cit'; societe_id: string; exercice: string }
  | { kind: 'tds'; societe_id: string; periode: string }

export async function POST(request: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = (await request.json()) as Body
    if (!body?.kind || !body?.societe_id) {
      return NextResponse.json({ error: 'kind et societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    if (body.kind === 'cit') {
      return await submitCitFlow(supabase, body.societe_id, body.exercice, user.id)
    }
    if (body.kind === 'tds') {
      return await submitTdsFlow(supabase, body.societe_id, body.periode, user.id)
    }
    return NextResponse.json({ error: `kind invalide : ${(body as any).kind}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur soumission MRA' }, { status: 500 })
  }
}

// ─── CIT ─────────────────────────────────────────────────────────────────────
async function submitCitFlow(
  supabase: ReturnType<typeof getAdminClient>,
  societe_id: string,
  exercice: string,
  user_id: string,
) {
  if (!exercice) {
    return NextResponse.json({ error: 'exercice requis (ex 2024-2025)' }, { status: 400 })
  }

  // 1. Récupérer la déclaration + société
  const [{ data: cit }, { data: societe }] = await Promise.all([
    supabase.from('cit_returns').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle(),
    supabase.from('societes').select('brn, ern').eq('id', societe_id).single(),
  ])

  if (!cit) {
    return NextResponse.json({ error: 'CIT return introuvable pour cet exercice' }, { status: 404 })
  }

  // 2. Vérifier workflow 4-yeux : seul 'approved' peut être soumis
  if (cit.statut !== 'approved') {
    return NextResponse.json({
      error: `Statut '${cit.statut}' : la déclaration doit être 'approved' avant soumission MRA`,
    }, { status: 409 })
  }

  // 3. Idempotence : si déjà soumise avec ack_ref, refuser
  if (cit.mra_ack_ref) {
    return NextResponse.json({
      error: `Déclaration déjà soumise (réf MRA : ${cit.mra_ack_ref})`,
      ack_ref: cit.mra_ack_ref,
    }, { status: 409 })
  }

  // 4. Générer XML CIT
  const xml = generateCitXml({
    societe_brn: societe?.brn || '—',
    societe_tan: societe?.ern || '—',
    exercice,
    profit_avant_impot: Number(cit.profit_avant_impot_mur) || 0,
    profit_imposable: Number(cit.profit_imposable_mur) || 0,
    impot_net: Number(cit.impot_net_mur) || 0,
    ftc_applied: Number(cit.ftc_applied_mur) || 0,
    tds_credit: Number(cit.tds_credit_mur) || 0,
  })

  // 5. Appel robot Playwright
  const result = await submitCIT({ societe_id, exercice, xml })

  // 6. Persister le résultat
  const now = new Date().toISOString()
  const updateFields: Record<string, any> = {
    updated_at: now,
    mra_last_error: result.error || null,
  }

  if (result.status === 'success') {
    updateFields.statut = 'submitted'
    updateFields.submitted_at = now
    updateFields.date_declaration = now.slice(0, 10)
    updateFields.mra_ack_ref = result.ack_ref || null
    updateFields.mra_screenshot_b64 = result.screenshot_b64 || null
    updateFields.approver_id = updateFields.approver_id ?? user_id
  } else if (result.status === 'manual_needed') {
    updateFields.statut = 'manual_needed'
    updateFields.mra_screenshot_b64 = result.screenshot_b64 || null
  }
  // status='failed' → on garde l'erreur mais on ne change pas le statut

  const { error: updErr } = await supabase
    .from('cit_returns')
    .update(updateFields)
    .eq('societe_id', societe_id)
    .eq('exercice', exercice)

  if (updErr) {
    return NextResponse.json({ error: `DB update failed: ${updErr.message}` }, { status: 500 })
  }

  const httpStatus = result.status === 'failed' ? 502 : 200
  return NextResponse.json({
    ok: result.status !== 'failed',
    statut: updateFields.statut ?? cit.statut,
    ack_ref: result.ack_ref,
    message: result.message,
    robot_status: result.status,
  }, { status: httpStatus })
}

// ─── TDS ─────────────────────────────────────────────────────────────────────
async function submitTdsFlow(
  supabase: ReturnType<typeof getAdminClient>,
  societe_id: string,
  periode: string,
  _user_id: string,
) {
  if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
    return NextResponse.json({ error: 'periode YYYY-MM requise' }, { status: 400 })
  }

  // 1. Récupérer factures TDS du mois + société
  const [m, mNum] = periode.split('-')
  const nextMonth = String(parseInt(mNum) + 1).padStart(2, '0')
  const [{ data: societe }, { data: factures }, { data: existing }] = await Promise.all([
    supabase.from('societes').select('nom, ern').eq('id', societe_id).single(),
    supabase.from('factures')
      .select('tiers, tds_category, tds_amount_mur, montant_mur, date_facture')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'fournisseur')
      .gt('tds_amount_mur', 0)
      .gte('date_facture', `${periode}-01`)
      .lt('date_facture', `${m}-${nextMonth}-01`),
    supabase.from('tds_declarations_mensuelles_v2').select('*').eq('societe_id', societe_id).eq('periode', periode).maybeSingle(),
  ])

  // 2. Idempotence
  if (existing?.mra_ack_ref) {
    return NextResponse.json({
      error: `TDS ${periode} déjà soumis (réf MRA : ${existing.mra_ack_ref})`,
      ack_ref: existing.mra_ack_ref,
    }, { status: 409 })
  }

  if (!factures || factures.length === 0) {
    return NextResponse.json({
      error: `Aucune retenue TDS pour ${periode} — rien à soumettre`,
    }, { status: 400 })
  }

  // 3. Générer CSV TDS
  const csv = generateTdsCsv({
    societe_name: societe?.nom || '—',
    societe_tan: societe?.ern || 'UNKNOWN',
    periode,
    records: factures.map((f: any) => ({
      tiers: f.tiers || '—',
      category: (f.tds_category as TdsCategory) || 'none',
      gross_mur: Number(f.montant_mur) || 0,
      tds_mur: Number(f.tds_amount_mur) || 0,
      payment_date: f.date_facture,
    })),
  })

  // 4. Appel robot Playwright
  const result = await submitTDS({ societe_id, periode, csv })

  // 5. Persister via upsert (la déclaration peut ne pas exister encore)
  const now = new Date().toISOString()
  const totalTds = factures.reduce((s: number, f: any) => s + (Number(f.tds_amount_mur) || 0), 0)
  const totalGross = factures.reduce((s: number, f: any) => s + (Number(f.montant_mur) || 0), 0)

  const upsertRow: Record<string, any> = {
    societe_id,
    periode,
    nb_paiements: factures.length,
    total_paiements_mur: totalGross,
    total_tds_mur: totalTds,
    mra_last_error: result.error || null,
    updated_at: now,
  }

  if (result.status === 'success') {
    upsertRow.statut = 'declare'
    upsertRow.date_declaration = now.slice(0, 10)
    upsertRow.mra_ack_ref = result.ack_ref || null
    upsertRow.mra_screenshot_b64 = result.screenshot_b64 || null
  } else if (result.status === 'manual_needed') {
    upsertRow.statut = 'manual_needed'
    upsertRow.mra_screenshot_b64 = result.screenshot_b64 || null
  }
  // failed → on conserve le statut existant ('a_faire' par défaut)

  const { error: upErr } = await supabase
    .from('tds_declarations_mensuelles_v2')
    .upsert(upsertRow, { onConflict: 'societe_id,periode' })

  if (upErr) {
    return NextResponse.json({ error: `DB upsert failed: ${upErr.message}` }, { status: 500 })
  }

  const httpStatus = result.status === 'failed' ? 502 : 200
  return NextResponse.json({
    ok: result.status !== 'failed',
    statut: upsertRow.statut ?? existing?.statut ?? 'a_faire',
    ack_ref: result.ack_ref,
    message: result.message,
    robot_status: result.status,
  }, { status: httpStatus })
}
