import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Admin-only: this is a destructive-ish operation when apply=true.
    const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
    const role = (profile as any)?.role || ''
    const isAdmin = ['admin', 'super_admin', 'comptable', 'comptable_dedie'].includes(role)
    if (!isAdmin) return NextResponse.json({ error: 'Réservé aux comptables' }, { status: 403 })

    const supabase = getAdminClient()
    const report: Record<string, any> = { apply, actions: { consolidate_pcm: doConsolidate, balance_pieces: doBalance, purge_duplicate_sal: doPurge } }

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
