/**
 * GET /api/admin/health
 *
 * Accounting health monitor — stateless, idempotent, read-only.
 * Each check returns { check_id, description, severity, status, count, details[] }.
 * Designed to detect regressions of known bug classes:
 *   - missing VTE/ACH ecritures for non-draft invoices
 *   - missing BNQ ecritures for paid invoices
 *   - legacy 3-digit bare accounts (421/431/432/433/444)
 *   - newly-introduced 6+ digit accounts lurking outside chart-of-accounts
 *   - 411 balances drifting away from open-invoice totals
 *   - unbalanced ref_folios (sum debit != sum credit, excl. BNQ)
 *   - foreign currency invoices without converted MUR amount
 *   - BNQ classification doublons (R03/R04)
 *   - P&L accounts (classes 6 / 7) carrying lettrage markers (R7 violation)
 *
 * Auth: strict admin/super_admin only (queries profiles.role).
 * Client: service-role Supabase (bypasses RLS — callers must be trusted).
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Severity = 'critical' | 'warning' | 'info'
type Status = 'pass' | 'fail' | 'warn'

interface HealthCheck {
  check_id: string
  description: string
  severity: Severity
  status: Status
  count: number
  details: Record<string, unknown>[]
}

interface FactureRow {
  id: string
  numero_facture: string | null
  tiers: string | null
  type_facture?: string | null
  date_facture: string | null
  montant_ttc: number | null
  montant_mur?: number | null
  devise?: string | null
  taux_change?: number | null
  statut: string | null
  societe_id: string | null
}

interface EcritureRow {
  id: string
  societe_id: string | null
  numero_compte: string | null
  nom_compte?: string | null
  description?: string | null
  date_ecriture: string | null
  journal: string | null
  ref_folio: string | null
  lettre?: string | null
  debit_mur: number | null
  credit_mur: number | null
  facture_id?: string | null
}

interface SocieteRow {
  id: string
  nom: string | null
}

const DETAIL_LIMIT = 10

async function requireAdmin(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return { ok: false, status: 401, error: 'Non autorisé' }
  const { data: profile } = await supabaseAuth
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!['admin', 'super_admin'].includes(role)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getAdminClient()
  const checks: HealthCheck[] = []
  const startedAt = Date.now()

  // ─────────────────────────────────────────────────────────────
  // 1. factures_sans_ecriture_vte
  // Invoices clients (non-draft / non-cancelled) with no VTE 411 entry.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: fClients } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, date_facture, montant_ttc, statut, societe_id')
      .eq('type_facture', 'client')
      .not('statut', 'in', '(brouillon,annule)')

    const list = (fClients || []) as FactureRow[]
    const ids = list.map((f: FactureRow) => f.id)
    const linked = new Set<string>()
    if (ids.length > 0) {
      // Supabase has URL-length limits; chunk the "in" filter.
      const CHUNK = 200
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: ecr } = await supabase
          .from('ecritures_comptables_v2')
          .select('facture_id')
          .in('facture_id', slice)
          .eq('journal', 'VTE')
          .eq('numero_compte', '411')
        for (const e of ((ecr || []) as Pick<EcritureRow, 'facture_id'>[])) {
          if (e.facture_id) linked.add(e.facture_id)
        }
      }
    }
    const missing = list.filter((f: FactureRow) => !linked.has(f.id))
    checks.push({
      check_id: 'factures_sans_ecriture_vte',
      description: "Factures clients non-brouillon sans écriture VTE 411",
      severity: 'critical',
      status: missing.length === 0 ? 'pass' : 'fail',
      count: missing.length,
      details: missing.slice(0, DETAIL_LIMIT).map((f: FactureRow) => ({
        facture_id: f.id, numero_facture: f.numero_facture, tiers: f.tiers,
        date_facture: f.date_facture, montant_ttc: f.montant_ttc, statut: f.statut,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'factures_sans_ecriture_vte', description: "Factures clients non-brouillon sans écriture VTE 411",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 2. factures_sans_ecriture_ach
  // Supplier invoices with no ACH 401 entry.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: fFour } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, date_facture, montant_ttc, statut, societe_id')
      .eq('type_facture', 'fournisseur')
      .not('statut', 'in', '(brouillon,annule)')

    const list = (fFour || []) as FactureRow[]
    const ids = list.map((f: FactureRow) => f.id)
    const linked = new Set<string>()
    if (ids.length > 0) {
      const CHUNK = 200
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: ecr } = await supabase
          .from('ecritures_comptables_v2')
          .select('facture_id')
          .in('facture_id', slice)
          .eq('journal', 'ACH')
          .eq('numero_compte', '401')
        for (const e of ((ecr || []) as Pick<EcritureRow, 'facture_id'>[])) {
          if (e.facture_id) linked.add(e.facture_id)
        }
      }
    }
    const missing = list.filter((f: FactureRow) => !linked.has(f.id))
    checks.push({
      check_id: 'factures_sans_ecriture_ach',
      description: "Factures fournisseurs sans écriture ACH 401",
      severity: 'critical',
      status: missing.length === 0 ? 'pass' : 'fail',
      count: missing.length,
      details: missing.slice(0, DETAIL_LIMIT).map((f: FactureRow) => ({
        facture_id: f.id, numero_facture: f.numero_facture, tiers: f.tiers,
        date_facture: f.date_facture, montant_ttc: f.montant_ttc, statut: f.statut,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'factures_sans_ecriture_ach', description: "Factures fournisseurs sans écriture ACH 401",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 3. factures_paye_sans_bnq
  // Paid invoices with no BNQ entry — payment was recorded without bank impact.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: fPaid } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, date_facture, montant_ttc, statut, societe_id')
      .eq('statut', 'paye')

    const list = (fPaid || []) as FactureRow[]
    const ids = list.map((f: FactureRow) => f.id)
    const linked = new Set<string>()
    if (ids.length > 0) {
      const CHUNK = 200
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: ecr } = await supabase
          .from('ecritures_comptables_v2')
          .select('facture_id')
          .in('facture_id', slice)
          .eq('journal', 'BNQ')
        for (const e of ((ecr || []) as Pick<EcritureRow, 'facture_id'>[])) {
          if (e.facture_id) linked.add(e.facture_id)
        }
      }
    }
    const missing = list.filter((f: FactureRow) => !linked.has(f.id))
    checks.push({
      check_id: 'factures_paye_sans_bnq',
      description: "Factures marquées payées sans écriture BNQ",
      severity: 'critical',
      status: missing.length === 0 ? 'pass' : 'fail',
      count: missing.length,
      details: missing.slice(0, DETAIL_LIMIT).map((f: FactureRow) => ({
        facture_id: f.id, numero_facture: f.numero_facture, tiers: f.tiers,
        type_facture: f.type_facture, date_facture: f.date_facture, montant_ttc: f.montant_ttc,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'factures_paye_sans_bnq', description: "Factures marquées payées sans écriture BNQ",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 4. ecritures_3digit_bare
  // Legacy bare 3-digit accounts — should be 6-digit sub-accounts.
  // ─────────────────────────────────────────────────────────────
  try {
    const LEGACY = ['421', '431', '432', '433', '444']
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, societe_id, numero_compte, description, date_ecriture, journal, debit_mur, credit_mur, ref_folio')
      .in('numero_compte', LEGACY)
      .limit(5000)
    const list = (ecr || []) as EcritureRow[]
    checks.push({
      check_id: 'ecritures_3digit_bare',
      description: "Écritures avec numéro de compte legacy à 3 chiffres (421/431/432/433/444)",
      severity: 'warning',
      status: list.length === 0 ? 'pass' : 'fail',
      count: list.length,
      details: list.slice(0, DETAIL_LIMIT).map((e: EcritureRow) => ({
        id: e.id, numero_compte: e.numero_compte, date_ecriture: e.date_ecriture,
        journal: e.journal, ref_folio: e.ref_folio, description: e.description,
        debit_mur: e.debit_mur, credit_mur: e.credit_mur,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'ecritures_3digit_bare', description: "Écritures avec numéro de compte legacy à 3 chiffres",
      severity: 'warning', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 5. ecritures_6digit_bare
  // Accounts with 6+ chars (e.g. custom sub-accounts) — flag for review.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, description, date_ecriture, journal, debit_mur, credit_mur, ref_folio')
      // 6+ chars: first 4 required, then '_%' means at least one more char
      .like('numero_compte', '____%_%')
      .limit(5000)
    // Refine: exactly 6+ chars (the pattern above is 5+). Filter in JS to be safe.
    const list = ((ecr || []) as EcritureRow[]).filter((e: EcritureRow) => (e.numero_compte || '').length >= 6)
    checks.push({
      check_id: 'ecritures_6digit_bare',
      description: "Écritures avec numéro de compte à 6+ chiffres (sous-comptes non standard)",
      severity: 'info',
      status: list.length === 0 ? 'pass' : 'warn',
      count: list.length,
      details: list.slice(0, DETAIL_LIMIT).map((e: EcritureRow) => ({
        id: e.id, numero_compte: e.numero_compte, date_ecriture: e.date_ecriture,
        journal: e.journal, ref_folio: e.ref_folio, description: e.description,
        debit_mur: e.debit_mur, credit_mur: e.credit_mur,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'ecritures_6digit_bare', description: "Écritures avec numéro de compte à 6+ chiffres",
      severity: 'info', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 6. soldes_411_anormaux
  // Per société: |solde 411| > 10x sum(montant_mur) of unpaid client invoices.
  // Flags runaway balances caused by missing payment entries or double billing.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: societes } = await supabase.from('societes').select('id, nom')
    const anomalies: Record<string, unknown>[] = []

    for (const soc of ((societes || []) as SocieteRow[])) {
      const { data: ecr411 } = await supabase
        .from('ecritures_comptables_v2')
        .select('debit_mur, credit_mur')
        .eq('societe_id', soc.id)
        .eq('numero_compte', '411')
      let solde411 = 0
      for (const e of ((ecr411 || []) as Pick<EcritureRow, 'debit_mur' | 'credit_mur'>[])) {
        solde411 += (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)
      }

      const { data: unpaid } = await supabase
        .from('factures')
        .select('montant_mur')
        .eq('societe_id', soc.id)
        .eq('type_facture', 'client')
        .not('statut', 'in', '(paye,annule,brouillon)')
      const unpaidSum = ((unpaid || []) as Pick<FactureRow, 'montant_mur'>[])
        .reduce((s: number, f) => s + (Number(f.montant_mur) || 0), 0)

      const threshold = Math.max(unpaidSum * 10, 10000)
      if (Math.abs(solde411) > threshold && unpaidSum >= 0) {
        anomalies.push({
          societe_id: soc.id, societe_nom: soc.nom,
          solde_411: Number(solde411.toFixed(2)),
          total_factures_non_payees_mur: Number(unpaidSum.toFixed(2)),
          seuil_mur: Number(threshold.toFixed(2)),
          ratio: unpaidSum > 0 ? Number((Math.abs(solde411) / unpaidSum).toFixed(2)) : null,
        })
      }
    }

    checks.push({
      check_id: 'soldes_411_anormaux',
      description: "Sociétés dont le solde 411 clients s'écarte anormalement des factures non payées",
      severity: 'warning',
      status: anomalies.length === 0 ? 'pass' : 'fail',
      count: anomalies.length,
      details: anomalies.slice(0, DETAIL_LIMIT),
    })
  } catch (e) {
    checks.push({
      check_id: 'soldes_411_anormaux', description: "Soldes 411 anormaux vs factures non payées",
      severity: 'warning', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 7. ecritures_desequilibrees
  // ref_folios whose sum(debit) != sum(credit), excluding BNQ (paiements
  // groupés où plusieurs 401 lignes par folio sont légitimes).
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('ref_folio, journal, societe_id, debit_mur, credit_mur')
      .not('ref_folio', 'is', null)
      .not('journal', 'eq', 'BNQ')
      .limit(50000)

    const agg: Record<string, { debit: number; credit: number; journal: string; societe_id: string }> = {}
    type FolioEcr = Pick<EcritureRow, 'ref_folio' | 'journal' | 'societe_id' | 'debit_mur' | 'credit_mur'>
    for (const e of ((ecr || []) as FolioEcr[])) {
      const key = `${e.societe_id || 'null'}::${e.ref_folio}`
      if (!agg[key]) agg[key] = { debit: 0, credit: 0, journal: e.journal || '', societe_id: e.societe_id || '' }
      agg[key].debit += Number(e.debit_mur) || 0
      agg[key].credit += Number(e.credit_mur) || 0
    }
    const unbalanced = Object.entries(agg)
      .map(([key, v]) => {
        const [societe_id, ref_folio] = key.split('::')
        return {
          societe_id, ref_folio,
          journal: v.journal,
          debit: Number(v.debit.toFixed(2)),
          credit: Number(v.credit.toFixed(2)),
          ecart: Number((v.debit - v.credit).toFixed(2)),
        }
      })
      .filter(x => Math.abs(x.ecart) > 0.01)

    checks.push({
      check_id: 'ecritures_desequilibrees',
      description: "Ref_folios dont la somme débit ≠ somme crédit (hors BNQ)",
      severity: 'critical',
      status: unbalanced.length === 0 ? 'pass' : 'fail',
      count: unbalanced.length,
      details: unbalanced.slice(0, DETAIL_LIMIT),
    })
  } catch (e) {
    checks.push({
      check_id: 'ecritures_desequilibrees', description: "Ref_folios déséquilibrés",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 8. factures_devise_non_mur_sans_montant_mur
  // Foreign-currency invoices lacking converted MUR amount.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: fx } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, devise, montant_ttc, montant_mur, taux_change, statut, date_facture')
      .not('devise', 'eq', 'MUR')
      .not('devise', 'is', null)

    const missing = ((fx || []) as FactureRow[]).filter((f: FactureRow) => {
      const mur = Number(f.montant_mur)
      return !mur || mur === 0
    })

    checks.push({
      check_id: 'factures_devise_non_mur_sans_montant_mur',
      description: "Factures en devise étrangère sans montant_mur (ou = 0)",
      severity: 'critical',
      status: missing.length === 0 ? 'pass' : 'fail',
      count: missing.length,
      details: missing.slice(0, DETAIL_LIMIT).map((f: FactureRow) => ({
        facture_id: f.id, numero_facture: f.numero_facture, tiers: f.tiers,
        devise: f.devise, montant_ttc: f.montant_ttc, montant_mur: f.montant_mur,
        taux_change: f.taux_change, statut: f.statut, date_facture: f.date_facture,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'factures_devise_non_mur_sans_montant_mur',
      description: "Factures en devise étrangère sans montant_mur",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 9. classifications_doublons
  // BNQ entries with same ref_folio + same numero_compte — regression of
  // R03/R04 duplicate classifications.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: bnq } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, ref_folio, numero_compte, societe_id, debit_mur, credit_mur, date_ecriture, description, lettre')
      .eq('journal', 'BNQ')
      .not('ref_folio', 'is', null)
      .limit(50000)

    const bnqList = (bnq || []) as EcritureRow[]
    const groups: Record<string, EcritureRow[]> = {}
    for (const e of bnqList) {
      const key = `${e.societe_id}::${e.ref_folio}::${e.numero_compte}`
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    const doublons: Record<string, unknown>[] = []
    for (const [key, rows] of Object.entries(groups)) {
      if (rows.length > 1) {
        const [societe_id, ref_folio, numero_compte] = key.split('::')
        doublons.push({
          societe_id, ref_folio, numero_compte,
          nb_occurrences: rows.length,
          ids: rows.map((r: EcritureRow) => r.id),
          sample: {
            date_ecriture: rows[0].date_ecriture,
            description: rows[0].description,
            debit_mur: rows[0].debit_mur,
            credit_mur: rows[0].credit_mur,
            lettre: rows[0].lettre,
          },
        })
      }
    }

    checks.push({
      check_id: 'classifications_doublons',
      description: "Écritures BNQ avec même ref_folio et même numéro de compte (doublons R03/R04)",
      severity: 'critical',
      status: doublons.length === 0 ? 'pass' : 'fail',
      count: doublons.length,
      details: doublons.slice(0, DETAIL_LIMIT),
    })
  } catch (e) {
    checks.push({
      check_id: 'classifications_doublons', description: "Doublons BNQ même ref_folio / même compte",
      severity: 'critical', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  // ─────────────────────────────────────────────────────────────
  // 10. comptes_resultat_lettres
  // Classes 6 / 7 entries with a non-null lettre — violates rule R7
  // (P&L accounts are not lettrable).
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, lettre, date_ecriture, journal, ref_folio, description, debit_mur, credit_mur')
      .not('lettre', 'is', null)
      .limit(20000)
    const bad = ((ecr || []) as EcritureRow[]).filter((e: EcritureRow) => {
      const c = e.numero_compte || ''
      return c.startsWith('6') || c.startsWith('7')
    })
    checks.push({
      check_id: 'comptes_resultat_lettres',
      description: "Écritures sur classes 6 ou 7 avec lettrage (viole règle R7)",
      severity: 'warning',
      status: bad.length === 0 ? 'pass' : 'fail',
      count: bad.length,
      details: bad.slice(0, DETAIL_LIMIT).map((e: EcritureRow) => ({
        id: e.id, numero_compte: e.numero_compte, lettre: e.lettre,
        date_ecriture: e.date_ecriture, journal: e.journal, ref_folio: e.ref_folio,
        description: e.description, debit_mur: e.debit_mur, credit_mur: e.credit_mur,
      })),
    })
  } catch (e) {
    checks.push({
      check_id: 'comptes_resultat_lettres', description: "Classes 6/7 avec lettrage",
      severity: 'warning', status: 'warn', count: 0,
      details: [{ error: e instanceof Error ? e.message : String(e) }],
    })
  }

  const duration_ms = Date.now() - startedAt
  const summary = {
    total: checks.length,
    pass: checks.filter((c: HealthCheck) => c.status === 'pass').length,
    fail: checks.filter((c: HealthCheck) => c.status === 'fail').length,
    warn: checks.filter((c: HealthCheck) => c.status === 'warn').length,
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    duration_ms,
    summary,
    checks,
  })
}
