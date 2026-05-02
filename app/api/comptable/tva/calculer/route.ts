import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, periode } = body // periode: YYYY-MM

    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }

    // Vérifier format période YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'Format periode invalide (YYYY-MM)' }, { status: 400 })
    }

    const date_debut = `${periode}-01`
    const [year, month] = periode.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const date_fin = `${periode}-${String(lastDay).padStart(2, '0')}`

    // Date limite : 20 du mois suivant
    const moisSuivant = month === 12 ? 1 : month + 1
    const anneeSuivant = month === 12 ? year + 1 : year
    const date_limite = `${anneeSuivant}-${String(moisSuivant).padStart(2, '0')}-20`

    // ----------------------------------------------------------------
    // Récupérer toutes les écritures de la période
    // ----------------------------------------------------------------
    const { data: ecritures, error } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, description, nom_compte')
      .eq('societe_id', societe_id)
      .gte('date_ecriture', date_debut)
      .lte('date_ecriture', date_fin)

    if (error) throw error

    // ----------------------------------------------------------------
    // Calcul des 9 Boxes MRA TVA
    // ----------------------------------------------------------------

    // BOX 1 : TVA collectée standard (comptes 4457xx)
    let box1 = 0
    // BOX 2 : Exports taxables (TVA 0% sur exports)
    let box2 = 0
    // BOX 3 : Ventes exonérées (santé, éducation, financier)
    let box3 = 0
    // BOX 4 : Reverse Charge Output (SaaS étrangers, comptes 4452)
    let box4 = 0
    // BOX 5 : Reverse Charge Input déductible
    let box5 = 0
    // BOX 6 : Exports zero-rated (comptes 7xxx avec flag export)
    let box6 = 0
    // BOX 7 : Capital goods TVA déductible (comptes 4456 — immobilisations)
    let box7 = 0
    // BOX 8 : Bad debt relief (créances irrécouvrables)
    let box8 = 0
    // BOX 9 : TVA déductible autres (comptes 4456xx standard)
    let box9 = 0

    // CA brut pour calcul exonérations
    let ca_total = 0
    let ca_exonere = 0
    let ca_export = 0

    for (const e of ecritures || []) {
      const c = e.numero_compte
      const debit  = e.debit_mur  || 0
      const credit = e.credit_mur || 0

      // TVA collectée standard (4457)
      if (c.startsWith('4457')) {
        box1 += credit - debit // Normalement créditeur
      }

      // Reverse Charge Output (4452) — TVA sur achats intracommunautaires/services étrangers
      if (c.startsWith('44520') || c.startsWith('44521')) {
        box4 += credit - debit
      }

      // Reverse Charge Input déductible (4452 déductible)
      if (c.startsWith('44522') || c.startsWith('44523')) {
        box5 += debit - credit
      }

      // TVA déductible sur immobilisations (4456)
      if (c.startsWith('44562') || c.startsWith('44566')) {
        box7 += debit - credit
      }

      // TVA déductible standard (4456)
      if (c.startsWith('4456') && !c.startsWith('44562') && !c.startsWith('44566')) {
        box9 += debit - credit
      }

      // CA (comptes 70x-75x)
      if (c >= '700' && c <= '759') {
        ca_total += credit - debit
        // Exports (selon libellé ou compte spécifique)
        if (e.description?.toLowerCase().includes('export') ||
            e.nom_compte?.toLowerCase().includes('export')) {
          ca_export += credit - debit
          box6 += credit - debit
        }
        // Exonérations (santé, éducation, financier)
        if (e.description?.toLowerCase().includes('exonér') ||
            e.description?.toLowerCase().includes('exempte') ||
            c.startsWith('756') || c.startsWith('757')) {
          ca_exonere += credit - debit
          box3 += credit - debit
        }
      }
    }

    // NB : ne PAS forcer Math.max(0, …). Si avoirs > facturations sur la
    // période, la TVA collectée est légitimement négative et doit s'imputer
    // en crédit reporté au mois suivant (VAT Act §24A). Les masquer cache
    // le crédit dû par la MRA.

    // ----------------------------------------------------------------
    // Bases HT par catégorie — lues directement depuis `factures`
    // ----------------------------------------------------------------
    // L'heuristique sur le libellé (« export » dans description) rate les
    // factures EUR/USD à clients étrangers dont la description ne mentionne
    // pas le mot. On lit donc directement la table factures pour catégoriser
    // proprement le CA HT par : export zero-rated / exonéré / taxable.
    //
    // Les montants TVA collectée (Box 1, 4) restent calculés depuis les
    // écritures comptables (4457, 4452) — la TVA réellement enregistrée fait
    // foi vis-à-vis de la MRA.
    const { data: facturesPeriode } = await supabase
      .from('factures')
      .select('id, devise, taux_change, montant_ht, montant_tva, montant_ttc, montant_mur, taux_tva, client_offshore, statut, type_facture, type_document')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .gte('date_facture', date_debut)
      .lte('date_facture', date_fin)
      .neq('statut', 'brouillon')

    let base_export_zero_rated = 0   // Box 6 — CA HT exports
    let base_exonere           = 0   // Box 3 — CA HT exonéré (santé, éducation, finance)
    let base_taxable_standard  = 0   // CA HT soumis à TVA standard (15%)
    let base_taxable_other     = 0   // CA HT taxable autre taux
    let nb_factures_periode    = 0
    let nb_avoirs_periode      = 0

    for (const f of facturesPeriode || []) {
      // Convertir le HT en MUR : montant_ht est dans la devise d'origine,
      // montant_mur est le TTC en MUR. Pour le HT en MUR : ratio préservé.
      const ttc = Number(f.montant_ttc) || 0
      const ht  = Number(f.montant_ht)  || 0
      const ttcMur = Number(f.montant_mur) || 0
      const htMur = ttc > 0 ? (ht / ttc) * ttcMur : (ht * (Number(f.taux_change) || 1))

      // Avoirs : signe négatif (réduction du CA)
      const isAvoir = f.type_document === 'avoir'
      const sign = isAvoir ? -1 : 1
      if (isAvoir) nb_avoirs_periode++
      else nb_factures_periode++

      const isForeign = f.devise && f.devise !== 'MUR'
      const isOffshore = !!f.client_offshore
      const isExport = isForeign || isOffshore
      const tauxTva = Number(f.taux_tva) || 0

      if (isExport) {
        base_export_zero_rated += sign * htMur
      } else if (tauxTva === 0) {
        base_exonere += sign * htMur
      } else if (tauxTva === 15) {
        base_taxable_standard += sign * htMur
      } else {
        base_taxable_other += sign * htMur
      }
    }

    base_export_zero_rated = Math.round(base_export_zero_rated * 100) / 100
    base_exonere           = Math.round(base_exonere           * 100) / 100
    base_taxable_standard  = Math.round(base_taxable_standard  * 100) / 100
    base_taxable_other     = Math.round(base_taxable_other     * 100) / 100
    const ca_ht_total = base_export_zero_rated + base_exonere + base_taxable_standard + base_taxable_other

    // Si Box 6 (depuis écritures via heuristique « export ») était à 0 mais que
    // les factures montrent du CA export, on aligne Box 6 sur la base factures.
    // Idem pour Box 3 (exonéré). Les factures sont la source de vérité pour les
    // BASES ; les écritures restent la source pour la TVA collectée (Box 1 / 4).
    if (box6 === 0 && base_export_zero_rated > 0) {
      box6 = base_export_zero_rated
    }
    if (box3 === 0 && base_exonere > 0) {
      box3 = base_exonere
    }

    // ----------------------------------------------------------------
    // Reverse charge — factures fournisseurs en devise étrangère
    // ----------------------------------------------------------------
    // À Maurice, un achat de services à un fournisseur étranger relève du
    // reverse charge : l'acheteur déclare la TVA à la fois en collectée
    // (Box 4) et en déductible (Box 5) au taux standard 15%. La TVA n'est
    // PAS facturée par le fournisseur, mais l'acheteur l'auto-liquide.
    //
    // Détection : type_facture='fournisseur' + devise≠MUR + montant_tva=0
    // (sinon c'est du Reverse Charge déjà comptabilisé manuellement via 4452).
    const { data: facturesFournisseurs } = await supabase
      .from('factures')
      .select('devise, taux_change, montant_ht, montant_tva, montant_mur, montant_ttc, capital_goods')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'fournisseur')
      .gte('date_facture', date_debut)
      .lte('date_facture', date_fin)
      .neq('statut', 'brouillon')

    let base_reverse_charge_mur = 0
    let nb_factures_rc = 0
    for (const f of facturesFournisseurs || []) {
      const isForeign = f.devise && f.devise !== 'MUR'
      const tvaPaid = Number(f.montant_tva) || 0
      // Reverse charge auto-liquidation : facture étrangère sans TVA payée
      if (isForeign && tvaPaid === 0) {
        const ttc = Number(f.montant_ttc) || 0
        const ht = Number(f.montant_ht) || 0
        const ttcMur = Number(f.montant_mur) || 0
        const htMur = ttc > 0 ? (ht / ttc) * ttcMur : (ht * (Number(f.taux_change) || 1))
        base_reverse_charge_mur += htMur
        nb_factures_rc++
      }
    }
    base_reverse_charge_mur = Math.round(base_reverse_charge_mur * 100) / 100

    // TVA reverse charge (15% sur la base) : auto-add à Box 4 (output) et
    // Box 5 (input) UNIQUEMENT si AUCUNE des deux box n'est déjà alimentée.
    // Si l'une des deux est non-nulle, c'est qu'au moins une partie du RC est
    // déjà comptabilisée manuellement via 4452x — on n'ajoute rien pour ne
    // pas doublonner. La déclaration sera incomplète et il faudra la
    // compléter manuellement (signal explicite via reverse_charge.warning).
    let rcWarning: string | null = null
    if (base_reverse_charge_mur > 0) {
      const tvaRc = Math.round(base_reverse_charge_mur * 0.15 * 100) / 100
      if (box4 === 0 && box5 === 0) {
        box4 = tvaRc
        box5 = tvaRc
      } else {
        rcWarning = `Reverse charge détecté (${base_reverse_charge_mur} MUR HT) mais Box 4 ou 5 déjà alimentée par les écritures — non auto-rempli pour éviter doublon. Vérifier manuellement.`
      }
    }

    // TVA nette = (Box1 + Box4) - (Box9 + Box5 + Box7 + Box8) - Crédit reporté
    const { data: tvaPrec } = await supabase
      .from('tva_mensuelle')
      .select('credit_reporte')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })
      .limit(1)
      .single()
      .then(r => r)

    const credit_reporte = tvaPrec?.credit_reporte || 0
    const tva_output = box1 + box4
    const tva_input  = box9 + box5 + box7 + box8
    const tva_nette  = tva_output - tva_input - credit_reporte

    // Pénalités si date > 20 du mois suivant
    const aujourd_hui  = new Date()
    const date_limite_d = new Date(date_limite)
    let penalites = 0
    let interets  = 0

    if (aujourd_hui > date_limite_d && tva_nette > 0) {
      const mois_retard = Math.ceil(
        (aujourd_hui.getTime() - date_limite_d.getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
      // VAT Act Maurice — Section 24 :
      //   • Pénalité 5% du montant dû — ONE-SHOT (pas mensuelle)
      //   • Intérêt 0,5% par mois de retard
      penalites = Math.round(tva_nette * 0.05 * 100) / 100
      interets  = Math.round(tva_nette * 0.005 * mois_retard * 100) / 100
    }

    // ----------------------------------------------------------------
    // Upsert dans tva_mensuelle
    // ----------------------------------------------------------------
    // Récupérer client_id depuis la société
    const { data: societe } = await supabase
      .from('societes')
      .select('client_id, nom')
      .eq('id', societe_id)
      .single()

    if (!societe) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }

    const tvaData = {
      client_id: societe.client_id,
      societe_id,
      societe: societe.nom,
      periode,
      // Boxes
      box1_output_standard:    Math.round(box1 * 100) / 100,
      box2_exports_taxable:    Math.round(box2 * 100) / 100,
      box3_exempt_supplies:    Math.round(box3 * 100) / 100,
      box4_reverse_charge_output: Math.round(box4 * 100) / 100,
      box5_reverse_charge_input:  Math.round(box5 * 100) / 100,
      box6_exports_zero_rated: Math.round(box6 * 100) / 100,
      box7_capital_goods:      Math.round(box7 * 100) / 100,
      box8_bad_debt_relief:    Math.round(box8 * 100) / 100,
      box9_input_other:        Math.round(box9 * 100) / 100,
      // Synthèse
      tva_collectee:  Math.round(tva_output * 100) / 100,
      tva_deductible: Math.round(tva_input  * 100) / 100,
      credit_reporte,
      tva_nette:      Math.round(Math.max(tva_nette, 0) * 100) / 100,
      statut:         tva_nette > 0 ? 'a_payer' : tva_nette < 0 ? 'credit' : 'neant',
      date_limite,
      penalites_retard: Math.round(penalites * 100) / 100,
      interets_retard:  Math.round(interets * 100) / 100,
    }

    const { data: upserted, error: upsertErr } = await supabase
      .from('tva_mensuelle')
      .upsert(tvaData, { onConflict: 'client_id,societe_id,periode' })
      .select()
      .single()

    if (upsertErr) {
      console.error('[TVA upsert]', upsertErr)
      // Continuer malgré l'erreur d'upsert (contrainte societe TEXT)
    }

    return NextResponse.json({
      success: true,
      periode,
      societe_id,
      boxes: {
        box1_tva_collectee_standard:   tvaData.box1_output_standard,
        box2_exports_taxables:          tvaData.box2_exports_taxable,
        box3_ventes_exonerees:          tvaData.box3_exempt_supplies,
        box4_reverse_charge_output:     tvaData.box4_reverse_charge_output,
        box5_reverse_charge_input:      tvaData.box5_reverse_charge_input,
        box6_exports_zero_rated:        tvaData.box6_exports_zero_rated,
        box7_capital_goods:             tvaData.box7_capital_goods,
        box8_bad_debt_relief:           tvaData.box8_bad_debt_relief,
        box9_tva_deductible_autre:      tvaData.box9_input_other,
      },
      synthese: {
        tva_output:     tvaData.tva_collectee,
        tva_input:      tvaData.tva_deductible,
        credit_reporte,
        tva_nette:      tvaData.tva_nette,
        statut:         tvaData.statut,
        date_limite,
        penalites,
        interets,
        total_a_payer:  Math.round((tvaData.tva_nette + penalites + interets) * 100) / 100,
      },
      bases_ht: {
        taxable_standard_15pct: base_taxable_standard,
        taxable_autre:          base_taxable_other,
        export_zero_rated:      base_export_zero_rated,
        exonere:                base_exonere,
        ca_ht_total:            Math.round(ca_ht_total * 100) / 100,
        nb_factures:            nb_factures_periode,
        nb_avoirs:              nb_avoirs_periode,
      },
      reverse_charge: {
        base_mur:    base_reverse_charge_mur,
        tva_15pct:   Math.round(base_reverse_charge_mur * 0.15 * 100) / 100,
        nb_factures: nb_factures_rc,
        warning:     rcWarning,
      },
      nb_ecritures: ecritures?.length || 0,
    })
  } catch (e: unknown) {
    console.error('[tva/calculer]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
