/**
 * GET /api/client/plan-comptable/export?societe_id=…&format=xlsx|csv&exercice=…
 *
 * Exporte le Plan Comptable Mauricien (PCM) — comptes globaux (societe_id=null)
 * + overrides société — au format Excel (défaut) ou CSV.
 *
 * Si un `exercice` (ou date_debut/date_fin) est fourni ET une société, l'export
 * est VALORISÉ : chaque compte porte son Débit / Crédit / Solde de l'exercice
 * (agrégé depuis ecritures_comptables_v2). Sans exercice → simple référentiel.
 *
 * Réutilise lib/export/xlsx-helpers (même pile que balance / grand-livre).
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import { aoaSheet, buildWorkbook, cell, xlsxResponse, FMT_DATE, FMT_MUR } from '@/lib/export/xlsx-helpers'
import {
  PCM_EXPORT_COLUMNS as COLUMNS,
  PCM_AMOUNT_COLUMNS,
  PCM_CLASSE_LABELS as CLASSE_LABELS,
  pcmDisplay as display,
  buildPcmCsv,
  pcmCountByClasse,
  type PcmExportRow,
} from '@/lib/export/plan-comptable-export'
import { exerciceDatesFromLabel } from '@/lib/accounting/exercices'
import { getCurrentExercice } from '@/lib/fiscal-years'

export const dynamic = 'force-dynamic'

type CompteRow = PcmExportRow & { societe_id?: string | null }

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const format = (searchParams.get('format') || 'xlsx').toLowerCase()
  const exerciceParam = searchParams.get('exercice')
  const includeAll = searchParams.get('all') === '1'
  let dDebut = searchParams.get('date_debut')
  let dFin = searchParams.get('date_fin')

  const { data, error } = await (societe_id
    ? supabase.from('plan_comptable').select(SELECT).eq('actif', true).or(`societe_id.eq.${societe_id},societe_id.is.null`).order('compte')
    : supabase.from('plan_comptable').select(SELECT).eq('actif', true).is('societe_id', null).order('compte'))
  if (error) return new Response(error.message, { status: 500 })
  let comptes = (data || []) as CompteRow[]

  let societeNom = ''
  if (societe_id) {
    const { data: soc } = await supabase.from('societes').select('nom').eq('id', societe_id).single()
    societeNom = soc?.nom || ''
  }

  // ── Résolution de la période (exercice valorisé) ──
  // Priorité : dates explicites → ligne exercices_fiscaux (dates exactes) →
  // dérivation du libellé → exercice courant par défaut (si une société est là).
  let exercice = exerciceParam || ''
  if (societe_id && (!dDebut || !dFin)) {
    if (!exercice) exercice = getCurrentExercice()
    if (exercice) {
      const { data: ex } = await supabase
        .from('exercices_fiscaux')
        .select('date_debut, date_fin')
        .eq('societe_id', societe_id)
        .eq('annee', exercice)
        .maybeSingle()
      if (ex?.date_debut && ex?.date_fin) { dDebut = ex.date_debut; dFin = ex.date_fin }
      else {
        const d = exerciceDatesFromLabel(exercice)
        if (d) { dDebut = d.date_debut; dFin = d.date_fin }
      }
    }
  }
  const withAmounts = !!(societe_id && dDebut && dFin)

  // ── Agrégation des montants de l'exercice, par compte ──
  if (withAmounts) {
    const ecritures = await fetchAllPaginated<{ numero_compte: string | null; nom_compte: string | null; debit_mur: number | null; credit_mur: number | null }>(() =>
      supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, nom_compte, debit_mur, credit_mur')
        .eq('societe_id', societe_id as string)
        .gte('date_ecriture', dDebut as string)
        .lte('date_ecriture', dFin as string),
    )
    const agg = new Map<string, { debit: number; credit: number; nom: string }>()
    for (const e of ecritures) {
      const k = (e.numero_compte || '').trim()
      if (!k) continue
      const cur = agg.get(k) || { debit: 0, credit: 0, nom: e.nom_compte || '' }
      cur.debit += Number(e.debit_mur) || 0
      cur.credit += Number(e.credit_mur) || 0
      if (!cur.nom && e.nom_compte) cur.nom = e.nom_compte
      agg.set(k, cur)
    }
    // Arrondi monétaire 2 décimales (évite les artefacts float type 1211847.8800000001).
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    // Attache les montants aux comptes du plan.
    const inChart = new Set<string>()
    for (const c of comptes) {
      inChart.add(c.compte)
      const a = agg.get(c.compte)
      c.debit = round2(a?.debit || 0)
      c.credit = round2(a?.credit || 0)
      c.solde = round2((a?.debit || 0) - (a?.credit || 0))
    }
    // Comptes MOUVEMENTÉS absents du plan (sous-comptes tenant) → ajoutés pour
    // ne perdre aucun montant.
    for (const [k, a] of agg) {
      if (inChart.has(k)) continue
      comptes.push({
        compte: k, libelle: a.nom || null, classe: /^\d/.test(k) ? Number(k[0]) : null,
        type_compte: null, sens_normal: null, compte_parent: null, niveau: null,
        est_analytique: null, categorie_ifrs: null, sous_categorie_ifrs: null,
        poste_etat_financier_ifrs: null, est_contra_ifrs: null, type_mra_ifrs: null,
        postable: true, related_party: null, vat_treatment: null, notes: null,
        debit: round2(a.debit), credit: round2(a.credit), solde: round2(a.debit - a.credit),
      })
    }
    // Par défaut, on ne garde que les comptes MOUVEMENTÉS (débit ou crédit ≠ 0) :
    // sans ça l'export affiche 200+ comptes à 0 (comptes de regroupement, comptes
    // non utilisés) et « paraît vide ». `?all=1` force le plan complet.
    if (!includeAll) {
      comptes = comptes.filter((c) => (c.debit || 0) !== 0 || (c.credit || 0) !== 0)
    }
    comptes.sort((x, y) => x.compte.localeCompare(y.compte))
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const exLabel = withAmounts ? `_${exercice.replace(/\s+/g, '')}` : ''
  const base = `plan_comptable_${(societeNom || 'PCM').replace(/\s+/g, '_')}${exLabel}_${stamp}`

  // ── CSV ──
  if (format === 'csv') {
    let body = buildPcmCsv(comptes, withAmounts)
    if (withAmounts) {
      const totDeb = comptes.reduce((s, c) => s + (c.debit || 0), 0)
      const totCred = comptes.reduce((s, c) => s + (c.credit || 0), 0)
      const pad = ';'.repeat(13) // 14 colonnes de base (Compte..Notes) → 13 séparateurs avant TOTAL
      body += `\r\nTOTAL${pad};${totDeb.toFixed(2)};${totCred.toFixed(2)};${(totDeb - totCred).toFixed(2)}`
    }
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
  const allCols = withAmounts ? [...COLUMNS, ...PCM_AMOUNT_COLUMNS] : COLUMNS

  const rows: any[][] = [allCols.map((c) => cell(c.label))]
  for (const c of comptes) {
    const line = COLUMNS.map((col) => cell(display(c[col.key])))
    if (withAmounts) {
      line.push(
        cell(c.debit ?? 0, FMT_MUR),
        cell(c.credit ?? 0, FMT_MUR),
        cell(c.solde ?? 0, FMT_MUR),
      )
    }
    rows.push(line)
  }
  // Ligne TOTAL (contrôle d'équilibre Σdébit = Σcrédit).
  if (withAmounts) {
    const totDeb = comptes.reduce((s, c) => s + (c.debit || 0), 0)
    const totCred = comptes.reduce((s, c) => s + (c.credit || 0), 0)
    const total = [cell('TOTAL'), ...Array(COLUMNS.length - 1).fill(cell(''))]
    total.push(cell(Math.round(totDeb * 100) / 100, FMT_MUR), cell(Math.round(totCred * 100) / 100, FMT_MUR), cell(Math.round((totDeb - totCred) * 100) / 100, FMT_MUR))
    rows.push(total)
  }
  const baseW = [12, 42, 7, 14, 7, 20, 26, 30, 10, 14, 8, 11, 13, 14, 7, 10, 30]
  const colWidths = withAmounts ? [...baseW, 16, 16, 16] : baseW
  sheets.push({ name: 'Plan comptable', ws: aoaSheet(rows, { colWidths, freezeTopRows: 1 }) })

  // Feuille « Par classe » : nombre de comptes (+ solde si valorisé).
  const byClasse = pcmCountByClasse(comptes)
  const soldeByClasse = new Map<string, number>()
  if (withAmounts) {
    for (const c of comptes) {
      const k = c.classe != null ? String(c.classe) : '?'
      soldeByClasse.set(k, (soldeByClasse.get(k) || 0) + (c.solde || 0))
    }
  }
  const classeHeader = withAmounts
    ? [cell('Classe'), cell('Intitulé'), cell('Nombre de comptes'), cell('Solde exercice')]
    : [cell('Classe'), cell('Intitulé'), cell('Nombre de comptes')]
  const classeRows: any[][] = [classeHeader]
  for (const k of ['1', '2', '3', '4', '5', '6', '7']) {
    const r = [cell(k), cell(CLASSE_LABELS[k] || k), cell(byClasse.get(k) || 0)]
    if (withAmounts) r.push(cell(soldeByClasse.get(k) || 0, FMT_MUR))
    classeRows.push(r)
  }
  classeRows.push([cell('TOTAL'), cell(''), cell(comptes.length)])
  sheets.push({ name: 'Par classe', ws: aoaSheet(classeRows, { colWidths: [8, 26, 18, 18], freezeTopRows: 1 }) })

  // Feuille « Info ».
  sheets.push({
    name: 'Info',
    ws: aoaSheet(
      [
        [cell('Plan Comptable Mauricien (PCM)')],
        [cell('Société'), cell(societeNom || '— (référentiel global)')],
        [cell('Exercice'), cell(withAmounts ? `${exercice} (${dDebut} → ${dFin})` : '— (référentiel seul, sans montants)')],
        [cell('Exporté le'), cell(new Date(), FMT_DATE)],
        [cell(withAmounts && !includeAll ? 'Comptes mouvementés' : 'Nombre de comptes'), cell(comptes.length)],
        [],
        [cell('Montants'), cell(withAmounts ? 'Débit / Crédit / Solde de l\'exercice, en MUR' : 'Aucun (sélectionnez un exercice pour valoriser)')],
        [cell('Périmètre'), cell(withAmounts ? (includeAll ? 'Tous les comptes du plan (y compris à 0)' : 'Comptes mouvementés uniquement (ajouter ?all=1 pour le plan complet)') : 'Référentiel complet')],
        [cell('Référentiel'), cell('Plan façon PCG (classes 1-7) adapté Maurice')],
        [cell('Normes'), cell('Full IFRS / IFRS for SMEs (Financial Reporting Act)')],
        [cell('Devise'), cell('MUR (Roupies Mauriciennes)')],
      ],
      { colWidths: [22, 60] },
    ),
  })

  const buf = buildWorkbook(sheets, {
    title: `Plan comptable ${societeNom}`.trim(),
    subject: 'Plan Comptable Mauricien (PCM)',
  })
  return xlsxResponse(buf, `${base}.xlsx`)
}

const SELECT =
  'compte, libelle, classe, type_compte, sens_normal, compte_parent, niveau, est_analytique, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs, est_contra_ifrs, type_mra_ifrs, postable, related_party, vat_treatment, notes, societe_id'
