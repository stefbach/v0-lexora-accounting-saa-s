import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  aoaSheet, buildWorkbook, cell, formula, xlsxResponse,
  FMT_MUR, FMT_DATE,
} from '@/lib/export/xlsx-helpers'

export const dynamic = 'force-dynamic'

/**
 * Export P&L (Profit & Loss) au format Excel — feuilles :
 *   • "P&L" : compte de résultat IFRS for SMEs en cascade jusqu'au résultat net
 *   • "Détail" : rubriques avec libellés et formules de sous-total
 *   • "Filtres" : méta
 *
 * Le P&L est récupéré depuis /api/client/financial (calcul source de vérité)
 * pour garantir la cohérence entre le dashboard et l'export Excel. Pas de
 * recalcul côté export.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  if (!societe_id) return new Response('societe_id requis', { status: 400 })

  // Appel à la route /api/client/financial pour récupérer le calcul officiel
  // (cohérence dashboard/Excel). On forward les paramètres + cookies pour
  // garder le contexte d'auth.
  const url = new URL('/api/client/financial', request.url)
  searchParams.forEach((v, k) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: { cookie: request.headers.get('cookie') || '' } })
  if (!res.ok) {
    return new Response(`Erreur P&L: ${res.status}`, { status: res.status })
  }
  // /api/client/financial renvoie { financial: {...}, exercice_actuel, ... }
  // On unwrap pour accéder directement aux champs P&L. Si le shape évolue, le
  // fallback || json garantit qu'on ne plante pas (mais champs à 0 dans l'export).
  const json: any = await res.json()
  const fin: any = json?.financial || json
  const exerciceActuel = json?.exercice_actuel

  const { data: societe } = await supabase
    .from('societes').select('nom').eq('id', societe_id).single()

  const sheets: Array<{ name: string; ws: any }> = []

  // ── Filtres ──
  sheets.push({
    name: 'Filtres',
    ws: aoaSheet([
      [cell('Compte de résultat (P&L)')],
      [cell('Société'), cell(societe?.nom || '—')],
      [cell('Exercice'), cell(exerciceActuel || fin.exercice || '—')],
      [cell('Période'), cell(`${fin.date_debut || ''} → ${fin.date_fin || ''}`)],
      [cell('Exporté le'), cell(new Date(), FMT_DATE)],
      [],
      [cell('Référentiel'), cell('IFRS for SMEs — Companies Act 2001 Mauritius')],
      [cell('Devise'),      cell('MUR (Roupies Mauriciennes)')],
      [cell('Source'),      cell('/api/client/financial — calcul de référence dashboard')],
    ], { colWidths: [22, 60] }),
  })

  // ── P&L cascade ──
  // Convention : produits positifs, charges en négatif (visuel rouge via format).
  const ca = Number(fin.chiffreAffaires) || 0
  const achats = -(Number(fin.achats) || 0)
  const salaires = -(Number(fin.salaires) || 0)
  const chargesSociales = -(Number(fin.chargesSociales) || 0)
  const autresServices = -(Number(fin.autresServicesExterieurs) || Number(fin.autresCharges) || 0)
  const impotsTaxes = -(Number(fin.impotsEtTaxes) || 0)
  const amortissements = -(Number(fin.amortissements) || 0)
  const chargesFinancieres = -(Number(fin.chargesFinancieres) || 0)
  const produitsFinanciers = Number(fin.produitsFinanciers) || 0

  const rows: any[][] = [
    [cell('Compte de résultat — Exercice ' + (exerciceActuel || fin.exercice || ''))],
    [],
    [cell('PRODUITS D\'EXPLOITATION'), cell('Montant MUR')],
    [cell('Chiffre d\'affaires (706, 707, 708)'), cell(ca, FMT_MUR)],
    // Ligne 5 = total produits
    [cell('Total produits d\'exploitation'), formula('B4', FMT_MUR)],
    [],
    [cell('CHARGES D\'EXPLOITATION')],
    [cell('Achats consommés (60x)'),             cell(achats, FMT_MUR)],
    [cell('Salaires et traitements (641, 644)'), cell(salaires, FMT_MUR)],
    [cell('Charges sociales et patronales (645-649)'), cell(chargesSociales, FMT_MUR)],
    [cell('Autres services extérieurs (621-629)'),     cell(autresServices, FMT_MUR)],
    [cell('Impôts, taxes et versements (63x)'),         cell(impotsTaxes, FMT_MUR)],
    [cell('Dotations aux amortissements (68x)'),       cell(amortissements, FMT_MUR)],
    // Ligne 14 = total charges (formule)
    [cell('Total charges d\'exploitation'), formula('SUM(B8:B13)', FMT_MUR)],
    [],
    // Ligne 16 = résultat exploitation
    [cell('RÉSULTAT D\'EXPLOITATION'), formula('B5+B14', FMT_MUR)],
    [],
    [cell('RÉSULTAT FINANCIER')],
    [cell('Produits financiers (76x)'),  cell(produitsFinanciers, FMT_MUR)],
    [cell('Charges financières (66x)'),  cell(chargesFinancieres, FMT_MUR)],
    // Ligne 21 = résultat financier
    [cell('Résultat financier'), formula('SUM(B19:B20)', FMT_MUR)],
    [],
    // Ligne 23 = résultat avant impôt
    [cell('RÉSULTAT AVANT IMPÔT'), formula('B16+B21', FMT_MUR)],
    [cell('Impôt sur les bénéfices (15%)'), cell(-Math.max(0, (Number(fin.resultatAvantImpot) || 0) * 0.15), FMT_MUR)],
    // Ligne 25 = résultat net
    [cell('RÉSULTAT NET DE L\'EXERCICE'), formula('B23+B24', FMT_MUR)],
  ]

  sheets.push({
    name: 'P&L',
    ws: aoaSheet(rows, { colWidths: [50, 18], freezeTopRows: 1 }),
  })

  // ── Détail expanded ──
  const detailRows: any[][] = [
    [cell('Indicateur'), cell('Valeur MUR'), cell('Commentaire')],
    [cell('Trésorerie (banques 512)'), cell(Number(fin.tresorerie) || 0, FMT_MUR), cell('Solde global tous comptes')],
    [cell('Créances clients (411)'),   cell(Number(fin.creancesClients) || 0, FMT_MUR), cell('Encours à recevoir')],
    [cell('Dettes fournisseurs (401)'), cell(Number(fin.dettesFournisseurs) || 0, FMT_MUR), cell('À payer')],
    [cell('Dettes sociales (43x)'),     cell(Number(fin.dettesSociales) || 0, FMT_MUR), cell('CSG/NSF/PAYE/cotisations dues')],
    [cell('Dettes fiscales (44x)'),     cell(Number(fin.dettesFiscales) || 0, FMT_MUR), cell('TVA/TDS/IS dus')],
    [cell('Immobilisations brutes (2x)'), cell(Number(fin.immobilisations) || 0, FMT_MUR), cell('Avant amortissements')],
    [cell('Stocks (3x)'),               cell(Number(fin.stocks) || 0, FMT_MUR), cell('')],
    [cell('Capitaux propres (1x)'),     cell(Number(fin.capitauxPropres) || 0, FMT_MUR), cell('')],
    [cell('Emprunts (16x)'),            cell(Number(fin.emprunts) || 0, FMT_MUR), cell('')],
  ]
  sheets.push({
    name: 'Détail bilan',
    ws: aoaSheet(detailRows, { colWidths: [36, 18, 40], freezeTopRows: 1 }),
  })

  const buf = buildWorkbook(sheets, {
    title: `P&L ${societe?.nom || ''}`,
    subject: 'Compte de résultat IFRS Maurice',
  })
  const fname = `pnl_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${exerciceActuel || fin.exercice || ''}.xlsx`
  return xlsxResponse(buf, fname)
}
