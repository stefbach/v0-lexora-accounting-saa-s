import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * POST /api/comptable/diagnostic-balance/repair
 *
 * Body: {
 *   societe_id: string,
 *   apply: boolean,                   // false = dry-run (default)
 *   actions?: {
 *     consolidate_pcm?: boolean,      // merge 4210→421, 4311/4312→431, 4330→444
 *     balance_pieces?: boolean,       // add an adjustment line on every imbalanced ref_folio
 *     purge_duplicate_sal?: boolean,  // remove SAL/OD-PAIE rows that collide with each other
 *   },
 * }
 *
 * Returns a detailed report of what was (or would be) changed. Safe to call
 * in dry-run mode — no mutation.
 *
 * The goal is to bring `Σ debit_mur = Σ credit_mur` on ecritures_comptables_v2
 * for the requested société, restoring the balance par compte integrity.
 *
 * The three actions are applied in this order:
 *   1. consolidate_pcm     — renames inconsistent 4-digit codes to the canonical
 *                            3-digit PCM used by generer_ecritures_paie().
 *                            Does NOT change totals (pure rename) but eliminates
 *                            the visual collision.
 *   2. purge_duplicate_sal — if both the SQL trigger (journal='OD-PAIE') and
 *                            the Excel import (journal='SAL') wrote entries
 *                            for the same period, we keep ONE source only
 *                            (the Excel import, because it has aggregated
 *                            totals closer to what the comptable expects).
 *   3. balance_pieces      — for every ref_folio with Σ D ≠ Σ C, we add a
 *                            compensating entry on 6418 (if debit needed) or
 *                            471 "Compte d'attente" (if credit needed) so
 *                            that the pièce is balanced.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const societe_id: string | undefined = body.societe_id
    const apply: boolean = !!body.apply
    const actions = body.actions || {}
    const doConsolidate = actions.consolidate_pcm !== false
    const doBalance = actions.balance_pieces !== false
    const doPurge = !!actions.purge_duplicate_sal
    const doRecomputeMur = actions.recompute_vte_ach_mur !== false
    const doRegenMissing = actions.regenerate_missing_vte_ach !== false
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Access control:
    //   • Global roles (admin / super_admin) : bypass.
    //   • Comptables (comptable / comptable_dedie) : autorisés.
    //   • Client admin : autorisé UNIQUEMENT si membre de user_societes
    //     ou propriétaire (societes.created_by).
    //   • Client user : refusé (lecture seule sur la balance).
    const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
    const role = (profile as any)?.role || ''
    const isGlobal = ['admin', 'super_admin'].includes(role)
    const isComptable = ['comptable', 'comptable_dedie'].includes(role)
    const isClientAdmin = role === 'client_admin'

    if (!isGlobal && !isComptable && !isClientAdmin) {
      return NextResponse.json({ error: 'Réservé aux comptables et client_admin' }, { status: 403 })
    }

    // Si pas admin global, on exige l'appartenance à la société demandée.
    if (!isGlobal) {
      const { data: userSocietes } = await authClient
        .from('user_societes').select('societe_id').eq('user_id', user.id)
      const { data: ownedSoc } = await authClient
        .from('societes').select('id').eq('created_by', user.id)
      const allowed = new Set<string>([
        ...((userSocietes || []) as any[]).map(s => s.societe_id),
        ...((ownedSoc || []) as any[]).map(s => s.id),
      ])
      if (!allowed.has(societe_id)) {
        return NextResponse.json({ error: 'Forbidden — société non autorisée' }, { status: 403 })
      }
    }

    const supabase = getAdminClient()
    const report: Record<string, any> = {
      apply,
      actions: {
        consolidate_pcm: doConsolidate,
        balance_pieces: doBalance,
        purge_duplicate_sal: doPurge,
        recompute_vte_ach_mur: doRecomputeMur,
        regenerate_missing_vte_ach: doRegenMissing,
      },
    }

    // ── STEP 0: initial state ───────────────────────────────────────
    const initial = await getBalanceStats(supabase, societe_id)
    report.initial = initial

    // ── STEP 1: consolidation PCM ───────────────────────────────────
    if (doConsolidate) {
      const mappings: Array<{ from: string[]; to: string; nom: string }> = [
        { from: ['4210', '4211', '4212'], to: '421', nom: 'Personnel — rémunérations dues' },
        { from: ['4311', '4312'],         to: '431', nom: 'Sécurité sociale (CSG/NSF) — salarié' },
        { from: ['4321', '4322'],         to: '431', nom: 'Sécurité sociale (CSG/NSF) — patronal' },
        { from: ['4323', '4324'],         to: '431', nom: 'Training Levy / PRGF — à verser' },
        { from: ['4330', '4440'],         to: '444', nom: 'État — PAYE à reverser MRA' },
      ]
      const consolidated: any[] = []
      for (const m of mappings) {
        const { data: affectedRows, error: errCount } = await supabase
          .from('ecritures_comptables_v2')
          .select('id, numero_compte')
          .eq('societe_id', societe_id)
          .in('numero_compte', m.from)
          .limit(10000)
        if (errCount) {
          consolidated.push({ mapping: m, error: errCount.message })
          continue
        }
        const nbRows = affectedRows?.length || 0
        if (nbRows === 0) {
          consolidated.push({ mapping: m, affected: 0 })
          continue
        }
        if (apply) {
          const ids = (affectedRows as any[]).map(r => r.id)
          const { error: updErr } = await supabase
            .from('ecritures_comptables_v2')
            .update({ numero_compte: m.to, nom_compte: m.nom })
            .in('id', ids)
          consolidated.push({ mapping: m, affected: nbRows, applied: !updErr, error: updErr?.message })
        } else {
          consolidated.push({ mapping: m, affected: nbRows, applied: false, dry_run: true })
        }
      }
      report.consolidate_pcm = consolidated
    }

    // ── STEP 2: purge duplicate SAL/OD-PAIE ─────────────────────────
    if (doPurge) {
      // Two sources of payroll écritures compete:
      //   • journal='OD-PAIE' from generer_ecritures_paie() (per bulletin)
      //   • journal='SAL'      from app/api/rh/import-paie/route.ts (per month)
      // We deduplicate by keeping SAL (aggregated monthly) if both exist for
      // the same month.
      const { data: periods } = await supabase
        .from('ecritures_comptables_v2')
        .select('date_ecriture, journal')
        .eq('societe_id', societe_id)
        .in('journal', ['SAL', 'OD-PAIE'])
      const byMonth = new Map<string, Set<string>>()
      for (const r of (periods || []) as any[]) {
        const month = String(r.date_ecriture).slice(0, 7)
        let s = byMonth.get(month)
        if (!s) { s = new Set<string>(); byMonth.set(month, s) }
        s.add(r.journal)
      }
      const duplicates: Array<{ month: string; action: string; removed?: number }> = []
      for (const [month, journals] of byMonth.entries()) {
        if (!(journals.has('SAL') && journals.has('OD-PAIE'))) continue
        // Delete OD-PAIE for that month
        if (apply) {
          const { count, error } = await supabase
            .from('ecritures_comptables_v2')
            .delete({ count: 'exact' })
            .eq('societe_id', societe_id)
            .eq('journal', 'OD-PAIE')
            .gte('date_ecriture', `${month}-01`)
            .lt('date_ecriture', nextMonth(month))
          duplicates.push({ month, action: 'delete OD-PAIE', removed: count || 0 })
          if (error) duplicates[duplicates.length - 1].action += ` (error: ${error.message})`
        } else {
          duplicates.push({ month, action: 'would delete OD-PAIE (dry-run)' })
        }
      }
      report.purge_duplicate_sal = duplicates
    }

    // ── STEP 2.5a: recompute_vte_ach_mur ─────────────────────────────
    // Les factures en devise étrangère (GBP/EUR/USD) avaient leurs
    // montants natifs (GBP) stockés dans debit_mur / credit_mur au lieu
    // de la conversion MUR. Conséquence visible : un paiement de 1 M MUR
    // sur compte 411 face à une facture de 19 k GBP (débit) → solde 411
    // largement créditeur alors qu'il devrait être proche de zéro.
    //
    // Stratégie : pour chaque facture avec devise≠MUR et montant_mur
    // cohérent, on UPDATE directement les écritures VTE/ACH associées
    // en recalculant debit_mur/credit_mur à partir de montant_mur.
    // On préserve le lettrage existant.
    if (doRecomputeMur) {
      const { data: factDev } = await supabase
        .from('factures')
        .select('id, numero_facture, devise, montant_ht, montant_tva, montant_ttc, montant_mur, type_facture')
        .eq('societe_id', societe_id)
        .neq('devise', 'MUR')
        .not('montant_mur', 'is', null)
        .gt('montant_mur', 0)
      const recomputed: any[] = []
      for (const f of (factDev || []) as any[]) {
        const nativeTtc = Number(f.montant_ttc) || 0
        const murTtc = Number(f.montant_mur) || 0
        if (nativeTtc <= 0 || murTtc <= 0) continue
        const ratio = murTtc / nativeTtc
        if (Math.abs(ratio - 1) < 0.001) continue // déjà en MUR

        const murHt = Math.round((Number(f.montant_ht) || 0) * ratio * 100) / 100
        const murTva = Math.round((Number(f.montant_tva) || 0) * ratio * 100) / 100
        const ecartTtc = Math.round((murTtc - nativeTtc) * 100) / 100
        if (Math.abs(ecartTtc) < 0.01) continue

        // Fetch existing entries for this facture
        const { data: existing } = await supabase
          .from('ecritures_comptables_v2')
          .select('id, numero_compte, debit_mur, credit_mur, lettre')
          .eq('societe_id', societe_id)
          .eq('facture_id', f.id)
          .in('journal', ['ACH', 'VTE'])
        const hits: Array<{ id: string; compte: string; before: number; after: number; side: 'D' | 'C' }> = []
        for (const row of (existing || []) as any[]) {
          const compte = String(row.numero_compte)
          let expected: number | null = null
          let side: 'D' | 'C' = 'D'
          // Map compte → expected value (MUR) + side
          if (compte === '411' || compte === '401') {
            expected = murTtc; side = compte === '411' ? 'D' : 'C'
          } else if (compte === '706' || compte === '607') {
            expected = murHt; side = compte === '706' ? 'C' : 'D'
          } else if (compte === '4457' || compte === '4456') {
            expected = murTva; side = compte === '4457' ? 'C' : 'D'
          }
          if (expected == null) continue
          const before = side === 'D' ? Number(row.debit_mur) : Number(row.credit_mur)
          if (Math.abs(before - expected) < 0.01) continue
          hits.push({ id: row.id, compte, before, after: expected, side })
        }
        if (hits.length === 0) continue
        if (apply) {
          for (const h of hits) {
            const payload: Record<string, any> = h.side === 'D' ? { debit_mur: h.after } : { credit_mur: h.after }
            await supabase.from('ecritures_comptables_v2').update(payload).eq('id', h.id)
          }
        }
        recomputed.push({
          facture_id: f.id,
          numero_facture: f.numero_facture,
          devise: f.devise,
          native_ttc: nativeTtc,
          mur_ttc: murTtc,
          ratio: Math.round(ratio * 10000) / 10000,
          updated: hits,
        })
      }
      report.recompute_vte_ach_mur = {
        nb_factures_affected: recomputed.length,
        details: recomputed.slice(0, 100),
        truncated: recomputed.length > 100,
      }
    }

    // ── STEP 2.5b: regenerate_missing_vte_ach ────────────────────────
    // Pour chaque facture existante (en_attente/partiel/paye/retard)
    // qui n'a PAS d'écriture VTE/ACH liée (facture_id), on la recrée.
    // Cas typique : OCR a créé la facture mais la génération d'écritures
    // a échoué (RLS, timeout…) → le 411 du client reste sans débit
    // correspondant → balance créditrice anormale.
    if (doRegenMissing) {
      const { data: fact } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, date_facture, montant_ht, montant_tva, montant_ttc, montant_mur, devise, societe_id, statut')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'partiel', 'paye', 'retard'])
      const regenerated: any[] = []
      for (const f of (fact || []) as any[]) {
        const journalWanted = f.type_facture === 'client' ? 'VTE' : 'ACH'
        const { data: existing } = await supabase
          .from('ecritures_comptables_v2')
          .select('id')
          .eq('societe_id', societe_id)
          .eq('facture_id', f.id)
          .eq('journal', journalWanted)
          .limit(1)
        if (existing && existing.length > 0) continue
        if (apply) {
          const gen = await createEcrituresForFacture(supabase, {
            id: f.id,
            societe_id: f.societe_id,
            numero_facture: f.numero_facture || '',
            tiers: f.tiers || '',
            date_facture: f.date_facture,
            montant_ht: Number(f.montant_ht) || 0,
            montant_tva: Number(f.montant_tva) || 0,
            montant_ttc: Number(f.montant_ttc) || 0,
            montant_mur: f.montant_mur != null ? Number(f.montant_mur) : null,
            devise: f.devise || 'MUR',
            type_facture: f.type_facture === 'client' ? 'client' : 'fournisseur',
          })
          regenerated.push({
            facture_id: f.id,
            numero_facture: f.numero_facture,
            tiers: f.tiers,
            type: f.type_facture,
            ok: gen.ok,
            error: gen.error,
            nb_entries: gen.nb_entries,
          })
        } else {
          regenerated.push({
            facture_id: f.id,
            numero_facture: f.numero_facture,
            tiers: f.tiers,
            type: f.type_facture,
            would_create: journalWanted,
          })
        }
      }
      report.regenerate_missing_vte_ach = {
        nb_factures_without_ecriture: regenerated.length,
        details: regenerated.slice(0, 100),
        truncated: regenerated.length > 100,
      }
    }

    // ── STEP 3: balance every imbalanced pièce ──────────────────────
    if (doBalance) {
      const { data: rows, error: rowsErr } = await supabase
        .from('ecritures_comptables_v2')
        .select('ref_folio, journal, date_ecriture, dossier_id, debit_mur, credit_mur')
        .eq('societe_id', societe_id)
        .not('ref_folio', 'is', null)
        .limit(100000)
      if (rowsErr) {
        report.balance_pieces_error = rowsErr.message
      } else {
        type Agg = { debit: number; credit: number; journal: string; date: string; dossier_id: string | null }
        const byFolio = new Map<string, Agg>()
        for (const r of (rows || []) as any[]) {
          const key = r.ref_folio
          let a = byFolio.get(key)
          if (!a) {
            a = { debit: 0, credit: 0, journal: r.journal, date: r.date_ecriture, dossier_id: r.dossier_id }
            byFolio.set(key, a)
          }
          a.debit += Number(r.debit_mur) || 0
          a.credit += Number(r.credit_mur) || 0
        }
        const balanced: any[] = []
        for (const [ref_folio, a] of byFolio.entries()) {
          const ecart = Math.round((a.debit - a.credit) * 100) / 100
          if (Math.abs(ecart) < 0.01) continue
          // ecart > 0 → trop de débit → on ajoute un crédit
          // ecart < 0 → trop de crédit → on ajoute un débit
          const compte = ecart > 0 ? '471' : '6418'
          const nom = ecart > 0 ? 'Compte d\'attente (régularisation)' : 'Ajustement paie / charges diverses'
          const libelle = `Ajustement balance ${ref_folio} (écart ${ecart.toFixed(2)})`
          const adjustment = {
            societe_id,
            dossier_id: a.dossier_id,
            date_ecriture: a.date,
            journal: a.journal,
            ref_folio,
            numero_piece: ref_folio,
            numero_compte: compte,
            nom_compte: nom,
            libelle,
            description: libelle,
            debit_mur: ecart < 0 ? Math.abs(ecart) : 0,
            credit_mur: ecart > 0 ? ecart : 0,
            exercice: String(a.date).slice(0, 4),
          }
          if (apply) {
            const { error: insErr } = await supabase
              .from('ecritures_comptables_v2')
              .insert(adjustment)
            balanced.push({ ref_folio, journal: a.journal, ecart, action: 'balancing entry added', compte, error: insErr?.message })
          } else {
            balanced.push({ ref_folio, journal: a.journal, ecart, would_add: { compte, amount: Math.abs(ecart) } })
          }
        }
        report.balance_pieces = {
          nb_imbalanced: balanced.length,
          details: balanced.slice(0, 200),
          truncated: balanced.length > 200,
        }
      }
    }

    // ── STEP 4: final state ─────────────────────────────────────────
    const final = await getBalanceStats(supabase, societe_id)
    report.final = final
    report.net_change = {
      debit: round2(final.total_debit - initial.total_debit),
      credit: round2(final.total_credit - initial.total_credit),
      ecart_before: initial.ecart,
      ecart_after: final.ecart,
      ecart_resolved: round2(initial.ecart - final.ecart),
    }
    return NextResponse.json(report)
  } catch (e: any) {
    console.error('[diagnostic-balance/repair]', e)
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

async function getBalanceStats(supabase: any, societe_id: string) {
  const { data } = await supabase
    .from('ecritures_comptables_v2')
    .select('debit_mur, credit_mur')
    .eq('societe_id', societe_id)
    .limit(100000)
  let d = 0, c = 0
  for (const r of (data || []) as any[]) {
    d += Number(r.debit_mur) || 0
    c += Number(r.credit_mur) || 0
  }
  return {
    total_debit: round2(d),
    total_credit: round2(c),
    ecart: round2(d - c),
    nb_ecritures: (data || []).length,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return `${next}-01`
}
