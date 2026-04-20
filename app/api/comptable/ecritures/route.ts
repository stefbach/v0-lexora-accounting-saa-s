import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkPeriodLock } from '@/lib/accounting/period-lock'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * CRUD écritures comptables manuelles
 *
 * POST /api/comptable/ecritures — crée une OD (Opération Diverse) multi-ligne équilibrée
 *   body: { societe_id, date_ecriture, libelle, journal?, reference?, lignes: [{numero_compte, debit_mur, credit_mur, libelle?, tiers?}] }
 *
 * PATCH /api/comptable/ecritures — modifie UNE écriture existante
 *   body: { id, ...fields }
 *
 * DELETE /api/comptable/ecritures?id=xxx&societe_id=yyy — supprime une écriture
 *
 * GET /api/comptable/ecritures?societe_id=xxx&compte=xxx&mois=YYYY-MM&limit=100&offset=0
 *   Grand livre par compte (ou toutes écritures si compte absent)
 */

export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const compte = searchParams.get('compte')
    const mois = searchParams.get('mois')
    const journal = searchParams.get('journal')
    const tiers = searchParams.get('tiers')
    const lettre = searchParams.get('lettre')
    const q = searchParams.get('q')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
    if (!dossier) return NextResponse.json({ ecritures: [], total: 0, message: 'Aucun dossier' })

    let query = supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, libelle, debit_mur, credit_mur, lettre, date_ecriture, journal, ref_folio, facture_id, created_at', { count: 'exact' })
      .eq('dossier_id', dossier.id)
      .order('date_ecriture', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (compte) query = query.ilike('numero_compte', `${compte}%`)
    if (journal) query = query.eq('journal', journal)
    if (lettre) query = query.eq('lettre', lettre)
    if (q) query = query.ilike('libelle', `%${q}%`)
    if (tiers) query = query.ilike('libelle', `%${tiers}%`)
    if (mois && /^\d{4}-\d{2}$/.test(mois)) {
      const [yy, mm] = mois.split('-').map(Number)
      const start = `${yy}-${String(mm).padStart(2, '0')}-01`
      const lastDay = new Date(yy, mm, 0).getDate()
      const end = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      query = query.gte('date_ecriture', start).lte('date_ecriture', end)
    }

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Totaux debit/credit sur la requete (sans limit)
    let totalsQuery = supabase
      .from('ecritures_comptables_v2')
      .select('debit_mur, credit_mur')
      .eq('dossier_id', dossier.id)
    if (compte) totalsQuery = totalsQuery.ilike('numero_compte', `${compte}%`)
    if (journal) totalsQuery = totalsQuery.eq('journal', journal)
    if (mois && /^\d{4}-\d{2}$/.test(mois)) {
      const [yy, mm] = mois.split('-').map(Number)
      const start = `${yy}-${String(mm).padStart(2, '0')}-01`
      const lastDay = new Date(yy, mm, 0).getDate()
      const end = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      totalsQuery = totalsQuery.gte('date_ecriture', start).lte('date_ecriture', end)
    }
    const { data: totalsData } = await totalsQuery
    const totals = {
      debit_total: (totalsData || []).reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0), 0),
      credit_total: (totalsData || []).reduce((s: number, e: any) => s + (Number(e.credit_mur) || 0), 0),
    }
    const solde = Math.round((totals.debit_total - totals.credit_total) * 100) / 100

    return NextResponse.json({
      ecritures: data || [],
      total: count || 0,
      totals: {
        debit_total: Math.round(totals.debit_total * 100) / 100,
        credit_total: Math.round(totals.credit_total * 100) / 100,
        solde,
      },
      limit, offset,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { societe_id, date_ecriture, libelle, journal = 'OD', reference, lignes } = body

    if (!societe_id || !date_ecriture || !Array.isArray(lignes) || lignes.length < 2) {
      return NextResponse.json({
        error: 'societe_id, date_ecriture et au moins 2 lignes requis',
      }, { status: 400 })
    }

    // Verifier equilibre debit = credit
    const totalDebit = lignes.reduce((s: number, l: any) => s + (Number(l.debit_mur) || 0), 0)
    const totalCredit = lignes.reduce((s: number, l: any) => s + (Number(l.credit_mur) || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json({
        error: `Ecriture non equilibree : debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)} (ecart ${(totalDebit - totalCredit).toFixed(2)})`,
      }, { status: 400 })
    }
    if (totalDebit <= 0) {
      return NextResponse.json({ error: 'Montant total doit etre > 0' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verifier periode non verrouillee
    const lockStatus = await checkPeriodLock(supabase, societe_id, date_ecriture)
    if (lockStatus.locked) {
      return NextResponse.json({
        error: `Periode verrouillee — ${lockStatus.reason}. Impossible de saisir une ecriture.`,
      }, { status: 403 })
    }

    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
    if (!dossier) return NextResponse.json({ error: 'Dossier comptable introuvable' }, { status: 400 })

    const refFolio = reference || `OD-${Date.now().toString(36)}`

    // Anti-doublon : si une reference explicite est fournie, verifier qu'elle
    // n'existe pas deja (evite les double-soumissions du formulaire)
    if (reference) {
      const { data: existing } = await supabase
        .from('ecritures_comptables_v2')
        .select('id')
        .eq('societe_id', societe_id)
        .like('ref_folio', `${reference}-%`)
        .limit(1)
      if (existing && existing.length > 0) {
        return NextResponse.json({
          error: `Ecriture avec reference "${reference}" deja existante — doublon evite`,
        }, { status: 409 })
      }
    }

    const payload = lignes.map((l: any, idx: number) => ({
      dossier_id: dossier.id,
      societe_id,
      date_ecriture,
      journal: journal || 'OD',
      numero_compte: String(l.numero_compte || '').trim(),
      libelle: (l.libelle || libelle || '').substring(0, 200),
      debit_mur: Math.round((Number(l.debit_mur) || 0) * 100) / 100,
      credit_mur: Math.round((Number(l.credit_mur) || 0) * 100) / 100,
      ref_folio: `${refFolio}-${idx + 1}`,
    }))

    // Valider que chaque ligne a un compte et debit OU credit (pas les deux)
    for (const p of payload) {
      if (!p.numero_compte) {
        return NextResponse.json({ error: 'Chaque ligne doit avoir un numero de compte' }, { status: 400 })
      }
      if (p.debit_mur > 0 && p.credit_mur > 0) {
        return NextResponse.json({
          error: `Ligne ${p.numero_compte}: debit et credit simultanes interdits`,
        }, { status: 400 })
      }
      if (p.debit_mur === 0 && p.credit_mur === 0) {
        return NextResponse.json({
          error: `Ligne ${p.numero_compte}: montant zero`,
        }, { status: 400 })
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from('ecritures_comptables_v2').insert(payload).select('id, numero_compte, debit_mur, credit_mur')
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      ref_folio: refFolio,
      nb_lignes: payload.length,
      ecritures: inserted,
      equilibre: { debit: totalDebit, credit: totalCredit, ecart: 0 },
    })
  } catch (e: any) {
    console.error('[ecritures POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { id, societe_id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture, lettre } = body
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Verif periode non verrouillee
    if (societe_id && date_ecriture) {
      const lockStatus = await checkPeriodLock(supabase, societe_id, date_ecriture)
      if (lockStatus.locked) {
        return NextResponse.json({
          error: `Periode verrouillee — ${lockStatus.reason}`,
        }, { status: 403 })
      }
    }

    const updates: Record<string, any> = {}
    if (numero_compte !== undefined) updates.numero_compte = String(numero_compte).trim()
    if (libelle !== undefined) updates.libelle = String(libelle).substring(0, 200)
    if (debit_mur !== undefined) updates.debit_mur = Math.round((Number(debit_mur) || 0) * 100) / 100
    if (credit_mur !== undefined) updates.credit_mur = Math.round((Number(credit_mur) || 0) * 100) / 100
    if (date_ecriture !== undefined) updates.date_ecriture = date_ecriture
    if (lettre !== undefined) updates.lettre = lettre || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ a modifier' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ecritures_comptables_v2').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, ecriture: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Purge d'un exercice complet
    if (action === 'purge_exercice') {
      const body = await request.json().catch(() => ({}))
      const { societe_id: sid, exercice } = body
      if (!sid || !exercice) {
        return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
      }
      // Résoudre les dates de l'exercice (ex: "FY2024-2025" → 2024-07-01 / 2025-06-30)
      const supabase = getAdminClient()
      const { data: ex } = await supabase
        .from('exercices_fiscaux')
        .select('date_debut, date_fin')
        .eq('societe_id', sid)
        .eq('annee', exercice)
        .single()
      if (!ex) {
        return NextResponse.json({ error: `Exercice ${exercice} non trouvé` }, { status: 404 })
      }
      const { count, error } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .eq('societe_id', sid)
        .gte('date_ecriture', ex.date_debut)
        .lte('date_ecriture', ex.date_fin)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, deleted: count || 0, exercice, date_debut: ex.date_debut, date_fin: ex.date_fin })
    }

    const id = searchParams.get('id')
    const societe_id = searchParams.get('societe_id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Recuperer l ecriture pour verif periode + ref_folio pour suppression groupe
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2').select('id, date_ecriture, societe_id, ref_folio').eq('id', id).single()
    if (!ecr) return NextResponse.json({ error: 'Ecriture non trouvee' }, { status: 404 })

    const sid = societe_id || ecr.societe_id
    if (sid && ecr.date_ecriture) {
      const lockStatus = await checkPeriodLock(supabase, sid, ecr.date_ecriture)
      if (lockStatus.locked) {
        return NextResponse.json({
          error: `Periode verrouillee — ${lockStatus.reason}`,
        }, { status: 403 })
      }
    }

    const { error } = await supabase.from('ecritures_comptables_v2').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, deleted_id: id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
