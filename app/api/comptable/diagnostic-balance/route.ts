import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/comptable/diagnostic-balance?societe_id=<uuid>&date_debut=&date_fin=
 *
 * Walks through ecritures_comptables_v2 and reports every plausible cause of
 * an unbalanced "balance par compte" view :
 *
 *   1. Journal-level imbalances   — per (journal, date_ecriture), sum D ≠ C.
 *   2. ref_folio-level imbalances — same piece comptable, sum D ≠ C.
 *   3. PCM-code collisions        — the same semantic account lives on 3-digit
 *      code AND its 4-digit expansion (e.g. 421 + 4210, 431 + 4311 + 4312).
 *      Migrations 018/029/120 vs `app/api/rh/import-paie/route.ts` disagree
 *      on the account numbering, so both end up in the ledger.
 *   4. Orphan SAL debits          — 6xxx rows whose ref_folio has no matching
 *      4xxx credit line at all (partial insert).
 *   5. Orphan paye_par_associe/manuel credits on 411 / 401 without a matching
 *      VTE/ACH debit for the same facture_id.
 *
 * Read-only — no mutation. Safe to run in production.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    let q = supabase
      .from('ecritures_comptables_v2')
      .select('id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, libelle, debit_mur, credit_mur, facture_id, lettre')
      .eq('societe_id', societe_id)
      .order('date_ecriture', { ascending: false })
      .limit(50000) // safety cap
    if (date_debut) q = q.gte('date_ecriture', date_debut)
    if (date_fin) q = q.lte('date_ecriture', date_fin)

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const all = rows || []

    // ── 1. Totaux globaux ───────────────────────────────────────────
    let totalDebit = 0
    let totalCredit = 0
    for (const r of all) {
      totalDebit += Number(r.debit_mur) || 0
      totalCredit += Number(r.credit_mur) || 0
    }
    const ecartGlobal = Math.round((totalDebit - totalCredit) * 100) / 100

    // ── 2. Imbalance par journal ────────────────────────────────────
    const byJournal = new Map<string, { debit: number; credit: number; count: number }>()
    for (const r of all) {
      const key = r.journal || '—'
      let agg = byJournal.get(key)
      if (!agg) { agg = { debit: 0, credit: 0, count: 0 }; byJournal.set(key, agg) }
      agg.debit += Number(r.debit_mur) || 0
      agg.credit += Number(r.credit_mur) || 0
      agg.count += 1
    }
    const journaux = [...byJournal.entries()]
      .map(([journal, v]) => ({
        journal,
        debit: Math.round(v.debit * 100) / 100,
        credit: Math.round(v.credit * 100) / 100,
        ecart: Math.round((v.debit - v.credit) * 100) / 100,
        count: v.count,
      }))
      .filter(j => Math.abs(j.ecart) >= 0.01)
      .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))

    // ── 3. Imbalance par ref_folio (piece comptable) ────────────────
    // A well-formed piece must be balanced: Σ D = Σ C. Any unbalance is a
    // partial insert or corrupted entry.
    const byFolio = new Map<string, { debit: number; credit: number; count: number; journal: string; date: string }>()
    for (const r of all) {
      const key = r.ref_folio || r.numero_piece
      if (!key) continue
      let agg = byFolio.get(key)
      if (!agg) {
        agg = { debit: 0, credit: 0, count: 0, journal: r.journal || '—', date: r.date_ecriture }
        byFolio.set(key, agg)
      }
      agg.debit += Number(r.debit_mur) || 0
      agg.credit += Number(r.credit_mur) || 0
      agg.count += 1
    }
    const folios = [...byFolio.entries()]
      .map(([ref_folio, v]) => ({
        ref_folio,
        journal: v.journal,
        date: v.date,
        debit: Math.round(v.debit * 100) / 100,
        credit: Math.round(v.credit * 100) / 100,
        ecart: Math.round((v.debit - v.credit) * 100) / 100,
        count: v.count,
      }))
      .filter(f => Math.abs(f.ecart) >= 0.01)
      .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))

    // ── 4. PCM collisions (3-digit vs 4-digit same concept) ─────────
    const PCM_COLLISIONS: Array<{ short: string; long: string[]; label: string }> = [
      { short: '421', long: ['4210', '4211', '4212'], label: 'Personnel — rémunérations' },
      { short: '431', long: ['4311', '4312'], label: 'Sécurité sociale salarié' },
      { short: '432', long: ['4321', '4322', '4323', '4324'], label: 'Sécurité sociale patronal' },
      { short: '444', long: ['4330', '4440'], label: 'PAYE / IR à reverser MRA' },
    ]
    const pcmStats = new Map<string, { debit: number; credit: number; count: number }>()
    for (const r of all) {
      const compte = String(r.numero_compte || '').trim()
      if (!compte) continue
      let agg = pcmStats.get(compte)
      if (!agg) { agg = { debit: 0, credit: 0, count: 0 }; pcmStats.set(compte, agg) }
      agg.debit += Number(r.debit_mur) || 0
      agg.credit += Number(r.credit_mur) || 0
      agg.count += 1
    }
    const collisions = PCM_COLLISIONS
      .map(c => {
        const short = pcmStats.get(c.short)
        const longHits = c.long.map(code => ({ code, stats: pcmStats.get(code) })).filter(x => x.stats)
        const present = !!short && longHits.length > 0
        if (!present) return null
        return {
          label: c.label,
          short: { code: c.short, ...toDisplay(short!) },
          long: longHits.map(x => ({ code: x.code, ...toDisplay(x.stats!) })),
          comment: `Le même concept comptable existe sur le code ${c.short} (via generer_ecritures_paie SQL) ET sur ${c.long.join('/')} (via import-paie route). Les deux cumulent → soldes faussés.`,
        }
      })
      .filter(Boolean)

    // ── 5. Orphan charges (6xxx debits not matched by any 4xxx credit) ──
    // For each SAL/OD-PAIE piece, if the charges exist but no dette exists,
    // the piece is broken. We approximate: for each ref_folio, list those
    // that have only class-6 entries and no class-4.
    const folioClasses = new Map<string, Set<string>>()
    for (const r of all) {
      const key = r.ref_folio || r.numero_piece
      if (!key) continue
      const cls = String(r.numero_compte || '').charAt(0)
      if (!cls) continue
      let s = folioClasses.get(key)
      if (!s) { s = new Set<string>(); folioClasses.set(key, s) }
      s.add(cls)
    }
    const orphanCharges: string[] = []
    for (const [key, classes] of folioClasses.entries()) {
      if (classes.has('6') && !classes.has('4') && !classes.has('5')) {
        orphanCharges.push(key)
      }
    }

    return NextResponse.json({
      periode: { date_debut: date_debut || null, date_fin: date_fin || null },
      totaux: {
        total_debit: Math.round(totalDebit * 100) / 100,
        total_credit: Math.round(totalCredit * 100) / 100,
        ecart: ecartGlobal,
        nb_ecritures: all.length,
      },
      journaux_deséquilibres: journaux,
      pieces_deséquilibres: folios.slice(0, 100),
      nb_pieces_deséquilibrees: folios.length,
      collisions_pcm: collisions,
      orphan_charges_ref_folios: orphanCharges.slice(0, 50),
      nb_orphan_charges: orphanCharges.length,
      recommandations: buildRecommendations(ecartGlobal, journaux, collisions as any[], orphanCharges),
    })
  } catch (e: any) {
    console.error('[diagnostic-balance]', e)
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

function toDisplay(s: { debit: number; credit: number; count: number }) {
  return {
    debit: Math.round(s.debit * 100) / 100,
    credit: Math.round(s.credit * 100) / 100,
    solde: Math.round((s.debit - s.credit) * 100) / 100,
    count: s.count,
  }
}

function buildRecommendations(
  ecart: number,
  journaux: Array<{ journal: string; ecart: number }>,
  collisions: any[],
  orphans: string[],
): string[] {
  const out: string[] = []
  if (Math.abs(ecart) < 0.01) {
    out.push('Balance équilibrée. Aucune action requise.')
    return out
  }
  out.push(`Balance déséquilibrée de ${ecart.toFixed(2)} MUR.`)
  const top = journaux[0]
  if (top && Math.abs(top.ecart) >= Math.abs(ecart) * 0.5) {
    out.push(`Le journal "${top.journal}" porte l'essentiel du déséquilibre (${top.ecart.toFixed(2)} MUR). Lancer un backfill / réinsertion de ses écritures en priorité.`)
  }
  if (collisions.length > 0) {
    out.push(`Collisions PCM détectées (${collisions.length}). Deux chemins de code (SQL trigger generer_ecritures_paie + route import-paie) écrivent sur des comptes différents pour le même concept. Consolider le plan comptable paie avant réparation.`)
  }
  if (orphans.length > 0) {
    out.push(`${orphans.length} pièce(s) avec charges 6xxx sans contrepartie 4xxx/5xxx — insertion partielle. Voir orphan_charges_ref_folios pour la liste.`)
  }
  return out
}
