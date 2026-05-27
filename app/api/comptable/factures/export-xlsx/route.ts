import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import {
  aoaSheet, buildWorkbook, cell, formula, xlsxResponse,
  FMT_MUR, FMT_DATE,
} from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export Excel des factures comptables (clients OU fournisseurs).
 *
 * GET /api/comptable/factures/export-xlsx
 *   ?societe_id=<uuid>           (optionnel — si absent, toutes sociétés accessibles)
 *   &type_facture=client|fournisseur (requis pour cohérence avec UI)
 *   &periode_debut=YYYY-MM-DD    (optionnel)
 *   &periode_fin=YYYY-MM-DD      (optionnel)
 *   &statut=...                  (optionnel)
 *
 * Multi-devise : la devise d'origine ET la conversion MUR sont exportées.
 */
export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type_facture = searchParams.get('type_facture') || searchParams.get('type')
    const periode_debut = searchParams.get('periode_debut') || searchParams.get('date_debut')
    const periode_fin = searchParams.get('periode_fin') || searchParams.get('date_fin')
    const statut = searchParams.get('statut')

    if (!type_facture || !['client', 'fournisseur'].includes(type_facture)) {
      return NextResponse.json({ error: 'type_facture requis (client|fournisseur)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    if (societe_id) {
      try {
        await assertSocieteAccess(supabase, user.id, societe_id)
      } catch (e) {
        const mapped = mapSocieteAccessError(e, { societe_id, user_id: user.id })
        if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
        throw e
      }
    }

    let q = supabase
      .from('factures')
      .select('id, numero_facture, tiers, description, date_facture, date_echeance, devise, taux_change, montant_ht, montant_tva, montant_ttc, montant_mur, statut, societe_id, type_facture')
      .eq('type_facture', type_facture)
      .order('date_facture', { ascending: false })

    if (societe_id) q = q.eq('societe_id', societe_id)
    if (statut) q = q.eq('statut', statut)
    if (periode_debut) q = q.gte('date_facture', periode_debut)
    if (periode_fin) q = q.lte('date_facture', periode_fin)

    const { data: factures, error } = await q
    if (error) throw error

    // Lookup nom sociétés
    const societeIds = Array.from(new Set((factures || []).map((f: any) => f.societe_id).filter(Boolean)))
    const societeMap = new Map<string, string>()
    if (societeIds.length > 0) {
      const { data: socs } = await supabase
        .from('societes').select('id, nom').in('id', societeIds)
      for (const s of socs || []) societeMap.set(s.id as string, (s.nom as string) || '')
    }

    // ── Feuille Filtres ──
    const sheets: Array<{ name: string; ws: any }> = []
    sheets.push({
      name: 'Filtres',
      ws: aoaSheet([
        [cell(type_facture === 'client' ? 'Factures clients — Export' : 'Factures fournisseurs — Export')],
        [cell('Société'), cell(societe_id ? (societeMap.get(societe_id) || societe_id) : 'toutes sociétés accessibles')],
        [cell('Type'), cell(type_facture === 'client' ? 'Clients (AR)' : 'Fournisseurs (AP)')],
        [cell('Période'), cell(`${periode_debut || 'depuis origine'} → ${periode_fin || 'à ce jour'}`)],
        [cell('Statut'), cell(statut || 'tous')],
        [cell('Exporté le'), cell(new Date(), FMT_DATE)],
        [cell('Nombre de factures'), cell((factures || []).length)],
        [],
        [cell('Note multi-devise')],
        [cell('Colonne "Montant MUR" = conversion au taux historique de la facture. Le total au bas de la feuille additionne les MUR (devise pivot Lexora).')],
      ], { colWidths: [22, 50] }),
    })

    // ── Feuille données ──
    const rows: any[][] = [
      [
        cell('Date'),
        cell('N° Facture'),
        cell('Société'),
        cell('Tiers'),
        cell('Description'),
        cell('HT'),
        cell('TVA'),
        cell('TTC'),
        cell('Devise'),
        cell('Taux'),
        cell('Montant MUR'),
        cell('Statut'),
        cell('Date Échéance'),
      ],
    ]
    const firstData = 2
    for (const f of factures || []) {
      rows.push([
        cell(f.date_facture ? new Date(f.date_facture as string) : '', FMT_DATE),
        cell((f.numero_facture as string) || ''),
        cell(societeMap.get(f.societe_id as string) || ''),
        cell((f.tiers as string) || ''),
        cell((f.description as string) || ''),
        cell(Number(f.montant_ht) || 0, FMT_MUR),
        cell(Number(f.montant_tva) || 0, FMT_MUR),
        cell(Number(f.montant_ttc) || 0, FMT_MUR),
        cell((f.devise as string) || 'MUR'),
        cell(Number(f.taux_change) || 1),
        cell(Number(f.montant_mur) || 0, FMT_MUR),
        cell((f.statut as string) || ''),
        cell(f.date_echeance ? new Date(f.date_echeance as string) : '', FMT_DATE),
      ])
    }
    const lastData = rows.length
    rows.push([
      cell('TOTAL'), cell(''), cell(''), cell(''), cell(''),
      formula(`SUM(F${firstData}:F${lastData})`, FMT_MUR),
      formula(`SUM(G${firstData}:G${lastData})`, FMT_MUR),
      formula(`SUM(H${firstData}:H${lastData})`, FMT_MUR),
      cell(''),
      cell(''),
      formula(`SUM(K${firstData}:K${lastData})`, FMT_MUR),
      cell(''),
      cell(''),
    ])
    sheets.push({
      name: type_facture === 'client' ? 'Factures clients' : 'Factures fournisseurs',
      ws: aoaSheet(rows, {
        colWidths: [12, 16, 22, 24, 36, 14, 12, 14, 8, 8, 14, 12, 12],
        freezeTopRows: 1,
      }),
    })

    const buf = buildWorkbook(sheets, {
      title: `Factures ${type_facture}`,
      subject: 'Export factures',
    })
    const today = new Date().toISOString().slice(0, 10)
    const sName = societe_id ? (societeMap.get(societe_id) || 'societe').replace(/\s+/g, '_') : 'toutes-societes'
    const fname = `factures_${type_facture}_${sName}_${today}.xlsx`
    return xlsxResponse(buf, fname)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur export Excel' }, { status: 500 })
  }
}
