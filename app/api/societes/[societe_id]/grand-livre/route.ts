/**
 * GET  /api/societes/{societe_id}/grand-livre
 *      ?compte=&date_debut=&date_fin=&journal=&lettre=&unlettered_only=true&limit=
 * POST /api/societes/{societe_id}/grand-livre  (créer une écriture équilibrée)
 *      Body: { date_ecriture, journal, numero_piece?, libelle, lignes: [{compte, debit, credit, libelle?}] }
 *      Validation : somme débits = somme crédits.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { writeAuditLog } from '@/lib/pcm/audit-log'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const SELECT_COLS =
  'id, date_ecriture, journal, numero_piece, ref_folio, numero_compte, nom_compte, libelle, debit_mur, credit_mur, devise, lettre, date_lettrage, facture_id, exercice'

const MAX_LIMIT = 1000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { searchParams } = new URL(request.url)
    const compte = searchParams.get('compte')
    const dateDebut = searchParams.get('date_debut')
    const dateFin = searchParams.get('date_fin')
    const journal = searchParams.get('journal')
    const lettre = searchParams.get('lettre')
    const unletteredOnly = searchParams.get('unlettered_only') === 'true'
    const limit = Math.min(Number(searchParams.get('limit')) || 200, MAX_LIMIT)

    let q = admin.from('ecritures_comptables_v2').select(SELECT_COLS, { count: 'exact' }).eq('societe_id', societe_id)
    if (compte) q = q.eq('numero_compte', compte)
    if (dateDebut) q = q.gte('date_ecriture', dateDebut)
    if (dateFin) q = q.lte('date_ecriture', dateFin)
    if (journal) q = q.eq('journal', journal)
    if (lettre) q = q.eq('lettre', lettre)
    if (unletteredOnly) q = q.is('lettre', null)
    q = q.order('date_ecriture', { ascending: false }).range(0, limit - 1)

    const { data, error, count } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let totalDebit = 0, totalCredit = 0
    for (const e of data || []) { totalDebit += +e.debit_mur || 0; totalCredit += +e.credit_mur || 0 }

    return NextResponse.json({
      ecritures: data || [],
      count: count ?? 0,
      returned: data?.length || 0,
      truncated: typeof count === 'number' && count > limit,
      totaux: { debit: Math.round(totalDebit * 100) / 100, credit: Math.round(totalCredit * 100) / 100 },
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

const ligneSchema = z.object({
  compte: z.string().min(1),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  libelle: z.string().optional(),
})

const createSchema = z.object({
  date_ecriture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  journal: z.string().min(1).default('OD'),
  numero_piece: z.string().optional(),
  libelle: z.string().min(1),
  devise: z.string().default('MUR'),
  lignes: z.array(ligneSchema).min(2),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }
    const b = parsed.data

    // Validation équilibre débit = crédit (tolérance 0.01)
    const totalDebit = b.lignes.reduce((s, l) => s + l.debit, 0)
    const totalCredit = b.lignes.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json({
        error: `Écriture déséquilibrée : débit ${totalDebit.toFixed(2)} ≠ crédit ${totalCredit.toFixed(2)}`,
      }, { status: 400 })
    }

    // Résoudre les libellés de compte depuis comptes_societes
    const numeros = [...new Set(b.lignes.map(l => l.compte))]
    const { data: comptes } = await admin
      .from('comptes_societes').select('numero, intitule, archive')
      .eq('societe_id', societe_id).in('numero', numeros)
    const compteMap = new Map((comptes || []).map((c: any) => [c.numero, c]))
    for (const num of numeros) {
      const c = compteMap.get(num)
      if (!c) return NextResponse.json({ error: `Compte ${num} absent du PCM de la société` }, { status: 400 })
      if (c.archive) return NextResponse.json({ error: `Compte ${num} est archivé` }, { status: 400 })
    }

    const refFolio = `OD-${Date.now()}`
    const exercice = String(new Date(b.date_ecriture).getFullYear())
    const rows = b.lignes.map(l => ({
      societe_id, date_ecriture: b.date_ecriture, journal: b.journal,
      numero_piece: b.numero_piece || refFolio, ref_folio: refFolio,
      numero_compte: l.compte, nom_compte: compteMap.get(l.compte)!.intitule,
      libelle: l.libelle || b.libelle, description: l.libelle || b.libelle,
      debit_mur: l.debit, credit_mur: l.credit, exercice,
    }))

    const { data: inserted, error } = await admin
      .from('ecritures_comptables_v2').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'create_journal_entry', entity_type: 'ecriture', entity_id: refFolio,
      after_state: { ref_folio: refFolio, nb_lignes: rows.length, total: totalDebit },
      actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason: b.libelle,
    })

    return NextResponse.json({ success: true, ref_folio: refFolio, nb_lignes: inserted?.length || 0 })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
