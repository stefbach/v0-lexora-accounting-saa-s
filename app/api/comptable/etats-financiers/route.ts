import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ClasseSolde = {
  classe: string
  total_debit: number
  total_credit: number
  solde: number
  nb_ecritures: number
}

// Parse exercice like "2024-2025" → { dDebut, dFin } (Mauritius fiscal year: July-June)
function parseExerciceRange(exercice: string): { dDebut: string; dFin: string } | null {
  const m = exercice.match(/^(?:FY)?(\d{4})-(\d{4})$/)
  if (!m) return null
  return { dDebut: `${m[1]}-07-01`, dFin: `${m[2]}-06-30` }
}

function shiftExerciceN1(exercice: string): string | null {
  const m = exercice.match(/^(?:FY)?(\d{4})-(\d{4})$/)
  if (!m) return null
  const a = parseInt(m[1]), b = parseInt(m[2])
  return `${a - 1}-${b - 1}`
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')   // ex: 2024-2025 / FY2024-2025
    const type       = searchParams.get('type') || 'pnl' // pnl | bilan | cashflow
    const date_debut = searchParams.get('date_debut')
    const date_fin   = searchParams.get('date_fin')
    const comparatif_n1 = searchParams.get('comparatif_n1') === 'true' || searchParams.get('comparatif_n1') === '1'

    if (!societe_id) {
      return NextResponse.json({ ok: false, error: 'societe_id requis' }, { status: 400 })
    }

    // Vérifier l'accès à la société (comptable/admin ou propriétaire)
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    const isComptable = profile && ['comptable', 'comptable_dedie', 'admin'].includes(profile.role)

    if (!isComptable) {
      // Vérifier l'accès via dossiers / ownership
      const { data: societeAccess } = await supabase
        .from('societes').select('id, created_by').eq('id', societe_id).maybeSingle()
      const owns = societeAccess?.created_by === user.id
      if (!owns) {
        const { data: dossierAccess } = await supabase
          .from('dossiers').select('id').eq('societe_id', societe_id).eq('client_id', user.id).limit(1)
        if (!dossierAccess || dossierAccess.length === 0) {
          return NextResponse.json({ ok: false, error: 'Accès non autorisé' }, { status: 403 })
        }
      }
    }

    // Résoudre les dates depuis l'exercice
    let dDebut: string | null = date_debut
    let dFin: string | null   = date_fin

    if (exercice && !dDebut && !dFin) {
      const { data: ex } = await supabase
        .from('exercices_fiscaux')
        .select('date_debut, date_fin')
        .eq('societe_id', societe_id)
        .eq('annee', exercice)
        .maybeSingle()
      if (ex) {
        dDebut = ex.date_debut
        dFin = ex.date_fin
      } else {
        const range = parseExerciceRange(exercice)
        if (range) { dDebut = range.dDebut; dFin = range.dFin }
      }
    }

    // --- Étape A : appel RPC fn_soldes_par_classe (migration 152) ---
    let soldesParClasse: ClasseSolde[] = []
    let rpcUsed = false
    if (dDebut && dFin) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_soldes_par_classe', {
        p_societe_id: societe_id,
        p_date_debut: dDebut,
        p_date_fin: dFin,
      })
      if (!rpcErr && Array.isArray(rpcData)) {
        soldesParClasse = (rpcData as Array<Record<string, unknown>>).map((r) => ({
          classe: String(r.classe ?? ''),
          total_debit: Number(r.total_debit ?? 0),
          total_credit: Number(r.total_credit ?? 0),
          solde: Number(r.solde ?? 0),
          nb_ecritures: Number(r.nb_ecritures ?? 0),
        }))
        rpcUsed = true
      } else if (rpcErr) {
        console.warn('[etats-financiers] fn_soldes_par_classe RPC failed, falling back to manual aggregation:', rpcErr.message)
      }
    }

    // Récupérer toutes les écritures (requis pour agrégation par compte détaillée,
    // et fallback si RPC indispo)
    let query = supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, nom_compte, date_ecriture')
      .eq('societe_id', societe_id)

    if (dDebut) query = query.gte('date_ecriture', dDebut)
    if (dFin)   query = query.lte('date_ecriture', dFin)

    const { data: ecritures, error } = await query
    if (error) throw error

    if ((!ecritures || ecritures.length === 0) && soldesParClasse.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Aucune écriture comptabilisée — uploadez des documents pour commencer",
        data: null,
        type,
        bilan: null,
        pnl: null,
        par_classe: [],
        periode: { date_debut: dDebut, date_fin: dFin, exercice },
        rpc_used: rpcUsed,
      })
    }

    // Agréger par compte
    const totaux: Record<string, { debit: number; credit: number }> = {}
    for (const e of ecritures || []) {
      const c = e.numero_compte
      if (!c) continue
      if (!totaux[c]) totaux[c] = { debit: 0, credit: 0 }
      totaux[c].debit  += e.debit_mur  || 0
      totaux[c].credit += e.credit_mur || 0
    }

    // Fallback : reconstruire soldesParClasse depuis les écritures si RPC a échoué
    if (!rpcUsed) {
      const byClasse: Record<string, ClasseSolde> = {}
      for (const [compte, v] of Object.entries(totaux)) {
        const cls = compte.charAt(0)
        if (!byClasse[cls]) byClasse[cls] = { classe: cls, total_debit: 0, total_credit: 0, solde: 0, nb_ecritures: 0 }
        byClasse[cls].total_debit += v.debit
        byClasse[cls].total_credit += v.credit
        byClasse[cls].solde += v.debit - v.credit
      }
      // nb_ecritures approximatif : nombre de lignes par classe
      for (const e of ecritures || []) {
        const cls = (e.numero_compte || '').charAt(0)
        if (byClasse[cls]) byClasse[cls].nb_ecritures += 1
      }
      soldesParClasse = Object.values(byClasse).sort((a, b) => a.classe.localeCompare(b.classe))
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
    // CALCULS COMMUNS — P&L + BILAN (toujours construits, même pour type spécifique)
    // ----------------------------------------------------------------

    // P&L — PRODUITS
    const ca_services     = sumPrefix('706', 'C') + sumPrefix('705', 'C') + sumPrefix('704', 'C')
    const ca_ventes       = sumPrefix('707', 'C') + sumPrefix('701', 'C') + sumPrefix('702', 'C')
    const autres_produits = sumPrefix('708', 'C') + sumPrefix('71', 'C') + sumPrefix('72', 'C') +
                            sumPrefix('74', 'C') + sumPrefix('75', 'C')
    const ca_total        = ca_services + ca_ventes + autres_produits

    // P&L — CHARGES
    const achats          = sumPrefix('60', 'D') + sumPrefix('61', 'D')
    const charges_perso   = sumPrefix('64', 'D')
    const autres_charges  = sumPrefix('62', 'D') + sumPrefix('63', 'D') + sumPrefix('65', 'D')
    const dotations       = sumPrefix('68', 'D')
    const total_charges   = achats + charges_perso + autres_charges + dotations

    const resultat_expl   = ca_total - total_charges
    const ebitda          = resultat_expl + dotations

    const produits_fin    = sumPrefix('76', 'C') + sumPrefix('77', 'C')
    const charges_fin     = sumPrefix('66', 'D') + sumPrefix('67', 'D')
    const resultat_fin    = produits_fin - charges_fin

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

    const parMois: Record<string, { ca: number; charges: number }> = {}
    for (const e of ecritures || []) {
      const m = e.date_ecriture?.slice(0, 7) || 'inconnu'
      if (!parMois[m]) parMois[m] = { ca: 0, charges: 0 }
      const c = e.numero_compte || ''
      if (c >= '700' && c <= '799') parMois[m].ca      += (e.credit_mur || 0) - (e.debit_mur || 0)
      if (c >= '600' && c <= '699') parMois[m].charges += (e.debit_mur || 0) - (e.credit_mur || 0)
    }

    const pnl = {
      produits: { ca_services, ca_ventes, autres_produits, total: ca_total },
      charges: { achats, charges_perso, autres_charges, dotations, total: total_charges },
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
    }

    // BILAN — ACTIF NON COURANT
    const immo_corp      = sumRange('210', '218', 'D')
    const immo_incorp    = sumRange('200', '209', 'D')
    const amortissements = Math.abs(sumRange('280', '289', 'D'))
    const immo_fin       = sumPrefix('26', 'D') + sumPrefix('27', 'D')
    const actif_nc       = immo_corp + immo_incorp - amortissements + immo_fin

    // BILAN — ACTIF COURANT
    const stocks          = sumPrefix('3', 'D')
    const clients         = sumPrefix('41', 'D')
    const autres_creances = sumPrefix('42', 'D') + sumPrefix('43', 'D') +
                            sumPrefix('44', 'D') + sumPrefix('46', 'D') + sumPrefix('47', 'D')
    const tresorerie      = sumPrefix('5', 'D')
    const actif_c         = stocks + clients + autres_creances + tresorerie
    const total_actif     = actif_nc + actif_c

    // PASSIF — CAPITAUX PROPRES
    const capital    = sumPrefix('101', 'C') + sumPrefix('102', 'C')
    const reserves   = sumPrefix('11', 'C')
    const report_nvx = sumPrefix('13', 'C')
    const total_cp   = capital + reserves + report_nvx + resultat_net

    // PASSIF — DETTES LT
    const emprunts_lt = sumPrefix('16', 'C') + sumPrefix('17', 'C') + sumPrefix('18', 'C')

    // PASSIF — DETTES CT
    const fournisseurs  = sumPrefix('40', 'C')
    const dettes_fisc   = sumPrefix('42', 'C') + sumPrefix('43', 'C') + sumPrefix('44', 'C')
    const autres_dettes = sumPrefix('46', 'C') + sumPrefix('47', 'C') + sumPrefix('48', 'C')
    const total_dc      = fournisseurs + dettes_fisc + autres_dettes

    const total_passif = total_cp + emprunts_lt + total_dc

    const bilan = {
      actif: {
        non_courant: { immo_corp, immo_incorp, amortissements, immo_fin, total: actif_nc },
        courant: { stocks, clients, autres_creances, tresorerie, total: actif_c },
        total: total_actif,
      },
      passif: {
        capitaux_propres: { capital, reserves, report_nvx, resultat_net, total: total_cp },
        dettes_lt: { emprunts_lt, total: emprunts_lt },
        dettes_ct: { fournisseurs, dettes_fisc, autres_dettes, total: total_dc },
        total: total_passif,
      },
      equilibre: Math.abs(total_actif - total_passif) < 1,
      delta: total_actif - total_passif,
    }

    // ----------------------------------------------------------------
    // COMPARATIF N-1 (si demandé)
    // ----------------------------------------------------------------
    let bilan_n1: typeof bilan | null = null
    let pnl_n1: typeof pnl | null = null

    if (comparatif_n1 && exercice) {
      const exN1 = shiftExerciceN1(exercice)
      if (exN1) {
        let dDebutN1: string | null = null
        let dFinN1: string | null = null
        const { data: exPrev } = await supabase
          .from('exercices_fiscaux')
          .select('date_debut, date_fin')
          .eq('societe_id', societe_id)
          .eq('annee', exN1)
          .maybeSingle()
        if (exPrev) {
          dDebutN1 = exPrev.date_debut
          dFinN1 = exPrev.date_fin
        } else {
          const r = parseExerciceRange(exN1)
          if (r) { dDebutN1 = r.dDebut; dFinN1 = r.dFin }
        }
        if (dDebutN1 && dFinN1) {
          const { data: ecrN1 } = await supabase
            .from('ecritures_comptables_v2')
            .select('numero_compte, debit_mur, credit_mur, date_ecriture')
            .eq('societe_id', societe_id)
            .gte('date_ecriture', dDebutN1)
            .lte('date_ecriture', dFinN1)

          if (ecrN1 && ecrN1.length > 0) {
            const totN1: Record<string, { debit: number; credit: number }> = {}
            for (const e of ecrN1) {
              const c = e.numero_compte
              if (!c) continue
              if (!totN1[c]) totN1[c] = { debit: 0, credit: 0 }
              totN1[c].debit  += e.debit_mur  || 0
              totN1[c].credit += e.credit_mur || 0
            }
            const sumPrefixN1 = (prefix: string, sens: 'D' | 'C' = 'D') => {
              let t = 0
              for (const [c, v] of Object.entries(totN1)) {
                if (c.startsWith(prefix)) t += sens === 'D' ? (v.debit - v.credit) : (v.credit - v.debit)
              }
              return t
            }
            const sumRangeN1 = (debut: string, fin: string, sens: 'D' | 'C' = 'D') => {
              let t = 0
              for (const [c, v] of Object.entries(totN1)) {
                if (c >= debut && c <= fin) t += sens === 'D' ? (v.debit - v.credit) : (v.credit - v.debit)
              }
              return t
            }
            const p1_ca_services     = sumPrefixN1('706', 'C') + sumPrefixN1('705', 'C') + sumPrefixN1('704', 'C')
            const p1_ca_ventes       = sumPrefixN1('707', 'C') + sumPrefixN1('701', 'C') + sumPrefixN1('702', 'C')
            const p1_autres_produits = sumPrefixN1('708', 'C') + sumPrefixN1('71', 'C') + sumPrefixN1('72', 'C') +
                                        sumPrefixN1('74', 'C') + sumPrefixN1('75', 'C')
            const p1_ca_total        = p1_ca_services + p1_ca_ventes + p1_autres_produits
            const p1_achats          = sumPrefixN1('60', 'D') + sumPrefixN1('61', 'D')
            const p1_charges_perso   = sumPrefixN1('64', 'D')
            const p1_autres_charges  = sumPrefixN1('62', 'D') + sumPrefixN1('63', 'D') + sumPrefixN1('65', 'D')
            const p1_dotations       = sumPrefixN1('68', 'D')
            const p1_total_charges   = p1_achats + p1_charges_perso + p1_autres_charges + p1_dotations
            const p1_resultat_expl   = p1_ca_total - p1_total_charges
            const p1_produits_fin    = sumPrefixN1('76', 'C') + sumPrefixN1('77', 'C')
            const p1_charges_fin     = sumPrefixN1('66', 'D') + sumPrefixN1('67', 'D')
            const p1_resultat_fin    = p1_produits_fin - p1_charges_fin
            const p1_produits_excep  = sumPrefixN1('78', 'C')
            const p1_charges_excep   = sumPrefixN1('69', 'D')
            const p1_resultat_excep  = p1_produits_excep - p1_charges_excep
            const p1_resultat_avant_is = p1_resultat_expl + p1_resultat_fin + p1_resultat_excep
            const p1_impot_societes    = sumPrefixN1('695', 'D')
            const p1_resultat_net      = p1_resultat_avant_is - p1_impot_societes

            pnl_n1 = {
              produits: { ca_services: p1_ca_services, ca_ventes: p1_ca_ventes, autres_produits: p1_autres_produits, total: p1_ca_total },
              charges: { achats: p1_achats, charges_perso: p1_charges_perso, autres_charges: p1_autres_charges, dotations: p1_dotations, total: p1_total_charges },
              resultats: {
                resultat_exploitation: p1_resultat_expl,
                ebitda: p1_resultat_expl + p1_dotations,
                resultat_financier: p1_resultat_fin,
                resultat_exceptionnel: p1_resultat_excep,
                resultat_avant_is: p1_resultat_avant_is,
                impot_societes: p1_impot_societes,
                resultat_net: p1_resultat_net,
              },
              marges: {
                marge_brute_pct: p1_ca_total > 0 ? Math.round(((p1_ca_total - p1_achats) / p1_ca_total) * 10000) / 100 : 0,
                marge_expl_pct: p1_ca_total > 0 ? Math.round((p1_resultat_expl / p1_ca_total) * 10000) / 100 : 0,
              },
              par_mois: [],
            }

            const b1_immo_corp      = sumRangeN1('210', '218', 'D')
            const b1_immo_incorp    = sumRangeN1('200', '209', 'D')
            const b1_amortissements = Math.abs(sumRangeN1('280', '289', 'D'))
            const b1_immo_fin       = sumPrefixN1('26', 'D') + sumPrefixN1('27', 'D')
            const b1_actif_nc       = b1_immo_corp + b1_immo_incorp - b1_amortissements + b1_immo_fin
            const b1_stocks          = sumPrefixN1('3', 'D')
            const b1_clients         = sumPrefixN1('41', 'D')
            const b1_autres_creances = sumPrefixN1('42', 'D') + sumPrefixN1('43', 'D') + sumPrefixN1('44', 'D') + sumPrefixN1('46', 'D') + sumPrefixN1('47', 'D')
            const b1_tresorerie      = sumPrefixN1('5', 'D')
            const b1_actif_c         = b1_stocks + b1_clients + b1_autres_creances + b1_tresorerie
            const b1_total_actif     = b1_actif_nc + b1_actif_c
            const b1_capital    = sumPrefixN1('101', 'C') + sumPrefixN1('102', 'C')
            const b1_reserves   = sumPrefixN1('11', 'C')
            const b1_report_nvx = sumPrefixN1('13', 'C')
            const b1_total_cp   = b1_capital + b1_reserves + b1_report_nvx + p1_resultat_net
            const b1_emprunts_lt = sumPrefixN1('16', 'C') + sumPrefixN1('17', 'C') + sumPrefixN1('18', 'C')
            const b1_fournisseurs  = sumPrefixN1('40', 'C')
            const b1_dettes_fisc   = sumPrefixN1('42', 'C') + sumPrefixN1('43', 'C') + sumPrefixN1('44', 'C')
            const b1_autres_dettes = sumPrefixN1('46', 'C') + sumPrefixN1('47', 'C') + sumPrefixN1('48', 'C')
            const b1_total_dc      = b1_fournisseurs + b1_dettes_fisc + b1_autres_dettes
            const b1_total_passif  = b1_total_cp + b1_emprunts_lt + b1_total_dc
            bilan_n1 = {
              actif: {
                non_courant: { immo_corp: b1_immo_corp, immo_incorp: b1_immo_incorp, amortissements: b1_amortissements, immo_fin: b1_immo_fin, total: b1_actif_nc },
                courant: { stocks: b1_stocks, clients: b1_clients, autres_creances: b1_autres_creances, tresorerie: b1_tresorerie, total: b1_actif_c },
                total: b1_total_actif,
              },
              passif: {
                capitaux_propres: { capital: b1_capital, reserves: b1_reserves, report_nvx: b1_report_nvx, resultat_net: p1_resultat_net, total: b1_total_cp },
                dettes_lt: { emprunts_lt: b1_emprunts_lt, total: b1_emprunts_lt },
                dettes_ct: { fournisseurs: b1_fournisseurs, dettes_fisc: b1_dettes_fisc, autres_dettes: b1_autres_dettes, total: b1_total_dc },
                total: b1_total_passif,
              },
              equilibre: Math.abs(b1_total_actif - b1_total_passif) < 1,
              delta: b1_total_actif - b1_total_passif,
            }
          }
        }
      }
    }

    // ----------------------------------------------------------------
    // CASHFLOW (simplifié) — pour compat rétro
    // ----------------------------------------------------------------
    const cashflow = {
      tresorerie_debut: 0,
      tresorerie_fin: tresorerie,
      variation: tresorerie - 0,
      note: 'Cashflow simplifié depuis solde comptes 5xx',
    }

    // ----------------------------------------------------------------
    // RÉPONSE UNIFIÉE — compat ascendante avec type=pnl|bilan|cashflow
    // ----------------------------------------------------------------
    const baseResponse = {
      ok: true,
      periode: { date_debut: dDebut, date_fin: dFin, exercice },
      bilan,
      pnl,
      par_classe: soldesParClasse,
      rpc_used: rpcUsed,
      bilan_n1,
      pnl_n1,
    }

    if (type === 'pnl') {
      return NextResponse.json({ ...baseResponse, type: 'pnl', ...pnl })
    }
    if (type === 'bilan') {
      return NextResponse.json({ ...baseResponse, type: 'bilan', ...bilan })
    }
    if (type === 'cashflow') {
      return NextResponse.json({ ...baseResponse, type: 'cashflow', ...cashflow })
    }

    // Type non reconnu : retourner la réponse unifiée sans erreur
    return NextResponse.json(baseResponse)
  } catch (e: unknown) {
    console.error('[etats-financiers]', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
