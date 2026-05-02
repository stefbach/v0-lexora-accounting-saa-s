import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')   // ex: FY2024-2025
    const type       = searchParams.get('type') || 'pnl' // pnl | bilan | cashflow
    const date_debut = searchParams.get('date_debut')
    const date_fin   = searchParams.get('date_fin')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Résoudre les dates depuis l'exercice
    let dDebut = date_debut
    let dFin   = date_fin

    if (exercice && !dDebut && !dFin) {
      const { data: ex } = await supabase
        .from('exercices_fiscaux')
        .select('date_debut, date_fin')
        .eq('societe_id', societe_id)
        .eq('annee', exercice)
        .single()
      if (ex) { dDebut = ex.date_debut; dFin = ex.date_fin }
    }

    // Récupérer toutes les écritures
    let query = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, nom_compte, date_ecriture')
      .eq('societe_id', societe_id)

    if (dDebut) query = query.gte('date_ecriture', dDebut)
    if (dFin)   query = query.lte('date_ecriture', dFin)

    const { data: ecritures, error } = await query
    if (error) throw error

    if (!ecritures || ecritures.length === 0) {
      return NextResponse.json({
        message: "Aucune écriture comptabilisée — uploadez des documents pour commencer",
        data: null,
        type,
      })
    }

    // Agréger par compte
    const totaux: Record<string, { debit: number; credit: number }> = {}
    for (const e of ecritures) {
      const c = e.numero_compte
      if (!totaux[c]) totaux[c] = { debit: 0, credit: 0 }
      totaux[c].debit  += e.debit_mur  || 0
      totaux[c].credit += e.credit_mur || 0
    }

    // Fonction helper : somme sur une plage de comptes (sens débiteur par défaut)
    const sumRange = (debut: string, fin: string, sens: 'D' | 'C' = 'D') => {
      let total = 0
      for (const [compte, v] of Object.entries(totaux)) {
        if (compte >= debut && compte <= fin) {
          total += sens === 'D' ? (v.debit - v.credit) : (v.credit - v.debit)
        }
      }
      return total
    }

    const sumPrefix = (prefix: string, sens: 'D' | 'C' = 'D') => {
      let total = 0
      for (const [compte, v] of Object.entries(totaux)) {
        if (compte.startsWith(prefix)) {
          total += sens === 'D' ? (v.debit - v.credit) : (v.credit - v.debit)
        }
      }
      return total
    }

    // ----------------------------------------------------------------
    // P&L (Compte de Résultat)
    // ----------------------------------------------------------------
    if (type === 'pnl') {
      // PRODUITS
      const ca_services     = sumPrefix('706', 'C') + sumPrefix('705', 'C') + sumPrefix('704', 'C')
      const ca_ventes       = sumPrefix('707', 'C') + sumPrefix('701', 'C') + sumPrefix('702', 'C')
      const autres_produits = sumPrefix('708', 'C') + sumPrefix('71', 'C') + sumPrefix('72', 'C') +
                              sumPrefix('74', 'C') + sumPrefix('75', 'C')
      const ca_total        = ca_services + ca_ventes + autres_produits

      // CHARGES D'EXPLOITATION
      const achats          = sumPrefix('60', 'D') + sumPrefix('61', 'D')
      const charges_perso   = sumPrefix('64', 'D')
      const autres_charges  = sumPrefix('62', 'D') + sumPrefix('63', 'D') + sumPrefix('65', 'D')
      const dotations       = sumPrefix('68', 'D')
      const total_charges   = achats + charges_perso + autres_charges + dotations

      const resultat_expl   = ca_total - total_charges
      const ebitda          = resultat_expl + dotations

      // RÉSULTAT FINANCIER
      const produits_fin    = sumPrefix('76', 'C') + sumPrefix('77', 'C')
      const charges_fin     = sumPrefix('66', 'D') + sumPrefix('67', 'D')
      const resultat_fin    = produits_fin - charges_fin

      // RÉSULTAT EXCEPTIONNEL
      const produits_excep  = sumPrefix('78', 'C')
      const charges_excep   = sumPrefix('69', 'D')
      const resultat_excep  = produits_excep - charges_excep

      const resultat_avant_is = resultat_expl + resultat_fin + resultat_excep
      const impot_societes    = sumPrefix('695', 'D')
      const resultat_net      = resultat_avant_is - impot_societes

      const marge_brute_pct = ca_total > 0
        ? Math.round(((ca_total - achats) / ca_total) * 10000) / 100
        : 0
      const marge_expl_pct  = ca_total > 0
        ? Math.round((resultat_expl / ca_total) * 10000) / 100
        : 0

      // Détail mensuel
      const parMois: Record<string, { ca: number; charges: number }> = {}
      for (const e of ecritures) {
        const m = e.date_ecriture?.slice(0, 7) || 'inconnu'
        if (!parMois[m]) parMois[m] = { ca: 0, charges: 0 }
        const c = e.numero_compte
        if (c >= '700' && c <= '799') parMois[m].ca        += (e.credit_mur || 0) - (e.debit_mur || 0)
        if (c >= '600' && c <= '699') parMois[m].charges   += (e.debit_mur || 0) - (e.credit_mur || 0)
      }

      return NextResponse.json({
        type: 'pnl',
        periode: { date_debut: dDebut, date_fin: dFin, exercice },
        produits: {
          ca_services, ca_ventes, autres_produits,
          total: ca_total,
        },
        charges: {
          achats, charges_perso, autres_charges, dotations,
          total: total_charges,
        },
        resultats: {
          resultat_exploitation: resultat_expl,
          ebitda,
          resultat_financier: resultat_fin,
          resultat_exceptionnel: resultat_excep,
          resultat_avant_is,
          impot_societes,
          resultat_net,
        },
        marges: { marge_brute_pct, marge_expl_pct },
        par_mois: Object.entries(parMois)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mois, v]) => ({ mois, ...v, resultat: v.ca - v.charges })),
      })
    }

    // ----------------------------------------------------------------
    // BILAN
    // ----------------------------------------------------------------
    if (type === 'bilan') {
      // ACTIF NON COURANT
      // sumPrefix au lieu de sumRange : '218' lex < '2181' donc sumRange('210','218')
      // exclut les sous-comptes 4-chars (2181, 2183, 2815…) — les amortissements
      // étaient invisibles. sumPrefix('21') englobe correctement tous les 21xx.
      const immo_corp     = sumPrefix('21', 'D')
      const immo_incorp   = sumPrefix('20', 'D')
      const amortissements = Math.abs(sumPrefix('28', 'D'))
      const immo_fin      = sumPrefix('26', 'D') + sumPrefix('27', 'D')
      const actif_nc      = immo_corp + immo_incorp - amortissements + immo_fin

      // ACTIF COURANT — clients NETs des provisions IFRS 9 (491)
      const stocks        = sumPrefix('3', 'D')
      const clients_brut  = sumPrefix('41', 'D')
      const provision_clients = sumPrefix('491', 'C')
      const clients       = clients_brut - provision_clients
      const autres_creances = sumPrefix('42', 'D') + sumPrefix('43', 'D') +
                              sumPrefix('44', 'D') + sumPrefix('46', 'D') + sumPrefix('47', 'D')
      const tresorerie    = sumPrefix('5', 'D')
      const actif_c       = stocks + clients + autres_creances + tresorerie

      const total_actif   = actif_nc + actif_c

      // PASSIF — CAPITAUX PROPRES
      // Séparer capital, réserves, report à nouveau, résultat de l'exercice.
      // L'erreur précédente : `reserves` mélangeait 11+12 ET `resultat_ex`
      // était variable morte → résultat absent du total → bilan déséquilibré.
      const capital       = sumPrefix('101', 'C') + sumPrefix('102', 'C')
      const reserves      = sumPrefix('11', 'C')          // Réserves seules
      const report_nvx    = sumPrefix('119', 'C') + sumPrefix('13', 'C')
      // Résultat de l'exercice = Σ produits classe 7 − Σ charges classe 6
      // (calculé dynamiquement quand le compte 1200 n'est pas alimenté)
      const compte_1200   = sumPrefix('120', 'C')
      const resultat_calc = sumPrefix('7', 'C') - sumPrefix('6', 'D')
      const resultat_ex   = compte_1200 !== 0 ? compte_1200 : resultat_calc
      const total_cp      = capital + reserves + report_nvx + resultat_ex

      // PASSIF — DETTES LT
      const emprunts_lt   = sumPrefix('16', 'C') + sumPrefix('17', 'C') + sumPrefix('18', 'C')

      // PASSIF — DETTES CT
      const fournisseurs  = sumPrefix('40', 'C')
      const dettes_fisc   = sumPrefix('42', 'C') + sumPrefix('43', 'C') + sumPrefix('44', 'C')
      const autres_dettes = sumPrefix('46', 'C') + sumPrefix('47', 'C') + sumPrefix('48', 'C')
      const total_dc      = fournisseurs + dettes_fisc + autres_dettes

      const total_passif  = total_cp + emprunts_lt + total_dc

      return NextResponse.json({
        type: 'bilan',
        periode: { date_debut: dDebut, date_fin: dFin, exercice },
        actif: {
          non_courant: { immo_corp, immo_incorp, amortissements, immo_fin, total: actif_nc },
          courant: { stocks, clients_brut, provision_clients, clients, autres_creances, tresorerie, total: actif_c },
          total: total_actif,
        },
        passif: {
          capitaux_propres: { capital, reserves, report_nvx, resultat_exercice: resultat_ex, total: total_cp },
          dettes_lt: { emprunts_lt, total: emprunts_lt },
          dettes_ct: { fournisseurs, dettes_fisc, autres_dettes, total: total_dc },
          total: total_passif,
        },
        equilibre: Math.abs(total_actif - total_passif) < 1,
        delta: total_actif - total_passif,
      })
    }

    // ----------------------------------------------------------------
    // CASHFLOW (simplifié)
    // ----------------------------------------------------------------
    if (type === 'cashflow') {
      const tresorerie_debut = 0 // Nécessiterait solde d'ouverture
      const flux_exploitation = sumPrefix('5', 'D') - sumPrefix('5', 'C') +
                                sumPrefix('6', 'D') - sumPrefix('7', 'C')
      const tresorerie_fin    = sumPrefix('5', 'D')

      return NextResponse.json({
        type: 'cashflow',
        periode: { date_debut: dDebut, date_fin: dFin, exercice },
        tresorerie_debut,
        tresorerie_fin,
        variation: tresorerie_fin - tresorerie_debut,
        note: 'Cashflow simplifié depuis solde comptes 5xx',
      })
    }

    return NextResponse.json({ error: 'type invalide — utiliser pnl|bilan|cashflow' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[etats-financiers]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
