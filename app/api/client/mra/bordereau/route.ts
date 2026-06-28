/**
 * GET /api/client/mra/bordereau?societe_id=...&type=PAYE|CSG|NSF|TDS&periode=YYYY-MM&format=csv|xlsx
 *
 * Génère le bordereau de remise MRA pour une obligation/période :
 *   • PAYE / CSG / NSF : détail par compte (depuis OD-PAIE)
 *   • TDS              : détail par fournisseur (depuis factures.tds_*)
 *
 * Formats : CSV (upload portail MRA) ou XLSX (lisible). Le PDF sera ajouté
 * avec l'UI (phase 2). Auth multi-mode (session / API key / token interne).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { aoaSheet, buildWorkbook, xlsxResponse } from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const PAYROLL_ACCOUNTS: Record<string, string[]> = {
  PAYE: ['4330'],
  CSG: ['4311', '4321'],
  NSF: ['4312', '4322'],
}
const ACCOUNT_LABELS: Record<string, string> = {
  '4330': 'PAYE à reverser MRA',
  '4311': 'CSG salarié',
  '4321': 'CSG patronal',
  '4312': 'NSF salarié',
  '4322': 'NSF patronal',
}

function csvResponse(content: string, filename: string): Response {
  return new Response('﻿' + content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type = String(searchParams.get('type') || '').toUpperCase()
    const periode = searchParams.get('periode') || ''
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!/^\d{4}-\d{2}$/.test(periode)) return NextResponse.json({ error: 'periode YYYY-MM requise' }, { status: 400 })
    if (!['PAYE', 'CSG', 'NSF', 'TDS'].includes(type)) return NextResponse.json({ error: 'type invalide' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { data: soc } = await admin.from('societes').select('nom, brn').eq('id', societe_id).maybeSingle()
    const societeName = soc?.nom || 'Société'
    const safeName = `${type}-${periode}-${societeName.replace(/[^a-zA-Z0-9]/g, '_')}`

    // ── TDS : détail par fournisseur ────────────────────────────────
    if (type === 'TDS') {
      const { data: factures } = await admin
        .from('factures')
        .select('tiers, tds_category, tds_rate_pct, tds_amount_mur, montant_ht, montant_ttc, date_facture, tds_period')
        .eq('societe_id', societe_id)
        .gt('tds_amount_mur', 0)
      const rows = (factures || []).filter(
        (f: any) => (f.tds_period || String(f.date_facture).slice(0, 7)) === periode,
      )
      const header = ['Fournisseur', 'Catégorie TDS', 'Taux %', 'Brut MUR', 'TDS retenue MUR', 'Date facture']
      const dataRows = rows.map((f: any) => [
        f.tiers || '',
        f.tds_category || '',
        Number(f.tds_rate_pct) || 0,
        Number(f.montant_ht || f.montant_ttc) || 0,
        Number(f.tds_amount_mur) || 0,
        String(f.date_facture || '').slice(0, 10),
      ])
      const totalTds = rows.reduce((s: number, f: any) => s + (Number(f.tds_amount_mur) || 0), 0)

      if (format === 'xlsx') {
        const ws = aoaSheet([
          [`Bordereau TDS — ${societeName} — ${periode}`],
          [`BRN: ${soc?.brn || '—'}`],
          [],
          header,
          ...dataRows,
          [],
          ['', '', '', 'TOTAL TDS', Math.round(totalTds * 100) / 100, ''],
        ], { colWidths: [30, 24, 8, 14, 16, 14] })
        const buf = buildWorkbook([{ name: 'TDS', ws }], { title: `TDS ${periode}` })
        return xlsxResponse(buf, `${safeName}.xlsx`)
      }
      const csv = [header.join(','), ...dataRows.map(r => r.map(csvCell).join(',')),
        ['', '', '', 'TOTAL', Math.round(totalTds * 100) / 100, ''].join(',')].join('\n')
      return csvResponse(csv, `${safeName}.csv`)
    }

    // ── PAYE / CSG / NSF : détail par compte (OD-PAIE) ──────────────
    const accounts = PAYROLL_ACCOUNTS[type]
    const start = `${periode}-01`
    const end = new Date(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)), 0)
      .toISOString().slice(0, 10)
    const { data: ecr } = await admin
      .from('ecritures_comptables_v2')
      .select('numero_compte, credit_mur, debit_mur, description')
      .eq('societe_id', societe_id)
      .eq('journal', 'OD-PAIE')
      .gte('date_ecriture', start).lte('date_ecriture', end)
      .in('numero_compte', accounts)

    const byAccount: Record<string, number> = {}
    for (const e of (ecr || []) as any[]) {
      const net = (Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0)
      byAccount[e.numero_compte] = (byAccount[e.numero_compte] || 0) + net
    }
    const header = ['Compte', 'Libellé', 'Montant à reverser MUR']
    const dataRows = accounts.map(a => [a, ACCOUNT_LABELS[a] || a, Math.round((byAccount[a] || 0) * 100) / 100])
    const total = accounts.reduce((s, a) => s + (byAccount[a] || 0), 0)

    if (format === 'xlsx') {
      const ws = aoaSheet([
        [`Bordereau ${type} — ${societeName} — ${periode}`],
        [`BRN: ${soc?.brn || '—'}`],
        [],
        header,
        ...dataRows,
        [],
        ['', 'TOTAL', Math.round(total * 100) / 100],
      ], { colWidths: [12, 28, 20] })
      const buf = buildWorkbook([{ name: type, ws }], { title: `${type} ${periode}` })
      return xlsxResponse(buf, `${safeName}.xlsx`)
    }
    const csv = [header.join(','), ...dataRows.map(r => r.map(csvCell).join(',')),
      ['', 'TOTAL', Math.round(total * 100) / 100].join(',')].join('\n')
    return csvResponse(csv, `${safeName}.csv`)
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

function csvCell(v: any): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
