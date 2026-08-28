/**
 * POST /api/comptable/rapprochement/card-settlement
 *
 * Rapproche un RÈGLEMENT CARTE agrégé : les ventes carte d'une période (par
 * une ou plusieurs banques) arrivent en banque regroupées en UNE transaction,
 * nette de commission. On solde le transit monétique 5118 des ventes carte de
 * la période et on comptabilise la commission :
 *
 *   D 512  (net reçu en banque)
 *   D 6271 (commission = brut − net, si > 0)
 *   C 5118 (brut des ventes carte de la période)
 *
 * body: { societe_id, date_debut, date_fin, montant_net, compte_banque?, dry_run? }
 * Idempotent par ref_folio CARDSET-<date_debut>_<date_fin>.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  computeSettlement,
  COMPTE_MONETIQUE_TRANSIT,
  COMPTE_BANQUE_DEFAUT,
  COMPTE_COMMISSION_CARTE,
} from '@/lib/accounting/card-settlement'
import { round2 } from '@/lib/money'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const societe_id = String(body.societe_id || '').trim()
    const date_debut = String(body.date_debut || '').slice(0, 10)
    const date_fin = String(body.date_fin || body.date_debut || '').slice(0, 10)
    const montant_net = round2(Number(body.montant_net) || 0)
    const compteBanque = String(body.compte_banque || COMPTE_BANQUE_DEFAUT)
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!date_debut || !date_fin) return NextResponse.json({ error: 'date_debut et date_fin requis' }, { status: 400 })
    if (montant_net <= 0) return NextResponse.json({ error: 'montant_net doit être > 0' }, { status: 400 })

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) return apiError('access_denied_company', 403)
      throw err
    }

    // Brut = solde débiteur du transit 5118 sur la période (ventes carte)
    const { data: transit, error: trErr } = await supabase
      .from('ecritures_comptables_v2')
      .select('debit_mur, credit_mur, date_ecriture')
      .eq('societe_id', societe_id)
      .eq('numero_compte', COMPTE_MONETIQUE_TRANSIT)
      .gte('date_ecriture', date_debut)
      .lte('date_ecriture', date_fin)
    if (trErr) throw trErr

    const brut = round2((transit || []).reduce((s, e) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0))
    if (brut <= 0) {
      return NextResponse.json({ error: 'Aucune vente carte en transit (5118) sur cette période.' }, { status: 400 })
    }

    const calc = computeSettlement(brut, montant_net)

    if (body.dry_run === true) {
      return NextResponse.json({ success: true, dry_run: true, ...calc })
    }

    const refFolio = `CARDSET-${date_debut}_${date_fin}`
    const { data: existing } = await supabase
      .from('ecritures_comptables_v2')
      .select('id').eq('societe_id', societe_id).eq('ref_folio', refFolio).limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, skipped: 'exists', ...calc })
    }

    const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
    const base = {
      societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: date_fin,
      journal: 'BNQ',
      ref_folio: refFolio,
      exercice: date_fin.slice(0, 4),
    }
    const libelle = `Règlement carte ${date_debut === date_fin ? date_fin : `${date_debut}→${date_fin}`}`
    const lignes: any[] = [
      { ...base, numero_compte: compteBanque, nom_compte: 'Banque', libelle, description: libelle, debit_mur: montant_net, credit_mur: 0 },
      { ...base, numero_compte: COMPTE_MONETIQUE_TRANSIT, nom_compte: 'Monétique en transit', libelle, description: libelle, debit_mur: 0, credit_mur: brut },
    ]
    if (calc.commission > 0) {
      lignes.push({ ...base, numero_compte: COMPTE_COMMISSION_CARTE, nom_compte: 'Commission carte', libelle: `${libelle} — commission`, description: libelle, debit_mur: calc.commission, credit_mur: 0 })
    } else if (calc.commission < 0) {
      // net > brut (ajustement / remboursement) : contrepartie en crédit
      lignes.push({ ...base, numero_compte: COMPTE_COMMISSION_CARTE, nom_compte: 'Commission carte', libelle: `${libelle} — ajustement`, description: libelle, debit_mur: 0, credit_mur: -calc.commission })
    }

    const totD = round2(lignes.reduce((s, l) => s + l.debit_mur, 0))
    const totC = round2(lignes.reduce((s, l) => s + l.credit_mur, 0))
    if (Math.abs(totD - totC) > 0.01) {
      return NextResponse.json({ error: `Écriture déséquilibrée (D ${totD} ≠ C ${totC})` }, { status: 500 })
    }

    const { error: insErr } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (insErr) throw insErr

    return NextResponse.json({ success: true, ...calc, ref_folio: refFolio, nb_lignes: lignes.length })
  } catch (e: any) {
    console.error('[card-settlement]', e)
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
