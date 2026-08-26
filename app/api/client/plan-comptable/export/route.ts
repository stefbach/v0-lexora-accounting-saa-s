/**
 * GET /api/client/plan-comptable/export?societe_id=...&format=xlsx|csv
 *
 * Exporte le Plan Comptable Mauricien (PCM) — comptes globaux (societe_id=null)
 * + overrides de la société — au format Excel (défaut) ou CSV.
 *
 * Le PCM Lexora est un plan numéroté façon PCG (classes 1→7, codes 3-6 chiffres)
 * adapté à Maurice : codes MRA (CSG/NSF/PRGF/HRDC/PAYE/TVA/TDS/APS/CSR) et
 * classification IFRS (SOFP/SOCI) portée par chaque compte. L'export restitue
 * toutes ces colonnes pour intégration dans un autre logiciel comptable / audit.
 *
 * Réutilise lib/export/xlsx-helpers (même pile que balance / grand-livre).
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { aoaSheet, buildWorkbook, cell, xlsxResponse, FMT_DATE } from '@/lib/export/xlsx-helpers'
import {
  PCM_EXPORT_COLUMNS as COLUMNS,
  PCM_CLASSE_LABELS as CLASSE_LABELS,
  pcmDisplay as display,
  buildPcmCsv,
  pcmCountByClasse,
  type PcmExportRow,
} from '@/lib/export/plan-comptable-export'

export const dynamic = 'force-dynamic'

type CompteRow = PcmExportRow & { societe_id: string | null }

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const format = (searchParams.get('format') || 'xlsx').toLowerCase()

  let query = supabase
    .from('plan_comptable')
    .select(
      'compte, libelle, classe, type_compte, sens_normal, compte_parent, niveau, est_analytique, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs, est_contra_ifrs, type_mra_ifrs, notes, societe_id',
    )
    .eq('actif', true)
    .order('compte', { ascending: true })

  query = societe_id
    ? query.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    : query.is('societe_id', null)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 500 })
  const comptes = (data || []) as CompteRow[]

  let societeNom = ''
  if (societe_id) {
    const { data: soc } = await supabase.from('societes').select('nom').eq('id', societe_id).single()
    societeNom = soc?.nom || ''
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const base = `plan_comptable_${(societeNom || 'PCM').replace(/\s+/g, '_')}_${stamp}`

  // ── CSV ──
  if (format === 'csv') {
    const body = buildPcmCsv(comptes)
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // ── Excel ──
  const sheets: Array<{ name: string; ws: ReturnType<typeof aoaSheet> }> = []

  // Feuille « Plan comptable » : une ligne par compte, toutes colonnes.
  const rows: any[][] = [COLUMNS.map((c) => cell(c.label))]
  for (const c of comptes) rows.push(COLUMNS.map((col) => cell(display(c[col.key]))))
  sheets.push({
    name: 'Plan comptable',
    ws: aoaSheet(rows, {
      colWidths: [12, 42, 7, 14, 7, 20, 26, 30, 10, 8, 14, 7, 10, 30],
      freezeTopRows: 1,
    }),
  })

  // Feuille « Par classe » : nombre de comptes par classe.
  const byClasse = pcmCountByClasse(comptes)
  const classeRows: any[][] = [[cell('Classe'), cell('Intitulé'), cell('Nombre de comptes')]]
  for (const k of ['1', '2', '3', '4', '5', '6', '7']) {
    classeRows.push([cell(k), cell(CLASSE_LABELS[k] || k), cell(byClasse.get(k) || 0)])
  }
  classeRows.push([cell('TOTAL'), cell(''), cell(comptes.length)])
  sheets.push({ name: 'Par classe', ws: aoaSheet(classeRows, { colWidths: [8, 26, 18], freezeTopRows: 1 }) })

  // Feuille « Info » : contexte référentiel.
  sheets.push({
    name: 'Info',
    ws: aoaSheet(
      [
        [cell('Plan Comptable Mauricien (PCM)')],
        [cell('Société'), cell(societeNom || '— (référentiel global)')],
        [cell('Exporté le'), cell(new Date(), FMT_DATE)],
        [cell('Nombre de comptes'), cell(comptes.length)],
        [],
        [cell('Référentiel'), cell('Plan façon PCG (classes 1-7) adapté Maurice')],
        [cell('Normes'), cell('Full IFRS / IFRS for SMEs (Financial Reporting Act)')],
        [cell('Codes MRA'), cell('CSG, NSF, PRGF, HRDC Training Levy, PAYE, TVA, TDS, APS, CSR')],
        [cell('Devise'), cell('MUR (Roupies Mauriciennes)')],
        [cell('Exercice fiscal'), cell('1er juillet → 30 juin')],
      ],
      { colWidths: [22, 52] },
    ),
  })

  const buf = buildWorkbook(sheets, {
    title: `Plan comptable ${societeNom}`.trim(),
    subject: 'Plan Comptable Mauricien (PCM)',
  })
  return xlsxResponse(buf, `${base}.xlsx`)
}
