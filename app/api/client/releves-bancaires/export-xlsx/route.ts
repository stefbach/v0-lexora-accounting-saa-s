import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import {
  aoaSheet, buildWorkbook, cell, xlsxResponse,
  FMT_MUR, FMT_DATE,
} from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export Excel des transactions bancaires d'une société.
 *
 * GET /api/client/releves-bancaires/export-xlsx
 *   ?societe_id=<uuid> (requis)
 *   &compte_id=<uuid>  (optionnel, filtre par compte bancaire)
 *   &periode=YYYY-MM   (optionnel, filtre par mois civil)
 *
 * Multi-devise : colonne Devise + montants MUR conservés. Auth multi-mode
 * via resolveUserAuth (session web / API key / token interne), comme
 * /api/client/releves-bancaires GET — pour cohérence MCP.
 */
export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const compte_id = searchParams.get('compte_id')
    const periode = searchParams.get('periode') // YYYY-MM

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e, { societe_id, user_id: user.id })
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    // Période : YYYY-MM → [date_debut, date_fin du mois civil]
    let dateStart: string | null = null
    let dateEnd: string | null = null
    if (periode && /^\d{4}-\d{2}$/.test(periode)) {
      const [y, m] = periode.split('-').map(Number)
      dateStart = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      dateEnd = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`
    }

    let q = supabase
      .from('transactions_bancaires')
      .select('date_transaction, libelle_banque, reference, debit, credit, devise, tiers_identifie, statut_lettrage, compte_bancaire_id')
      .eq('societe_id', societe_id)
    if (compte_id) q = q.eq('compte_bancaire_id', compte_id)
    if (dateStart) q = q.gte('date_transaction', dateStart)
    if (dateEnd) q = q.lte('date_transaction', dateEnd)
    q = q.order('date_transaction', { ascending: false })

    const { data: tx, error } = await q
    if (error) throw error

    // Lookup comptes bancaires pour afficher le nom (1 query)
    const compteIds = Array.from(new Set((tx || []).map((t: any) => t.compte_bancaire_id).filter(Boolean)))
    const compteMap = new Map<string, { nom: string; iban: string | null; banque: string | null; devise: string }>()
    if (compteIds.length > 0) {
      const { data: comptes } = await supabase
        .from('comptes_bancaires')
        .select('id, nom, iban, banque, devise')
        .in('id', compteIds)
      for (const c of comptes || []) {
        compteMap.set(c.id as string, {
          nom: (c.nom as string) || '',
          iban: (c.iban as string | null) || null,
          banque: (c.banque as string | null) || null,
          devise: (c.devise as string) || 'MUR',
        })
      }
    }

    const { data: societe } = await supabase
      .from('societes').select('nom').eq('id', societe_id).single()

    // ── Feuille Filtres / méta ──
    const sheets: Array<{ name: string; ws: any }> = []
    sheets.push({
      name: 'Filtres',
      ws: aoaSheet([
        [cell('Relevés bancaires — Export')],
        [cell('Société'), cell(societe?.nom || '—')],
        [cell('Période'), cell(periode || 'toutes périodes')],
        [cell('Compte'), cell(compte_id ? (compteMap.get(compte_id)?.nom || compte_id) : 'tous comptes')],
        [cell('Exporté le'), cell(new Date(), FMT_DATE)],
        [cell('Nombre de transactions'), cell((tx || []).length)],
        [],
        [cell('Note')],
        [cell('Les montants sont conservés dans leur devise d\'origine. Le total cumulé en bas est en MUR (conversion au taux du jour côté société).')],
      ], { colWidths: [22, 50] }),
    })

    // ── Feuille principale ──
    const rows: any[][] = [
      [
        cell('Date'),
        cell('Compte'),
        cell('Banque'),
        cell('Libellé'),
        cell('Référence'),
        cell('Tiers détecté'),
        cell('Débit'),
        cell('Crédit'),
        cell('Devise'),
        cell('Statut lettrage'),
      ],
    ]
    let sumDebit = 0
    let sumCredit = 0
    for (const t of tx || []) {
      const compte = t.compte_bancaire_id ? compteMap.get(t.compte_bancaire_id as string) : null
      const dev = (t.devise as string) || compte?.devise || 'MUR'
      const debit = Number(t.debit) || 0
      const credit = Number(t.credit) || 0
      sumDebit += debit
      sumCredit += credit
      rows.push([
        cell(t.date_transaction ? new Date(t.date_transaction as string) : '', FMT_DATE),
        cell(compte?.nom || '—'),
        cell(compte?.banque || '—'),
        cell((t.libelle_banque as string) || ''),
        cell((t.reference as string) || ''),
        cell((t.tiers_identifie as string) || ''),
        cell(debit, FMT_MUR),
        cell(credit, FMT_MUR),
        cell(dev),
        cell((t.statut_lettrage as string) || 'non lettré'),
      ])
    }
    rows.push([
      cell('TOTAL'), cell(''), cell(''), cell(''), cell(''), cell(''),
      cell(sumDebit, FMT_MUR),
      cell(sumCredit, FMT_MUR),
      cell(''), cell(''),
    ])
    sheets.push({
      name: 'Transactions',
      ws: aoaSheet(rows, {
        colWidths: [12, 22, 16, 40, 16, 22, 14, 14, 8, 14],
        freezeTopRows: 1,
      }),
    })

    const buf = buildWorkbook(sheets, {
      title: `Relevés ${societe?.nom || ''}`,
      subject: 'Export transactions bancaires',
    })
    const today = new Date().toISOString().slice(0, 10)
    const fname = `releves_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${periode || today}.xlsx`
    return xlsxResponse(buf, fname)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur export Excel' }, { status: 500 })
  }
}
